import type { MantisConnection, injectUIType, onMessageType, registerListenersType, setProgressType, establishLogSocketType } from "../types";
import { GenerationProgress } from "../types";
import escodegen from "escodegen";

import githubIcon from "data-base64:../../../assets/github.png";
import { getSpacePortal, registerAuthCookies, reqSpaceCreation } from "../../driver";
const { Octokit } = require("@octokit/core");


const trigger = (url: string) => {
    return url.includes("github.com/") && url.includes("/");
};


const octokit = new Octokit({
    auth: process.env.PLASMO_PUBLIC_GITHUB_AUTH
});

const injectUI = async (space_id: string, onMessage: onMessageType, registerListeners: registerListenersType) => {
    await registerAuthCookies();

    const iframeScalerParent = await getSpacePortal (space_id, onMessage, registerListeners);

    const repoContent = document.querySelector(".repository-content");
    if (repoContent) {
        repoContent.prepend(iframeScalerParent);
    } else {
        console.error("Repository content element not found");
    }

    return iframeScalerParent;
};
const createSpace = async (injectUI: injectUIType, setProgress: setProgressType, onMessage: onMessageType, registerListeners: registerListenersType, establishLogSocket: establishLogSocketType) => {
    setProgress(GenerationProgress.GATHERING_DATA);

    const currentUrl = new URL(window.location.href);
    const repoPath = currentUrl.pathname.slice(1);
    const [owner, repo] = repoPath.split('/');

    if (!owner || !repo) {
        throw new Error("Invalid GitHub repository URL");
    }

    let allCommits = [];
    let page = 1;
    while (true) {
        const response = await octokit.request(`GET /repos/${owner}/${repo}/commits`, {
            owner: owner,
            repo: repo,
            per_page: 100,
            page: page,
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        if (response.data.length === 0) break;
        allCommits.push(...response.data);
        if (response.data.length < 100) break;
        page++;
    }

    let commits = [];
    for (const data of allCommits) {
        const commitSha = data.sha;
        const message = data.commit.message;
        const author = data.commit.author.name;
        const date = data.commit.author.date;
        const link = data.html_url;
        let diff = "Diff unavailable";

        try {
            const diffResponse = await octokit.request(`GET /repos/${owner}/${repo}/commits/${commitSha}`, {
                owner: owner,
                repo: repo,
                ref: commitSha,
                headers: { accept: 'application/vnd.github.v3.diff' }
            });
            diff = diffResponse.data as string;
        } catch (e) {
            console.error("Failed to retrieve diff:", e);
            diff = "Diff unavailable";
        }

        commits.push({ message, author, date, link, diff });
    }
    commits = commits.reverse();

    let extractedData = [];
    commits.forEach((commit, idx) => {
        const title = `Commit ${idx + 1}`;
        extractedData.push({ 
            title: title, 
            idx: idx, 
            commit: commit.message,
            author: commit.author,
            date: commit.date,
            link: commit.link,
            diff: commit.diff
        });
    });
    console.log(extractedData);

    setProgress(GenerationProgress.CREATING_SPACE);

    const spaceData = await reqSpaceCreation(
        extractedData,
        {
            "title": "title",
            "idx": "numeric",
            "commit": "semantic",
            "author": "categoric",
            "date": "date",
            "link": "links",
            "diff": "semantic"
        },
        establishLogSocket,
        repo
    );

    setProgress(GenerationProgress.INJECTING_UI);

    const spaceId = spaceData.space_id;
    const createdWidget = await injectUI(spaceId, onMessage, registerListeners);

    setProgress(GenerationProgress.COMPLETED);

    return { spaceId, createdWidget };
};

export const GitHubConnection: MantisConnection = {
    name: "GitHub Commits",
    description: "Builds spaces based on GitHub repository commits, including messages, authors, dates, commit links, and diffs.",
    icon: githubIcon,
    trigger: trigger,
    createSpace: createSpace,
    injectUI: injectUI
};
