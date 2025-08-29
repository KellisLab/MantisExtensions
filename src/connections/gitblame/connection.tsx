import type { MantisConnection, injectUIType, onMessageType, registerListenersType, setProgressType, establishLogSocketType } from "../types";
import { GenerationProgress } from "../types";
import { Octokit } from "@octokit/rest";
import { saveGitHubToken, getGitHubToken } from "../../github-token-manager";

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

// Check if a repository is public (no authentication required)
async function isRepositoryPublic(owner: string, repo: string): Promise<boolean> {
    try {
        // Try to access the repository without authentication
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
        
        // Check if we got a valid JSON response
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            console.warn('GitHub API returned non-JSON response, assuming private repository');
            return false;
        }
        
        if (response.status === 200) {
            const data = await response.json();
            // Check if the repository is actually public
            return !data.private;
        }
        
        return false;
    } catch (error) {
        console.warn('Could not determine repository visibility:', error);
        return false; // Assume private if we can't determine
    }
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
        // Fallback to URL parsing, but handle branch names with slashes more intelligently
        const blobIndex = pathParts.indexOf('blob');
        if (blobIndex !== -1 && blobIndex + 1 < pathParts.length) {
            const afterBlob = pathParts.slice(blobIndex + 1);
            
            if (afterBlob.length >= 2) {
                // For better branch detection, we need to be smarter about where the branch ends
                // GitHub URLs typically have the pattern: /owner/repo/blob/branch/path/to/file
                // But branch names can contain slashes, so we need to find the right split point
                
                // Try to find the file extension to determine where the file path starts
                let filePathStartIndex = 0;
                for (let i = 0; i < afterBlob.length; i++) {
                    const part = afterBlob[i];
                    // If this part contains a file extension, it's likely part of the file path
                    if (part.includes('.') && !part.includes('/')) {
                        filePathStartIndex = i;
                        break;
                    }
                    // If this part looks like a commit hash (40+ hex chars), it's likely a commit, not a branch
                    if (/^[a-f0-9]{40,}$/.test(part)) {
                        filePathStartIndex = i;
                        break;
                    }
                }
                
                if (filePathStartIndex > 0) {
                    // We found a likely file path start, everything before is the branch
                    branch = afterBlob.slice(0, filePathStartIndex).join('/');
                    filePath = afterBlob.slice(filePathStartIndex).join('/');
                } else {
                    // Fallback: assume first part is branch, rest is file path
                    // This handles cases like "feature/new-feature" as branch name
                    branch = afterBlob[0];
                    filePath = afterBlob.slice(1).join('/');
                }
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

    // Check if repository is public first
    const isPublic = await isRepositoryPublic(owner, repo);
    
    let githubToken: string | undefined;
    let octokit: Octokit;
    
    if (isPublic) {
        // For public repos, we can work without authentication
        console.log('Repository is public, proceeding without authentication');
        octokit = new Octokit();
        
        // However, some GitHub API operations (like GraphQL) may still require authentication
        // We'll try without auth first, but fall back to asking for a token if needed
    } else {
        // For private repos, we need authentication
        console.log('Repository is private, authentication required');
        
        // Check if user has a GitHub token
        githubToken = await getGitHubToken();
        
        if (!githubToken) {
            // Prompt user for token
            githubToken = await promptForGitHubToken();
            
            if (!githubToken) {
                throw new Error('GitHub Personal Access Token is required for private repositories.');
            }
            
            // Validate the token
            const isValid = await validateGitHubToken(githubToken);
            if (!isValid) {
                throw new Error('Invalid GitHub Personal Access Token. Please check your token and try again.');
            }
            
            // Save the valid token
            await saveGitHubToken(githubToken);
        }
        
        octokit = new Octokit({ auth: githubToken });
    }

    try {
        // Get file blame information
        const blameData = await getFileBlame(octokit, owner, repo, filePath, branch);
        
        // If we got no blame data and we're using an unauthenticated client, 
        // it might be because GraphQL requires authentication
        if (blameData.length === 0 && !githubToken) {
            console.log('No blame data received, this might require authentication. Prompting for token...');
            
            // Ask for a token even for public repos if GraphQL operations fail
            const fallbackToken = await promptForGitHubToken();
            if (fallbackToken) {
                const isValid = await validateGitHubToken(fallbackToken);
                if (isValid) {
                    await saveGitHubToken(fallbackToken);
                    const authenticatedOctokit = new Octokit({ auth: fallbackToken });
                    const retryBlameData = await getFileBlame(authenticatedOctokit, owner, repo, filePath, branch);
                    
                    if (retryBlameData.length > 0) {
                        console.log('Successfully retrieved blame data with authentication');
                        // Use the authenticated data
                        const extractedData = retryBlameData.map(entry => ({
                            filename: entry.filename,
                            lineNumber: entry.lineNumber,
                            commit: entry.commit,
                            author: entry.author,
                            date: entry.date,
                            lineContent: entry.lineContent,
                            repository: `${owner}/${repo}`,
                            branch: branch
                        }));
                        
                        // Continue with the authenticated data...
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
                    }
                }
            }
        }
        
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
        
        // Provide more helpful error messages
        if (error.message && error.message.includes('Unexpected token')) {
            throw new Error('GitHub API returned an invalid response. This usually means authentication is required. Please provide a valid GitHub Personal Access Token.');
        }
        
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

        // Make GraphQL request and get file content in parallel
        const [response, fileContentResponse] = await Promise.all([
            octokit.graphql(query, variables),
            octokit.rest.repos.getContent({ owner, repo, path, ref: branch })
        ]);
        
        // Type the GraphQL response properly and validate it's not HTML
        const typedResponse = response as any;
        
        // Check if we got a valid response structure
        if (!typedResponse || typeof typedResponse !== 'object') {
            console.warn('Invalid GraphQL response structure:', typedResponse);
            return [];
        }
        
        if (!typedResponse.repository || !typedResponse.repository.object) {
            console.warn('Repository or object not found in GraphQL response');
            return [];
        }
        
        const blameData = typedResponse.repository.object.blame?.ranges || [];

        if (Array.isArray(fileContentResponse.data)) {
            // This shouldn't happen for a file path, but handle it
            return [];
        }

        // Check if it's a file (not a symlink or submodule)
        if (fileContentResponse.data.type !== 'file') {
            console.warn(`Path ${path} is not a file (type: ${fileContentResponse.data.type})`);
            return [];
        }

        const content = Buffer.from(fileContentResponse.data.content, 'base64').toString('utf-8');
        const lines = content.split('\n');

        // Convert GraphQL response to our format
        const result: BlameMapEntry[] = [];
        
        for (const range of blameData) {
            const { startingLine, endingLine, commit } = range;
            
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
        }

        // Sort by line number
        return result.sort((a, b) => a.lineNumber - b.lineNumber);
        
    } catch (error) {
        console.warn(`Could not get blame for ${path}:`, error);
        
        // Check if the error is due to authentication issues
        if (error.message && error.message.includes('Unexpected token')) {
            console.warn('This appears to be an authentication issue. Please provide a valid GitHub token.');
        }
        
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
