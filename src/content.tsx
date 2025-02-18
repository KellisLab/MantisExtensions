import cssText from "data-text:~style.css";
import type { PlasmoCSConfig } from "plasmo";
import { useEffect, useState } from "react";

import faviconIco from "../assets/icon.png";
import { searchConnections } from "./driver";
import type { MantisConnection, setProgressType, StoredSpace } from "./connections/types";
import { GenerationProgress, Progression } from "./connections/types";
import { addSpaceToCache, deleteSpacesWhere, getCachedSpaces } from "./persistent";

export const config: PlasmoCSConfig = {
    matches: ["<all_urls>"] 
};

// Plasmo code for using tailwindcss in the page
export const getStyle = () => {
    const style = document.createElement("style");
    style.textContent = cssText;
    return style;
}

// This manages the possiblity of duplicate widget
// where a new space is created where an old one was
// already created. *aka* it removes the old injected
// widget and replaces it with the new one.
const sanitizeWidget = (widget: HTMLElement, connection: MantisConnection) => {
    const widget_id = `mantis-injected-widget-${connection.name}`;

    // Remove the widget if it already exists and replace it
    const existingInjectedWidget = document.getElementById(widget_id);
    if (existingInjectedWidget) {
        existingInjectedWidget.remove();
    }

    if (widget) {
        widget.id = widget_id;
    }
}

// Exits the dialog
const CloseButton = ({ close }: { close: () => void }) => {
    return <button
    onClick={close}
    className={`absolute top-2 right-4 text-gray-500 hover:text-gray-700 text-2xl font-bold`}
    >
        &times;
    </button>;
};

// Dialog util
const DialogHeader = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white p-5 rounded-xl shadow-[0_0_20px_rgba(0,0,0,0.15)]">
            <div className="w-[800px] min-h-[150px] h-fit flex flex-col justify-between">
                {children}
            </div>
        </div>
    );
}

// Displays a navigation arrowhead
const ArrowHead = ({ left, disabled }: { left: boolean, disabled: boolean }) => {
    return (
        <i
            style={{ 
                borderColor: disabled ? "#D1D5DB" : "#2563EB", // Using valid CSS hex colors
                borderStyle: "solid",
                borderWidth: "0 3px 3px 0",
                display: "inline-block",
                padding: "3px",
                transform: `rotate(${left ? "135deg" : "-45deg"})`,
            }}
        />
    );
}

