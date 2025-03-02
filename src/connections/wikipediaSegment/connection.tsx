import type { MantisConnection, injectUIType, onMessageType, sendMessageType, setProgressType } from "../types";
import { GenerationProgress } from "../types";
import { median } from "d3-array";
import wikiIcon from "../../../assets/wiki.png";
import { getSpacePortal, registerAuthCookies, reqSpaceCreation } from "../../driver";

const trigger = (url: string) => {
    return url.includes("en.wikipedia.org/wiki");
}

const createSpace = async (injectUI: injectUIType, setProgress: setProgressType, onMessage: onMessageType, registerListeners: sendMessageType) => {
    setProgress(GenerationProgress.GATHERING_DATA);

    let extractedData: any[] = [];
    
    // Get the main content paragraphs
    const paragraphs = document.querySelectorAll('#mw-content-text .mw-parser-output > p');
    type Segment = {text: string, paragraph_idx: number};

    const splitParagraphs = (delim: string): Segment[] => {
        // For each HTML paragraph
        // Split into segments
        // Map each segment to include the paragraph index
        // Flatten segments
        return Array.from(paragraphs).map((p, paragraph_idx) => { 
            return p.textContent.split (delim).map (text => ({ text, paragraph_idx }));
        }).flat();
    }

    let segments: Segment[] = splitParagraphs ("\n");
    
    if (segments.length < 90) {
        segments = splitParagraphs (".");

        if (segments.length < 20) {
            throw new Error("Article is too short to be converted into a space");
        }
    }

    // Merge segments that are short with the previous segment if under threshold of the median length
    const lengths = segments.map(s => s.text.trim().length).filter(len => len > 0);
    const med = median(lengths) || 0;
    const threshold = 0.4 * med;

    const continuations = ["•", "-"];

    let i = 1;
    while (segments.length > 1 && i < segments.length) {
        const segment = segments[i].text.trim();
        let merge = false;

        if (segment.length < threshold) merge = true;
        if (segments.length > 100 && continuations.some(cont => segment.startsWith(cont))) merge = true;
        if (segments.length > 100 && /^[A-Za-z0-9]+\.\s/.test(segment)) merge = true;

        if (merge) {
            segments[i - 1].text += "\n" + segments[i].text;
            segments.splice(i, 1);
            i = 1;
        } else {
            i++;
        }
    }

    // Remove empty segments
    const nonEmptySegments = segments.filter((segment) => segment.text.trim() !== "");

    // Generate smart titles for each segment
    nonEmptySegments.forEach(segment => {
        const idx = extractedData.length;
        
        // Generate a smart title based on the content
        let title = generateSmartTitle(segment.text);
        
        extractedData.push({ title, idx, segment: segment.text, paragraph_idx: segment.paragraph_idx });
    });

    extractedData = extractedData.filter(data => data.segment.length > 0);

    console.log(extractedData);

    if (extractedData.length < 20) {
        throw new Error("Article is too short to be converted into a space");
    }

    setProgress(GenerationProgress.CREATING_SPACE);

    const spaceData = await reqSpaceCreation(extractedData, {
        "title": "title",
        "idx": "numeric",
        "segment": "semantic",
        "paragraph_idx": "numeric"
    });

    setProgress(GenerationProgress.INJECTING_UI);

    const spaceId = spaceData.space_id;
    const createdWidget = await injectUI(spaceId, onMessage, registerListeners);

    setProgress(GenerationProgress.COMPLETED);

    return { spaceId, createdWidget };
}

// Helper function to generate smart titles from segment content
function generateSmartTitle(segment: string): string {
    // Clean the segment text
    const text = segment.trim();
    
    if (text.length === 0) return "Empty Segment";
    
    // Try to extract the first sentence or part of it
    let title = "";
    
    // Look for the first sentence (ending with period, question mark, or exclamation)
    const firstSentenceMatch = text.match(/^([^.!?]+[.!?])/);
    if (firstSentenceMatch) {
        title = firstSentenceMatch[1].trim();
    } else {
        // If no sentence punctuation, take the first part
        title = text.split("\n")[0].trim();
    }
    
    // Limit length and remove reference brackets common in Wikipedia
    title = title.replace(/\[\d+\]/g, "").trim();
    
    // If title is too long, truncate it
    if (title.length > 60) {
        // Try to find a natural break point
        const breakPoint = title.lastIndexOf(" ", 57);
        if (breakPoint > 20) {
            title = title.substring(0, breakPoint) + "...";
        } else {
            title = title.substring(0, 57) + "...";
        }
    }
    
    // If title is too short or empty, use fallback
    if (title.length < 3) {
        // Extract keywords or use generic title
        const words = text.split(/\s+/).filter(word => word.length > 4).slice(0, 3);
        if (words.length > 0) {
            title = words.join(" ");
            if (title.length > 60) title = title.substring(0, 57) + "...";
        } else {
            title = "Section Content";
        }
    }
    
    return title;
}

const injectUI = async (space_id: string, onMessage: onMessageType, registerListeners: sendMessageType) => {
    await registerAuthCookies();

    const iframeScalerParent = await getSpacePortal (space_id, onMessage, registerListeners);

    document.querySelector("body > div.mw-page-container").prepend(iframeScalerParent);

    return iframeScalerParent;
}

const onMessage = async (messageType: string, messagePayload: any) => {
    if (messageType === "select") {
        const paragraphIdx = messagePayload.point.metadata.values.paragraph_idx;
        const paragraphs = document.querySelectorAll('#mw-content-text .mw-parser-output > p');
        
        if (paragraphs.length > 0) {
            // Use the index to approximate which paragraph to highlight
            // This is a simplification since our segments don't directly match paragraphs
            const paragraph = paragraphs[paragraphIdx] as HTMLElement;
            const prevColor = paragraph.style.backgroundColor;
            
            paragraph.scrollIntoView({ behavior: 'smooth', block: 'center' });
            paragraph.style.backgroundColor = 'yellow';
            
            setTimeout(() => {
                paragraph.style.backgroundColor = prevColor;
            }, 3000);
        }
    }

    if (messageType == "add_point") {
        const paragraphIdx = messagePayload.point.metadata.values.paragraph_idx;
        const clusterColor = messagePayload.cluster.color;

        const paragraphs = document.querySelectorAll('#mw-content-text .mw-parser-output > p');
        
        if (paragraphs.length > 0) {
            const paragraph = paragraphs[paragraphIdx] as HTMLElement;
            
            // Create a more subtle version of the color with transparency
            const r = parseInt(clusterColor.slice(1, 3), 16);
            const g = parseInt(clusterColor.slice(3, 5), 16);
            const b = parseInt(clusterColor.slice(5, 7), 16);
            const subtleColor = `rgba(${r}, ${g}, ${b}, 0.3)`;
            
            paragraph.style.backgroundColor = subtleColor;
            paragraph.style.borderRadius = '5px';
            paragraph.style.padding = '2px';
        }
    }
};

export const WikipediaSegmentConnection: MantisConnection = {
    name: "Wikipedia Article",
    description: "Builds spaces based on the content of a Wikipedia article",
    icon: wikiIcon,
    trigger: trigger,
    createSpace: createSpace,
    onMessage: onMessage,
    injectUI: injectUI,
    registerListeners: registerListeners,
}