import type { MantisConnection, injectUIType, onMessageType, registerListenersType, setProgressType, establishLogSocketType } from "../types";
import { GenerationProgress } from "../types";
import { Octokit } from "@octokit/rest";

import githubIcon from "data-base64:../../../assets/github.svg";
import { getSpacePortal, registerAuthCookies, reqSpaceCreation } from "../../driver";

const trigger = (url: string) => {
    return url.includes("github.com") && url.includes("/blob/");
}

const createSpace = async (injectUI: injectUIType, setProgress: setProgressType, onMessage: onMessageType, registerListeners: registerListenersType, establishLogSocket: establishLogSocketType) => {
    setProgress(GenerationProgress.GATHERING_DATA);

    // Extract repository information from the URL
    const url = new URL(window.location.href);
    const pathParts = url.pathname.split('/');
    const owner = pathParts[1];
    const repo = pathParts[2];
    const branch = pathParts[4] || "main";
    const filePath = pathParts.slice(5).join('/');

    console.log(`Processing repository: ${owner}/${repo}, branch: ${branch}, file: ${filePath}`);

    // Initialize Octokit with GitHub token from environment
    const octokit = new Octokit({
        auth: process.env.PLASMO_PUBLIC_GITHUB_TOKEN
    });

    try {
        // Get file blame information
        const blameData = await getFileBlame(octokit, owner, repo, filePath, branch);
        
        // Get additional repository information
        const repoInfo = await getRepositoryInfo(octokit, owner, repo);
        
        // Combine data for space creation
        const extractedData = blameData.map(entry => ({
            filename: entry.filename,
            lineNumber: entry.lineNumber,
            commit: entry.commit,
            author: entry.author,
            date: entry.date,
            lineContent: entry.lineContent,
            repository: `${owner}/${repo}`,
            branch: branch
        }));

        // Add repository metadata
        if (repoInfo) {
            extractedData.push({
                filename: "repository_info",
                lineNumber: 0,
                commit: "metadata",
                author: repoInfo.owner.login,
                date: repoInfo.created_at,
                lineContent: `Repository: ${repoInfo.full_name}, Description: ${repoInfo.description || 'No description'}, Language: ${repoInfo.language || 'Unknown'}`,
                repository: `${owner}/${repo}`,
                branch: branch
            });
        }

        console.log(`Extracted ${extractedData.length} blame entries`);

        setProgress(GenerationProgress.CREATING_SPACE);

        const spaceData = await reqSpaceCreation(extractedData, {
            "filename": "text",
            "lineNumber": "number",
            "commit": "text",
            "author": "text",
            "date": "date",
            "lineContent": "semantic",
            "repository": "text",
            "branch": "text"
        }, establishLogSocket, `GitBlame: ${owner}/${repo}/${filePath}`);

        setProgress(GenerationProgress.INJECTING_UI);

        const spaceId = spaceData.space_id;
        const createdWidget = await injectUI(spaceId, onMessage, registerListeners);

        setProgress(GenerationProgress.COMPLETED);

        return { spaceId, createdWidget };

    } catch (error) {
        console.error('Error creating GitBlame space:', error);
        throw error;
    }
}

