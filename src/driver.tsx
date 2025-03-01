import { url } from "inspector";
import { GoogleConnection } from "./connections/google/connection";
import { WikipediaReferencesConnection } from "./connections/wikipediaReferences/connection";
import { PubmedConnection } from "./connections/pubmed/connection";
import { GoogleDocsConnection } from "./connections/googleDocs/connection";
import { GoogleScholarConnection } from "./connections/googleScholar/connection";
import type { onMessageType } from "./connections/types";

const CONNECTIONS = [WikipediaReferencesConnection, GoogleConnection, PubmedConnection, GoogleDocsConnection, GoogleScholarConnection];

let COOKIE: string = "";

// Get cookies for authentication from which ever domain hosts cookies
const refetchAuthCookies = async () => {
    await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "getAuthCookies" }, (response) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }

            COOKIE = response.cookies
                .map((cookie: any) => `${cookie.name}=${cookie.value}`)
                .join("; ");

            console.log (COOKIE);

            resolve();
        });
    });
};

refetchAuthCookies ();

export const searchConnections = (url: string, ) => {
    const connections = CONNECTIONS.filter(connection => connection.trigger(url));

    return connections;
};

export const getSpacePortal = async (space_id: string, onMessage: onMessageType) => {
    const scale = 0.75;

    // Generate uuidv4 using the browser's crypto API
    const uuidv4 = crypto.randomUUID();

    await chrome.runtime.sendMessage({
        action: "registerCommunication",
        uuid: uuidv4,
        onMessage: onMessage
    });

    // Create the iframe, hidden by default
    const iframeScalerParent = document.createElement("div");
    iframeScalerParent.style.width = "100%";
    iframeScalerParent.style.height = "80vh";
    iframeScalerParent.style.border = "none";

    const iframe = document.createElement("iframe");
    iframe.src = `${process.env.PLASMO_PUBLIC_FRONTEND}/space/${space_id}?uuid=${uuidv4}`;
    iframe.style.border = "none";
    iframe.style.transform = `scale(${scale})`;
    iframe.style.transformOrigin = "top left";
    iframe.style.width = (100 / scale).toString() + "%";
    iframe.style.height = (80 / scale).toString() + "vh";
    iframe.style.overflow = "hidden";
    iframeScalerParent.appendChild(iframe);

    return iframeScalerParent;
};

export const reqSpaceCreation = async (data: any, data_types: any, name: string | null = null)  => {
    const spaceDataResponse = await fetch(`${process.env.PLASMO_PUBLIC_SDK}/create-space`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            data: data,
            cookie: COOKIE,
            data_types: data_types,
            name: name,
        })
    });

    if (!spaceDataResponse.ok) {
        throw new Error(`Failed to create create space: ${await spaceDataResponse.text()}`);
    }

    return await spaceDataResponse.json();
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