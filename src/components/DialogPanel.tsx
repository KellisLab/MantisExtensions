import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import faviconIco from "data-base64:../../assets/icon.png";

// Close button component
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

// Arrow head component for resize handles
const ArrowHead = ({ direction }: { direction: 'top' | 'right' | 'bottom' | 'left' }) => {
    const getArrowStyle = () => {
        switch (direction) {
            case 'top':
                return { transform: 'rotate(0deg)' };
            case 'right':
                return { transform: 'rotate(90deg)' };
            case 'bottom':
                return { transform: 'rotate(180deg)' };
            case 'left':
                return { transform: 'rotate(270deg)' };
        }
    };

    return (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-2 h-2 border-t-2 border-l-2 border-gray-400" style={getArrowStyle()} />
        </div>
    );
};

// Dialog panel component with drag and resize functionality
export const DialogPanel = ({ 
    children, 
    overlay, 
    close 
}: { 
    children: React.ReactNode, 
    overlay?: React.ReactNode, 
    close?: () => void 
}) => {
    const [panelSize, setPanelSize] = useState<{ width: number; height: number }>({ width: 550, height: 330 });
    const resizingRef = useRef<{
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

    const [pos, setPos] = useState<{ top: number; left: number }>(() => {
        const minMargin = 4;
        const bottom = 130;
        const right = 80;
        const top = Math.max(minMargin, window.innerHeight - bottom - 365);
        const left = Math.max(minMargin, window.innerWidth - right - 550);
        return { top, left };
    });
    
    const draggingRef = useRef<{ startX: number; startY: number; startTop: number; startLeft: number } | null>(null);

    const onMouseMove = useCallback((e: MouseEvent) => {
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

        // Apply constraints
        newW = Math.max(minW, Math.min(maxW, newW));
        newH = Math.max(minH, Math.min(maxH, newH));
        newLeft = Math.max(0, Math.min(window.innerWidth - newW, newLeft));
        newTop = Math.max(0, Math.min(window.innerHeight - newH, newTop));

        setPanelSize({ width: newW, height: newH });
        if (newLeft !== pos.left || newTop !== pos.top) {
            setPos({ left: newLeft, top: newTop });
        }
    }, [panelSize.width, panelSize.height, pos.left, pos.top]);

    const onMouseMoveDrag = useCallback((e: MouseEvent) => {
        if (!draggingRef.current) return;
        const dx = e.clientX - draggingRef.current.startX;
        const dy = e.clientY - draggingRef.current.startY;

        const newLeft = draggingRef.current.startLeft + dx;
        const newTop = draggingRef.current.startTop + dy;

        const minMargin = 4;
        const maxLeft = window.innerWidth - panelSize.width - minMargin;
        const maxTop = window.innerHeight - panelSize.height - minMargin;

        setPos({
            left: Math.max(minMargin, Math.min(maxLeft, newLeft)),
            top: Math.max(minMargin, Math.min(maxTop, newTop))
        });
    }, [panelSize.width, panelSize.height]);

    const endResize = useCallback(() => {
        resizingRef.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        // Remove event listeners
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', endResize);
    }, [onMouseMove]);

    const endDrag = useCallback(() => {
        draggingRef.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        // Remove event listeners
        document.removeEventListener('mousemove', onMouseMoveDrag);
        document.removeEventListener('mouseup', endDrag);
    }, [onMouseMoveDrag]);

    const startResize = useCallback((e: React.MouseEvent, edge: 'top'|'right'|'bottom'|'left') => {
        e.preventDefault();
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
        document.body.style.cursor = edge === 'left' || edge === 'right' ? 'ew-resize' : 'ns-resize';
        document.body.style.userSelect = 'none';
        
        // Add event listeners
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', endResize);
    }, [panelSize.width, panelSize.height, pos.left, pos.top, onMouseMove, endResize]);

    const startDrag = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        draggingRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startTop: pos.top,
            startLeft: pos.left
        };
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
        
        // Add event listeners
        document.addEventListener('mousemove', onMouseMoveDrag);
        document.addEventListener('mouseup', endDrag);
    }, [pos.top, pos.left, onMouseMoveDrag, endDrag]);

    useEffect(() => {
        const handleResize = () => {
            const minMargin = 4;
            const bottom = 130;
            const right = 80;
            const newTop = Math.max(minMargin, window.innerHeight - bottom - 365);
            const newLeft = Math.max(minMargin, window.innerWidth - right - 550);
            
            if (newLeft !== pos.left || newTop !== pos.top) {
                setPos({ left: newLeft, top: newTop });
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [panelSize.width, panelSize.height, pos.left, pos.top]);

    useEffect(() => () => endDrag(), [endDrag]);

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
                className="min-h-[200px] max-h-[70vh] overflow-y-auto -mr-6 pr-6"
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
                            alt="Mantis" 
                            className="w-10 h-10"
                        />
                    </motion.div>
                    <motion.h2 
                        className="text-3xl font-bold bg-black bg-clip-text text-transparent"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        Mantis
                    </motion.h2>
                </div>
                <div className="relative">
                    {children}
                </div>
            </div>
            
            {/* Resize handles */}
            <div
                onMouseDown={(e) => startResize(e, 'top')}
                className="absolute top-0 left-0 right-0 h-2 cursor-n-resize group"
                style={{ transform: 'translateY(-1px)' }}
                title="Resize"
            >
                <ArrowHead direction="top" />
            </div>
            <div
                onMouseDown={(e) => startResize(e, 'bottom')}
                className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize group"
                style={{ transform: 'translateY(1px)' }}
                title="Resize"
            >
                <ArrowHead direction="bottom" />
            </div>
            <div
                onMouseDown={(e) => startResize(e, 'left')}
                className="absolute left-0 top-0 bottom-0 w-2 cursor-w-resize group"
                style={{ transform: 'translateX(-1px)' }}
                title="Resize"
            >
                <ArrowHead direction="left" />
            </div>
            <div
                onMouseDown={(e) => startResize(e, 'right')}
                className="absolute right-0 top-0 bottom-0 w-2 cursor-e-resize group"
                style={{ transform: 'translateX(1px)' }}
                title="Resize"
            >
                <ArrowHead direction="right" />
            </div>
            
            {overlay && (
                <div className="absolute inset-0 z-10 pointer-events-none">
                    {overlay}
                </div>
            )}
        </motion.div>
    );
};
