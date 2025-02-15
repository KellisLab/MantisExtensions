import { GoogleConnection } from "./connections/google/connection";
import { WikipediaConnection } from "./connections/wikipedia/connection";

const CONNECTIONS = [WikipediaConnection, GoogleConnection];

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
}

export const reqSpaceCreation = async (data: any, data_types: any, name: string | null = null)  => {
    const spaceDataResponse = await fetch(`${process.env.SDK}/create-space`, {
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

    for (const cookieStr of COOKIE.split(";")) {
        const [cookieName, cookieValue] = cookieStr.split("=", 2);

        // Send message to chrome
        await chrome.runtime.sendMessage({
            action: "setCookie",
            url: process.env.COOKIE_DOMAIN,
            name: cookieName.trim(),
            value: cookieValue?.trim() || "",
            sameSite: "no_restriction"
        });
    }
}