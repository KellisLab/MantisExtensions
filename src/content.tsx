import cssText from "data-text:~style.css";
import type { PlasmoCSConfig } from "plasmo";
import React, { useEffect, useRef, useState } from "react";

import faviconIco from "data-base64:../assets/icon.png";
import { searchConnections } from "./connection_manager";
import type { LogMessage, MantisConnection } from "./connections/types";
import { GenerationProgress, Progression } from "./connections/types";
import { addSpaceToCache, deleteSpacesWhere, getCachedSpaces } from "./persistent";
import { refetchAuthCookies } from "./driver";
import { motion, AnimatePresence} from "framer-motion";

export const config: PlasmoCSConfig = {
    matches: ["<all_urls>"],
    all_frames: true,
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
    return (
        <motion.button
            onClick={close}
            className="absolute top-4 right-4 z-20 text-gray-400 hover:text-gray-700 text-2xl font-bold transition-colors duration-200"
            whileHover={{ scale: 1.2, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
        >
            &times;
        </motion.button>
    );
};

// Dialog util
const DialogHeader = ({ children, overlay, close }: { children: React.ReactNode, overlay?: React.ReactNode, close?: () => void }) => {
    const [panelSize, setPanelSize] = React.useState<{ width: number; height: number }>({ width: 550, height: 330 });
    const resizingRef = React.useRef<{
        startX: number;
        startY: number;
        startW: number;
        startH: number;
        startLeft: number;
        startTop: number;
        viewportW: number;
        viewportH: number;
        edge: 'top'|'right'|'bottom'|'left';
    } | null>(null);

    const [pos, setPos] = React.useState<{ top: number; left: number }>(() => {
        const minMargin = 4;
        const bottom = 130;
        const right = 80;
        const top = Math.max(minMargin, window.innerHeight - bottom - 365);
        const left = Math.max(minMargin, window.innerWidth - right - 550);
        return { top, left };
    });
    const draggingRef = React.useRef<{ startX: number; startY: number; startTop: number; startLeft: number } | null>(null);

    const onMouseMove = React.useCallback((e: MouseEvent) => {
        if (!resizingRef.current) return;
        const dx = e.clientX - resizingRef.current.startX;
        const dy = e.clientY - resizingRef.current.startY;

        const minW = 320;
        const minH = 200;
        const maxW = Math.min(window.innerWidth * 0.92, 900);
        const maxH = Math.min(window.innerHeight * 0.7, 800);

        let newW = resizingRef.current.startW;
        let newH = resizingRef.current.startH;
        let newLeft = pos.left;
        let newTop = pos.top;
        switch (resizingRef.current.edge) {
            case 'right':
                newW = resizingRef.current.startW + dx;
                break;
            case 'left':
                newW = resizingRef.current.startW - dx;
                newLeft = resizingRef.current.startLeft + dx;
                break;
            case 'bottom':
                newH = resizingRef.current.startH + dy;
                break;
            case 'top':
                newH = resizingRef.current.startH - dy;
                newTop = resizingRef.current.startTop + dy;
                break;
        }
        newW = Math.max(minW, Math.min(maxW, newW));
        newH = Math.max(minH, Math.min(maxH, newH));
        const minMargin = 4;
        const maxLeft = Math.max(minMargin, resizingRef.current.viewportW - newW - minMargin);
        const maxTop = Math.max(minMargin, resizingRef.current.viewportH - newH - minMargin);
        newLeft = Math.max(minMargin, Math.min(maxLeft, newLeft));
        newTop = Math.max(minMargin, Math.min(maxTop, newTop));

        setPanelSize({ width: newW, height: newH });
        if (resizingRef.current.edge === 'left' || resizingRef.current.edge === 'top') {
            setPos({ left: newLeft, top: newTop });
        }
    }, []);

    const endResize = React.useCallback(() => {
        if (!resizingRef.current) return;
        resizingRef.current = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', endResize);
        document.body.style.cursor = '';
        (document.body.style as any).userSelect = '';
    }, [onMouseMove]);

    const startResize = React.useCallback((e: React.MouseEvent, edge: 'top'|'right'|'bottom'|'left') => {
        resizingRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startW: panelSize.width,
            startH: panelSize.height,
            startLeft: pos.left,
            startTop: pos.top,
            viewportW: window.innerWidth,
            viewportH: window.innerHeight,
            edge
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', endResize);
        const cursor = edge === 'left' || edge === 'right' ? 'ew-resize' : 'ns-resize';
        document.body.style.cursor = cursor;
        (document.body.style as any).userSelect = 'none';
        e.preventDefault();
        e.stopPropagation();
    }, [panelSize.width, panelSize.height, pos.left, pos.top, onMouseMove, endResize]);

    React.useEffect(() => () => endResize(), [endResize]);

    const onDragMove = React.useCallback((e: MouseEvent) => {
        if (!draggingRef.current) return;
        const dx = e.clientX - draggingRef.current.startX;
        const dy = e.clientY - draggingRef.current.startY;
        let newLeft = draggingRef.current.startLeft + dx;
        let newTop = draggingRef.current.startTop + dy;

        const minMargin = 4;
        const maxLeft = Math.max(minMargin, window.innerWidth - panelSize.width - minMargin);
        const maxTop = Math.max(minMargin, window.innerHeight - panelSize.height - minMargin);
        newLeft = Math.max(minMargin, Math.min(maxLeft, newLeft));
        newTop = Math.max(minMargin, Math.min(maxTop, newTop));

        setPos({ left: newLeft, top: newTop });
    }, [panelSize.width, panelSize.height]);

    const endDrag = React.useCallback(() => {
        if (!draggingRef.current) return;
        draggingRef.current = null;
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', endDrag);
        document.body.style.cursor = '';
        (document.body.style as any).userSelect = '';
    }, [onDragMove]);

    const startDrag: React.MouseEventHandler<HTMLDivElement> = React.useCallback((e) => {
        if (resizingRef.current) return;
        draggingRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startTop: pos.top,
            startLeft: pos.left
        };
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', endDrag);
        document.body.style.cursor = 'grabbing';
        (document.body.style as any).userSelect = 'none';
        e.preventDefault();
        e.stopPropagation();
    }, [pos.top, pos.left, onDragMove, endDrag]);

    React.useEffect(() => () => endDrag(), [endDrag]);

    return (
        <motion.div 
            className="fixed bg-white/95 backdrop-blur-md p-6 rounded-2xl shadow-xl ring-1 ring-gray-200 relative z-[9999]"
            style={{ position: 'fixed', top: `${pos.top}px`, left: `${pos.left}px`, bottom: 'auto', right: 'auto' }}
            initial={{ opacity: 0, scale: 0.98, y: 16, x: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ 
                type: "spring",
                damping: 20,
                stiffness: 300
            }}
        >
            {close && <CloseButton close={close} />}
            <div
                className="min-h-[200px] max-h-[70vh] overflow-y-auto"
                style={{ width: `${panelSize.width}px`, height: `${panelSize.height}px`, maxWidth: '92vw' }}
            >
                <div className="flex items-center justify-center mb-6 cursor-grab select-none"
                     onMouseDown={startDrag}
                     title="Drag">
                    <motion.div
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{
                            type: "spring",
                            stiffness: 260,
                            damping: 20,
                            delay: 0.1
                        }}
                        className="mr-3"
                    >
                        <img 
                            src={faviconIco} 
                            alt="MantisAI" 
                            className="w-10 h-10"
                        />
                    </motion.div>
                    <motion.h2 
                        className="text-3xl font-bold bg-black bg-clip-text text-transparent"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        MantisAI
                    </motion.h2>
                </div>
                <div className="relative">
                    {children}
                </div>
            </div>
            <div
                onMouseDown={(e) => startResize(e, 'top')}
                className="absolute top-0 left-0 right-0 h-2 cursor-n-resize"
                style={{ transform: 'translateY(-1px)' }}
                title="Resize"
            />
            <div
                onMouseDown={(e) => startResize(e, 'bottom')}
                className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize"
                style={{ transform: 'translateY(1px)' }}
                title="Resize"
            />
            <div
                onMouseDown={(e) => startResize(e, 'left')}
                className="absolute left-0 top-0 bottom-0 w-2 cursor-w-resize"
                style={{ transform: 'translateX(-1px)' }}
                title="Resize"
            />
            <div
                onMouseDown={(e) => startResize(e, 'right')}
                className="absolute right-0 top-0 bottom-0 w-2 cursor-e-resize"
                style={{ transform: 'translateX(1px)' }}
                title="Resize"
            />
            {overlay && (
                <div className="absolute inset-0 z-10 pointer-events-none">
                    {overlay}
                </div>
            )}
        </motion.div>
    );
};

