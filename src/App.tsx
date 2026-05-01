import { useState, useRef, useEffect, useLayoutEffect, type CSSProperties } from 'react';
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
  const [isStampPanelOpen, setIsStampPanelOpen] = useState(false);
  const [bgColor, setBgColor] = useState(() => {
    try {
      const saved = localStorage.getItem('kids-oekaki-bg');
      return saved ?? '#FFFFFF';
    } catch {
      return '#FFFFFF';
    }
  });

  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('kids-oekaki-sound');
      return saved === 'true';
    } catch {
      return false;
    }
  });
  const [soundVolume, setSoundVolume] = useState(() => {
    try {
      const saved = localStorage.getItem('kids-oekaki-volume');
      if (saved === null) return 1.2;
      const parsed = Number(saved);
      if (!Number.isFinite(parsed)) return 1.2;
      return Math.min(2, Math.max(0, parsed));
    } catch {
      return 1.2;
    }
  });
  const [isSoundPanelOpen, setIsSoundPanelOpen] = useState(false);

  const [canUndo, setCanUndo] = useState(false);

  const canvasRef = useRef<CanvasHandle>(null);
  const topBarRef = useRef<HTMLElement>(null);
  const [topBarHeight, setTopBarHeight] = useState(0);

  useLayoutEffect(() => {
    const update = () => {
      const rect = topBarRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTopBarHeight(Math.ceil(rect.height));
    };
    update();
    if (!topBarRef.current) return;
    const observer = new ResizeObserver(update);
    const viewport = window.visualViewport;
    observer.observe(topBarRef.current);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    viewport?.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      viewport?.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    const closeTransientUi = () => {
      setIsStampPanelOpen(false);
      setIsSoundPanelOpen(false);
    };
    const viewport = window.visualViewport;
    window.addEventListener('resize', closeTransientUi);
    window.addEventListener('orientationchange', closeTransientUi);
    viewport?.addEventListener('resize', closeTransientUi);
    return () => {
      window.removeEventListener('resize', closeTransientUi);
      window.removeEventListener('orientationchange', closeTransientUi);
      viewport?.removeEventListener('resize', closeTransientUi);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('kids-oekaki-sound', String(soundEnabled));
    } catch {
      // Ignore storage errors (private mode, quota, etc.)
    }
    soundManager.setEnabled(soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem('kids-oekaki-volume', String(soundVolume));
    } catch {
      // Ignore storage errors (private mode, quota, etc.)
    }
    soundManager.setVolume(soundVolume);
  }, [soundVolume]);

  useEffect(() => {
    try {
      localStorage.setItem('kids-oekaki-bg', bgColor);
    } catch {
      // Ignore storage errors (private mode, quota, etc.)
    }
  }, [bgColor]);

  const handleSetSoundEnabled = (enabled: boolean) => {
    setSoundEnabled(enabled);
    if (enabled) {
      void soundManager.unlock();
    }
  };

  const handleSetSoundVolume = (volume: number) => {
    const clamped = Math.min(2, Math.max(0, volume));
    setSoundVolume(clamped);
  };

  const toggleSoundPanel = () => {
    setIsSoundPanelOpen((prev) => !prev);
  };

  const handleColorSelect = (c: string) => {
    void soundManager.unlock();
    soundManager.playColorSelectSound();
    setColor(c);
    setIsEraser(false);
    setIsRainbow(false);
  };

  const handleRainbowSelect = () => {
    void soundManager.unlock();
    soundManager.playRainbowSelectSound();
    setIsRainbow(true);
    setIsEraser(false);
  };

  const handleBackgroundSelect = (c: string) => {
    void soundManager.unlock();
    soundManager.playColorSelectSound();
    setBgColor(c);
  };

  const handleSelectStamp = (stampId: StampId) => {
    setSelectedStamp(stampId);
    setIsStampMode(true);
    setIsStampPanelOpen(false);
    setIsEraser(false);
  };

  const handleSelectDrawMode = () => {
    setIsStampMode(false);
  };

  const handleBrushSizeChange = (size: number) => {
    void soundManager.unlock();
    soundManager.playBrushSizeSound(size);
    setBrushSize(size);
  };

  const handleToggleEraser = () => {
    const next = !isEraser;
    void soundManager.unlock();
    soundManager.playEraserSound(next);
    setIsEraser(next);
    setIsStampMode(false);
    // Disable rainbow while erasing so the tool state remains unambiguous.
    if (next) setIsRainbow(false);
  };

  const handleUndo = () => {
    void soundManager.unlock();
    soundManager.playUndoSound();
    canvasRef.current?.undo();
  };

  const handleClearAll = () => {
    canvasRef.current?.clear();
    void soundManager.unlock();
    soundManager.playClearAllSound();
  };

  const handleStrokeStart = () => {
    void soundManager.unlock();
    soundManager.startDrawingSound();
  };

  const handleStrokeEnd = () => {
    soundManager.stopDrawingSound();
    soundManager.playStrokeEndSound();
  };

  const handleStampPlaced = (stampId: StampId) => {
    void soundManager.unlock();
    soundManager.playStampSound(stampId);
  };

  const appStyle = {
    '--top-bar-height': `${topBarHeight}px`,
    '--canvas-bg': bgColor,
  } as CSSProperties;

  return (
    <div className="app-container" style={appStyle}>
      <header className="top-bar" ref={topBarRef}>
        <ColorPicker
          selectedColor={color}
          onSelectColor={handleColorSelect}
          isRainbow={isRainbow}
          onSelectRainbow={handleRainbowSelect}
          backgroundColor={bgColor}
          onSelectBackground={handleBackgroundSelect}
          soundEnabled={soundEnabled}
          onSetSoundEnabled={handleSetSoundEnabled}
          soundVolume={soundVolume}
          onSetSoundVolume={handleSetSoundVolume}
          isSoundPanelOpen={isSoundPanelOpen}
          onToggleSoundPanel={toggleSoundPanel}
        />
        <StampPicker
          stamps={STAMPS}
          selectedStamp={selectedStamp}
          isStampMode={isStampMode}
          isOpen={isStampPanelOpen}
          onSelectStamp={handleSelectStamp}
          onSelectDrawMode={handleSelectDrawMode}
          onToggleOpen={() => setIsStampPanelOpen((prev) => !prev)}
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
          onStrokeStart={handleStrokeStart}
          onStrokeEnd={handleStrokeEnd}
          onStampPlaced={handleStampPlaced}
        />
      </main>

      <footer className="bottom-bar">
        <ControlBar
          brushSize={brushSize}
          setBrushSize={handleBrushSizeChange}
          isEraser={isEraser}
          toggleEraser={handleToggleEraser}
          onUndo={handleUndo}
          canUndo={canUndo}
          onClearAll={handleClearAll}
        />
      </footer>
    </div>
  )
}

export default App;
