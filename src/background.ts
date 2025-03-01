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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "registerCommunication") {
        const uuid = request.uuid;

        communications[uuid] = request.onMessage;

        return true;
    }
});