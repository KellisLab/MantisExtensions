import type { MantisConnection, injectUIType, onMessageType, registerListenersType, setProgressType, establishLogSocketType } from "../types";
import { GenerationProgress } from "../types";
import { getSpacePortal, registerAuthCookies, reqSpaceCreation } from "../../driver";
import linkedin from "data-base64:../../../../assets/linkedin.png";

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

  const waitForSelector = (selector: string, timeout = 5000): Promise<Element> => {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const observer = new MutationObserver((_, obs) => {
        const el = document.querySelector(selector);
        if (el) {
          obs.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for selector: ${selector}`));
      }, timeout);
    });
  };

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
  const name = document.querySelector("h1.text-heading-xlarge")?.textContent?.trim() || "Sadhika Kamchetty";
  const headline = document.querySelector(".text-body-medium.break-words")?.textContent?.trim() || "";
  extractedData.push({
    uuid: uuidv4(),
    title: name,
    text: sanitize(headline),
    link: window.location.href,
    __mantis_href: window.location.href,
    group: "Profile"
  });

  // About
  const aboutSection = Array.from(document.querySelectorAll("section"))
    .find(section => section.innerText?.includes("About"));
  const about = aboutSection?.innerText?.trim();
  if (about) {
    extractedData.push({
      uuid: uuidv4(),
      title: "About Sadhika",
      text: sanitize(about),
      link: window.location.href,
      __mantis_href: window.location.href,
      group: "Profile"
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
        group: "Experience"
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
        group: "Education"
      });
    }
  });

  // Connections
  const connectionCards = document.querySelectorAll("a[href*='/in/']") as NodeListOf<HTMLAnchorElement>;
  const seen = new Set<string>();
  connectionCards.forEach((card) => {
    const connectionName = card.textContent?.trim().replace(/\n+/g, " ") || "Connection";
    const connectionUrl = card.href;
    if (!seen.has(connectionUrl) && !connectionUrl.includes("sadhikakamchetty")) {
      seen.add(connectionUrl);
      extractedData.push({
        uuid: uuidv4(),
        title: `Connection: ${connectionName}`,
        text: `Connected with ${connectionName}`,
        link: connectionUrl,
        __mantis_href: connectionUrl,
        group: "Connections"
      });
    }
  });

  // Filter + Validate
  const filteredData = extractedData.filter(d =>
    typeof d.text === "string" &&
    d.text.trim().length > 0 &&
    typeof d.title === "string"
  );

  console.log("Final filtered data:", JSON.stringify(filteredData, null, 2));

  setProgress(GenerationProgress.CREATING_SPACE);

  const spaceData = await reqSpaceCreation(
    filteredData,
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
      
        // Insert the Mantispace into the LinkedIn homepage feed
        const feedContainer = document.querySelector("main");
        feedContainer?.prepend(iframeScalerParent);
      
        return iframeScalerParent;
      }
      const onMessage = async (messageType: string, messagePayload: any) => {
        if (messageType === "select") {
          const pointTitle = messagePayload.point.metadata.values.title;
      
          // Find the first visible element on the page that includes the selected title
          const elements = Array.from(document.querySelectorAll("*")).filter(el =>
            el.textContent?.includes(pointTitle)
          );
      
          if (elements.length > 0) {
            const el = elements[0] as HTMLElement;

            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.style.backgroundColor = "yellow";
      
            setTimeout(() => {
              el.style.backgroundColor = "";
            }, 3000);
          }
        }
      };
      export const LinkedInConnection: MantisConnection = {
        name: "LinkedIn Home",
        description: "Builds a Mantispace from companies you follow, jobs suggested for you, and your personalized feed data on the LinkedIn homepage.",
        icon: linkedin, // make sure to import your LinkedIn icon at the top
        trigger,
        createSpace,
        onMessage,
        injectUI
      };
      
      
      

