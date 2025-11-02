// This is used to get all tabs in the browser, and some of their conten
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle getTabs request for Chrome Tabs connection
    if (request.action === "getTabs") {
        chrome.tabs.query({}, (tabs) => {
            if (chrome.runtime.lastError) {
                sendResponse({ error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ tabs: tabs });
            }
        });
        return true;
    }
    
    // Handle getTabsWithContent request
    if (request.action === "getTabsWithContent") {
        chrome.tabs.query({}, async (tabs) => {
            if (chrome.runtime.lastError) {
                sendResponse({ error: chrome.runtime.lastError.message });
                return;
            }

            const tabsWithContent = [];
            
            for (const tab of tabs) {
                const tabData = { ...tab, pageContent: '' }; // Add pageContent property
                
                // Try to get page content for each tab
                try {
                    if (tab.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
                        // Execute content script to get page text
                        const results = await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: getPageContent, // Use 'func' instead of 'function'
                        });
                        
                        if (results && results[0] && results[0].result) {
                            tabData.pageContent = results[0].result;
                        }
                    }
                } catch (error) {
                    console.error(`Could not get content for tab ${tab.id}:`, error);
                    // Set a fallback description
                    tabData.pageContent = `Content from ${tab.url ? new URL(tab.url).hostname : 'unknown site'} - unable to read page content`;
                }
                
                tabsWithContent.push(tabData);
            }
            
            sendResponse({ tabs: tabsWithContent });
        });
        return true;
    }
    
    // Don't interfere with other message handlers
    return false;
});

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
                {
                    acceptNode: function(node) {
                        // Skip script, style, and other non-visible content
                        const parent = node.parentElement;
                        if (!parent) return NodeFilter.FILTER_REJECT;
                        
                        const tagName = parent.tagName.toLowerCase();
                        if (['script', 'style', 'noscript', 'iframe', 'object'].includes(tagName)) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        
                        // Skip if parent is hidden
                        const style = window.getComputedStyle(parent);
                        if (style.display === 'none' || style.visibility === 'hidden') {
                            return NodeFilter.FILTER_REJECT;
                        }
                        
                        // Only accept text nodes with meaningful content
                        const text = node.textContent?.trim() || '';
                        if (text.length < 3) return NodeFilter.FILTER_REJECT;
                        
                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
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
            .replace(/\n+/g, ' ')           // Replace newlines with spaces
            .replace(/\t+/g, ' ')           // Replace tabs with spaces
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
        console.log('Error extracting page content:', error);
        
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