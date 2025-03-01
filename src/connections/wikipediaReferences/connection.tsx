import { create } from "domain";
import type { MantisConnection, injectUIType, setProgressType } from "../types";
import { GenerationProgress } from "../types";

import wikiIcon from "../../../assets/wiki.png";
import { getSpacePortal, registerAuthCookies, reqSpaceCreation } from "../../driver";

const trigger = (url: string) => {
    return url.includes("en.wikipedia.org/wiki");
}

const createSpace = async (injectUI: injectUIType, setProgress: setProgressType) => {
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

    setProgress(GenerationProgress.CREATING_SPACE);

    const spaceData = await reqSpaceCreation(extractedData, {
        "title": "title",
        "link": "links",
        "__mantis_href": "links",
        "text": "semantic",
    });

    setProgress(GenerationProgress.INJECTING_UI);

    const spaceId = spaceData.space_id;

    const createdWidget = await injectUI(spaceId);

    setProgress(GenerationProgress.COMPLETED);

    return { spaceId, createdWidget };
}

const injectUI = async (space_id: string) => {
    await registerAuthCookies();

    const iframeScalerParent = getSpacePortal (space_id);

    document.querySelector("body > div.mw-page-container").prepend(iframeScalerParent);

    return iframeScalerParent;
}

const onMessage = async (messageType, messagePayload) => {

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