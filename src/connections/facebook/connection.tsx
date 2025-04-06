import type { MantisConnection, injectUIType, onMessageType, registerListenersType, setProgressType, establishLogSocketType } from "../types";
import { GenerationProgress } from "../types";

import facebookIcon from "data-base64:../../../assets/facebook.png";
import { getSpacePortal, registerAuthCookies, reqSpaceCreation } from "../../driver";

const trigger = (url: string) => {
    return url.includes("facebook.com");
};

const extractedData: any[] = [];

const createSpace = async (injectUI: injectUIType, setProgress: setProgressType, onMessage: onMessageType, registerListeners: registerListenersType, establishLogSocket: establishLogSocketType) => {
    
    setProgress(GenerationProgress.GATHERING_DATA);

    console.log("Extracted Data:", extractedData);

    if (extractedData.length === 0) {
        console.warn("No data extracted, so no space will be created.");
        setProgress(GenerationProgress.FAILED);
        return;
    } else if (extractedData.length < 5) {
        console.warn("Need more than 5 data points to create a space.");
        setProgress(GenerationProgress.FAILED);
        return;
    }

    setProgress(GenerationProgress.CREATING_SPACE);

    const spaceData = await reqSpaceCreation(extractedData, {
        content: "links",
    }, establishLogSocket);
  
    setProgress(GenerationProgress.INJECTING_UI);
 
    const spaceId = spaceData.space_id;
    const createdWidget = await injectUI(spaceId, onMessage, registerListeners);
  
    setProgress(GenerationProgress.COMPLETED);
  
    return { spaceId, createdWidget };
};
 
const injectUI = async (space_id: string, onMessage: onMessageType, registerListeners: registerListenersType) => {
    await registerAuthCookies();
 
    const iframeScalerParent = await getSpacePortal(space_id, onMessage, registerListeners);
 
    document.querySelector("div.x1hc1fzr.x1unhpq9.x6o7n8i").prepend(iframeScalerParent);
 
    return iframeScalerParent;
};

const extractURL = (embedCode: string): string | null => {
    try {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = embedCode;
        const iframe = tempDiv.querySelector("iframe");
        if (iframe) return iframe.getAttribute("src");
        return null;
    } catch (error) {
        console.error("There was an error while extracting the post's URL: ", error);
        return null;
    }
};

const monitorDOM = () => {
    const targetSelector = "div.x9f619.x1n2onr6.x1ja2u2z";
    const elementSelector = "input[aria-label='Sample code input']";

    const targetNode = document.querySelector(targetSelector);
    if (!targetNode) return console.error("Main page not found");

    const observer = new MutationObserver(mutations => {
        for (const {addedNodes} of mutations) {
            for (const node of addedNodes) {
                if (!(node instanceof Element)) continue;
                const targetElement = node.querySelector(elementSelector) as HTMLInputElement;
                if (targetElement) {
                    const url = extractURL(targetElement.value);
                    if (url) {
                        extractedData.push({ content: url });
                        console.log("Data point added: ", url);

                        const closeButton = node.querySelector("div[aria-label='Close']");
                        if (closeButton) (closeButton as HTMLAnchorElement).click();
                    }
                }
            }
        }
    });

    observer.observe(targetNode, {childList: true, subtree: true});
};

const addButton = (injectUI: injectUIType, setProgress: setProgressType, onMessage: onMessageType, registerListeners: registerListenersType, establishLogSocket: establishLogSocketType) => {
    const feedElement = document.querySelector("div[role='banner']");
    if (!feedElement) return console.error("Couldn't find Facebook banner");

    const createSpaceButton = document.createElement("button");
    createSpaceButton.textContent = "Create space";
    createSpaceButton.addEventListener("click", () => { createSpace(injectUI, setProgress, onMessage, registerListeners, establishLogSocket) });

    feedElement.prepend(createSpaceButton);
};


const setup = (injectUI: injectUIType, setProgress: setProgressType, onMessage: onMessageType, registerListeners: registerListenersType, establishLogSocket: establishLogSocketType) => {
    monitorDOM();
    addButton(injectUI, setProgress, onMessage, registerListeners, establishLogSocket);
};

window.addEventListener("load", () => {
    if (window.location.href.includes("facebook.com")) {
        FacebookConnection.onPageLoad();
    }
});

export const FacebookConnection: MantisConnection = {
   name: "Facebook",
   description: "Builds spaces based on the content of a Facebook feed",
   icon: facebookIcon,
   trigger: trigger,
   createSpace: createSpace,
   injectUI: injectUI,
   onPageLoad: setup,
}