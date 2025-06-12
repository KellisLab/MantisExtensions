import type { MantisConnection, injectUIType, onMessageType, registerListenersType, setProgressType, establishLogSocketType } from "../types";
import { GenerationProgress } from "../types";

import driveIcon from "data-base64:../../../assets/drive.png";
import { getSpacePortal, reqSpaceCreation} from "../../driver";

const trigger = (url: string) => {
    return url.includes("drive.google.com");
}

const getDriveFiles = async () => {
        try {
            const response = await new Promise<{
            success: boolean;
            token?: string;
driveFiles?: DriveFile[];
            error?: string;
            }>((resolve, reject) => {
            chrome.runtime.sendMessage({ action: "initiateOAuth" }, (response) => {
                if (chrome.runtime.lastError) {
                return reject(new Error("Runtime error: " + chrome.runtime.lastError.message));
                }
                resolve(response);
            });
            });

            if (response.success && response.driveFiles) {
            console.log("Token:", response.token);
            console.log("Drive files:", response.driveFiles);
            return response.driveFiles;
            } else {
            console.error("OAuth failed:", response.error);
            }
        } catch (err) {
            console.error("Error during Drive file fetch:", err);
        }
    };

const createSpace = async (injectUI: injectUIType, setProgress: setProgressType, onMessage: onMessageType, registerListeners: registerListenersType, establishLogSocket: establishLogSocketType) => {
    setProgress(GenerationProgress.GATHERING_DATA);
    const fileMetadata = await getDriveFiles();
    
    setProgress(GenerationProgress.CREATING_SPACE);

    const spaceData = await reqSpaceCreation(fileMetadata, {
        "name": "semantic",
    }, establishLogSocket);

    setProgress(GenerationProgress.INJECTING_UI);

    const spaceId = spaceData.space_id;
    const createdWidget = await injectUI(spaceId, onMessage, registerListeners);

    setProgress(GenerationProgress.COMPLETED);

    return { spaceId, createdWidget }; 
};

const injectUI = async (space_id: string, onMessage: onMessageType, registerListeners: registerListenersType) => {

    const iframeScalerParent = await getSpacePortal (space_id, onMessage, registerListeners);

    document.body.prepend (iframeScalerParent);

    return iframeScalerParent;
}



export const GoogleDriveConnection: MantisConnection = {
    name: "Google Drive",
    description: "Builds spaces based on the content of an entire Google Drive",
    icon: driveIcon,
    trigger: trigger,
    createSpace: createSpace,
    injectUI: injectUI,
}