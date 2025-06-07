import type { 
  MantisConnection, 
  injectUIType, 
  onMessageType, 
  registerListenersType, 
  setProgressType, 
  establishLogSocketType 
} from "../types";
import { GenerationProgress } from "../types";
import gmailIcon from "data-base64:../../../assets/gmail.png";
import { getSpacePortal, registerAuthCookies, reqSpaceCreation } from "../../driver";

/** Sleep helper */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Wait for a DOM element with timeout.
 */
async function waitForElement(selector: string, timeout = 500): Promise<Element | null> {
  return new Promise(resolve => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

/* ============================= */
/*      Email Row Detection      */
/* ============================= */

/**
 * Extract the legacy value from a row.
 */
function extractLegacyFromRow(row: HTMLTableRowElement): string | null {
  let legacy = row.getAttribute("data-legacy-last-message-id");
  if (!legacy) {
    const descendant = row.querySelector("[data-legacy-last-message-id]");
    if (descendant) {
      legacy = descendant.getAttribute("data-legacy-last-message-id");
    }
  }
  return legacy;
}

/**
 * Get email rows using specified selectors.
 */
function getSelectedEmailRows(): HTMLTableRowElement[] {
  return Array.from(document.querySelectorAll<HTMLTableRowElement>("tr.zA.zE.x7, tr.zA.yO.x7"));
}

/* ============================= */
/*   Global Monitoring State     */
/* ============================= */

declare global {
  interface Window {
    mantisExtractedEmails: Array<{
      subject: string;
      sender: string;
      content: string;
      date: string;
    }>;
    mantisLegacyIds: Set<string>;
    mantisObserver: MutationObserver | null;
    mantisStartMonitoring: () => void;
    mantisStopMonitoring: () => void;
  }
}

window.mantisExtractedEmails = window.mantisExtractedEmails || [];
window.mantisLegacyIds = window.mantisLegacyIds || new Set();
window.mantisObserver = window.mantisObserver || null;

/* ============================= */
/*       Gmail OAuth Logic       */
/* ============================= */

const Auth: string = `${process.env.PLASMO_PUBLIC_GMAIL_GOOGLE_KEY}`;
const REDIRECT_URI = `${process.env.PLASMO_PUBLIC_FRONTEND}/Integrations/`;

const authenticateGmail = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${Auth}&response_type=token&redirect_uri=${encodeURIComponent(
      REDIRECT_URI
    )}&scope=https://www.googleapis.com/auth/gmail.readonly&prompt=consent`;
    const authWindow = window.open(authUrl, "_blank", "width=500,height=600");
    if (!authWindow) {
      reject("Popup blocked. Please allow popups and try again.");
      return;
    }
    const handleMessage = (event: MessageEvent) => {
      if (!event.origin.includes(process.env.PLASMO_PUBLIC_FRONTEND)) return;
      const { type, token, error } = event.data;
      if (type === "oauth_success" && token) {
        window.removeEventListener("message", handleMessage);
        resolve(token);
      } else if (type === "oauth_error") {
        reject(error || "Authentication failed.");
      }
    };
    window.addEventListener("message", handleMessage);
    const checkPopup = setInterval(() => {
      if (!authWindow || authWindow.closed) {
        clearInterval(checkPopup);
        reject("Authentication canceled by user.");
      }
    }, 500);
  });
};

/* ============================= */
/*      Email Processing         */
/* ============================= */

/**
 * Process an individual email by legacy ID using the provided Gmail API token.
 * It fetches email details and stores them (using "N/A" for missing values).
 */
async function processEmailLegacy(legacy: string, token: string) {
  try {
    const response = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${legacy}?format=full`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status}`);
    }
    const emailData = await response.json();
    const headers = emailData.payload.headers;
    let subject = "", sender = "", dateStr = "", content = "";
    headers.forEach((header: { name: string, value: string }) => {
      const lowerName = header.name.toLowerCase();
      if (lowerName === "subject") subject = header.value;
      if (lowerName === "from") sender = header.value;
      if (lowerName === "date") dateStr = header.value;
    });
    // Extract full email body from payload
    if (emailData.payload.body?.data) {
      content = decodeURIComponent(escape(atob(emailData.payload.body.data.replace(/-/g, "+").replace(/_/g, "/"))));
    } else if (emailData.payload.parts) {
      for (const part of emailData.payload.parts) {
        if (part.mimeType === "text/plain" && part.body?.data) {
          content = decodeURIComponent(escape(atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"))));
          break;
        }
      }
    }
    let date = null;
    if (dateStr) {
      const d = new Date(dateStr);
      date = d.toLocaleDateString();
    }
    subject = subject || "N/A";
    sender = sender || "N/A";
    const finalDate = date || "N/A";
    const finalContent = content || "N/A";
    window.mantisExtractedEmails.push({
      subject,
      sender,
      content: finalContent,
      date: finalDate,
    });
  } catch (error: any) {
    console.error(`Error processing email with legacy ${legacy}: ${error.message}`);
  }
}

