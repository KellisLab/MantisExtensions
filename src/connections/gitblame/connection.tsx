import type { MantisConnection, injectUIType, onMessageType, registerListenersType, setProgressType, establishLogSocketType } from "../types";
import { GenerationProgress } from "../types";
import { Octokit } from "@octokit/rest";
import { saveGitHubToken, getGitHubToken, hasGitHubToken } from "../../github-token-manager";

import githubIcon from "data-base64:../../../assets/github.svg";
import { getSpacePortal, registerAuthCookies, reqSpaceCreation } from "../../driver";

// Define types for better type safety
type BlameMapEntry = {
    filename: string;
    lineNumber: number;
    commit: string;
    author?: string;
    date?: string;
    lineContent: string;
};

type GitHubBlameRange = {
    startingLine: number;
    endingLine: number;
    age: number;
    commit: {
        oid: string;
        author: {
            name: string;
            date: string;
        };
    };
};

const trigger = (url: string) => {
    return url.includes("github.com") && url.includes("/blob/");
}

// Add this function to handle token input
async function promptForGitHubToken(): Promise<string> {
    return new Promise((resolve) => {
        const token = prompt(
            "Please enter your GitHub Personal Access Token:\n\n" +
            "This token will be stored locally in your browser and used to access GitHub's API.\n" +
            "You can create a token at: https://github.com/settings/tokens\n\n" +
            "Required permissions: repo (for private repos) or public_repo (for public repos only)",
            ""
        );
        
        if (token && token.trim()) {
            resolve(token.trim());
        } else {
            resolve("");
        }
    });
}

// Add this function to validate token
async function validateGitHubToken(token: string): Promise<boolean> {
    try {
        const octokit = new Octokit({ auth: token });
        const { data } = await octokit.rest.users.getAuthenticated();
        return !!data.login;
    } catch (error) {
        console.warn('Invalid GitHub token:', error);
        return false;
    }
}

