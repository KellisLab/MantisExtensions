import type { MantisConnection, injectUIType, onMessageType, registerListenersType, setProgressType, establishLogSocketType } from "../types";
import { GenerationProgress } from "../types";

import chromeIcon from "data-base64:../../../assets/chrome.png";
import { reqSpaceCreation } from "../../driver";


interface TabWithContent extends chrome.tabs.Tab {
    pageContent?: string;
    dataIndex?: number;
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

const trigger = (url: string) => {
    return url.includes("google.com/search");
}
const MAX_RETRIES = 5;
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
    const tabsMap = new Map();

    try {
        const tabs = await getTabsWithContentViaMessage();
        
        if (!tabs || tabs.length === 0) {
            throw new NoTabsFoundError();
        }

        tabs.forEach((tab, index) => {
            if (tab.title && tab.url && tab.id) {
                let domain = '';
                try {
                    domain = new URL(tab.url).hostname;
                } catch (e) {
                    domain = 'unknown';
                }

                let pageContent = tab.pageContent || `Page from ${domain}`;

                extractedData.push({
                    title: tab.title,
                    semantic_title: `${tab.active ? 'Active' : 'Background'} tab: ${tab.title}`,
                    link: tab.url,
                    snippet: `Tab ${index + 1}: ${pageContent}`,
                    tab_id: tab.id.toString()  // ← ADD THIS: Store the actual Chrome tab ID
                });

                tabsMap.set(tab.id, tab.id);  // ← CHANGE THIS: Map Chrome tab ID to itself
            }
        });

        setProgress(GenerationProgress.CREATING_SPACE);

        const spaceData = await createSpaceWithAutoRetry(extractedData, establishLogSocket, `Chrome Tabs Space (${tabs.length} tabs)`);

        console.log('🔍 Full spaceData:', JSON.stringify(spaceData, null, 2));

        setProgress(GenerationProgress.INJECTING_UI);

        const spaceId = spaceData.space_id;
        
        const createdWidget = await injectUI(spaceId, onMessage, registerListeners);

        setProgress(GenerationProgress.COMPLETED);

        showOrganizationPrompt(spaceId, tabsMap);

        return { spaceId, createdWidget };

    } catch (error) {
        console.error('Error in Chrome Tabs connection:', error);
        
        if (error instanceof DatasetTooSmallError) {
            showDatasetTooSmallError(error.dataCount);
            return null;
        }
        
        if (error instanceof NoTabsFoundError) {
            showNoTabsError();
            return null;
        }
        
        const errorMessage = error.message || error.toString();
        if (errorMessage.includes('Dataset too small') || 
            errorMessage.includes('minimum 100 rows are required')) {
            showDatasetTooSmallError(extractedData.length);
            return null;
        }
        
        throw error;
    }
}


const showOrganizationPrompt = (spaceId: string, tabsMap: Map<number, number>) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.3s ease;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
        background: white;
        border-radius: 16px;
        padding: 32px;
        max-width: 480px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        animation: slideUp 0.3s ease;
    `;

    modal.innerHTML = `
        <style>
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideUp {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
        </style>
        <div style="text-align: center;">
            <div style="font-size: 48px; margin-bottom: 16px;">📁</div>
            <h2 style="margin: 0 0 12px 0; font-size: 24px; color: #1a1a1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                Organize Your Tabs?
            </h2>
            <p style="margin: 0 0 24px 0; color: #666; font-size: 15px; line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                Would you like to automatically group your tabs based on the clusters in your Mantis space?
            </p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="organize-yes" style="
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    padding: 12px 28px;
                    border-radius: 8px;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    transition: transform 0.2s ease;
                ">
                    Yes, Organize
                </button>
                <button id="organize-no" style="
                    background: #f0f0f0;
                    color: #666;
                    border: none;
                    padding: 12px 28px;
                    border-radius: 8px;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    transition: transform 0.2s ease;
                ">
                    No Thanks
                </button>
            </div>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const yesButton = modal.querySelector('#organize-yes') as HTMLButtonElement;
    const noButton = modal.querySelector('#organize-no') as HTMLButtonElement;

    yesButton.addEventListener('mouseenter', () => {
        yesButton.style.transform = 'translateY(-2px)';
    });
    yesButton.addEventListener('mouseleave', () => {
        yesButton.style.transform = 'translateY(0)';
    });

    noButton.addEventListener('mouseenter', () => {
        noButton.style.transform = 'translateY(-2px)';
    });
    noButton.addEventListener('mouseleave', () => {
        noButton.style.transform = 'translateY(0)';
    });

    yesButton.addEventListener('click', async () => {
        yesButton.innerHTML = '⏳ Organizing...';
        yesButton.disabled = true;
        noButton.disabled = true;

        try {
            await organizeTabsIntoGroups(spaceId, tabsMap);
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 300);
        } catch (error) {
            console.error('Failed to organize tabs:', error);
            modal.innerHTML = `
                <div style="text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                    <h2 style="margin: 0 0 12px 0; font-size: 24px; color: #1a1a1a;">Failed to Organize</h2>
                    <p style="margin: 0 0 24px 0; color: #666; font-size: 15px;">
                        ${error.message || 'An error occurred while organizing tabs.'}
                    </p>
                    <button id="close-error" style="
                        background: #f0f0f0;
                        color: #666;
                        border: none;
                        padding: 12px 28px;
                        border-radius: 8px;
                        font-size: 15px;
                        font-weight: 600;
                        cursor: pointer;
                    ">Close</button>
                </div>
            `;
            modal.querySelector('#close-error').addEventListener('click', () => {
                overlay.style.opacity = '0';
                setTimeout(() => overlay.remove(), 300);
            });
        }
    });

    noButton.addEventListener('click', () => {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 300);
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 300);
        }
    });
};

