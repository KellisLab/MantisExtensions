import { request } from "http";

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

// Retrieve access tokens
async function initiateSignIn(): Promise<string | undefined> {
  try {
    const result = await chrome.identity.getAuthToken({
      interactive: true
    });
    if (result && result.token) {
      console.log("Access token retrieved after interactive sign-in:", result.token);
      return result.token; // Return the token string from the result object
    } else {
      console.log("Interactive sign-in failed or was cancelled.");
      return undefined; // Return undefined if no token in the result
    }
  } catch (error: any) {
    console.error("Error during interactive sign-in:", error);
    console.error("Error details:", JSON.stringify(error, null, 2));
    return undefined; // Return undefined if an error occurred
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "initiateOAuth") {
    (async () => {
      try {
        const token = await initiateSignIn();
        if (!token) {
          sendResponse({ success: false, error: "Failed to retrieve access token." });
          return;
        }

        const allFiles: any[] = [];
        let nextPageToken: string | undefined = undefined;

        do {
          const url = new URL("https://www.googleapis.com/drive/v3/files");
          url.searchParams.set("pageSize", "1000"); // max per API page
          url.searchParams.set("fields", "nextPageToken, files(id, name)");
          if (nextPageToken) {
            url.searchParams.set("pageToken", nextPageToken);
          }

          const res = await fetch(url.toString(), {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!res.ok) {
            const errorData = await res.json();
            sendResponse({
              success: false,
              error: `Drive API error: ${errorData.error?.message || res.statusText}`,
            });
            return;
          }

          const data = await res.json();
          allFiles.push(...data.files);

          // Stop at 2000 files
          if (allFiles.length >= 2000) {
            allFiles.length = 2000; // truncate if over
            break;
          }

          nextPageToken = data.nextPageToken;
        } while (nextPageToken);

        console.log("✅ Fetched Drive Files (max 2000):", allFiles);
        sendResponse({ success: true, token, driveFiles: allFiles });
      } catch (err) {
        sendResponse({
          success: false,
          error: (err as Error).message || "Failed to fetch Google Drive metadata",
        });
      }
    })();
    return true;
  }
});