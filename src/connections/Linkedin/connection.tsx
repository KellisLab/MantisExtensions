import type { MantisConnection, injectUIType, onMessageType, registerListenersType, setProgressType, establishLogSocketType } from "../types";
import { GenerationProgress } from "../types";
import { getSpacePortal, registerAuthCookies, reqSpaceCreation } from "../../driver";
import wikiIcon from "data-base64:../../../assets/wiki.png";

import { v4 as uuidv4 } from 'uuid';





const trigger = (url: string) =>
    url.includes("linkedin.com/in/");
  

const createSpace = async (
  injectUI,
  setProgress,
  onMessage,
  registerListeners,
  establishLogSocket
) => {
  setProgress(GenerationProgress.GATHERING_DATA);
  const csvData = await new Promise<any[]>((resolve) => { 
    const banner = document.createElement("div");
    banner.style.position = "fixed";
    banner.style.bottom = "20px";
    banner.style.left = "20px";
    banner.style.zIndex = "99999";
    banner.style.background = "#0073b1";
    banner.style.color = "white";
    banner.style.padding = "16px";
    banner.style.borderRadius = "8px";
    banner.style.boxShadow = "0 4px 8px rgba(0,0,0,0.2)";
    banner.innerHTML = `
      <div style="font-size: 14px; margin-bottom: 8px;">
        Upload your LinkedIn job export CSV:
      </div>
      <button id="mantis-upload-btn">Upload</button>
      <button id="mantis-skip-btn">Skip</button>
    `;
    document.body.appendChild(banner);

    document.getElementById("mantis-upload-btn")?.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".csv";
      input.style.display = "none";
      document.body.appendChild(input);

      input.onchange = async () => {
        const result = [];
        const file = input.files?.[0];
        if (file) {
          const text = await file.text();
          const rows = text.split("\n").map(r => r.split(",").map(c => c.trim().replace(/^"|"$/g, "")));
          const headers = rows[0].map(h => h.toLowerCase());
          const titleIdx = headers.findIndex(h => h.includes("title"));
          const companyIdx = headers.findIndex(h => h.includes("company"));
          const linkIdx = headers.findIndex(h => h.includes("url"));

          if (titleIdx !== -1 && companyIdx !== -1) {
            rows.slice(1).forEach(row => {
              const title = row[titleIdx];
              const company = row[companyIdx];
              const url = linkIdx !== -1 ? row[linkIdx] : "";
              result.push({
                uuid: uuidv4(),
                title: `Applied Job: ${title}`,
                text: `Applied to ${title} at ${company}`,
                link: url,
                __mantis_href: url,
                group: "Applied Jobs"
              });
            });
          }
        }
        input.remove();
        banner.remove();
        resolve(result);
      };

      input.click();
    });

    document.getElementById("mantis-skip-btn")?.addEventListener("click", () => {
      banner.remove();
      resolve([]);
    });
  });

  const waitForSelector = (selector, timeout = 5000) => new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);
    const observer = new MutationObserver((_, obs) => {
      const el = document.querySelector(selector);
      if (el) {
        obs.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      reject(new Error("Timeout waiting for selector: " + selector));
    }, timeout);
  });

  await new Promise(resolve => setTimeout(resolve, 1500));
  try {
    await waitForSelector("section");
    await waitForSelector("h1.text-heading-xlarge");
  } catch (err) {
    console.error("Timed out waiting for sections to load:", err);
  }

  const extractedData = [];

  const sanitize = (text: string) => text.replace(/[^\x00-\x7F]/g, "").substring(0, 1000).trim();

  // Name + Headline
  const name = document.querySelector("h1.text-heading-xlarge")?.textContent?.trim() || "Unknown Name";
  const headline = document.querySelector(".text-body-medium.break-words")?.textContent?.trim() || "";
  extractedData.push({
    uuid: uuidv4(),
    title: name,
    text: sanitize(headline),
    link: window.location.href,
    __mantis_href: window.location.href,
    group: "Profile",
    metadata: {
      tags: [] // ✅ Start empty, user adds later
    }
  });

  // About
  const aboutSection = Array.from(document.querySelectorAll("section"))
    .find(section => section.innerText?.includes("About"));
  const about = aboutSection?.innerText?.trim();
  if (about) {
    extractedData.push({
      uuid: uuidv4(),
      title: "About",
      text: sanitize(about),
      link: window.location.href,
      __mantis_href: window.location.href,
      group: "Profile",
      metadata: {
        tags: [] // Start empty, user adds later
      }
    });
  }

  // Experience
  const experienceSection = Array.from(document.querySelectorAll("section"))
    .find(section => section.innerText?.includes("Experience"));
  const experienceItems = experienceSection?.querySelectorAll("li") || [];

  experienceItems.forEach((entry) => {
    const jobTitle = entry.querySelector("span[aria-hidden=true]")?.textContent?.trim();
    const description = entry.innerText?.trim();
    if (jobTitle && description) {
      extractedData.push({
        uuid: uuidv4(),
        title: `Experience: ${jobTitle}`,
        text: sanitize(description),
        link: window.location.href,
        __mantis_href: window.location.href,
        group: "Experience",
        metadata: {
          tags: [] // Start empty, user adds later
        }
      });
    }
  });

  // Education
  const educationSection = Array.from(document.querySelectorAll("section"))
    .find(section => section.innerText?.includes("Education"));
  const educationItems = educationSection?.querySelectorAll("li") || [];

  educationItems.forEach((entry) => {
    const school = entry.querySelector("span[aria-hidden=true]")?.textContent?.trim();
    const eduDetails = entry.innerText?.trim();
    if (school && eduDetails) {
      extractedData.push({
        uuid: uuidv4(),
        title: `Education: ${school}`,
        text: sanitize(eduDetails),
        link: window.location.href,
        __mantis_href: window.location.href,
        group: "Education",
        metadata: {
          tags: [] // Start empty, user adds later
        }
      });
    }
  });

  // Connections
  const connectionCards = document.querySelectorAll("a[href*='/in/']") as NodeListOf<HTMLAnchorElement>;
  const seen = new Set<string>();
  connectionCards.forEach((card) => {
    const connectionName = card.textContent?.trim().replace(/\n+/g, " ") || "Connection";
    const connectionUrl = card.href;
    if (!seen.has(connectionUrl)) {
      seen.add(connectionUrl);
      extractedData.push({
        uuid: uuidv4(),
        title: `Connection: ${connectionName}`,
        text: `Connected with ${connectionName}`,
        link: connectionUrl,
        __mantis_href: connectionUrl,
        group: "Connections",
        metadata: {
          tags: [] // Start empty, user adds later
        }
      });
    }
  });
