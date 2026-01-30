const CLUSTER_COLORS = [
    'blue', 'red', 'yellow', 'green', 'pink', 
    'purple', 'cyan', 'orange', 'grey'
] as const;

async function createTabGroupsFromClusters(clusters: [number, number[], string][]) {
    try {
        // Sort clusters by size (largest first)
        clusters.sort((a, b) => b[1].length - a[1].length);

        for (const [clusterIndex, [clusterId, tabIds, label]] of clusters.entries()) {
            if (tabIds.length === 0) continue;

            // Create a group for this cluster
            const groupId = await chrome.tabs.group({ tabIds });
            
            // Update group with cluster name and color
            const color = CLUSTER_COLORS[clusterIndex % CLUSTER_COLORS.length];
            await chrome.tabGroups.update(groupId, {
                title: `${label} (${tabIds.length})`,  // Use the actual cluster label
                color: color,
                collapsed: tabIds.length > 5
            });
            
        }
    } catch (error) {
        console.error('Error creating tab groups:', error);
        throw error;
    }
}
async function fetchClustersFromMantis(spaceId: string, tabsMap: Map<number, number>): Promise<[number, number[], string][]> {
    return new Promise((resolve, reject) => {
        try {
            const backendUrl = process.env.PLASMO_PUBLIC_MANTIS_API || 'http://localhost:8000';
            const wsUrl = backendUrl.replace('http', 'ws') + `/ws/space/${spaceId}/`;
            
            // Connecting to WebSocket

            const ws = new WebSocket(wsUrl);
            let clustersReceived = false;
            let pointsWithClustersReceived = false;
            let pointsWithMetadataReceived = false;
            
            const clusterLabels = new Map<string, string>();        // Map cluster ID to label
            const pointToClusterMap = new Map<string, string>();    // ← ADD THIS: Map point ID to cluster ID
            const clusterGroups = new Map<string, number[]>();      // Map cluster ID to tab IDs


            ws.addEventListener('message', (event) => {
                const data = JSON.parse(event.data);
                
                // Collect cluster labels (only update with real names, not UUIDs)
                if (data.type === 'cluster' && data.clusters) {
                    
                    // Recieved Cluster Labels
                    
                    data.clusters.forEach((cluster: any) => {
                        const label = cluster.label?.trim();
                        
                        if (label && !label.startsWith('Cluster ')) {
                            clusterLabels.set(cluster.id, label);
                        }
                    });
                    
                    clustersReceived = true;
                }
                
                // First points message: Get cluster assignments (has cluster field)
                if (data.type === 'points' && data.points && data.points[0]?.cluster && !pointsWithClustersReceived) {
                    // Processing points with cluster assignments
                    
                    data.points.forEach((point: any) => {
                        if (point.cluster && point.id) {
                            pointToClusterMap.set(point.id, point.cluster);
                        }
                    });
                    
                    pointsWithClustersReceived = true;
                }
                
                // Later points message: Get tab_id metadata (has metadata.tab_id field)
                if (data.type === 'points' && data.points && data.points[0]?.metadata?.tab_id && !pointsWithMetadataReceived) {
                    // Processing points with tab IDs
                    
                    data.points.forEach((point: any) => {
                        const tabId = parseInt(point.metadata.tab_id);
                        const pointId = point.id;
                        const clusterId = pointToClusterMap.get(pointId);
                        
                        if (clusterId && tabId) {
                            if (!clusterGroups.has(clusterId)) {
                                clusterGroups.set(clusterId, []);
                            }
                            clusterGroups.get(clusterId)!.push(tabId);
                        }
                    });
                    
                    pointsWithMetadataReceived = true;
                }

                if (data.type === 'finished') {
                    // WebSocket finished loading data
                    ws.close();
                    
                    if (clustersReceived && pointsWithClustersReceived && pointsWithMetadataReceived && clusterGroups.size > 0) {
                        const result: [number, number[], string][] = Array.from(clusterGroups.entries()).map(
                            ([clusterId, tabIds]) => {
                                const label = clusterLabels.get(clusterId) || `Cluster ${clusterId}`;
                                return [clusterId as any, tabIds, label];
                            }
                        );
                        
                        result.sort((a, b) => b[1].length - a[1].length);
                        
                        resolve(result);
                    } else {
                        reject(new Error(`Missing data: clusters=${clustersReceived}, pointsWithClusters=${pointsWithClustersReceived}, pointsWithMetadata=${pointsWithMetadataReceived}, groups=${clusterGroups.size}`));
                    }
                }
            });

            ws.addEventListener('error', (error) => {
                console.error('💥 WebSocket error:', error);
                ws.close();
                reject(new Error('WebSocket connection failed'));
            });


            setTimeout(() => {
                if (!clustersReceived || !pointsWithClustersReceived || !pointsWithMetadataReceived) {
                    ws.close();
                    reject(new Error('WebSocket timeout'));
                }
            }, 30000);

        } catch (error) {
            console.error('💥 Error setting up WebSocket:', error);
            reject(error);
        }
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fetchClusters") {
        fetchClustersFromMantis(request.spaceId, new Map(request.tabsMap))
            .then((clusterGroups: [number, number[], string][]) => {  // Add the string type for label
                createTabGroupsFromClusters(clusterGroups)
                    .then(() => sendResponse({ success: true }))
                    .catch(error => sendResponse({ success: false, error: error.message }));
            })
            .catch(error => sendResponse({ success: false, error: error.message }));
        
        return true; // Keep message channel open for async response
    }
});


