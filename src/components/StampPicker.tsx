import React from 'react';
import './StampPicker.css';
import type { StampId } from '../types';

export interface StampItem {
    id: StampId;
    label: string;
    icon: string;
}

interface StampPickerProps {
    stamps: StampItem[];
    selectedStamp: StampId;
    isStampMode: boolean;
    onSelectStamp: (id: StampId) => void;
    onSelectDrawMode: () => void;
}

export const StampPicker: React.FC<StampPickerProps> = ({
    stamps,
    selectedStamp,
    isStampMode,
    onSelectStamp,
    onSelectDrawMode,
}) => {
    return (
        <div className="stamp-picker-container">
            <div className="stamp-header">
                <span className="stamp-title">スタンプ</span>
                <button
                    className={`stamp-chip draw-mode ${!isStampMode ? 'selected' : ''}`}
                    onClick={onSelectDrawMode}
                    aria-label="おえかきモード"
                >
                    ✏️
                </button>
            </div>
            <div className="stamps-scroll">
                {stamps.map((stamp) => (
                    <button
                        key={stamp.id}
                        className={`stamp-chip ${isStampMode && selectedStamp === stamp.id ? 'selected' : ''}`}
                        onClick={() => onSelectStamp(stamp.id)}
                        aria-label={stamp.label}
                    >
                        <span className="stamp-icon">{stamp.icon}</span>
                        <span className="stamp-label">{stamp.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};
