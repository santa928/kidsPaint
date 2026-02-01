import React, { useState } from 'react';
import './ColorPicker.css';

interface ColorPickerProps {
    selectedColor: string;
    onSelectColor: (color: string) => void;
    isRainbow: boolean;
    onSelectRainbow: () => void;
    backgroundColor: string;
    onSelectBackground: (color: string) => void;
    soundEnabled: boolean;
    onToggleSound: () => void;
}

const COLORS = [
    { name: '黒', value: '#000000' },
    { name: '赤', value: '#FF0000' },
    { name: '青', value: '#0000FF' },
    { name: '緑', value: '#008000' },
    { name: '黄', value: '#FFFF00' },
    { name: '橙', value: '#FFA500' },
    { name: '紫', value: '#800080' },
    { name: '白', value: '#FFFFFF' }, // Eraser might be separate, but white is useful
];

const BACKGROUND_COLORS = [
    { name: '白', value: '#FFFFFF' },
    { name: 'クリーム', value: '#FFF7D6' },
    { name: 'そら', value: '#E6F7FF' },
    { name: 'みどり', value: '#E8F5E9' },
    { name: 'もも', value: '#FCE4EC' },
    { name: 'むらさき', value: '#F3E5F5' },
    { name: 'ももいろ', value: '#FBE9E7' },
    { name: 'はいいろ', value: '#ECEFF1' },
];

export const ColorPicker: React.FC<ColorPickerProps> = ({
    selectedColor,
    onSelectColor,
    isRainbow,
    onSelectRainbow,
    backgroundColor,
    onSelectBackground,
    soundEnabled,
    onToggleSound,
}) => {
    const [isBgOpen, setIsBgOpen] = useState(false);

    return (
        <div className="color-picker-container">
            <div className="color-groups">
                <div className="color-row">
                    <div className="colors-scroll">
                        {COLORS.map((c) => (
                            <button
                                key={c.value}
                                className={`color-chip ${!isRainbow && selectedColor === c.value ? 'selected' : ''}`}
                                style={{ backgroundColor: c.value }}
                                onClick={() => onSelectColor(c.value)}
                                aria-label={c.name}
                            />
                        ))}
                        <button
                            className={`color-chip rainbow ${isRainbow ? 'selected' : ''}`}
                            onClick={onSelectRainbow}
                            aria-label="レインボー"
                        >
                            🌈
                        </button>
                    </div>

                    <button
                        type="button"
                        className={`bg-toggle-btn ${isBgOpen ? 'active' : ''}`}
                        onClick={() => setIsBgOpen((prev) => !prev)}
                        aria-expanded={isBgOpen}
                        aria-controls="bg-color-popover"
                    >
                        背景
                    </button>
                </div>

                {isBgOpen && (
                    <div className="bg-popover" id="bg-color-popover">
                        <div className="bg-colors-scroll">
                            {BACKGROUND_COLORS.map((c) => (
                                <button
                                    key={c.value}
                                    className={`bg-color-chip ${backgroundColor === c.value ? 'selected' : ''}`}
                                    style={{ backgroundColor: c.value }}
                                    onClick={() => {
                                        onSelectBackground(c.value);
                                        setIsBgOpen(false);
                                    }}
                                    aria-label={`背景 ${c.name}`}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="sound-control">
                <button className={`sound-btn ${soundEnabled ? 'active' : ''}`} onClick={onToggleSound}>
                    {soundEnabled ? '🔊' : '🔇'}
                </button>
            </div>
        </div>
    );
};
