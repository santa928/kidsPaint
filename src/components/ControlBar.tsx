import React, { useState, useRef } from 'react';
import './ControlBar.css';

interface ControlBarProps {
    brushSize: number;
    setBrushSize: (size: number) => void;
    isEraser: boolean;
    toggleEraser: () => void;
    onUndo: () => void;
    canUndo: boolean;
    onClearAll: () => void;
}

const BRUSH_SIZES = [
    { label: 'ほそい', value: 4 },
    { label: 'ふつう', value: 8 },
    { label: 'ふとい', value: 14 },
];

export const ControlBar: React.FC<ControlBarProps> = ({
    brushSize,
    setBrushSize,
    isEraser,
    toggleEraser,
    onUndo,
    canUndo,
    onClearAll,
}) => {
    // Long press logic for "Clear All"
    const [pressProgress, setPressProgress] = useState(0);
    const startTimeRef = useRef<number>(0);
    const animationFrameRef = useRef<number | null>(null);
    const isPressingRef = useRef(false);

    const LONG_PRESS_DURATION = 600; // ms

    const startPress = () => {
        if (isPressingRef.current) return;
        isPressingRef.current = true;
        startTimeRef.current = 0;
        setPressProgress(0);

        const updateProgress = (timestamp: number) => {
            if (startTimeRef.current === 0) {
                startTimeRef.current = timestamp;
            }
            const elapsed = timestamp - startTimeRef.current;
            const progress = Math.min((elapsed / LONG_PRESS_DURATION) * 100, 100);
            setPressProgress(progress);

            if (elapsed >= LONG_PRESS_DURATION) {
                onClearAll();
                resetPress();
            } else {
                animationFrameRef.current = requestAnimationFrame(updateProgress);
            }
        };

        animationFrameRef.current = requestAnimationFrame(updateProgress);
    };

    const resetPress = () => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        isPressingRef.current = false;
        startTimeRef.current = 0;
        setPressProgress(0);
    };

    return (
        <div className="control-bar-container">
            <div className="brush-sizes">
                {BRUSH_SIZES.map((size) => (
                    <button
                        key={size.value}
                        className={`size-btn ${brushSize === size.value && !isEraser ? 'active' : ''}`}
                        onClick={() => {
                            if (isEraser) toggleEraser();
                            setBrushSize(size.value);
                        }}
                    >
                        <div className="dot" style={{ width: size.value, height: size.value }} />
                        <span>{size.label}</span>
                    </button>
                ))}
            </div>

            <div className="tools">
                <button
                    className={`tool-btn ${isEraser ? 'active' : ''}`}
                    onClick={toggleEraser}
                >
                    けしゴム
                </button>

                <button
                    className="tool-btn"
                    onClick={onUndo}
                    disabled={!canUndo}
                >
                    もどす
                </button>

                <button
                    className="tool-btn clear-btn"
                    onPointerDown={startPress}
                    onPointerUp={resetPress}
                    onPointerCancel={resetPress}
                    onPointerLeave={resetPress}
                >
                    <div className="progress-bg" style={{ width: `${pressProgress}%` }} />
                    <span className="btn-text">ぜんぶけす</span>
                </button>
            </div>
        </div>
    );
};
