import type { MantisConnection, injectUIType, onMessageType, registerListenersType, setProgressType, establishLogSocketType } from "../types";
import { GenerationProgress } from "../types";

import chromeIcon from "data-base64:../../../assets/chrome.png";
import { getSpacePortal, registerAuthCookies, reqSpaceCreation } from "../../driver";


interface TabWithContent extends chrome.tabs.Tab {
    pageContent?: string;
}

class DatasetTooSmallError extends Error {
    constructor(public dataCount: number, message?: string) {
        super(message || `Dataset too small: ${dataCount} items`);
        this.name = 'DatasetTooSmallError';
    }
}

class NoTabsFoundError extends Error {
    constructor(message?: string) {
        super(message || 'No tabs found');
        this.name = 'NoTabsFoundError';
    }
}

class InsufficientTabsError extends Error {
    constructor(public tabCount: number, message?: string) {
        super(message || `Not enough tabs: ${tabCount}`);
        this.name = 'InsufficientTabsError';
    }
}

const trigger = (url: string) => {
    return url.includes("google.com/search");
}
const MAX_RETRIES = 5;
const MIN_TAB_COUNT = 3;
const RETRY_DELAY_MS = 3000;

const getTabsWithContentViaMessage = (): Promise<TabWithContent[]> => {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "getTabsWithContent" }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else if (response.error) {
                reject(new Error(response.error));
            } else {
                resolve(response.tabs || []);
            }
        });
    });
};


const createSpace = async (injectUI: injectUIType, setProgress: setProgressType, onMessage: onMessageType, registerListeners: registerListenersType, establishLogSocket: establishLogSocketType) => {
    setProgress(GenerationProgress.GATHERING_DATA);

    const extractedData = [];

    try {
        // Get tabs via message passing
        const tabs = await getTabsWithContentViaMessage();
        
        if (!tabs || tabs.length === 0) {
            throw new NoTabsFoundError();
        }

        // Process each tab (no duplication, no domain grouping)
        tabs.forEach((tab, index) => {
            if (tab.title && tab.url) {
                let domain = '';
                try {
                    domain = new URL(tab.url).hostname;
                } catch (e) {
                    domain = 'unknown';
                }

                // Get page content if available
                let pageContent = '';
                if (tab.pageContent) {
                    pageContent = tab.pageContent;
                } else {
                    pageContent = `Page from ${domain}`;
                }

                extractedData.push({
                    title: tab.title,
                    semantic_title: `${tab.active ? 'Active' : 'Background'} tab: ${tab.title}`,
                    link: tab.url,
                    snippet: `Tab ${index + 1}: ${pageContent}`
                });
            }
        });

        // Check if we have enough data
        if (extractedData.length < MIN_TAB_COUNT) {
            throw new InsufficientTabsError(extractedData.length, 'Not enough tabs open for meaningful space creation');
        }

        setProgress(GenerationProgress.CREATING_SPACE);

        // Use automatic retry for space creation
        const spaceData = await createSpaceWithAutoRetry(extractedData, establishLogSocket, `Chrome Tabs Space (${tabs.length} tabs)`);

        setProgress(GenerationProgress.INJECTING_UI);

        const spaceId = spaceData.space_id;
        const createdWidget = await injectUI(spaceId, onMessage, registerListeners);

        setProgress(GenerationProgress.COMPLETED);

        return { spaceId, createdWidget };

    } catch (error) {
        console.error('Error in Chrome Tabs connection:', error);
        
        // Handle custom errors with instanceof
        if (error instanceof DatasetTooSmallError) {
            showDatasetTooSmallError(error.dataCount);
            return null;
        }
        
        if (error instanceof NoTabsFoundError || error instanceof InsufficientTabsError) {
            showNoTabsError();
            return null;
        }
        
        // Handle server-side dataset errors by checking the error message
        // (These come from external API, so we still need string checking)
        const errorMessage = error.message || error.toString();
        if (errorMessage.includes('Dataset too small') || 
            errorMessage.includes('minimum 100 rows are required')) {
            showDatasetTooSmallError(extractedData.length);
            return null;
        }
        
        throw error;
    }
}

