import type { MantisConnection, injectUIType, setProgressType } from "../types";
import { GenerationProgress } from "../types";

import googleScholarIcon from "../../../assets/scholar.png";
import { getSpacePortal, registerAuthCookies, reqSpaceCreation } from "../../driver";

const trigger = (url: string) => {
    return url.includes("scholar.google.com/scholar?");
}

const createSpace = async (injectUI: injectUIType, setProgress: setProgressType) => {
    setProgress (GenerationProgress.GATHERING_DATA);

    const url = new URL(window.location.href);
    const searchParams = url.searchParams;
    const query = searchParams.get("q");
    const as_sdt = searchParams.get("as_sdt") || "0";

    const extractedData = [];

    for (let start = 0; start < 200; start += 20) {
        // sleep for 5 sec
        await new Promise(r => setTimeout(r, 5000));

        const innerUrl = new URL("https://serpapi.com/search");
        innerUrl.searchParams.set("engine", "google_scholar");
        innerUrl.searchParams.set("q", query || "");
        innerUrl.searchParams.set("api_key", process.env.PLASMO_PUBLIC_SERP_API_KEY || "");
        innerUrl.searchParams.set("num", "20");
        innerUrl.searchParams.set("start", start.toString());
        innerUrl.searchParams.set("as_sdt", as_sdt);

        const proxyUrl = `${process.env.PLASMO_PUBLIC_SDK}/get_proxy/${encodeURIComponent(innerUrl.toString())}`;

        const apiResponse = await fetch(proxyUrl);

        if (!apiResponse.ok) {
            throw new Error(`Failed to fetch search results: ${await apiResponse.text()}`);
        }

        const data = await apiResponse.json();

        for (const result of data.organic_results) {
            console.log (result);
            
            extractedData.push({
                idx: result.position + start,
                title: result.title,
                link: result.link,
                snippet: result.snippet
            });
        }
    }

    console.log (extractedData);

    setProgress (GenerationProgress.CREATING_SPACE);

    const spaceData = await reqSpaceCreation (extractedData, {
        "idx": "numeric",
        "title": "title",
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
    await registerAuthCookies();

    const iframeScalerParent = getSpacePortal (space_id);

    document.querySelector("#gs_bdy_ccl").prepend(iframeScalerParent);

    return iframeScalerParent;
}

export const GoogleScholarConnection: MantisConnection = {
    name: "Google Scholar",
    description: "Builds spaces based on the results of your Google Scholar searches",
    icon: googleScholarIcon,
    trigger: trigger,
    createSpace: createSpace,
    injectUI: injectUI,
}