//activity section 
//  Find Activity Section (Posts)
const activitySection = Array.from(document.querySelectorAll("section")).find(section =>
  section.innerText?.includes("Activity")
);

if (activitySection) {
  const postCards = activitySection.querySelectorAll("a[href*='/feed/update/']");

  postCards.forEach(card => {
    const postUrl = (card as HTMLAnchorElement).href;
    const postContent = card.textContent?.trim().replace(/\s+/g, " ") || "LinkedIn Activity";

    extractedData.push({
      uuid: uuidv4(),
      title: `Activity: ${postContent.slice(0, 40)}...`,
      text: postContent,
      link: postUrl,
      __mantis_href: postUrl,
      group: "Posts" ,
      metadata: {
        tags: [] // Start empty, user adds later
      } // This ensures it becomes its own Mantispace landscape
    });
  });
}

//messages
const getMessagesFromIframe = async (): Promise<any[]> => {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = "https://www.linkedin.com/messaging/";
    document.body.appendChild(iframe);

    iframe.onload = () => {
      setTimeout(() => {
        const doc = iframe.contentDocument;
        if (!doc) return resolve([]);

        const threads = doc.querySelectorAll("li.msg-conversation-listitem");
        const messages = Array.from(threads).map((thread) => {
          const name = thread.querySelector(".msg-conversation-listitem__participant-names")?.textContent?.trim() || "Unknown";
          const snippet = thread.querySelector(".msg-conversation-listitem__message-snippet")?.textContent?.trim() || "No preview";
          const timestamp = thread.querySelector("time")?.textContent?.trim() || "";
          const threadId = thread.getAttribute("data-conversation-id");
          const threadUrl = threadId
            ? `https://www.linkedin.com/messaging/thread/${threadId}/`
            : "https://www.linkedin.com/messaging/";

          return {
            uuid: uuidv4(),
            title: `Message with ${name}`,
            text: `${timestamp} - ${snippet}`,
            link: threadUrl,
            __mantis_href: threadUrl,
            group: "Messages",
            metadata: { tags: [] }
          };
        });

        resolve(messages);
      }, 2000); // give time for iframe to fully load
    };
  });
};