// This is used to get all tabs in the browser, and some of their content
// Add timeout wrapper function
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, defaultValue: T): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((resolve) => setTimeout(() => resolve(defaultValue), timeoutMs))
    ]);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle getTabsWithContent request
    if (request.action === "getTabsWithContent") {
        chrome.tabs.query({}, async (tabs) => {
            if (chrome.runtime.lastError) {
                sendResponse({ error: chrome.runtime.lastError.message });
                return;
            }

            // Process Tabs

            const tabsWithContentPromises = tabs.map(async (tab, index) => {
                const tabData = { ...tab, pageContent: '' };
                
                try {
                    if (tab.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
                        // Add 5 second timeout per tab
                        const results = await withTimeout(
                            chrome.scripting.executeScript({
                                target: { tabId: tab.id },
                                func: getPageContent,
                            }),
                            5000, // 5 second timeout
                            null
                        );
                        
                        if (results && results[0] && results[0].result) {
                            tabData.pageContent = results[0].result;
                        } else {
                            tabData.pageContent = `Content from ${new URL(tab.url).hostname} - timed out`;
                        }
                    }
                } catch (error) {
                    console.warn(`⚠️ Could not get content for tab ${tab.id}:`, error.message);
                    tabData.pageContent = `Content from ${tab.url ? new URL(tab.url).hostname : 'unknown site'} - unable to read page content`;
                }
                
                
                return tabData;
            });

            const tabsWithContent = await Promise.all(tabsWithContentPromises);
            
            sendResponse({ tabs: tabsWithContent });
        });
        return true;
    }
    
    
    return false;
});

// This is for filtering text nodes in the page content extraction
// It feels less appropriate to have this logic here, 
// but this function was long enough to warrant its own helper
const acceptNode = (node, excludedTags = ['script', 'style', 'noscript', 'iframe', 'object'], minTextLength = 3) => {
    // Skip script, style, and other non-visible content
    const parent = node.parentElement;
    if (!parent) return NodeFilter.FILTER_REJECT;
    
    const tagName = parent.tagName.toLowerCase();
    if (excludedTags.includes(tagName)) {
        return NodeFilter.FILTER_REJECT;
    }
    
    // Skip if parent is hidden
    const style = window.getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden') {
        return NodeFilter.FILTER_REJECT;
    }
    
    // Only accept text nodes with meaningful content
    const text = node.textContent?.trim() || '';
    if (text.length < minTextLength) return NodeFilter.FILTER_REJECT;
    
    return NodeFilter.FILTER_ACCEPT;
};

