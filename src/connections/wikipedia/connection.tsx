import { create } from "domain";
import type { MantisConnection, injectUIType, setProgressType } from "../types";
import { GenerationProgress } from "../types";

import wikiIcon from "../../../assets/wiki.png";
import { FRONTEND } from "../../config";
import { registerAuthCookies, reqSpaceCreation } from "../../driver";

const trigger = (url: string) => {
    return url.includes("en.wikipedia.org/wiki");
}

const createSpace = async (injectUI: injectUIType, setProgress: setProgressType) => {
    setProgress(GenerationProgress.GATHERING_DATA);

    const references = document.querySelectorAll<HTMLAnchorElement>("p > a[title][href]");
    const extractedData = [];

    console.log(`Collected ${references.length} references`);

    let counter = 0;

    for (const reference of references) {
        const url = new URL(reference.href);

        if (counter >= 150) break;
        counter += 1;

        try {
            const response = await fetch(url.href);
            if (!response.ok) continue;

            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");

            const articleElement = doc.querySelectorAll("#mw-content-text > div > p");

            const totalText = Array.from(articleElement).map((element) => element.textContent).join(" ");

            const title = reference.title;

            extractedData.push({
                title,
                link: url.href,
                text: totalText,
            });
        } catch (error) {
            console.error("Error fetching Wikipedia article:", error);
        }
    }

    console.log(extractedData);

    setProgress(GenerationProgress.CREATING_SPACE);

    const spaceData = await reqSpaceCreation(extractedData, {
        "title": "title",
        "link": "links",
        "text": "semantic"
    });

    setProgress(GenerationProgress.INJECTING_UI);

    const spaceId = spaceData.space_id;

    const createdWidget = await injectUI(spaceId);

    setProgress(GenerationProgress.COMPLETED);

    return { spaceId, createdWidget };
}
const injectUI = async (space_id: string) => {
    await registerAuthCookies();

    const scale = 0.75;

    // Create the iframe, hidden by default
    const iframeScalerParent = document.createElement("div");
    iframeScalerParent.style.width = "100%";
    iframeScalerParent.style.height = "80vh";
    iframeScalerParent.style.display = "none";
    iframeScalerParent.style.border = "none";

    const iframe = document.createElement("iframe");
    iframe.src = `${FRONTEND}/space/${space_id}`;
    iframe.style.border = "none";
    iframe.style.transform = `scale(${scale})`;
    iframe.style.transformOrigin = "top left";
    iframe.style.width = (100 / scale).toString() + "%";
    iframe.style.height = (80 / scale).toString() + "vh";
    iframe.style.overflow = "hidden";
    iframeScalerParent.appendChild(iframe);

    document.querySelector("body > div.mw-page-container > div").prepend(iframeScalerParent);

    return iframeScalerParent;
}

export const WikipediaConnection: MantisConnection = {
    name: "Wikipedia",
    description: "Builds spaces based on the references in a Wikipedia article",
    icon: wikiIcon,
    trigger: trigger,
    createSpace: createSpace,
    injectUI: injectUI,
}