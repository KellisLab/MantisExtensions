import type { MantisConnection, injectUIType, onMessageType, registerListenersType, setProgressType, establishLogSocketType } from "../types";
import { GenerationProgress } from "../types";
import escodegen from "escodegen";

import githubIcon from "data-base64:../../../assets/github.png";
import { getSpacePortal, registerAuthCookies, reqSpaceCreation } from "../../driver";
const { Octokit } = require("@octokit/core");

const DEBUG = false;

const trigger = (url: string) => {
    return url.includes("github.com/") && url.includes("/");
};


const octokit = new Octokit({
    auth: process.env.PLASMO_PUBLIC_GITHUB_AUTH
});

const summarizeDiff = async (diff: string, commitMessage: string): Promise<string> => {
    if (diff === "Diff unavailable" || !diff.trim()) {
        return "No diff available for this commit";
    }

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.PLASMO_PUBLIC_OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: "You are a code reviewer. Summarize git diffs in 2-3 sentences, focusing on what was changed and why. Be concise and technical."
                    },
                    {
                        role: "user",
                        content: `Commit message: "${commitMessage}"\n\nDiff:\n${diff.substring(0, 4000)}` // Limit diff size
                    }
                ],
                max_tokens: 150,
                temperature: 0.3
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || "Could not generate summary";
    } catch (error) {
        console.error("Error summarizing diff:", error);
        return `Error generating summary: ${error.message}`;
    }
};

const parseDiffInfo = (diff: string) => {
    if (diff === "Diff unavailable" || !diff.trim()) {
        return {
            filesAdded: [],
            filesModified: [],
            filesDeleted: [],
            totalAdditions: 0,
            totalDeletions: 0
        };
    }

    const lines = diff.split('\n');
    const filesAdded = [];
    const filesModified = [];
    const filesDeleted = [];
    let totalAdditions = 0;
    let totalDeletions = 0;
    let currentFile = '';

    for (const line of lines) {
        if (line.startsWith('diff --git')) {
            currentFile = line.split(' b/')[1] || line.split(' a/')[1]?.replace('a/', '') || '';
        } else if (line.startsWith('new file mode')) {
            if (currentFile) filesAdded.push(currentFile);
        } else if (line.startsWith('deleted file mode')) {
            if (currentFile) filesDeleted.push(currentFile);
        } else if (line.startsWith('index') && currentFile && !filesAdded.includes(currentFile) && !filesDeleted.includes(currentFile)) {
            filesModified.push(currentFile);
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
            totalAdditions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
            totalDeletions++;
        }
    }

    return {
        filesAdded: [...new Set(filesAdded)],
        filesModified: [...new Set(filesModified)],
        filesDeleted: [...new Set(filesDeleted)],
        totalAdditions,
        totalDeletions
    };
};

const injectUI = async (space_id: string, onMessage: onMessageType, registerListeners: registerListenersType) => {
    await registerAuthCookies();

    const iframeScalerParent = await getSpacePortal(space_id, onMessage, registerListeners);

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

    const MAX_COMMITS = DEBUG ? 300 : Infinity;
    let allCommits = [];
    let page = 1;
    
    while (allCommits.length < MAX_COMMITS) {
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
        
        const commitsToAdd = response.data.slice(0, MAX_COMMITS - allCommits.length);
        allCommits.push(...commitsToAdd);
        
        if (response.data.length < 100 || allCommits.length >= MAX_COMMITS) break;
        page++;
    }

    let commits = [];
    const batchSize = 5;
    
    for (let i = 0; i < allCommits.length; i += batchSize) {
        const batch = allCommits.slice(i, Math.min(i + batchSize, allCommits.length));
        setProgress(GenerationProgress.GATHERING_DATA);
        
        const batchPromises = batch.map(async (data) => {
            const commitSha = data.sha;
            const message = data.commit.message;
            const authorName = data.commit.author.name || "Unknown Author";
            const authorEmail = data.commit.author.email || "";
            const authorUsername = data.author?.login || "";
            const date = data.commit.author.date;
            const link = data.html_url;
            let diff = "Diff unavailable";
            let diffSummary = "Could not generate summary";

            try {
                const diffResponse = await octokit.request(`GET /repos/${owner}/${repo}/commits/${commitSha}`, {
                    owner: owner,
                    repo: repo,
                    ref: commitSha,
                    headers: { accept: 'application/vnd.github.v3.diff' }
                });
                diff = diffResponse.data as string;
                
                diffSummary = await summarizeDiff(diff, message);
                
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (e) {
                console.error("Failed to retrieve diff:", e);
                diff = "Diff unavailable";
                diffSummary = "Could not retrieve diff for summary";
            }

            const diffInfo = parseDiffInfo(diff);

            return {
                message,
                authorName,
                authorEmail,
                authorUsername,
                date,
                link,
                diff,
                diffSummary,
                filesAdded: diffInfo.filesAdded,
                filesModified: diffInfo.filesModified,
                filesDeleted: diffInfo.filesDeleted,
                totalAdditions: diffInfo.totalAdditions,
                totalDeletions: diffInfo.totalDeletions,
                totalFilesChanged: diffInfo.filesAdded.length + diffInfo.filesModified.length + diffInfo.filesDeleted.length
            };
        });

        const batchResults = await Promise.all(batchPromises);
        commits.push(...batchResults);
    }

    commits = commits.reverse();

    let extractedData = [];
    commits.forEach((commit, idx) => {
        const title = `Commit ${idx + 1}`;
        extractedData.push({
            title: title,
            idx: Math.floor(idx),
            commit: commit.message,
            authorName: commit.authorName,
            authorEmail: commit.authorEmail,
            authorUsername: commit.authorUsername,
            date: commit.date,
            link: commit.link,
            diffSummary: commit.diffSummary,
            filesAdded: commit.filesAdded.join(', '),
            filesModified: commit.filesModified.join(', '),
            filesDeleted: commit.filesDeleted.join(', '),
            totalAdditions: commit.totalAdditions,
            totalDeletions: commit.totalDeletions,
            totalFilesChanged: commit.totalFilesChanged
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
            "authorName": "categoric",
            "authorEmail": "categoric",
            "authorUsername": "categoric",
            "date": "date",
            "link": "links",
            "diffSummary": "semantic",
            "filesAdded": "semantic",
            "filesModified": "semantic",
            "filesDeleted": "semantic",
            "totalAdditions": "numeric",
            "totalDeletions": "numeric",
            "totalFilesChanged": "numeric"
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
    description: "Builds spaces based on GitHub repository commits with AI-powered diff summaries and detailed file change information.",
    icon: githubIcon,
    trigger: trigger,
    createSpace: createSpace,
    injectUI: injectUI
};