// ⬇️ Then inside createSpace()
const messages = await getMessagesFromIframe();
extractedData.push(...messages);




const getFollowedCompanies = async (): Promise<any[]> => {
  return new Promise(resolve => {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = "https://www.linkedin.com/feed/following/";
    document.body.appendChild(iframe);

    iframe.onload = () => {
      setTimeout(() => {
        const doc = iframe.contentDocument;
        if (!doc) return resolve([]);

        const cards = doc.querySelectorAll("li.follows-recommendation-card__info") || [];

        const follows = Array.from(cards).map(card => {
          const name = card.querySelector(".follows-recommendation-card__name")?.textContent?.trim() || "Unknown";
          const subtitle = card.querySelector(".follows-recommendation-card__headline")?.textContent?.trim() || "";
          const link = (card.querySelector("a") as HTMLAnchorElement)?.href || "";

          return {
            uuid: uuidv4(),
            title: `Following: ${name}`,
            text: subtitle,
            link,
            __mantis_href: link,
            group: "Companies"
          };
        });

        resolve(follows);
      }, 2000); // allow time for iframe content to fully render
    };
  });
};

const followedCompanies = await getFollowedCompanies();
extractedData.push(...followedCompanies);


  extractedData.push(...csvData);

  // Filter + Validate
  const filteredData = extractedData.filter(d =>
    typeof d.text === "string" &&
    d.text.trim().length > 0 &&
    typeof d.title === "string"
  );
  const patchedData = filteredData.map(d => ({
    ...d,
    links: d.link,                //  remap for schema
    semantic: d.text,
    label: d.group
  }));
  

  console.log("Final filtered data:", JSON.stringify(filteredData, null, 2));

  setProgress(GenerationProgress.CREATING_SPACE);

  const spaceData = await reqSpaceCreation(
    patchedData,
    {
      id: "uuid",
      title: "title",
      link: "links",
      __mantis_href: "links",
      text: "semantic",
      group: "label"
    },
    establishLogSocket
  );

  setProgress(GenerationProgress.INJECTING_UI);

  const spaceId = spaceData.space_id;
  const createdWidget = await injectUI(spaceId, onMessage, registerListeners);

  setProgress(GenerationProgress.COMPLETED);

  return { spaceId, createdWidget };
};



    const injectUI = async (
        space_id: string,
        onMessage: onMessageType,
        registerListeners: registerListenersType
      ) => {
        await registerAuthCookies();
      
        const iframeScalerParent = await getSpacePortal(space_id, onMessage, registerListeners);
        const waitForCards = async (doc: Document) => {
          return new Promise<Element[]>((resolve) => {
            const interval = setInterval(() => {
              const cards = Array.from(doc.querySelectorAll('[data-point-id]'));
              if (cards.length > 0) {
                clearInterval(interval);
                resolve(cards);
              }
            }, 300);
          });
        };
        
        setTimeout(async () => {
          const iframe = iframeScalerParent.querySelector("iframe");
          if (!iframe || !iframe.contentWindow) return;
        
          const doc = iframe.contentDocument || iframe.contentWindow.document;
          const cards = await waitForCards(doc);
        
          cards.forEach(card => {
            const footer = document.createElement("div");
            footer.style.marginTop = "8px";
            footer.style.display = "flex";
            footer.style.gap = "6px";
        
            const tags = ["invite", "interesting", "potential hire"];
            tags.forEach(tag => {
              const btn = document.createElement("button");
              btn.innerText = tag;
              btn.style.padding = "4px 8px";
              btn.style.fontSize = "12px";
              btn.style.borderRadius = "4px";
              btn.style.border = "none";
              btn.style.cursor = "pointer";
              btn.style.background = "#eee";
              btn.style.color = "#333";
        
              btn.onclick = () => {
                btn.style.background = "#0073b1";
                btn.style.color = "#fff";
                alert(`✅ Tagged as: ${tag}`);
              };
        
              footer.appendChild(btn);
            });
        
            card.appendChild(footer);
          });
        }, 2000);
        
        let highlighterMode = false;



// Add highlighter CSS
const style = document.createElement("style");
style.innerHTML = `.mantis-highlight {
  outline: 2px solid orange;
  background-color: rgba(255, 200, 0, 0.25);
}`;
document.head.appendChild(style);




      
        // Insert the Mantispace into the LinkedIn homepage feed
        const feedContainer = document.querySelector("main");
        feedContainer?.prepend(iframeScalerParent);
      
        return iframeScalerParent;
      }
      const onMessage = async (messageType: string, messagePayload: any) => {
        const pointTitle = messagePayload.point.metadata.values.title;
      
        // ⬇️ Access the iframe that holds the Mantispace
        const iframe = document.querySelector("iframe");
        if (!iframe || !iframe.contentWindow) return;
      
        const doc = iframe.contentDocument || iframe.contentWindow.document;
      
        // ⬇️ Now search inside the iframe DOM
        const cards = Array.from(doc.querySelectorAll('[data-point-id]'));
      
        const matchingCard = cards.find(card => {
          return card.textContent?.includes(pointTitle);
        }) as HTMLElement;
        
      
        if (matchingCard) {
          matchingCard.scrollIntoView({ behavior: "smooth", block: "center" });
      
          if (messageType === "select") {
            matchingCard.style.backgroundColor = "yellow";
            setTimeout(() => {
              matchingCard.style.backgroundColor = "";
            }, 3000);
          }
      
          if (messageType === "highlight") {
            matchingCard.classList.add("mantis-highlight");
          }
      
          // ✅ Optionally: show tag buttons dynamically
          const existingFooter = matchingCard.querySelector(".mantis-tags-footer");
          if (!existingFooter) {
            const footer = document.createElement("div");
            footer.className = "mantis-tags-footer";
            footer.style.marginTop = "8px";
            footer.style.display = "flex";
            footer.style.gap = "6px";
      
            const tags = ["invite", "interesting", "potential hire"];
            tags.forEach(tag => {
              const btn = document.createElement("button");
              btn.innerText = tag;
              btn.style.padding = "4px 8px";
              btn.style.fontSize = "12px";
              btn.style.borderRadius = "4px";
              btn.style.border = "none";
              btn.style.cursor = "pointer";
              btn.style.background = "#eee";
              btn.style.color = "#333";
      
              btn.onclick = () => {
                btn.style.background = "#0073b1";
                btn.style.color = "#fff";
                alert(`✅ Tagged as: ${tag}`);
              };
      
              footer.appendChild(btn);
            });
      
            matchingCard.appendChild(footer);
          }
        }
      };
      
      
      export const LinkedInConnection: MantisConnection = {
        name: "LinkedIn Home",
        description: "Builds a Mantispace from companies you follow, jobs suggested for you, and your personalized feed data on the LinkedIn homepage.",
        icon: wikiIcon, // make sure to import your LinkedIn icon at the top
        trigger,
        createSpace,
        onMessage,
        injectUI
      };
      