async function getFileBlame(octokit: Octokit, owner: string, repo: string, path: string, branch: string) {
    try {
        const commits = await octokit.paginate(
            octokit.rest.repos.listCommits,
            {
                owner,
                repo,
                path,
                sha: branch,
                per_page: 100
            }
        );

        const blameMap: Record<number, any> = {};
        let lineCount = 0;

        for (const commit of commits.reverse()) {
            const commitSha = commit.sha;

            const commitData = await octokit.rest.repos.getCommit({
                owner,
                repo,
                ref: commitSha
            });

            for (const file of commitData.data.files || []) {
                if (file.filename === path && file.patch) {
                    const patchLines = file.patch.split("\n");

                    let currentOldLine = 0;
                    let currentNewLine = 0;

                    for (const line of patchLines) {
                        if (line.startsWith("@@")) {
                            const match = /@@ -(\d+),?\d* \+(\d+),?\d* @@/.exec(line);
                            if (match) {
                                currentOldLine = parseInt(match[1], 10);
                                currentNewLine = parseInt(match[2], 10);
                            }
                        } else if (line.startsWith("+")) {
                            blameMap[currentNewLine] = {
                                filename: path,
                                lineNumber: currentNewLine,
                                commit: commitSha,
                                author: commit.commit.author.name,
                                date: commit.commit.author.date,
                                lineContent: line.slice(1)
                            };
                            currentNewLine++;
                        } else if (line.startsWith("-")) {
                            currentOldLine++;
                        } else {
                            currentOldLine++;
                            currentNewLine++;
                        }
                    }
                }
            }

            if (!lineCount && Object.keys(blameMap).length > 0) {
                lineCount = Math.max(...Object.keys(blameMap).map(Number));
            }
        }

        const blameData = [];
        for (let i = 1; i <= lineCount; i++) {
            if (blameMap[i]) {
                blameData.push(blameMap[i]);
            }
        }
        
        return blameData;
    } catch (error) {
        console.warn(`Could not get blame for ${path}:`, error);
        return [];
    }
}

async function getRepositoryInfo(octokit: Octokit, owner: string, repo: string) {
    try {
        const { data } = await octokit.rest.repos.get({
            owner,
            repo
        });
        return data;
    } catch (error) {
        console.warn(`Could not get repository info for ${owner}/${repo}:`, error);
        return null;
    }
}

const injectUI = async (space_id: string, onMessage: onMessageType, registerListeners: registerListenersType) => {
    // Find the GitHub file header to inject our UI
    const fileHeader = document.querySelector('.file-header') || 
                      document.querySelector('.Box-header') ||
                      document.querySelector('.d-flex.flex-column.flex-md-row');

    if (!fileHeader) {
        throw new Error('Could not find GitHub file header');
    }

    // Container for everything
    const div = document.createElement("div");

    // Toggle switch wrapper
    const label = document.createElement("label");
    label.style.display = "inline-flex";
    label.style.alignItems = "center";
    label.style.cursor = "pointer";
    label.style.marginLeft = "16px";
    label.style.marginRight = "16px";

    // Checkbox as toggle
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.style.display = "none";

    // Text container with GitHub-style styling
    const textContainer = document.createElement("span");
    textContainer.innerText = "Mantis GitBlame";
    textContainer.style.background = "linear-gradient(90deg, #0366d6, #28a745)";
    textContainer.style.backgroundClip = "text";
    textContainer.style.webkitTextFillColor = "transparent";
    textContainer.style.fontWeight = "600";
    textContainer.style.fontSize = "14px";

    await registerAuthCookies();

    const iframeScalerParent = await getSpacePortal(space_id, onMessage, registerListeners);
    iframeScalerParent.style.display = "none";
      
    // Toggle behavior
    checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
            iframeScalerParent.style.display = "block";
            textContainer.style.background = "linear-gradient(90deg, #28a745, #0366d6)";
        } else {
            iframeScalerParent.style.display = "none";
            textContainer.style.background = "linear-gradient(90deg, #0366d6, #28a745)";
        }
        textContainer.style.backgroundClip = "text";
    });

    // Assemble elements
    label.appendChild(textContainer);
    label.appendChild(checkbox);
    div.appendChild(label);

    // Insert the iframe after the file header
    fileHeader.parentNode?.insertBefore(iframeScalerParent, fileHeader.nextSibling);

    // Insert into the file header
    fileHeader.appendChild(div);

    return div;
}

export const GitBlameConnection: MantisConnection = {
    name: "GitBlame",
    description: "Builds spaces based on Git blame information from GitHub repositories",
    icon: githubIcon,
    trigger: trigger,
    createSpace: createSpace,
    injectUI: injectUI,
}
