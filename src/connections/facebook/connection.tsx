import type { MantisConnection, injectUIType, onMessageType, registerListenersType, setProgressType, establishLogSocketType } from "../types";
import { GenerationProgress } from "../types";

import facebookIcon from "data-base64:../../../assets/facebook.png";
import { getSpacePortal, registerAuthCookies, reqSpaceCreation } from "../../driver";

const trigger = (url: string) => {
   return url.includes("facebook.com");
}

const createSpace = async (injectUI: injectUIType, setProgress: setProgressType, onMessage: onMessageType, registerListeners: registerListenersType, establishLogSocket: establishLogSocketType) => {

    setProgress(GenerationProgress.GATHERING_DATA);

    const extractedData: any[] = [];

    const postElements = document.querySelectorAll("div[role='main']");

    postElements.forEach((postElement, index) => {
        const textContent = postElement.textContent;
        if (textContent) {
            extractedData.push({
                index: index,
                content: textContent,
            });
        }
    });

    console.log("Extracted Data:", extractedData);

    setProgress(GenerationProgress.CREATING_SPACE);

    const spaceData = await reqSpaceCreation(extractedData, {
        index: "numeric",
        content: "semantic",
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

    const targetElement = document.querySelector("div[role='feed']");

    if (targetElement) {
        targetElement.prepend(iframeScalerParent);
    } else {
        document.body.appendChild(iframeScalerParent); // Fallback in case the feed is not found
    }

    return iframeScalerParent;
};


export const FacebookConnection: MantisConnection = {
   name: "Facebook",
   description: "Builds spaces based on the content of a Facebook feed",
   icon: facebookIcon,
   trigger: trigger,
   createSpace: createSpace,
   injectUI: injectUI,
}