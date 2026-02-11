import React, { useEffect, useState } from 'react';
import './ColorPicker.css';

interface ColorPickerProps {
    selectedColor: string;
    onSelectColor: (color: string) => void;
    isRainbow: boolean;
    onSelectRainbow: () => void;
    backgroundColor: string;
    onSelectBackground: (color: string) => void;
    soundEnabled: boolean;
    onSetSoundEnabled: (enabled: boolean) => void;
    soundVolume: number;
    onSetSoundVolume: (volume: number) => void;
    isSoundPanelOpen: boolean;
    onToggleSoundPanel: () => void;
}

const COLORS = [
    { name: '黒', value: '#000000' },
    { name: '赤', value: '#FF0000' },
    { name: '青', value: '#0000FF' },
    { name: '緑', value: '#008000' },
    { name: '黄', value: '#FFFF00' },
    { name: '橙', value: '#FFA500' },
    { name: '紫', value: '#800080' },
    { name: 'ピンク', value: '#FF69B4' },
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
    onSetSoundEnabled,
    soundVolume,
    onSetSoundVolume,
    isSoundPanelOpen,
    onToggleSoundPanel,
}) => {
    const [isBgOpen, setIsBgOpen] = useState(false);
    const volumePercent = Math.round(Math.min(2, Math.max(0, soundVolume)) * 100);

    useEffect(() => {
        const closePopover = () => setIsBgOpen(false);
        const viewport = window.visualViewport;
        window.addEventListener('resize', closePopover);
        window.addEventListener('orientationchange', closePopover);
        viewport?.addEventListener('resize', closePopover);
        return () => {
            window.removeEventListener('resize', closePopover);
            window.removeEventListener('orientationchange', closePopover);
            viewport?.removeEventListener('resize', closePopover);
        };
    }, []);

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
                <button
                    type="button"
                    className={`sound-btn ${isSoundPanelOpen ? 'active' : ''}`}
                    onClick={onToggleSoundPanel}
                    aria-label="音量設定"
                    aria-expanded={isSoundPanelOpen}
                    aria-controls="sound-popover"
                >
                    {soundEnabled ? '🔊' : '🔇'}
                </button>
                {isSoundPanelOpen && (
                    <div className="sound-popover" id="sound-popover">
                        <button
                            type="button"
                            className={`sound-enabled-toggle ${soundEnabled ? 'active' : ''}`}
                            onClick={() => onSetSoundEnabled(!soundEnabled)}
                        >
                            音を出す: {soundEnabled ? 'ON' : 'OFF'}
                        </button>

                        <label className="sound-volume-label" htmlFor="sound-volume-range">
                            音量 {volumePercent}%
                        </label>
                        <input
                            id="sound-volume-range"
                            className="sound-volume-range"
                            type="range"
                            min={0}
                            max={200}
                            step={5}
                            value={volumePercent}
                            onChange={(event) => onSetSoundVolume(Number(event.target.value) / 100)}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
