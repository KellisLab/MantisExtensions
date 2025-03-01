import { create } from "domain";
import type { MantisConnection, injectUIType, onMessageType, setProgressType } from "../types";
import { GenerationProgress } from "../types";

import pubmedIcon from "../../../assets/pubmed.png";
import { getSpacePortal, registerAuthCookies, reqSpaceCreation } from "../../driver";

interface PubMedAuthor {
    LastName?: string;
    ForeName?: string;
}

interface PubMedArticle {
    MedlineCitation: {
        Article: {
            ArticleTitle: string;
            Abstract?: { AbstractText?: string[] };
            AuthorList?: PubMedAuthor[];
            Journal: {
                JournalIssue: {
                    PubDate: string;
                };
            };
        };
        PMID: string;
    };
}

const trigger = (url: string) => {
    return url.includes("pubmed.ncbi.nlm.nih.gov/?term");
}

const createSpace = async (injectUI: injectUIType, setProgress: setProgressType, onMessage: onMessageType) => {
    setProgress(GenerationProgress.GATHERING_DATA);

    const currentUrl = new URL(window.location.href);
    const searchParams = currentUrl.searchParams;

    // Build eutils search parameters from URL parameters
    const eutilsParams = new URLSearchParams();
    eutilsParams.set("db", "pubmed");
    eutilsParams.set("retmax", "1000");
    eutilsParams.set("format", "json");

    // We'll accumulate extra pieces (like publication types, text avail.) here
    let extraFilters: string[] = [];

    // Maps for known filter patterns
    const textAvailabilityMap: Record<string, string> = {
        "simsearch1.fha": "hasabstract[filter]",
        "simsearch2.ffrft": "free full text[filter]",
        "simsearch3.fft": "full text[filter]"
    };

    const articleAttrMap: Record<string, string> = {
        "articleattr.data": "data[filter]"
    };

    for (const [key, value] of searchParams) {
        if (!value || key.startsWith("ps_") || key === "page") continue;

        // Date range from "datesearch.y_"
        if (key === "filter" && value.startsWith("datesearch.y_")) {
            const yearsPast = parseInt(value.split("_")[1] || "1", 10);

            const currentDate = new Date();
            const startYear = currentDate.getFullYear() - yearsPast;
            const mm = String(currentDate.getMonth() + 1).padStart(2, "0");
            const dd = String(currentDate.getDate()).padStart(2, "0");

            eutilsParams.set("datetype", "pdat");
            eutilsParams.set("mindate", `${startYear}/${mm}/${dd}`);
            eutilsParams.set("maxdate", `${currentDate.getFullYear()}/${mm}/${dd}`);
            continue;
        }

        // Sort by date
        if (key === "sort") {
            eutilsParams.set("sort", value);
            continue;
        }

        // Handle other filters
        if (key === "filter") {
            if (value in articleAttrMap) {
                if (articleAttrMap[value]) {
                    extraFilters.push(articleAttrMap[value]);
                }

                continue;
            }

            if (value in textAvailabilityMap) {
                if (textAvailabilityMap[value]) {
                    extraFilters.push(textAvailabilityMap[value]);
                }

                continue;
            }
        }
    }

    let searchQuery = eutilsParams.get("term");

    for (const filter of extraFilters) {
        searchQuery += ` OR ${filter}`;
    }

    eutilsParams.set("term", searchQuery);

    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${eutilsParams.toString()}`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
    const ids = searchData.esearchresult.idlist;

    // Fetch articles in batches of 50
    const batchSize = 50;
    const allArticles: PubMedArticle[] = [];

    for (let i = 0; i < ids.length; i += batchSize) {
        await new Promise(resolve => setTimeout(resolve, 1000));  // Rate limit

        const batchIds = ids.slice(i, i + batchSize);   // Get current batch of IDs

        const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${batchIds.join(',')}&retmode=xml`;
        const fetchResponse = await fetch(fetchUrl);
        const fetchData = await fetchResponse.text();

        // Parse XML data
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(fetchData, "text/xml");
        const articles = Array.from(xmlDoc.getElementsByTagName("PubmedArticle"));

        // Structure XML into JS object
        const parsedArticles = articles.map(article => ({
            MedlineCitation: {
                Article: {
                    ArticleTitle: article.querySelector("ArticleTitle")?.textContent || "",
                    Abstract: {
                        AbstractText: [article.querySelector("Abstract AbstractText")?.textContent || ""]
                    },
                    AuthorList: Array.from(article.querySelectorAll("Author")).map(author => ({
                        LastName: author.querySelector("LastName")?.textContent || "",
                        ForeName: author.querySelector("ForeName")?.textContent || ""
                    })),
                    Journal: {
                        JournalIssue: {
                            PubDate: article.querySelector("PubDate Year")?.textContent || ""
                        }
                    }
                },
                PMID: article.querySelector("PMID")?.textContent || ""
            }
        }));

        allArticles.push(...parsedArticles);
    }

    // Flatten for space creation
    const unfilteredExtractedData = allArticles.map((article: PubMedArticle) => ({
        title: article.MedlineCitation.Article.ArticleTitle,
        abstract: article.MedlineCitation.Article.Abstract?.AbstractText?.join(' ') || '',
        authors: (article.MedlineCitation.Article.AuthorList?.map((author: PubMedAuthor) =>
            `${author.LastName || ''} ${author.ForeName || ''}`
        ) || []).join (", "),
        date: article.MedlineCitation.Article.Journal.JournalIssue.PubDate,
        pmid: article.MedlineCitation.PMID
    }));

    const extractedData = unfilteredExtractedData.filter((article) => article.title && article.abstract && article.authors && article.date && article.pmid);

    setProgress(GenerationProgress.CREATING_SPACE);

    const spaceData = await reqSpaceCreation(extractedData, {
        "title": "title",
        "date": "date",
        "abstract": "semantic",
        "pmid": "categoric",
        "authors": "categoric"
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

    document.querySelector("main > div[class='inner-wrap']").prepend(iframeScalerParent);

    return iframeScalerParent;
}

export const PubmedConnection: MantisConnection = {
    name: "Pubmed",
    description: "Builds spaces based on the results of your Pubmed search",
    icon: pubmedIcon,
    trigger: trigger,
    createSpace: createSpace,
    injectUI: injectUI,
}