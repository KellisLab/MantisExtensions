import { GoogleConnection } from "./connections/google/connection";
import { WikipediaReferencesConnection } from "./connections/wikipediaReferences/connection";
import { PubmedConnection } from "./connections/pubmed/connection";
import { GoogleDocsConnection } from "./connections/googleDocs/connection";
import { GoogleScholarConnection } from "./connections/googleScholar/connection";
import { WikipediaSegmentConnection } from "./connections/wikipediaSegment/connection";
import { FacebookConnection } from "./connections/facebook/connection";

export const CONNECTIONS = [FacebookConnection, WikipediaSegmentConnection, WikipediaReferencesConnection, GoogleConnection, PubmedConnection, GoogleDocsConnection, GoogleScholarConnection];

export const searchConnections = (url: string, ) => {
    const connections = CONNECTIONS.filter(connection => connection.trigger(url));

    return connections;
};