import type { MantisConnection, injectUIType, onMessageType, registerListenersType, setProgressType, establishLogSocketType } from "../types";
import { GenerationProgress } from "../types";
import ArxivIcon from "data-base64:../../../assets/arxiv.png";
import { getSpacePortal, registerAuthCookies, reqSpaceCreation } from "../../driver";

const trigger = (url: string) => {
    return url.includes("arxiv.org");
}

const createSpace = async (injectUI: injectUIType, setProgress: setProgressType, onMessage: onMessageType, registerListeners: registerListenersType, establishLogSocket: establishLogSocketType) => {
    setProgress(GenerationProgress.GATHERING_DATA);

    const url = new URL(window.location.href);
    const query = url.searchParams.get("query") || "";
    const spaceTitle = `Arxiv results for ${query}`;

    const extractedData = [];
    let idx = 1;
    for ( let start = 0 ; start < 200; start += 20){
        const apiUrl = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=${start}&max_results=50`;
        const apiResponse = await fetch(apiUrl);
        if (!apiResponse.ok) {
            throw new Error(`Failed to fetch search results: ${await apiResponse.text()}`);
        }
        const data = await apiResponse.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(data, "application/xml");
        const entries = Array.from(xml.getElementsByTagName("entry"));

        if (entries.length === 0) break;

        for ( const entry of entries) {
            const title = entry.querySelector("title")?.textContent || "No title";
            const link = entry.querySelector("id")?.textContent || "No link";
            const summary = entry.querySelector("summary")?.textContent || "No summary";

            extractedData.push({
                idx: idx++,
                title: title,
                link: link,
                snippet: summary
            });
        }
        await new Promise(r => setTimeout(r, 5000));
    }

    setProgress(GenerationProgress.CREATING_SPACE);

    const spaceData = await reqSpaceCreation(extractedData, {
        "idx": "numeric",
        "title": "title",
        "link": "links",
        "snippet": "semantic"
    }, establishLogSocket, spaceTitle);

    setProgress(GenerationProgress.INJECTING_UI);

    const spaceId = spaceData.space_id;
    const createdWidget = await injectUI(spaceId, onMessage, registerListeners);

    setProgress(GenerationProgress.COMPLETED);

    return { spaceId, createdWidget }
    
}

const injectUI = async (space_id: string, onMessage: onMessageType, registerListeners: registerListenersType) => {
    await registerAuthCookies();

    const iframeScalerParent = await getSpacePortal(space_id, onMessage, registerListeners);
    document.querySelector(".search-title")?.prepend(iframeScalerParent);

    return iframeScalerParent;
}

export const ArxivConnection: MantisConnection ={
    name:'Arxiv',
    description:'creates spaces based on the searches within the Arxiv database',
    icon: ArxivIcon,
    trigger: trigger,
    createSpace: createSpace,
    injectUI:injectUI,
}