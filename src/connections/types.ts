export type injectUIType = (space_id: string) => Promise<HTMLElement>;
export type setProgressType = (progress: GenerationProgress) => void;

// Defines the stages in the generation process
export enum GenerationProgress {
    GATHERING_DATA = "Gathering Data",
    CREATING_SPACE = "Creating Space",
    INJECTING_UI = "Injecting into GUI",
    COMPLETED = "Completed",
    FAILED = "Failed"
}

// Defines the order of the stages in the generation process
// this is used to determine progress percent
export const Progression = [GenerationProgress.GATHERING_DATA, 
                            GenerationProgress.CREATING_SPACE, 
                            GenerationProgress.INJECTING_UI,
                            GenerationProgress.COMPLETED,];

interface CreateSpaceResult {
    spaceId: string; // Id of the space created
    createdWidget: HTMLElement; // The element that was injected to the page (we need to track this so we can manage it's state)
}

export interface MantisConnection {
    name: string; // Name of the connection to display
    description: string; // A brief description of what the connection does
    icon: string; // The icon URL to display for the connection
    trigger: (url: string) => boolean; // A function that returns true if the connection should be used for any given URL
    createSpace: (injectUI: injectUIType, setProgress: setProgressType) => Promise<CreateSpaceResult>; // A function that creates a space and returns the spaceId
    injectUI: injectUIType; // A function that injects the UI into the page
}

// This is what is stored in chrome local storage
export interface StoredSpace {
    name: string;
    id: string; // ID of the space created
    dateCreated: string;
    url: string;
    host: string;
    connectionParent: string;
}