/* ============================= */
/*      Email Monitoring         */
/* ============================= */

window.mantisStartMonitoring = () => {
  if (window.mantisObserver) return;
  window.mantisObserver = new MutationObserver(() => {
    const rows = getSelectedEmailRows();
    rows.forEach(row => {
      const legacy = extractLegacyFromRow(row);
      if (legacy && !window.mantisLegacyIds.has(legacy)) {
        window.mantisLegacyIds.add(legacy);
      }
    });
  });
  window.mantisObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });
};

window.mantisStopMonitoring = () => {
  if (window.mantisObserver) {
    window.mantisObserver.disconnect();
    window.mantisObserver = null;
  }
};

/* ============================= */
/*  Space Creation & UI Injection */
/* ============================= */

/**
 * Create a space using processed emails and a user-provided space name.
 * Now follows the newer structure and forwards the establishLogSocket parameter.
 */
const createSpace = async (
  injectUI: injectUIType,
  setProgress: setProgressType,
  onMessage: onMessageType,
  registerListeners: registerListenersType,
  establishLogSocket: establishLogSocketType
) => {
  setProgress(GenerationProgress.GATHERING_DATA);
  if (!window.mantisObserver) {
    window.mantisStartMonitoring();
  }
  let token: string;
  try {
    token = await authenticateGmail();
  } catch (error: any) {
    setProgress(GenerationProgress.FAILED);
    throw new Error("Authentication failed: " + error);
  }
  for (const legacy of window.mantisLegacyIds) {
    await processEmailLegacy(legacy, token);
    await sleep(100);
  }
  if (window.mantisExtractedEmails.length === 0) {
    setProgress(GenerationProgress.FAILED);
    throw new Error("No emails have been processed yet. Please select some emails first.");
  }
  const nameInput = document.getElementById("mantis-space-name") as HTMLInputElement;
  const spaceName = nameInput?.value || "Untitled Space";
  setProgress(GenerationProgress.CREATING_SPACE);
  const spaceData = await reqSpaceCreation(
    window.mantisExtractedEmails,
    {
      subject: "title",
      sender: "semantic",
      content: "semantic",
      date: "date",
    },
    establishLogSocket
  );
  setProgress(GenerationProgress.INJECTING_UI);
  if (!spaceData?.space_id) {
    setProgress(GenerationProgress.FAILED);
    throw new Error("Failed to create space from emails.");
  }
  const createdWidget = await injectUI(spaceData.space_id, onMessage, registerListeners);
  setProgress(GenerationProgress.COMPLETED);
  return { spaceId: spaceData.space_id, createdWidget };
};

/**
 * Inject UI elements into Gmail by obtaining an iframe container via getSpacePortal.
 * The returned portal is then inserted into the Gmail sidebar.
 */
const injectUI = async (
  space_id: string,
  onMessage: onMessageType,
  registerListeners: registerListenersType
) => {
  await registerAuthCookies();
  const iframeScalerParent = await getSpacePortal(space_id, onMessage, registerListeners);
  const sidebar = document.querySelector(".gb_Ud");
  if (sidebar) {
    sidebar.prepend(iframeScalerParent);
  }
  return iframeScalerParent;
};

/**
 * Trigger monitoring when on Gmail.
 */
const trigger = (url: string) => {
  const isGmail = url.includes("mail.google.com");
  if (isGmail && !window.mantisObserver) {
    setTimeout(() => window.mantisStartMonitoring(), 1000);
  }
  return isGmail;
};

const onMessage = async (messageType: string, messagePayload: any) => {
  if (messageType === "select") {
    const emailId = messagePayload.point.metadata.legacy_id;
    const emailRow = document.querySelector(`[data-legacy-last-message-id="${emailId}"]`) as HTMLElement;
    if (emailRow) {
      emailRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const prevColor = emailRow.style.backgroundColor;
      emailRow.style.backgroundColor = 'yellow';
      setTimeout(() => {
        emailRow.style.backgroundColor = prevColor;
      }, 3000);
    }
  }
};

export const GmailConnection: MantisConnection = {
  name: "Gmail",
  description: "Create a space using your selected emails.",
  icon: gmailIcon,
  trigger,
  createSpace,
  injectUI,
  onMessage
};
