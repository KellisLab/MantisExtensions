import type { MantisConnection, injectUIType, setProgressType } from "../types";  
import { GenerationProgress } from "../types";
import gmailIcon from "../../../assets/gmail.png";
import { registerAuthCookies, reqSpaceCreation } from "../../driver";

/** Sleep helper */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Wait for a DOM element with timeout
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

// Global storage for email data and monitoring state
declare global {
  interface Window {
    mantisExtractedEmails: Array<{
      subject: string;
      sender: string;
      content: string;
      date: string | null;
      time: string | null;
    }>;
    mantisProcessingEmail: boolean;
    mantisSelectedRows: Set<string>;
    mantisObserver: MutationObserver | null;
    mantisStartMonitoring: () => void;
    mantisStopMonitoring: () => void;
  }
}

// Initialize global storage
window.mantisExtractedEmails = window.mantisExtractedEmails || [];
window.mantisProcessingEmail = false;
window.mantisSelectedRows = window.mantisSelectedRows || new Set();
window.mantisObserver = window.mantisObserver || null;

/* ============================= */
/*       Email Processing        */
/* ============================= */

/**
 * Process a single email row
 */
async function processEmail(row: HTMLTableRowElement) {
  if (window.mantisProcessingEmail || window.mantisSelectedRows.has(row.id)) return;
  
  try {
    window.mantisProcessingEmail = true;
    window.mantisSelectedRows.add(row.id);
    
    // Open the email
    row.click();
    
    const [subjectEl, bodyEl] = await Promise.all([
      waitForElement(".hP", 1000),
      waitForElement("div.a3s.aiL", 1000)
    ]);

    if (!subjectEl || !bodyEl) {
      window.history.back();
      await sleep(200);
      window.mantisProcessingEmail = false;
      return;
    }

    // Wait for content to stabilize
    let contentText = "";
    let prevLength = 0;
    let stableCount = 0;
    
    while (stableCount < 5 || contentText.length === 0) {
      contentText = bodyEl.textContent?.trim() || "";
      if (contentText.length > prevLength) {
        prevLength = contentText.length;
        stableCount = 0;
      } else {
        stableCount++;
      }
      await sleep(200);
    }

    // Extract email data
    const subject = subjectEl.textContent?.trim() || "No Subject";
    
    const senderEl = document.querySelector(".gD");
    const sender = senderEl
      ? (senderEl.getAttribute("email") || senderEl.textContent || "Unknown")
      : "Unknown";
    
    const dateTimeEl = document.querySelector(".g3") || document.querySelector(".gK");
    const dateTimeText = dateTimeEl
      ? (dateTimeEl.getAttribute("title") || dateTimeEl.textContent)
      : null;
    
    let date: string | null = null;
    let time: string | null = null;
    
    if (dateTimeText?.includes(",")) {
      [date, time] = dateTimeText.split(",").map(s => s.trim());
    } else {
      date = dateTimeText;
    }

    const emailData = { 
      subject: subject || "N/A", 
      sender: sender || "N/A", 
      content: contentText || "N/A", 
      date, 
      time 
    };
    
    // Go back to inbox and store processed email
    window.history.back();
    await sleep(200);
    window.mantisExtractedEmails.push(emailData);
    console.log("Email processed:", subject);
    
  } catch (error) {
    console.error("Error processing email:", error);
    window.history.back();
    await sleep(200);
  } finally {
    window.mantisProcessingEmail = false;
  }
}

/* ============================= */
/*      Email Monitoring         */
/* ============================= */

/**
 * Start monitoring for selected emails
 */
window.mantisStartMonitoring = () => {
  if (window.mantisObserver) return;
  
  console.log("Starting email selection monitoring");
  
  window.mantisObserver = new MutationObserver(() => {
    if (window.mantisProcessingEmail) return;
    
    const selectedEmails = document.querySelectorAll<HTMLTableRowElement>("tr.zA.zE.x7, tr.zA.yO.x7");
    if (selectedEmails.length === 0) return;
    
    // Process one unprocessed email at a time
    for (const row of selectedEmails) {
      if (!window.mantisSelectedRows.has(row.id) && row.id) {
        processEmail(row);
        break;
      }
    }
  });
  
  window.mantisObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });
};

/**
 * Stop email monitoring
 */
window.mantisStopMonitoring = () => {
  if (window.mantisObserver) {
    window.mantisObserver.disconnect();
    window.mantisObserver = null;
    console.log("Email selection monitoring stopped");
  }
};

