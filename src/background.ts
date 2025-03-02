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
