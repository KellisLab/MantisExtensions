import { GoogleConnection } from "./connections/google/connection";
import { WikipediaReferencesConnection } from "./connections/wikipediaReferences/connection";
import { PubmedConnection } from "./connections/pubmed/connection";
import { GoogleDocsConnection } from "./connections/googleDocs/connection";
import { GoogleScholarConnection } from "./connections/googleScholar/connection";
import { WikipediaSegmentConnection } from "./connections/wikipediaSegment/connection";
import { LinkedInConnection } from "./connections/Linkedin/connection";


export const CONNECTIONS = [WikipediaSegmentConnection, WikipediaReferencesConnection, GoogleConnection, PubmedConnection, GoogleDocsConnection, GoogleScholarConnection,LinkedInConnection];

export const searchConnections = (url: string, ) => {
    const connections = CONNECTIONS.filter(connection => connection.trigger(url));

    return connections;
};