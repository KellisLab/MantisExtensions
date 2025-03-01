import type { MantisConnection, injectUIType, setProgressType } from "../types";
import { GenerationProgress } from "../types";
import escodegen from "escodegen";

import githubIcon from "../../../assets/github.png";
import { registerAuthCookies, reqSpaceCreation } from "../../driver";

const trigger = (url: string) => {
    return url.includes("github.com/") && url.includes("/");
};

const { Octokit } = require("@octokit/core");

const octokit = new Octokit({
    auth: process.env.PLASMO_PUBLIC_GITHUB_AUTH
});

const injectUI = async (space_id: string) => {
    const scale = 0.75;

    const iframeScalerParent = document.createElement("div");
    iframeScalerParent.style.width = "100%";
    iframeScalerParent.style.height = "80vh";
    iframeScalerParent.style.border = "none";
    iframeScalerParent.style.display = "block";
    iframeScalerParent.style.position = "relative"; 

    await registerAuthCookies();

    const iframe = document.createElement("iframe");
    iframe.src = `${process.env.PLASMO_PUBLIC_FRONTEND}/space/${space_id}`;
    iframe.style.border = "none";
    iframe.style.transform = `scale(${scale})`;
    iframe.style.transformOrigin = "top left";
    iframe.style.width = (100 / scale).toString() + "%";
    iframe.style.height = (80 / scale).toString() + "vh";
    iframe.style.overflow = "hidden";
    iframeScalerParent.appendChild(iframe);

    const repoContent = document.querySelector(".repository-content");
    if (repoContent) {
        repoContent.prepend(iframeScalerParent);
    } else {
        console.error("Repository content element not found");
    }

    return iframeScalerParent;
};

const createSpace = async (injectUI: any, setProgress: any) => {
    setProgress(GenerationProgress.GATHERING_DATA);

    const currentUrl = new URL(window.location.href);
    const repoPath = currentUrl.pathname.slice(1);
    const [owner, repo] = repoPath.split('/');
    console.log(owner, repo);

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

        // try {
        //     const diffResponse = await octokit.request(`GET /repos/${owner}/${repo}/commits/${commitSha}`, {
        //         owner: owner,
        //         repo: repo,
        //         ref: commitSha,
        //         headers: { accept: 'application/vnd.github.v3.diff' }
        //     });
        //     diff = diffResponse.data as string;
        // } catch (e) {
        //     diff = "Diff unavailable";
        // }

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
        repo
    );
    console.log(spaceData);

    setProgress(GenerationProgress.INJECTING_UI);

    const spaceId = spaceData.space_id;
    const createdWidget = await injectUI(spaceId);

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
