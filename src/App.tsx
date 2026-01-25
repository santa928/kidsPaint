import { useState, useRef, useEffect } from 'react';
import './App.css';
import { ColorPicker } from './components/ColorPicker';
import { ControlBar } from './components/ControlBar';
import { Canvas, type CanvasHandle } from './components/Canvas';
import { StampPicker } from './components/StampPicker';
import { soundManager } from './SoundManager';
import type { StampId } from './types';

const STAMPS: { id: StampId; label: string; icon: string }[] = [
  { id: 'circle', label: 'まる', icon: '○' },
  { id: 'cross', label: 'ばつ', icon: '✕' },
  { id: 'square', label: 'しかく', icon: '□' },
  { id: 'triangle', label: 'さんかく', icon: '△' },
  { id: 'rabbit', label: 'うさぎ', icon: '🐰' },
  { id: 'bird', label: 'とり', icon: '🐦' },
  { id: 'train', label: 'でんしゃ', icon: '🚆' },
];

function App() {
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(8);
  const [isEraser, setIsEraser] = useState(false);
  const [isRainbow, setIsRainbow] = useState(false);
  const [isStampMode, setIsStampMode] = useState(false);
  const [selectedStamp, setSelectedStamp] = useState<StampId>('circle');

  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('kids-oekaki-sound');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const [canUndo, setCanUndo] = useState(false);

  const canvasRef = useRef<CanvasHandle>(null);

  useEffect(() => {
    try {
      localStorage.setItem('kids-oekaki-sound', String(soundEnabled));
    } catch { }
    soundManager.setEnabled(soundEnabled);
  }, [soundEnabled]);

  const toggleSound = () => {
    const newState = !soundEnabled;
    setSoundEnabled(newState);
    if (newState) {
      soundManager.unlock();
    }
  };

  const handleColorSelect = (c: string) => {
    setColor(c);
    setIsEraser(false);
    setIsRainbow(false);
    setIsStampMode(false);
  };

  const handleRainbowSelect = () => {
    setIsRainbow(true);
    setIsEraser(false);
    setIsStampMode(false);
  };

  const handleSelectStamp = (stampId: StampId) => {
    setSelectedStamp(stampId);
    setIsStampMode(true);
    setIsEraser(false);
    setIsRainbow(false);
  };

  const handleSelectDrawMode = () => {
    setIsStampMode(false);
  };

  const handleBrushSizeChange = (size: number) => {
    setBrushSize(size);
  };

  const handleDrawStart = () => {
    soundManager.startDrawingSound();
  };

  const handleDrawEnd = () => {
    soundManager.stopDrawingSound();
    soundManager.playEndSound();
  };

  return (
    <div className="app-container">
      <header className="top-bar">
        <ColorPicker
          selectedColor={color}
          onSelectColor={handleColorSelect}
          isRainbow={isRainbow}
          onSelectRainbow={handleRainbowSelect}
          soundEnabled={soundEnabled}
          onToggleSound={toggleSound}
        />
        <StampPicker
          stamps={STAMPS}
          selectedStamp={selectedStamp}
          isStampMode={isStampMode}
          onSelectStamp={handleSelectStamp}
          onSelectDrawMode={handleSelectDrawMode}
        />
      </header>

      <main className="canvas-area">
        <Canvas
          ref={canvasRef}
          color={color}
          brushSize={brushSize}
          isEraser={isEraser}
          isRainbow={isRainbow}
          isStampMode={isStampMode}
          stampId={selectedStamp}
          onHistoryChange={setCanUndo}
          onDrawStart={handleDrawStart}
          onDrawEnd={handleDrawEnd}
        />
      </main>

      <footer className="bottom-bar">
        <ControlBar
          brushSize={brushSize}
          setBrushSize={handleBrushSizeChange}
          isEraser={isEraser}
          toggleEraser={() => {
            const next = !isEraser;
            setIsEraser(next);
            setIsStampMode(false);
            // Disable rainbow if eraser on, or keep state? Usually eraser overrides color.
            // If we toggle eraser off, we return to previous state? 
            // Simplification: Turn off rainbow when Eraser is activated.
            if (next) setIsRainbow(false);
          }}
          onUndo={() => canvasRef.current?.undo()}
          canUndo={canUndo}
          onClearAll={() => canvasRef.current?.clear()}
        />
      </footer>
    </div>
  )
}

export default App;