const organizeTabsIntoGroups = async (spaceId: string, tabsMap: Map<number, number>) => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'fetchClusters',
            spaceId: spaceId,
            tabsMap: Array.from(tabsMap.entries()) // Convert Map to Array for serialization
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else if (response?.success) {
                resolve(true);
            } else {
                reject(new Error(response?.error || 'Unknown error'));
            }
        });
    });
};


// New function for automatic retry
const createSpaceWithAutoRetry = async (extractedData: { title: string; semantic_title: string; link: string; snippet: string; tab_id: string; }[], establishLogSocket: establishLogSocketType, title: string, maxRetries = MAX_RETRIES) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            
            if (attempt > 1) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            }
            
            return await reqSpaceCreation(extractedData, {
                "title": "title",
                "semantic_title": "semantic",
                "link": "links",
                "snippet": "semantic",
                "tab_id": "numeric"  // ← ADD THIS: Tell Mantis this is a numeric field
            }, establishLogSocket, title);
            
        } catch (error) {
            const errorMessage = error.message || error.toString();
            
            if (errorMessage.includes('Dataset too small') || 
                errorMessage.includes('minimum 100 rows are required')) {
                throw new DatasetTooSmallError(extractedData.length, errorMessage);
            }
            
            if ((errorMessage.includes('504') || 
                 errorMessage.includes('timeout') || 
                 errorMessage.includes('Gateway Time-out')) && 
                 attempt < maxRetries) {
                
                continue;
            }
            
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

const injectUI = async (
    space_id: string, 
    onMessage: onMessageType, 
    registerListeners: registerListenersType,
    tabsMap?: Map<number, number>
) => {
    // If no tabsMap provided (non-ChromeTabs connection), return early
    if (!tabsMap) return null;

    // Create a floating button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 10000;
    `;

    // Create the organize button
    const organizeButton = document.createElement('button');
    organizeButton.style.cssText = `
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        padding: 14px 24px;
        border-radius: 28px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        transition: all 0.3s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    
    organizeButton.innerHTML = `
        <span>📁</span>
        <span>Organize Tabs by Clusters</span>
    `;

    // Hover effects
    organizeButton.addEventListener('mouseenter', () => {
        organizeButton.style.transform = 'translateY(-2px)';
        organizeButton.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.5)';
    });

    organizeButton.addEventListener('mouseleave', () => {
        organizeButton.style.transform = 'translateY(0)';
        organizeButton.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
    });

    // Click handler
    let isOrganizing = false;
    organizeButton.addEventListener('click', async () => {
        if (isOrganizing) return;
        
        isOrganizing = true;
        organizeButton.disabled = true;
        organizeButton.innerHTML = `
            <span>⏳</span>
            <span>Organizing...</span>
        `;

        try {
            await organizeTabsIntoGroups(space_id, tabsMap);
            
            // Success state
            organizeButton.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';
            organizeButton.innerHTML = `
                <span>✓</span>
                <span>Tabs Organized!</span>
            `;

            // Hide button after success
            setTimeout(() => {
                buttonContainer.style.opacity = '0';
                buttonContainer.style.transition = 'opacity 0.5s ease';
                setTimeout(() => buttonContainer.remove(), 500);
            }, 2000);

        } catch (error) {
            console.error('Failed to organize tabs:', error);
            
            // Error state
            organizeButton.style.background = 'linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)';
            organizeButton.innerHTML = `
                <span>⚠️</span>
                <span>Failed to Organize</span>
            `;
            
            setTimeout(() => {
                isOrganizing = false;
                organizeButton.disabled = false;
                organizeButton.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                organizeButton.innerHTML = `
                    <span>📁</span>
                    <span>Organize Tabs by Clusters</span>
                `;
            }, 3000);
        }
    });

    buttonContainer.appendChild(organizeButton);
    document.body.appendChild(buttonContainer);

    return buttonContainer;
}

export const ChromeTabsConnection: MantisConnection = {
    name: "Chrome Tabs",
    description: "Analyzes all your currently open browser tabs",
    icon: chromeIcon,
    trigger: trigger,
    createSpace: createSpace,
    injectUI: injectUI,
}