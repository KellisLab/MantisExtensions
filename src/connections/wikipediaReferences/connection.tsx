import type { MantisConnection, injectUIType, onMessageType, registerListenersType, setProgressType, establishLogSocketType } from "../types";
import { GenerationProgress } from "../types";

import wikiIcon from "data-base64:../../../assets/wiki.png";
import { getSpacePortal, registerAuthCookies, reqSpaceCreation } from "../../driver";

const trigger = (url: string) => {
    return url.includes("en.wikipedia.org/wiki");
}

const createSpace = async (injectUI: injectUIType, setProgress: setProgressType, onMessage: onMessageType, registerListeners: registerListenersType, establishLogSocket: establishLogSocketType) => {
    setProgress(GenerationProgress.GATHERING_DATA);

    const references = document.querySelectorAll<HTMLAnchorElement>("p > a[title][href]");
    const extractedData = [];

    console.log(`Collected ${references.length} references`);

    for (const reference of references) {
        const url = new URL(reference.href);

        try {
            const response = await fetch(url.href);
            if (!response.ok) continue;

            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");

            const articleElement = doc.querySelectorAll("#mw-content-text > div > p");

            const totalText = Array.from(articleElement).map((element) => element.textContent).join(" ").substring (0, 200);

            const title = reference.title;

            extractedData.push({
                title,
                link: url.href,
                __mantis_href: url.href,
                text: totalText,
            });
        } catch (error) {
            console.error("Error fetching Wikipedia article:", error);
        }
    }

    const filteredData = extractedData.filter((data) => data.text.length > 0);

    setProgress(GenerationProgress.CREATING_SPACE);

    const spaceData = await reqSpaceCreation(filteredData, {
        "title": "title",
        "link": "links",
        "__mantis_href": "links",
        "text": "semantic",
    }, establishLogSocket);

    setProgress(GenerationProgress.INJECTING_UI);

    const spaceId = spaceData.space_id;

    const createdWidget = await injectUI(spaceId, onMessage, registerListeners);

    setProgress(GenerationProgress.COMPLETED);

    return { spaceId, createdWidget };
}

const injectUI = async (space_id: string, onMessage: onMessageType, registerListeners: registerListenersType) => {
    await registerAuthCookies();

    const iframeScalerParent = await getSpacePortal (space_id, onMessage, registerListeners);

    document.querySelector("body > div.mw-page-container").prepend(iframeScalerParent);

    return iframeScalerParent;
}

// Receives messages from within Mantis
const onMessage = async (messageType, messagePayload) => {
    if (messageType == "select") {
        const pointTitle = messagePayload.point.metadata.values.title;

        const references = document.querySelectorAll<HTMLAnchorElement>("p > a[title][href]");
        const matchingReference = Array.from (references).find(ref => ref.title === pointTitle);

        if (matchingReference) {
            // Scroll to the matching reference
            matchingReference.scrollIntoView({ behavior: 'smooth', block: 'center' });
            matchingReference.style.backgroundColor = 'yellow';

            setTimeout(() => {
                matchingReference.style.backgroundColor = '';
            }, 3000);
        }
    }
};

export const WikipediaReferencesConnection: MantisConnection = {
    name: "Wikipedia References",
    description: "Builds spaces based on the references in a Wikipedia article",
    icon: wikiIcon,
    trigger: trigger,
    createSpace: createSpace,
    onMessage: onMessage,
    injectUI: injectUI,
}