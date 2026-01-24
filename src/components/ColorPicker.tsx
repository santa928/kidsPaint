import React from 'react';
import './ColorPicker.css';

interface ColorPickerProps {
    selectedColor: string;
    onSelectColor: (color: string) => void;
    isRainbow: boolean;
    onSelectRainbow: () => void;
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

export const ColorPicker: React.FC<ColorPickerProps> = ({
    selectedColor,
    onSelectColor,
    isRainbow,
    onSelectRainbow,
    soundEnabled,
    onToggleSound,
}) => {
    return (
        <div className="color-picker-container">
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

            <div className="sound-control">
                <button className={`sound-btn ${soundEnabled ? 'active' : ''}`} onClick={onToggleSound}>
                    {soundEnabled ? '🔊' : '🔇'}
                </button>
            </div>
        </div>
    );
};
