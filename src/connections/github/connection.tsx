import { create } from "domain";
import type { MantisConnection, injectUIType, setProgressType } from "../types";
import { GenerationProgress } from "../types";
import escodegen from "escodegen";

import githubIcon from "../../../assets/github.png";
import { registerAuthCookies, reqSpaceCreation } from "../../driver";

const trigger = (url: string) => {
    return url.includes("github.com/") && url.includes("/"); 
};

const createSpace = async (injectUI: injectUIType, setProgress: setProgressType) => {
    setProgress(GenerationProgress.GATHERING_DATA);

    const url = new URL(window.location.href);
    const pathParts = url.pathname.split("/").filter(Boolean); // Removes empty strings

    // Extract the username and repository name
    const username = pathParts[0] || null;
    const repo = pathParts[1] ? `${username}/${pathParts[1]}` : null;

    if (!repo) {
        throw new Error("Repository name is required.");
    }

    const commitsUrl = `https://api.github.com/repos/${repo}/commits`;

    const searchResults = [];

    for (let page = 1; page <= 10; page++) {
        const response = await fetch(`${commitsUrl}?page=${page}&per_page=100`);
        if (!response.ok) {
            throw new Error(`Failed to fetch commits: ${await response.text()}`);
        }

        const data = await response.json();

        for (const commit of data) {
            //const diffUrl = commit.html_url;
            const commitSha = commit.sha;
            const diffUrl = `https://github.com/${repo}/commit/${commitSha}.diff`;
            const diffResponse = await fetch(diffUrl);

            const diffText = diffResponse.ok ? await diffResponse.text() : "Diff unavailable";
            
            searchResults.push({
                message: commit.commit.message,
                author: commit.commit.author.name,
                date: commit.commit.author.date,
                link: commit.html_url,
                diff: diffText
            });
        }
    }

    setProgress(GenerationProgress.CREATING_SPACE);

    const spaceData = await reqSpaceCreation(searchResults, {
        "repo_name": "title",
        "message": "semantic",
        "author": "categoric",
        "date": "date",
        "link": "links",
        "diff": "semantic"
    }, repo);

    setProgress(GenerationProgress.INJECTING_UI);

    const spaceId = spaceData.space_id;

    const createdWidget = await injectUI(spaceId);

    setProgress(GenerationProgress.COMPLETED);

    return { spaceId, createdWidget };
};

const injectUI = async (space_id: string) => {
    await registerAuthCookies();

    const scale = 0.75;

    // Create the iframe, hidden by default
    const iframeScalerParent = document.createElement("div");
    iframeScalerParent.style.width = "100%";
    iframeScalerParent.style.height = "80vh";
    iframeScalerParent.style.border = "none";

    const iframe = document.createElement("iframe");
    iframe.src = `${process.env.PLASMO_PUBLIC_FRONTEND}/space/${space_id}`;
    iframe.style.border = "none";
    iframe.style.transform = `scale(${scale})`;
    iframe.style.transformOrigin = "top left";
    iframe.style.width = (100 / scale).toString() + "%";
    iframe.style.height = (80 / scale).toString() + "vh";
    iframe.style.overflow = "hidden";
    iframeScalerParent.appendChild(iframe);

    document.querySelector("#docs-editor-container").prepend (iframeScalerParent);

    return iframeScalerParent;
}

export const GitHubConnection: MantisConnection = {
    name: "GitHub Commits",
    description: "Builds spaces based on GitHub repository commits, including messages, authors, dates, commit links, and diffs.",
    icon: githubIcon,
    trigger: trigger,
    createSpace: createSpace,
    injectUI: injectUI
};