// This gets the page content from a tab.
function getPageContent() {
    try {
        const title = document.title || '';
        const url = window.location.href;
        const domain = window.location.hostname;
        
        // Get ALL visible text from the page
        let allText = '';
        
        // Method 1: Try to get all text from body
        if (document.body) {
            // Get all text content, which automatically excludes HTML tags
            allText = document.body.innerText || document.body.textContent || '';
        }
        
        // If body approach fails, try document-wide text extraction
        if (!allText || allText.length < 100) {
            // Get all text nodes in the document
            const walker = document.createTreeWalker(
                document.body || document.documentElement,
                NodeFilter.SHOW_TEXT,
                { acceptNode }
            );
            
            const textNodes = [];
            let node;
            while (node = walker.nextNode()) {
                const text = node.textContent?.trim();
                if (text && text.length > 2) {
                    textNodes.push(text);
                }
            }
            
            allText = textNodes.join(' ');
        }
        
        // Clean up the text
        allText = allText
            .replace(/\s+/g, ' ')           // Replace multiple whitespace with single space
            .trim();
        
        // Take a reasonable sample of the text (first 300 chars)
        const textSample = allText.substring(0, 300);

        // Combine title and text content
        let result = '';
        if (title && title.trim()) {
            result += `${title.trim()}. `;
        }
        
        if (textSample && textSample.length > 10) {
            // Remove title from content if it's repeated
            let contentText = textSample;
            if (title && textSample.toLowerCase().startsWith(title.toLowerCase())) {
                contentText = textSample.substring(title.length).trim();
                if (contentText.startsWith('.') || contentText.startsWith('-')) {
                    contentText = contentText.substring(1).trim();
                }
            }
            
            if (contentText.length > 10) {
                result += contentText;
            }
        }
        
        // Generic fallback if no meaningful content found
        if (!result.trim() || result.trim().length < 20) {
            result = `Content from ${domain} - ${title || url.split('/').pop() || 'webpage'}`;
        }
        
        return result || `Page from ${domain}`;
        
    } catch (error) {
        console.error('Error extracting page content:', error);
        
        // Simple fallback
        const domain = window.location.hostname;
        const title = document.title || '';
        
        return title || `Content from ${domain}`;
    }
}

// This is used to register cookies in the browser
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "setCookie") {
        chrome.cookies.set({
            url: request.url,
            name: request.name,
            value: request.value,
            path: "/",
            secure: true,
            sameSite: request.sameSite || "strict",
            httpOnly: false,
            expirationDate: Math.floor(Date.now() / 1000) + 3600 // 1 hour
        }, () => sendResponse({ success: true }));
        
        return true; // Keep the message channel open for async response
    }
})

// This is used to get cookies from the browser
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getCookie") {
        chrome.cookies.get({
            url: request.url,
            name: request.name
        }, (cookie) => sendResponse({ cookie }));

        return true;
    }
})

// This retrieves all cookies from the domain
// hosting the Mantis frontend that we are using
// e.g. "mantisdev.csail.mit.edu" or "localhost"
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const frontendUrl = new URL(process.env.PLASMO_PUBLIC_FRONTEND);

    if (request.action === "getAuthCookies") {
        chrome.cookies.getAll({ domain: frontendUrl.hostname }, (cookies) => sendResponse({ cookies }));

        return true;
    }
});

const communications = {};

// This is used to register communication channels between the background script and the injected Mantis
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === "registerCommunication") {
        const uuid = request.uuid;

        communications[uuid] = _sender.tab.id;
        
        sendResponse({ success: true });
        return true;
    }
});

// Gets a proxied message from the content script and forwards it to the appropriate tab
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === "mantis_msg") {
        const uuid = request.uuid;
        const tabId = communications[uuid];
        
        if (tabId) {
            // Forward the message to the content script in the appropriate tab
            chrome.tabs.sendMessage(tabId, {
                action: "forward_mantis_msg",
                uuid: uuid,
                messageType: request.messageType,
                messagePayload: request.messagePayload
            }, response => {
                sendResponse(response);
            });

            return true;
        } else {
            sendResponse({ success: false });
            return true;
        }
    }
});