const createSpace = async (injectUI: injectUIType, setProgress: setProgressType, onMessage: onMessageType, registerListeners: registerListenersType, establishLogSocket: establishLogSocketType) => {
    setProgress(GenerationProgress.GATHERING_DATA);

    // Check if user has a GitHub token
    let githubToken = await getGitHubToken();
    
    if (!githubToken) {
        // Prompt user for token
        githubToken = await promptForGitHubToken();
        
        if (!githubToken) {
            throw new Error('GitHub Personal Access Token is required to use the GitBlame connection.');
        }
        
        // Validate the token
        const isValid = await validateGitHubToken(githubToken);
        if (!isValid) {
            throw new Error('Invalid GitHub Personal Access Token. Please check your token and try again.');
        }
        
        // Save the valid token
        await saveGitHubToken(githubToken);
    }

    // Extract repository information from the URL more robustly
    const url = new URL(window.location.href);
    const pathParts = url.pathname.split('/');
    const owner = pathParts[1];
    const repo = pathParts[2];
    
    // More robust branch and file path extraction
    let branch = "main";
    let filePath = "";
    
    // Look for branch name in meta tags first (more reliable)
    const branchMeta = document.querySelector('meta[name="branch-name"]');
    if (branchMeta) {
        branch = branchMeta.getAttribute('content') || "main";
    } else {
        // Fallback to URL parsing, but handle branch names with slashes
        const blobIndex = pathParts.indexOf('blob');
        if (blobIndex !== -1 && blobIndex + 1 < pathParts.length) {
            // The part after 'blob' could be the branch or part of the file path
            // We need to determine where the branch ends and file path begins
            const afterBlob = pathParts.slice(blobIndex + 1);
            
            // Try to find a reasonable split point
            if (afterBlob.length >= 2) {
                // Assume first part is branch, rest is file path
                branch = afterBlob[0];
                filePath = afterBlob.slice(1).join('/');
            } else if (afterBlob.length === 1) {
                // Only one part after blob, assume it's the branch
                branch = afterBlob[0];
                filePath = "";
            }
        }
    }
    
    // If we still don't have a file path, try to extract it from the page
    if (!filePath) {
        const filePathMeta = document.querySelector('meta[name="file-path"]');
        if (filePathMeta) {
            filePath = filePathMeta.getAttribute('content') || "";
        }
    }

    console.log(`Processing repository: ${owner}/${repo}, branch: ${branch}, file: ${filePath}`);

    // Initialize Octokit with user's token
    const octokit = new Octokit({
        auth: githubToken
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

async function getFileBlame(octokit: Octokit, owner: string, repo: string, path: string, branch: string): Promise<BlameMapEntry[]> {
    try {
        // Use GitHub's GraphQL API for proper blame data
        const query = `
            query($owner: String!, $repo: String!, $path: String!, $ref: String!) {
                repository(owner: $owner, name: $repo) {
                    object(expression: $ref) {
                        ... on Commit {
                            blame(path: $path) {
                                ranges {
                                    startingLine
                                    endingLine
                                    age
                                    commit {
                                        oid
                                        author {
                                            name
                                            date
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `;

        const variables = {
            owner,
            repo,
            path,
            ref: branch
        };

        // Make GraphQL request using Octokit
        const response = await octokit.graphql(query, variables);
        const blameData = response.repository?.object?.blame?.ranges || [];

        // Convert GraphQL response to our format
        const result: BlameMapEntry[] = [];
        
        for (const range of blameData) {
            const { startingLine, endingLine, commit } = range;
            
            // Get the actual file content for these lines
            try {
                const fileContent = await octokit.rest.repos.getContent({
                    owner,
                    repo,
                    path,
                    ref: commit.oid
                });

                if (Array.isArray(fileContent.data)) {
                    // This shouldn't happen for a file path, but handle it
                    continue;
                }

                const content = Buffer.from(fileContent.data.content, 'base64').toString('utf-8');
                const lines = content.split('\n');

                // Add each line in the range
                for (let lineNum = startingLine; lineNum <= endingLine; lineNum++) {
                    if (lineNum > 0 && lineNum <= lines.length) {
                        result.push({
                            filename: path,
                            lineNumber: lineNum,
                            commit: commit.oid,
                            author: commit.author?.name,
                            date: commit.author?.date,
                            lineContent: lines[lineNum - 1] || ''
                        });
                    }
                }
            } catch (error) {
                console.warn(`Could not get content for commit ${commit.oid}:`, error);
                // Fallback: add entry without line content
                for (let lineNum = startingLine; lineNum <= endingLine; lineNum++) {
                    result.push({
                        filename: path,
                        lineNumber: lineNum,
                        commit: commit.oid,
                        author: commit.author?.name,
                        date: commit.author?.date,
                        lineContent: `[Line ${lineNum} - content unavailable]`
                    });
                }
            }
        }

        // Sort by line number
        return result.sort((a, b) => a.lineNumber - b.lineNumber);
        
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
    label.classList.add("inline-flex", "items-center", "cursor-pointer", "ml-4", "mr-4");

    // Checkbox as toggle
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.classList.add("hidden");

    // Text container with GitHub-style styling
    const textContainer = document.createElement("span");
    textContainer.innerText = "Mantis GitBlame";
    textContainer.classList.add("font-semibold", "text-sm");
    // Use CSS custom properties for gradient text since Tailwind doesn't support it
    textContainer.style.background = "linear-gradient(90deg, #0366d6, #28a745)";
    textContainer.style.backgroundClip = "text";
    textContainer.style.webkitTextFillColor = "transparent";

    await registerAuthCookies();

    const iframeScalerParent = await getSpacePortal(space_id, onMessage, registerListeners);
    iframeScalerParent.classList.add("hidden");
      
    // Toggle behavior
    checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
            iframeScalerParent.classList.remove("hidden");
            textContainer.style.background = "linear-gradient(90deg, #28a745, #0366d6)";
        } else {
            iframeScalerParent.classList.add("hidden");
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
