import type { onMessageType, registerListenersType } from "./connections/types";
import { fetchFromCelerySDK } from "./requests";

let COOKIE: string = "";

// Get cookies for authentication from which ever domain hosts cookies
export const refetchAuthCookies = async () => {
    await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "getAuthCookies" }, (response) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }

            COOKIE = response.cookies
                .map((cookie: any) => `${cookie.name}=${cookie.value}`)
                .join("; ");

            console.log (COOKIE);

            if (response.cookies.find ((cookie) => cookie.name === "sessionid") === undefined) {
                reject (new Error(`User is not authenticated with host: ${process.env.PLASMO_PUBLIC_FRONTEND}`));
            }

            resolve();
        });
    });
};

refetchAuthCookies ();

export const getSpacePortal = async (space_id: string, onMessage: onMessageType, registerListeners: registerListenersType) => {
    const IFRAME_SCALE = 0.75;

    // Generate uuidv4 using the browser's crypto API
    const uuidv4 = getUuidV4 ();

    // Lets the background script know that WE are the ones communicating with this mantis space
    await chrome.runtime.sendMessage({
        action: "registerCommunication",
        uuid: uuidv4,
    });

    // Listen for double proxied messages from the background manager and executes the payload from the callback
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "forward_mantis_msg") {
            const uuid = request.uuid;
            
            if (uuid === uuidv4) {
                onMessage (request.messageType, request.messagePayload);
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false });
            }
            
            return true;
        }
    });

    // Create the iframe and container elements
    const iframeScalerParent = document.createElement("div");
    iframeScalerParent.style.width = "100%";
    iframeScalerParent.style.height = "80vh";
    iframeScalerParent.style.border = "none";
    iframeScalerParent.style.position = "relative"; // Add position relative to contain absolute children

    const iframe = document.createElement("iframe");
    const iframeUrl = `${process.env.PLASMO_PUBLIC_FRONTEND}/space/${space_id}?ext_id=${uuidv4}`;
    iframe.src = iframeUrl;
    iframe.style.border = "none";
    iframe.style.transform = `scale(${IFRAME_SCALE})`;
    iframe.style.transformOrigin = "top left";
    iframe.style.width = (100 / IFRAME_SCALE).toString() + "%";
    iframe.style.height = (80 / IFRAME_SCALE).toString() + "vh";
    iframe.style.overflow = "hidden";
    
    // Create the popout button
    const popoutButton = document.createElement("button");
    popoutButton.innerText = "Open in new window";
    popoutButton.style.position = "absolute";
    popoutButton.style.top = "10px";
    popoutButton.style.right = "10px";
    popoutButton.style.padding = "6px 12px";
    popoutButton.style.zIndex = "1000";
    popoutButton.style.cursor = "pointer";
    popoutButton.style.backgroundColor = "#4f46e5"; // indigo-600
    popoutButton.style.color = "white";
    popoutButton.style.border = "none";
    popoutButton.style.borderRadius = "6px";
    popoutButton.style.fontSize = "14px";
    popoutButton.style.fontWeight = "500";
    popoutButton.style.boxShadow = "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)";
    popoutButton.style.transition = "background-color 150ms ease";
    
    // Hover effect
    popoutButton.addEventListener("mouseover", () => {
        popoutButton.style.backgroundColor = "#4338ca"; // indigo-700
    });
    
    popoutButton.addEventListener("mouseout", () => {
        popoutButton.style.backgroundColor = "#4f46e5"; // indigo-600
    });
    
    // Add click event to the button
    popoutButton.addEventListener("click", () => {
        // Open the URL in a new window
        window.open(iframeUrl, "_blank", "width=1024,height=768");
        iframeScalerParent.remove();
    });
    
    // Add elements to the container
    iframeScalerParent.appendChild(popoutButton);
    iframeScalerParent.appendChild(iframe);

    return iframeScalerParent;
};

export const reqSpaceCreation = async (data: any, data_types: any, establishLogSocket: (string) => void, name: string | null = null)  => {
    return await new Promise<{ space_id: string, error: string, stacktrace: string }> (async (resolve, reject) => {
        const job = getUuidV4();    

        // Main create space driver, makes initial request
        fetchFromCelerySDK(`/api/create-space`, `/api/space-task-status`, {
            method: 'POST',
            credentials: 'omit',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                data: data,
                cookie: COOKIE,
                data_types: data_types,
                name: name,
                job: job
            })
        }).then ((spaceDataResponse) => { // <- if request succeeds then resolve creation
            resolve(spaceDataResponse);
        }).catch (reject);

        // Poll for the space ID continuously
        // this is in order to instantiate a logging socket 
        const checkSpaceId = async () => {
            try {
                // Probe backend, resolve if found
                const response = await fetch(`${process.env.PLASMO_PUBLIC_SDK}/api/get-space-id/${job}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.space_id) {
                        return { spaceId: data.space_id, layerId: data.layer_id };
                    }
                }

                await new Promise(r => setTimeout(r, 500));
                return checkSpaceId(); // Recursive call
            } catch (error) {
                await new Promise(r => setTimeout(r, 500));
                return checkSpaceId(); // Recursive call
            }
        };

        // Start logging sequence, this will establish a socket connection to the space
        const { spaceId, layerId } = await checkSpaceId();
        establishLogSocket(spaceId);
    });
}

export const registerAuthCookies = async () => {
    // Get the latest and greatest cookies from COOKIE domain
    await refetchAuthCookies ();

    const frontendUrl = new URL(process.env.PLASMO_PUBLIC_FRONTEND);

    for (const cookieStr of COOKIE.split(";")) {
        let [cookieName, cookieValue] = cookieStr.split("=", 2);
        cookieName = cookieName.trim();

        if (!cookieName) {
            continue;
        }

        // Send message to chrome
        await chrome.runtime.sendMessage({
            action: "setCookie",
            url: `https://${frontendUrl.hostname}`, // For some reason it only works if we force the domain to use https
            name: cookieName.trim(),
            value: cookieValue?.trim() || "",
            sameSite: "no_restriction"
        });
    }
}
export const getUuidV4 = () => {
    return crypto.randomUUID();
}
