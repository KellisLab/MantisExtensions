import { create } from "domain";
import type { MantisConnection, injectUIType, setProgressType } from "../types";
import { GenerationProgress } from "../types";
import { simple as walk } from "acorn-walk";
import escodegen from "escodegen";

import docsIcon from "../../../assets/docs.png";
import { registerAuthCookies, reqSpaceCreation } from "../../driver";

const acorn = require("acorn"); // This package only works with old require

const trigger = (url: string) => {
    return url.includes("docs.google.com/document/d");
}

const createSpace = async (injectUI: injectUIType, setProgress: setProgressType) => {
    // TODO: For popping out webpages from inside Mantis, we could
    // have it auto pop out when control-click is done, and the point
    // has a like a name __mantis_href attr
    
    setProgress(GenerationProgress.GATHERING_DATA);

    const extractedData: any[] = [];

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
            let docCode = escodegen.generate(docValue);

            // Swap the " with ' and vice versa in the value of docCode
            docCode = docCode.replace(/['"]/g, function (x) { return x === '"' ? "'" : '"'; });

            console.log (docCode);

            extractedData.push (JSON.parse(docCode));
        }
    });

    console.log (extractedData);

    setProgress(GenerationProgress.COMPLETED);

    const spaceId = null;
    const createdWidget = null;

    return { spaceId, createdWidget };
}
const injectUI = async (space_id: string) => {
    await registerAuthCookies();

    return null;
}

export const GoogleDocsConnection: MantisConnection = {
    name: "Google Docs",
    description: "Builds spaces based on the content of a Google Docs document",
    icon: docsIcon,
    trigger: trigger,
    createSpace: createSpace,
    injectUI: injectUI,
}