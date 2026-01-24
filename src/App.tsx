import { useState, useRef, useEffect } from 'react';
import './App.css';
import { ColorPicker } from './components/ColorPicker';
import { ControlBar } from './components/ControlBar';
import { Canvas, type CanvasHandle } from './components/Canvas';
import { soundManager } from './SoundManager';

function App() {
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(8);
  const [isEraser, setIsEraser] = useState(false);
  const [isRainbow, setIsRainbow] = useState(false);

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
  };

  const handleRainbowSelect = () => {
    setIsRainbow(true);
    setIsEraser(false);
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
      </header>

      <main className="canvas-area">
        <Canvas
          ref={canvasRef}
          color={color}
          brushSize={brushSize}
          isEraser={isEraser}
          isRainbow={isRainbow}
          onHistoryChange={setCanUndo}
          onDrawStart={handleDrawStart}
          onDrawEnd={handleDrawEnd}
        />
      </main>

      <footer className="bottom-bar">
        <ControlBar
          brushSize={brushSize}
          setBrushSize={setBrushSize}
          isEraser={isEraser}
          toggleEraser={() => {
            setIsEraser(!isEraser);
            // Disable rainbow if eraser on, or keep state? Usually eraser overrides color.
            // If we toggle eraser off, we return to previous state? 
            // Simplification: Turn off rainbow when Eraser is activated.
            if (!isEraser) setIsRainbow(false);
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