// Main dialog that appears when creating a space
const ConnectionDialog = ({ activeConnections, close }: { activeConnections: MantisConnection[], close: () => void }) => {
    const [state, setState] = useState<GenerationProgress>(GenerationProgress.GATHERING_DATA); // Progress of creation process
    const [errorText, setErrorText] = useState<string | null>(null);
    const [running, setRunning] = useState(false); // If the creation process is running
    const [spaceId, setSpaceId] = useState<string | null>(null);
    const [dataName, setDataName] = useState<string | null>(document.title); // Name of the space that will be created
    const [noteText, setNoteText] = useState<string | null>(null);
    const [save, setSave] = useState(false); // Whether the space has been saved
    const [connectionIdx, setConnectionIdx] = useState(0); // Index of the active connection, there can be multiple

    // When the connection is run
    const runConnection = async (connection: MantisConnection) => {
        setRunning(true);

        const setProgress = (progress: GenerationProgress) => {
            setState(progress);
        };

        try {
            const { spaceId: _spaceId, createdWidget } = await connection.createSpace(connection.injectUI, setProgress);

            sanitizeWidget(createdWidget, connection);
            setSpaceId(_spaceId);
        } catch (e: any) {
            setState(GenerationProgress.FAILED);
            setErrorText(`Message: ${e.message}. Stack Trace: ${e.stack}`);
        } finally {
            setRunning(false);
        }
    };

    const activeConnection = activeConnections[connectionIdx];

    const onSave = async () => {
        setSave(true);

        // Overwrite any existing spaces on the same URL
        // this is crucial so that we know exactly which
        // space to load when a user comes back to the page
        await deleteSpacesWhere((space) => space.url === window.location.href);

        await addSpaceToCache({
            name: dataName!,
            id: spaceId!,
            dateCreated: new Date().toLocaleString(),
            url: window.location.href,
            host: window.location.host,
            connectionParent: activeConnection.name,
        });
    };

    const connectionData = (
        <div className="space-y-4">
            <div className="flex items-center space-x-4">
                <img
                    src={activeConnection.icon}
                    alt="Connection icon"
                    className="h-8"
                />
                <div className="flex flex-col justify-center">
                    <p className="text-xl font-bold leading-tight">{activeConnection.name}</p>
                    <p className="text-gray-600">{activeConnection.description}</p>
                </div>
            </div>
        </div>
    );

    const progressPercent = Progression.indexOf(state) / (Progression.length - 1);

    // On opening
    useEffect(() => {
        // Make sure the user knows that they will be overwriting the existing space on the URL
        const checkForExistingSpace = async () => {
            const cachedSpaces = await getCachedSpaces();
            const space = cachedSpaces?.find((space) => space.url === window.location.href);

            if (space) {
                setNoteText(`A space already exists for this URL. Creating a new space will overwrite '${space.name}' (if saved)`);
            }
        };

        checkForExistingSpace();
    });

    if (state === GenerationProgress.COMPLETED) {
        return (
            <DialogHeader>
                <CloseButton close={close} />
                {connectionData}
                <div className="mt-4 flex flex-col items-center space-y-4">
                    <p className="text-green-600 font-semibold">
                        Space was created successfully and injected{" "}
                        <span className="text-blue-600">
                            <a
                                href={`https://mantisdev.csail.mit.edu/space/${spaceId}/`}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                (Direct)
                            </a>
                        </span>
                    </p>
                    <div className="flex space-x-2 w-full">
                        <button
                            className={`w-full text-white py-2 px-4 rounded transition-opacity ${
                                save
                                    ? "bg-gray-400 cursor-not-allowed"
                                    : "bg-gradient-to-r from-green-300 to-green-500 hover:opacity-90"
                            }`}
                            onClick={onSave}
                            disabled={save}
                        >
                            {save ? "Saved" : "Save"}
                        </button>
                        <button
                            className="w-full bg-gradient-to-r from-red-500 to-red-700 text-white py-2 px-4 rounded hover:opacity-90 transition-opacity"
                            onClick={close}
                        >
                            Close
                        </button>
                    </div>
                </div>
            </DialogHeader>
        );
    }

    if (state === GenerationProgress.FAILED) {
        return (
            <DialogHeader>
                <CloseButton close={close} />
                {connectionData}
                <div className="text-red-500">{errorText}</div>
                <button
                    className="w-full bg-gradient-to-r from-red-500 to-red-700 text-white py-2 px-4 rounded hover:opacity-90 transition-opacity"
                    onClick={close}
                >
                    Close
                </button>
            </DialogHeader>
        );
    }

    if (running) {
        return (
            <DialogHeader>
                {connectionData}
                <div className="flex flex-col items-center space-y-2">
                    <div className="w-full bg-gray-300 rounded-full h-4">
                        <div
                            className="bg-blue-500 h-4 rounded-full transition-all duration-500 animate-pulse"
                            style={{ width: `${progressPercent * 100}%` }}
                        />
                    </div>
                    <span className="text-sm font-medium text-blue-600">{state}</span>
                </div>
            </DialogHeader>
        );
    }

    return (
        <DialogHeader>
            <CloseButton close={close} />
            <div style={{ height: "20px" }} />
            {activeConnections.length > 1 && (
                <div className="bg-white flex items-center justify-between mb-4">
                    <button
                        onClick={() => setConnectionIdx(connectionIdx - 1)}
                        disabled={connectionIdx === 0}
                    >
                        <ArrowHead disabled={connectionIdx === 0} left />
                    </button>
                    <div className="flex-grow" />
                    <span className="text-gray-600">
                        {connectionIdx + 1}/{activeConnections.length}
                    </span>
                    <div className="flex-grow" />
                    <button
                        onClick={() => setConnectionIdx(connectionIdx + 1)}
                        disabled={connectionIdx === activeConnections.length - 1}
                    >
                        <ArrowHead disabled={connectionIdx === activeConnections.length - 1} left={false} />
                    </button>
                </div>
            )}
            {connectionData}
            <div className="h-2" />
            <hr />
            <div className="h-8" />
            <h2 className="text-lg font-semibold">Space Name</h2>
            <input
                type="text"
                value={dataName || ""}
                onChange={(e) => setDataName(e.target.value)}
                className="w-full p-2 bg-gray-100 rounded"
            />
            {noteText && (
                <>
                    <div className="h-2" />
                    <p className="text-gray-500">{noteText}</p>
                </>
            )}
            <button
                className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white py-2 px-4 rounded-lg 
                           hover:opacity-90 transition-opacity flex items-center justify-center space-x-2 mt-4"
                onClick={() => runConnection(activeConnection)}
            >
                <span>Create</span>
                <span className="animate-pulse">✨</span>
            </button>
        </DialogHeader>
    );
};

const PlasmoFloatingButton = () => {
    const [open, setOpen] = useState(false);
    const [activeConnections, setActiveConnections] = useState<MantisConnection[]>([]);

    useEffect(() => {
        // Search for which connections are active on the current URL
        setActiveConnections(searchConnections(window.location.href));
    }, []);

    useEffect(() => {
        const searchForExistingSpace = async () => {
            // Search all existing spaces for one that already exists on the same URL
            const cachedSpaces = await getCachedSpaces();
            const space = cachedSpaces?.find((space) => space.url === window.location.href);

            // Only proceed if there is a space and there are active connections to display
            if (!space || activeConnections.length === 0) {
                return;
            }

            for (const connection of activeConnections) {
                // Only inject the UI if the connection IS what created the space initially
                if (connection.name !== space.connectionParent) {
                    continue;
                }

                const createdWidget = await connection.injectUI(space.id);

                sanitizeWidget(createdWidget, connection);
            }
        };

        searchForExistingSpace();
    }, [window.location.href, activeConnections]);

    // Don't display a button if there are no active connections on the page
    if (activeConnections.length == 0) {
        return null;
    }

    return (
        <>
            <button
                className="fixed bottom-[30px] right-[30px] w-20 h-20 rounded-full bg-white text-white shadow-[0_0_20px_rgba(0,0,0,0.15)] cursor-pointer flex items-center justify-center transition duration-300 ease-in-out hover:shadow-[0_0_20px_rgba(0,0,0,0.3)] hover:scale-105"
                onClick={() => setOpen(true)}
            >
                <img className="h-[80%]" src={faviconIco} />
            </button>
            {open && (
                <ConnectionDialog activeConnections={activeConnections} close={() => setOpen(false)} />
            )}
        </>
    )
}

export default PlasmoFloatingButton;