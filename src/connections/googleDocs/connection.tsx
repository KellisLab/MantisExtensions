import { create } from "domain";
import type { MantisConnection, injectUIType, onMessageType, setProgressType } from "../types";
import { GenerationProgress } from "../types";
import { simple as walk } from "acorn-walk";
import escodegen from "escodegen";

import docsIcon from "../../../assets/docs.png";
import { getSpacePortal, registerAuthCookies, reqSpaceCreation } from "../../driver";

const acorn = require("acorn"); // This package only works with old require
import { median } from "d3-array";

const trigger = (url: string) => {
    return url.includes("docs.google.com/document/d");
}

const createSpace = async (injectUI: injectUIType, setProgress: setProgressType, onMessage: onMessageType) => {
    setProgress(GenerationProgress.GATHERING_DATA);

    let extractedData: any[] = [];
    let documentString = "";

    document.querySelectorAll('script[nonce]').forEach((script) => {
        const content = script.textContent || "";
        const ast = acorn.parse(content, { ecmaVersion: 2020 });

        let docValue = null;
        
        walk(ast, {
            AssignmentExpression(node) {
                // Look for assignments to VAR
                if (node.left.type === 'Identifier' && node.left.name === 'DOCS_modelChunk') {
                    if (!(node.right.type === 'Identifier' && node.right.name === 'undefined')) {
                        docValue = node.right;
                    }
                }
            }
        });

        if (docValue) {
            let docCode = escodegen.generate(docValue, {
                format: {
                    json: true
                },
            });

            const docData: any[] = JSON.parse(docCode);
            const documentStringSlice = docData.find((param) => param.ty === "is").s;

            documentString += documentStringSlice;
        }
    });


    // This syntax is absolutely DISGUSTING
    // But it's the only way to make sure we have enough splits
    let segments = documentString.split("\n");

    if (segments.length < 50) {
        segments = documentString.split(". ");

        if (segments.length < 20) {
            throw new Error ("Document is too short to be converted into a space");
        }
    }

    // Merge segments that are short with the previous segment if under 20% of the average length
    const lengths = segments.map(s => s.trim().length).filter(len => len > 0);
    const med = median(lengths) || 0;
    const threshold = 0.5 * med;

    const continuations = ["•", "-"];

    let i = 1;
    while (segments.length > 1 && i < segments.length) {
        const segment = segments[i].trim();
        let merge = false;

        if (segment.length < threshold) merge = true;
        if (segments.length > 100 && continuations.some(cont => segment.startsWith(cont))) merge = true;
        if (segments.length > 100 && /^[A-Za-z0-9]+\.\s/.test(segment)) merge = true;

        if (merge) {
            segments[i - 1] += "\n" + segments[i];
            segments.splice(i, 1);
            i = 1;
        } else {
            i++;
        }
    }

    // Remove empty segments
    const nonEmptySegments = segments.filter((segment) => segment.trim() !== "");

    nonEmptySegments.forEach (segment => {
        const idx = extractedData.length;
        const title = `Segment ${idx + 1}`;

        extractedData.push({ title, idx, segment });
    });

    extractedData = extractedData.filter (data => data.segment.length > 0);

    console.log (extractedData);

    if (extractedData.length < 20) {
        throw new Error ("Document is too short to be converted into a space");
    }

    setProgress(GenerationProgress.CREATING_SPACE);

    const spaceData = await reqSpaceCreation(extractedData, {
        "title": "title",
        "idx": "numeric",
        "segment": "semantic"
    });

    setProgress(GenerationProgress.INJECTING_UI);

    const spaceId = spaceData.space_id;
    const createdWidget = await injectUI(spaceId, onMessage);

    setProgress(GenerationProgress.COMPLETED);

    return { spaceId, createdWidget };
}
const injectUI = async (space_id: string, onMessage: onMessageType) => {
    await registerAuthCookies();

    const iframeScalerParent = await getSpacePortal (space_id, onMessage);

    document.querySelector("#docs-editor-container").prepend (iframeScalerParent);

    return iframeScalerParent;
}

export const GoogleDocsConnection: MantisConnection = {
    name: "Google Docs",
    description: "Builds spaces based on the content of a Google Docs document",
    icon: docsIcon,
    trigger: trigger,
    createSpace: createSpace,
    injectUI: injectUI,
}