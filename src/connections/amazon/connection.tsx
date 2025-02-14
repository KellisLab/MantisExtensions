import { create } from "domain";
import type { MantisConnection, injectUIType, setProgressType } from "../types";
import amazonIcon from "../../../assets/amazon.jpg";

const trigger = (url: string) => {
    return url.includes("amazon.com/s?");
}

const createSpace = async (injectUI: injectUIType, setProgress: setProgressType) => {
    // Extract k param from the URL
    const url = new URL(window.location.href);
    const searchParams = url.searchParams;
    const query = searchParams.get("k");

    injectUI(query);

    return { spaceId: "", createdWidget: null };
}

const injectUI = async (space_id: string) => {
    console.log (space_id);

    return null;
}

export const AmazonConnection: MantisConnection = {
    name: "Amazon",
    description: "Builds spaces based on the search results of your Amazon searches",
    icon: amazonIcon,
    trigger: trigger,
    createSpace: createSpace,
    injectUI: injectUI,
};