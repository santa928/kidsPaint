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
    isOpen: boolean;
    onSelectStamp: (id: StampId) => void;
    onSelectDrawMode: () => void;
    onToggleOpen: () => void;
}

export const StampPicker: React.FC<StampPickerProps> = ({
    stamps,
    selectedStamp,
    isStampMode,
    isOpen,
    onSelectStamp,
    onSelectDrawMode,
    onToggleOpen,
}) => {
    return (
        <div className="stamp-picker-container">
            <div className="stamp-row">
                <button
                    type="button"
                    className={`stamp-toggle-btn ${isOpen ? 'active' : ''}`}
                    onClick={onToggleOpen}
                    aria-expanded={isOpen}
                    aria-controls="stamp-popover"
                >
                    スタンプ
                </button>
                <button
                    type="button"
                    className={`stamp-draw-btn ${!isStampMode ? 'active' : ''}`}
                    onClick={onSelectDrawMode}
                    aria-label="おえかきモード"
                >
                    ✏️
                </button>
            </div>
            {isOpen && (
                <div className="stamp-popover" id="stamp-popover">
                    <div className="stamp-items-scroll">
                        {stamps.map((stamp) => (
                            <button
                                key={stamp.id}
                                type="button"
                                className={`stamp-item-chip ${isStampMode && selectedStamp === stamp.id ? 'selected' : ''}`}
                                onClick={() => onSelectStamp(stamp.id)}
                                aria-label={stamp.label}
                            >
                                <span className="stamp-icon">{stamp.icon}</span>
                                <span className="stamp-label">{stamp.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