// Displays a navigation arrowhead
const ArrowHead = ({ left, disabled }: { left: boolean, disabled: boolean }) => {
    return (
        <motion.i
            style={{
                borderColor: disabled ? "#D1D5DB" : "#6366F1",
                borderStyle: "solid",
                borderWidth: "0 3px 3px 0",
                display: "inline-block",
                padding: "3px",
                transform: `rotate(${left ? "135deg" : "-45deg"})`,
            }}
            whileHover={!disabled ? { x: left ? -3 : 3 } : {}}
            transition={{ type: "spring", stiffness: 500 }}
        />
    );
}

// Main dialog that appears when creating a space
const ConnectionDialog = ({ activeConnections, close }: { activeConnections: MantisConnection[], close: () => void }) => {
    const [showInitialText, setShowInitialText] = useState(true);
    const [state, setState] = useState<GenerationProgress>(GenerationProgress.GATHERING_DATA); // Progress of creation process
    const [errorText, setErrorText] = useState<string | null>(null);
    const [running, setRunning] = useState(false); // If the creation process is running
    const [spaceId, setSpaceId] = useState<string | null>(null);
    const [dataName, setDataName] = useState<string | null>(document.title); // Name of the space that will be created
    const [noteText, setNoteText] = useState<string | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(true);
    const [authErrorText, setAuthErrorText] = useState<string | null>(null);
    const [save, setSave] = useState(false); // Whether the space has been saved
    const [connectionIdx, setConnectionIdx] = useState(0); // Index of the active connection, there can be multiple
    const [WSStatus, setWSStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
    const [logMessages, setLogMessages] = useState<LogMessage[]>([]);

    const logContainerRef = useRef<HTMLDivElement>(null);
    const [showOverlay, setShowOverlay] = useState(true);

    const overlayElement = (
        <AnimatePresence>
            {showOverlay && (
                <motion.div
                    className="absolute inset-0 rounded-2xl bg-white flex items-center justify-center"
                    initial={{ opacity: 1 }}
                    animate={{ opacity: [1, 1, 0] }}
                    transition={{ duration: 2, times: [0, 0.85, 1], ease: "easeInOut" }}
                    onAnimationComplete={() => setShowOverlay(false)}
                >
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="flex flex-col items-center"
                    >
                        <motion.img
                            src={faviconIco}
                            alt="MantisAI"
                            className="w-16 h-16 mb-3"
                            initial={{ rotate: -180 }}
                            animate={{ rotate: 0 }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                        />
                        <motion.h2
                            className="text-3xl font-extrabold text-black tracking-wide"
                            initial={{ y: 10, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ duration: 0.6, delay: 0.2 }}
                        >
                            MantisAI
                        </motion.h2>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
    
    // Check if the log scroll is at the bottom
    const isScrolledToBottom = () => {
        const container = logContainerRef.current;
        if (!container) return false;
        
        const threshold = 10;
        return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
    };
    
    // Scroll to bottom effect when new messages arrive
    useEffect(() => {
        if (logMessages.length > 0 && logContainerRef.current) {
            if (isScrolledToBottom()) {
                const container = logContainerRef.current;
                container.scrollTop = container.scrollHeight;
            }
        }
    }, [logMessages]);

    const establishLogSocket = (space_id: string) => {
        const backendApiUrl = new URL(process.env.PLASMO_PUBLIC_MANTIS_API);
        const isLocalhost = backendApiUrl.hostname.includes('localhost') || backendApiUrl.hostname.includes('127.0.0.1');
        const baseWsUrl = isLocalhost
            ? process.env.PLASMO_PUBLIC_MANTIS_API.replace('http://', 'ws://').replace('https://', 'ws://')
            : process.env.PLASMO_PUBLIC_MANTIS_API.replace('https://', 'wss://');

        const socketUrl = `${baseWsUrl}/ws/synthesis_progress/${space_id}/`;
        let reconnectTimer: NodeJS.Timeout;

        const connectWebSocket = () => {
            setWSStatus('connecting');
            const ws = new WebSocket(socketUrl);

            ws.onopen = () => {
                setWSStatus('connected');
                setLogMessages(prev => [...prev, {
                    type: 'log',
                    message: 'Connected to log stream',
                    level: 'INFO',
                    timestamp: new Date().toISOString(),
                }]);
            };

            ws.onmessage = (event: MessageEvent) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'log' || data.log) {
                        const logMsg: LogMessage = {
                            type: data.type || 'log',
                            message: data.message || data.log,
                            level: data.level || 'INFO',
                            timestamp: data.timestamp || new Date().toISOString(),
                            logger: data.logger,
                        };
                        setLogMessages(prev => [...prev, logMsg]);
                    }
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            ws.onerror = (error) => {
                setWSStatus('disconnected');
                setLogMessages(prev => [...prev, {
                    type: 'log',
                    message: 'WebSocket error occurred',
                    level: 'ERROR',
                    timestamp: new Date().toISOString(),
                }]);
            };

            ws.onclose = (event) => {
                setWSStatus('disconnected');
                setLogMessages(prev => [...prev, {
                    type: 'log',
                    message: `Connection closed: ${event.reason || 'Unknown reason'} (code: ${event.code})`,
                    level: 'WARNING',
                    timestamp: new Date().toISOString(),
                }]);

                // Attempt to reconnect after 5 seconds
                reconnectTimer = setTimeout(connectWebSocket, 5000);
            };

            return ws;
        };

        connectWebSocket();
    }

    // When the connection is run
    const runConnection = async (connection: MantisConnection) => {
        setRunning(true);

        const setProgress = (progress: GenerationProgress) => {
            setState(progress);
        };

        try {
            const { spaceId: _spaceId, createdWidget } = await connection.createSpace(connection.injectUI,
                setProgress,
                connection.onMessage || ((_, __) => { }),
                connection.registerListeners || ((_) => { }),
                establishLogSocket);

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

    useEffect(() => {
        const timer = setTimeout(() => {
            setShowInitialText(false);
        }, 1000);
        return () => clearTimeout(timer);
    }, []);

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

        const checkForAuth = async () => {    
            // Try to get the auth cookies
            // if they don't exist
            // then notify the user
            try {
                await refetchAuthCookies ();
            } catch (e) {
                setAuthErrorText(e.message);
                setIsAuthenticated(false);
            }
        }

        checkForExistingSpace();
        checkForAuth();
    });

    if (state === GenerationProgress.COMPLETED) {
        return (
            <DialogHeader overlay={overlayElement} close={close}>
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
                            className={`w-full text-white py-2 px-4 rounded transition-opacity ${save
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
            <DialogHeader overlay={overlayElement} close={close}>
                    {connectionData}
                    <div className="text-red-500">{errorText}</div>
                    <button
                        className="w-full bg-gradient-to-r from-red-500 to-red-700 text-white py-2 px-4 rounded-lg hover:opacity-90 transition-opacity"
                        onClick={close}
                    >
                        Close
                    </button>
            </DialogHeader>
        );
    }

    if (running) {
        return (
            <AnimatePresence mode="wait">
                {showInitialText ? (
                    <motion.div
                        key="initial-text"
                        className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[9999]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <motion.h1 
                            className="text-5xl font-bold text-center bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ 
                                type: "spring",
                                damping: 10,
                                stiffness: 100,
                                delay: 0.1
                            }}
                        >
                            MantisAI
                        </motion.h1>
                    </motion.div>
                ) : (
                    <DialogHeader key="dialog" overlay={overlayElement} close={close}>
                        {connectionData}
                        
                        {state !== GenerationProgress.CREATING_SPACE ? (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-2xl font-bold">Create New Space</h2>
                                    <div className="flex space-x-2">
                                        <button
                                            onClick={() => setConnectionIdx(prev => Math.max(0, prev - 1))}
                                            disabled={connectionIdx === 0}
                                            className={`p-2 rounded-full ${connectionIdx === 0 ? 'text-gray-300' : 'text-blue-500 hover:bg-blue-50'}`}
                                        >
                                            <ArrowHead left={true} disabled={connectionIdx === 0} />
                                        </button>
                                        <button
                                            onClick={() => setConnectionIdx(prev => Math.min(activeConnections.length - 1, prev + 1))}
                                            disabled={connectionIdx === activeConnections.length - 1}
                                            className={`p-2 rounded-full ${connectionIdx === activeConnections.length - 1 ? 'text-gray-300' : 'text-blue-500 hover:bg-blue-50'}`}
                                        >
                                            <ArrowHead left={false} disabled={connectionIdx === activeConnections.length - 1} />
                                        </button>
                                    </div>
                                </div>
                                
                                <div className="space-y-4">
                                    <div className="flex items-center space-x-4">
                                        <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-blue-100 rounded-xl">
                                            <img src={activeConnections[connectionIdx].icon} alt={activeConnections[connectionIdx].name} className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg">{activeConnections[connectionIdx].name}</h3>
                                            <p className="text-sm text-gray-500">{activeConnections[connectionIdx].description}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="pt-4">
                                        <button
                                            onClick={() => runConnection(activeConnections[connectionIdx])}
                                            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center space-x-2"
                                        >
                                            <span>Create Space</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-2xl font-bold">Creating Space</h2>
                                        <div className="text-sm text-gray-500">
                                            {Progression.indexOf(state) + 1} of {Progression.length} steps
                                        </div>
                                    </div>
                        <div className="max-h-48 overflow-y-auto p-3 bg-gray-50 font-mono text-sm" ref={logContainerRef}>
                            {logMessages.length === 0 ? (
                                <div className="text-center text-gray-400 py-2">No log messages yet</div>
                            ) : (
                                logMessages.map((log, i) => (
                                    <div
                                        key={i}
                                        className={`mb-1 pl-2 border-l-2 ${log.level === 'ERROR' ? 'border-red-500 text-red-800' :
                                                log.level === 'WARNING' ? 'border-yellow-500 text-yellow-800' :
                                                    'border-blue-500 text-gray-800'
                                            }`}
                                    >
                                        <div className="flex items-start">
                                            <span className="text-xs text-gray-500 mr-2">
                                                {new Date(log.timestamp || '').toLocaleTimeString()}
                                            </span>
                                            <span>{log.message}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                                </div>
                            </div>
                </div>)}
                    </DialogHeader>
                )}
            </AnimatePresence>
        );
    }

    return (
        <DialogHeader overlay={overlayElement} close={close}>
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
                    <p className="text-red-500">{noteText}</p>
                </>
            )}
            {authErrorText && (
                <>
                    <div className="h-2" />
                    <p className="text-red-500">{authErrorText} (Try logging in)</p>
                </>
            )}
            <button
                className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white py-2 px-4 rounded-lg 
                           hover:opacity-90 transition-opacity flex items-center justify-center space-x-2 mt-4"
                onClick={() => runConnection(activeConnection)}
                disabled={!isAuthenticated}
            >
                <span>Create Space</span>
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

        // NOTE: This window code is only used when on a mantis page that was
        // injected by a connection. Its purpose is because the mantis page
        // doesn't have access to chrome APIs, so it just uses a builtin
        // postMessage, and then we intercept that and forward it using
        // the chrome API
        window.addEventListener("message", async (event) => {
            if (event.source !== window) return;

            const message = event.data;

            // Check that the message is intended for the extension
            // and forward the message to background.ts
            if (message.action === "mantis_msg") {
                await chrome.runtime.sendMessage(message);
            }
        });
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

                const createdWidget = await connection.injectUI(space.id, connection.onMessage || ((_, __) => { }), connection.registerListeners || ((_) => { }));

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
                className="fixed bottom-[30px] right-[30px] w-20 h-20 rounded-full bg-white text-white shadow-[0_0_20px_rgba(0,0,0,0.15)] cursor-pointer flex items-center justify-center transition duration-300 ease-in-out hover:shadow-[0_0_20px_rgba(0,0,0,0.3)] hover:scale-105 z-[10000]"
                onClick={() => setOpen(true)}
            >
                <img className="h-[80%]" src={faviconIco} alt="MantisAI" />
            </button>
            {open && (
                <ConnectionDialog activeConnections={activeConnections} close={() => setOpen(false)} />
            )}
        </>
    )
}

export default PlasmoFloatingButton;