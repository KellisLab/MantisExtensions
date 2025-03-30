const trimOuterSlash = (url: string) => {
    if (url.startsWith("/")) {
        return url.substring(1);
    }
    if (url.endsWith("/")) {
        return url.substring(0, url.length - 1);
    }
    return url;
}

export const fetchFromCelerySDK = async (url: string, taskUrl: string, options={}) => {
    console.log (`${process.env.PLASMO_PUBLIC_SDK}/${trimOuterSlash(url)}`);
    console.log (options);

    const response = await fetch(`${process.env.PLASMO_PUBLIC_SDK}/${trimOuterSlash(url)}`, options);
    const responseData = await response.json ();

    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${responseData.error}`);
    }
    
    if (responseData.task_id === undefined) {
        throw new Error(`Failed to fetch ${url} (No task ID found): ${responseData.error}`);
    }

    const getTaskProgress = async () => {
        const poll = await fetch (`${process.env.PLASMO_PUBLIC_SDK}/${trimOuterSlash(taskUrl)}/${responseData.task_id}`);
        const pollData = await poll.json ();

        if (pollData.state === "SUCCESS") {
            if (pollData.stacktrace) {
                throw new Error(`Task failed: ${pollData.stacktrace}`);
            }

            return pollData.result;
        }

        if (pollData.state === "FAILURE") {
            throw new Error(`Task failed: ${pollData.result}`);
        }

        return undefined;
    }

    while (true) {
        const result = await getTaskProgress();

        if (result !== undefined) {
            return result;
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
    }
};