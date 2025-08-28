// Functions to manage GitHub token storage
export const GITHUB_TOKEN_KEY = 'github_personal_access_token';

export async function saveGitHubToken(token: string): Promise<void> {
    await chrome.storage.local.set({ [GITHUB_TOKEN_KEY]: token });
}

export async function getGitHubToken(): Promise<string | null> {
    const result = await chrome.storage.local.get([GITHUB_TOKEN_KEY]);
    return result[GITHUB_TOKEN_KEY] || null;
}

export async function hasGitHubToken(): Promise<boolean> {
    const token = await getGitHubToken();
    return !!token;
}

export async function clearGitHubToken(): Promise<void> {
    await chrome.storage.local.remove([GITHUB_TOKEN_KEY]);
}
