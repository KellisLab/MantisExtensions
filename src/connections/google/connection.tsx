import type { MantisConnection, injectUIType, setProgressType } from "../types";
import { GenerationProgress } from "../types";

import googleIcon from "../../../assets/google.png";
import { registerAuthCookies, reqSpaceCreation } from "../../driver";

const trigger = (url: string) => {
    return url.includes("google.com/search");
}

const createSpace = async (injectUI: injectUIType, setProgress: setProgressType) => {
    setProgress (GenerationProgress.GATHERING_DATA);

    // Extract k param from the URL
    const url = new URL(window.location.href);
    const searchParams = url.searchParams;
    const query = searchParams.get("q");

    const searchResults = [];

    for (let start = 0; start < 100; start += 10) {
        const baseReqURL = "https://www.googleapis.com/customsearch/v1";
        const params = {
            key: process.env.GOOGLE_API_KEY,
            cx: "6161a1838d8c34589",
            q: query,
            start: start.toString(),
        };

        const paramString = new URLSearchParams(params);

        const response = await fetch(`${baseReqURL}?${paramString}`);

        if (!response.ok) {
            throw new Error(`Failed to fetch search results: ${await response.text()}`);
        }

        const data = await response.json();

        searchResults.push(...data.items);
    }

    const extractedData = searchResults.map(item => ({
        title: item.title,
        semantic_title: item.title,
        link: item.link,
        snippet: item.snippet
    }));

    console.log (extractedData);

    setProgress (GenerationProgress.CREATING_SPACE);

    const spaceData = await reqSpaceCreation (extractedData, {
        "title": "title",
        "semantic_title": "semantic",
        "link": "links",
        "snippet": "semantic"
    }, query);

    setProgress (GenerationProgress.INJECTING_UI);

    const spaceId = spaceData.space_id;

    const createdWidget = await injectUI(spaceId);

    setProgress (GenerationProgress.COMPLETED);

    return { spaceId, createdWidget };
}
const injectUI = async (space_id: string) => {
    const menu = document.querySelector("#hdtb-sc > div > div > div.crJ18e").children[0];

    // Container for everything
    const div = document.createElement("div");

    // Toggle switch wrapper
    const label = document.createElement("label");
    label.style.display = "inline-flex";
    label.style.alignItems = "center";
    label.style.cursor = "pointer";
    label.className = "nPDzT T3FoJb YmvwI";

    // Checkbox as toggle
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.style.display = "none";

    // Text container with sparkling style
    const textContainer = document.createElement("span");
    textContainer.innerText = "Mantis";
    textContainer.style.background = "linear-gradient(90deg,rgb(255, 188, 222),rgb(223, 197, 255))";
    textContainer.style.backgroundClip = "text";
    textContainer.style.webkitTextFillColor = "transparent";
    textContainer.style.fontWeight = "bold";

    await registerAuthCookies();

    const scale = 0.75;

    // Create the iframe, hidden by default
    const iframeScalerParent = document.createElement("div");
    iframeScalerParent.style.width = "100%";
    iframeScalerParent.style.height = "80vh";
    iframeScalerParent.style.display = "none";
    iframeScalerParent.style.border = "none";

    const iframe = document.createElement("iframe");
    iframe.src = `${process.env.FRONTEND}/space/${space_id}`;
    iframe.style.border = "none";
    iframe.style.transform = `scale(${scale})`;
    iframe.style.transformOrigin = "top left";
    iframe.style.width = (100 / scale).toString() + "%";
    iframe.style.height = (80 / scale).toString() + "vh";
    iframe.style.overflow = "hidden";
      
    // Toggle behavior
    checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
            iframeScalerParent.style.display = "block";
            textContainer.style.background = "linear-gradient(90deg, #ff2d95, #7100ff)";
        } else {
            iframeScalerParent.style.display = "none";
            textContainer.style.background = "linear-gradient(90deg,rgb(255, 188, 222),rgb(223, 197, 255))";
        }
        textContainer.style.backgroundClip = "text";
    });

    // Assemble elements
    label.appendChild(textContainer);
    label.appendChild(checkbox);
    div.appendChild(label);

    iframeScalerParent.appendChild(iframe);
    document.querySelector("#appbar > div > div:nth-child(2)").prepend(iframeScalerParent);

    // Insert into the menu
    menu.insertBefore(div, menu.children[1]);

    return div;
}

export const GoogleConnection: MantisConnection = {
    name: "Google",
    description: "Builds spaces based on the results of your Google searches",
    icon: googleIcon,
    trigger: trigger,
    createSpace: createSpace,
    injectUI: injectUI,
}