// New function for automatic retry
const createSpaceWithAutoRetry = async (extractedData: { title: string; semantic_title: string; link: string; snippet: string; }[], establishLogSocket: establishLogSocketType, title: string, maxRetries = MAX_RETRIES) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            
            if (attempt > 1) {
                // Wait for server to finish background processing
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            }
            
            return await reqSpaceCreation(extractedData, {
                "title": "title",
                "semantic_title": "semantic",
                "link": "links",
                "snippet": "semantic"
            }, establishLogSocket, title);
            
        } catch (error) {
            const errorMessage = error.message || error.toString();
            
            // Check if it's a server-side dataset error and convert to custom error
            if (errorMessage.includes('Dataset too small') || 
                errorMessage.includes('minimum 100 rows are required')) {
                throw new DatasetTooSmallError(extractedData.length, errorMessage);
            }
            
            // Check if it's a timeout error and we have retries left
            if ((errorMessage.includes('504') || 
                 errorMessage.includes('timeout') || 
                 errorMessage.includes('Gateway Time-out')) && 
                 attempt < maxRetries) {
                
                continue; // Try again
            }
            
            // If it's not a timeout or we're out of retries, throw the error
            throw error;
        }
    }
};

// Error handlers
// Base styles for error notifications
const getBaseErrorStyles = () => ({
    container: `
        position: fixed;
        top: 20px;
        right: 20px;
        color: white;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        max-width: 400px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `,
    header: 'display: flex; align-items: center; margin-bottom: 12px;',
    title: 'font-size: 16px;',
    message: 'margin: 0 0 12px 0; line-height: 1.4; font-size: 14px;',
    button: `
        background: rgba(255, 255, 255, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: white;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
    `
});

// Generic error notification creator
const createErrorNotification = (config: {
    background: string;
    title: string;
    message: string;
    buttonText: string;
}) => {
    const styles = getBaseErrorStyles();
    const errorDiv = document.createElement('div');
    
    errorDiv.style.cssText = `
        ${styles.container}
        background: ${config.background};
    `;

    // Create header container
    const headerDiv = document.createElement('div');
    headerDiv.style.cssText = styles.header;
    
    const title = document.createElement('strong');
    title.style.cssText = styles.title;
    title.textContent = config.title;
    headerDiv.appendChild(title);

    // Create message paragraph
    const message = document.createElement('p');
    message.style.cssText = styles.message;
    message.textContent = config.message;

    // Create button
    const button = document.createElement('button');
    button.style.cssText = styles.button;
    button.textContent = config.buttonText;

    // Add event listener for button click
    button.addEventListener('click', () => errorDiv.remove());

    // Assemble the error div
    errorDiv.appendChild(headerDiv);
    errorDiv.appendChild(message);
    errorDiv.appendChild(button);

    document.body.appendChild(errorDiv);
};

const showDatasetTooSmallError = (dataCount: number) => {
    createErrorNotification({
        background: 'linear-gradient(135deg, #ff6b6b, #ee5a52)',
        title: 'Not Enough Data',
        message: `We found ${dataCount} tabs, but need more to create a meaningful space (recommended: ~70-100).`,
        buttonText: 'Got it'
    });
};

const showNoTabsError = () => {
    createErrorNotification({
        background: 'linear-gradient(135deg, #ff9500, #ff6b35)',
        title: 'No Tabs Found',
        message: 'Unable to gather enough tab information. Please ensure the extension has permissions and that you have at least 3 tabs open.',
        buttonText: 'OK'
    });
};
const injectUI = async (space_id: string, onMessage: onMessageType, registerListeners: registerListenersType) => {
    return null;
}

export const ChromeTabsConnection: MantisConnection = {
    name: "Chrome Tabs",
    description: "Analyzes all your currently open browser tabs",
    icon: chromeIcon,
    trigger: trigger,
    createSpace: createSpace,
    injectUI: injectUI,
}