/* ============================= */
/*  Space Creation & UI Injection */
/* ============================= */

/**
 * Create a space using processed emails and a user-provided space name
 */
const createSpace = async (injectUI: injectUIType, setProgress: setProgressType) => {
  setProgress(GenerationProgress.GATHERING_DATA);
  
  // Start monitoring if not already started
  if (!window.mantisObserver) {
    window.mantisStartMonitoring();
  }
  
  // Ensure emails have been processed
  if (window.mantisExtractedEmails.length === 0) {
    setProgress(GenerationProgress.FAILED);
    throw new Error("No emails have been processed yet. Please select some emails first.");
  }
  
  // Get space name from naming input in the UI
  const nameInput = document.getElementById("mantis-space-name") as HTMLInputElement;
  const spaceName = nameInput?.value || "Untitled Space";

  console.log(`Creating space "${spaceName}" with ${window.mantisExtractedEmails.length} processed emails`);
  setProgress(GenerationProgress.CREATING_SPACE);

  // Pass the space name to the reqSpaceCreation request
  const spaceData = await reqSpaceCreation(window.mantisExtractedEmails, {
    subject: "title",
    sender: "semantic",
    content: "semantic",
    date: "categoric",
    time: "categoric"
  }, spaceName);

  setProgress(GenerationProgress.INJECTING_UI);

  if (!spaceData?.space_id) {
    setProgress(GenerationProgress.FAILED);
    throw new Error("Failed to create space from emails.");
  }

  const createdWidget = await injectUI(spaceData.space_id);
  setProgress(GenerationProgress.COMPLETED);
  return { spaceId: spaceData.space_id, createdWidget };
};

/**
 * Inject UI elements into the sidebar, including a naming panel for the space
 */
const injectUI = async (space_id: string) => {
  await registerAuthCookies();

  const sidebar = document.querySelector(".gb_Ud");
  if (!sidebar) return;

  const container = document.createElement("div");
  Object.assign(container.style, {
    display: "flex",
    alignItems: "center",
    marginTop: "10px"
  });

  // Label with toggle for the widget
  const label = document.createElement("label");
  Object.assign(label.style, {
    display: "inline-flex",
    alignItems: "center",
    cursor: "pointer"
  });

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.style.display = "none";

  const textContainer = document.createElement("span");
  textContainer.innerText = "Mantis";
  Object.assign(textContainer.style, {
    background: "linear-gradient(90deg, #ff2d95, #7100ff)",
    backgroundClip: "text",
    webkitTextFillColor: "transparent",
    fontWeight: "bold",
    marginLeft: "8px"
  });

  label.appendChild(checkbox);
  label.appendChild(textContainer);
  container.appendChild(label);

  // Naming input for the space
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.id = "mantis-space-name";
  nameInput.placeholder = "Space Name";
  Object.assign(nameInput.style, {
    marginLeft: "10px",
    padding: "4px",
    fontSize: "14px"
  });
  container.appendChild(nameInput);

  // Iframe container for the created space view
  const iframeScalerParent = document.createElement("div");
  Object.assign(iframeScalerParent.style, {
    width: "100%",
    height: "80vh",
    display: "none",
    border: "1px solid #ddd"
  });

  const iframe = document.createElement("iframe");
  iframe.src = `${process.env.PLASMO_PUBLIC_FRONTEND}/space/${space_id}`;
  Object.assign(iframe.style, {
    border: "none",
    width: "100%",
    height: "100%"
  });

  iframeScalerParent.appendChild(iframe);
  checkbox.addEventListener("change", () => {
    iframeScalerParent.style.display = checkbox.checked ? "block" : "none";
  });

  sidebar.prepend(container);
  sidebar.prepend(iframeScalerParent);

  return container;
};

/**
 * Trigger monitoring for Gmail if applicable
 */
const trigger = (url: string) => {
  const isGmail = url.includes("mail.google.com");
  if (isGmail && !window.mantisObserver) {
    // Start monitoring when extension is triggered on Gmail
    setTimeout(() => window.mantisStartMonitoring(), 1000);
  }
  return isGmail;
};

export const GmailConnection: MantisConnection = {
  name: "Gmail",
  description: "Create a space using your selected gmails.",
  icon: gmailIcon,
  trigger,
  createSpace,
  injectUI,
};
