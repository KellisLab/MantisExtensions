import type { StoredSpace } from "./connections/types";

// Get all spaces in the chrome local storage
export const getCachedSpaces = async (): Promise<StoredSpace[]> => {
    const { mantis_saved_connections } = await chrome.storage.local.get("mantis_saved_connections");
    return mantis_saved_connections ?? [];
}

// Add new space to cache
export const addSpaceToCache = async (space: StoredSpace) => {
    const cachedSpaces = await getCachedSpaces();
    cachedSpaces.push(space);

    await chrome.storage.local.set({ "mantis_saved_connections": cachedSpaces });
}

// Delete space from cache
export const deleteSpace = async (spaceToRm: StoredSpace) => {
    const cachedSpaces = await getCachedSpaces();
    const prunedSpaces = cachedSpaces.filter(space => space !== spaceToRm);

    await chrome.storage.local.set({ "mantis_saved_connections": prunedSpaces });
}

// Delete spaces from cache that meet any given condition
export const deleteSpacesWhere = async (predicate: (space: StoredSpace) => boolean) => {
    const cachedSpaces = await getCachedSpaces();
    const prunedSpaces = cachedSpaces.filter(space => !predicate(space));
    
    await chrome.storage.local.set ({ "mantis_saved_connections": prunedSpaces });
}