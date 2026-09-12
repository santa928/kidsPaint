import { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';
import { ColorPicker } from './components/ColorPicker';
import { BACKGROUNDS } from './palette';
import { ControlBar } from './components/ControlBar';
import { Canvas, type CanvasHandle } from './components/Canvas';
import { StampPicker } from './components/StampPicker';
import { ArtworkPreview } from './components/ArtworkPreview';
import { Dialog } from './components/Dialog';
import { ToolIcon } from './components/ToolIcon';
import { useArtworkSession } from './hooks/useArtworkSession';
import { soundManager } from './SoundManager';
import { artworkToPng, downloadPng } from './artworkExport';
import type { Artwork } from './storage/artworks';
import type { DrawingTool } from './drawing/types';
import type { StampId } from './types';

type Panel = 'stamps' | 'gallery' | 'settings' | 'paper' | null;

/** Read optional legacy preferences without preventing drawing when storage is unavailable. */
function preference(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** A tablet art desk with immediate drawing and a separate, recoverable artwork collection. */
function App() {
  const session = useArtworkSession();
  const { current } = session;
  const canvasRef = useRef<CanvasHandle>(null);
  const [tool, setTool] = useState<DrawingTool>('brush');
  const [color, setColor] = useState('#FF0000');
  const [brushSize, setBrushSize] = useState(16);
  const [rainbow, setRainbow] = useState(false);
  const [stamp, setStamp] = useState<StampId>('rabbit');
  const [panel, setPanel] = useState<Panel>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [notice, setNotice] = useState('');
  const [exporting, setExporting] = useState(false);
  const [toolsVisible, setToolsVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => preference('kids-oekaki-sound') === 'true');
  const [volume, setVolume] = useState(() => {
    const saved = preference('kids-oekaki-volume');
    const parsed = saved === null ? 1.2 : Number(saved);
    return Number.isFinite(parsed) ? Math.min(2, Math.max(0, parsed)) : 1.2;
  });

  useEffect(() => {
    soundManager.setEnabled(soundEnabled);
    soundManager.setVolume(volume);
    try { localStorage.setItem('kids-oekaki-sound', String(soundEnabled)); localStorage.setItem('kids-oekaki-volume', String(volume)); } catch { /* Preferences are optional; artwork failures are reported separately. */ }
  }, [soundEnabled, volume]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!current || (session.status !== 'saving' && session.status !== 'error')) return;
    // Browsers can warn before a reload while the last stroke is still unsaved.
    const protectDraft = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protectDraft);
    return () => window.removeEventListener('beforeunload', protectDraft);
  }, [current, session.status]);

  /** Unlock audio only within a user gesture and only when the user has enabled it. */
  const play = useCallback((action: () => void) => {
    if (!soundEnabled) return;
    void soundManager.unlock();
    action();
  }, [soundEnabled]);

  /** Commit a held finger before another control changes the tool or active paper. */
  const finish = useCallback(() => { canvasRef.current?.finishStroke(); soundManager.stopDrawingSound(); }, []);
  const openPanel = useCallback((next: Panel) => { finish(); setNotice(''); setPanel(next); }, [finish]);

  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  /** Browser chrome can only be hidden through a supported, user-triggered fullscreen request. */
  const toggleFullscreen = async () => {
    finish();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.fullscreenEnabled && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else { setPanel('settings'); setNotice('このブラウザでは、ホーム画面に追加して開くと大きく遊べます。'); }
    } catch { setPanel('settings'); setNotice('全画面にできませんでした。ホーム画面に追加する方法も使えます。'); }
  };

  /** Expose a read-only, artwork-coordinate snapshot for repeatable browser acceptance checks. */
  useEffect(() => {
    const target = window as Window & { render_game_to_text?: () => string; advanceTime?: (milliseconds: number) => Promise<void> };
    target.render_game_to_text = () => JSON.stringify({
      mode: 'drawing', coordinates: 'top-left origin; x right, y down; artwork units',
      artworkId: current?.id ?? null, width: current?.drawing.width, height: current?.drawing.height,
      operationCount: current?.drawing.operations.length ?? 0, backgroundColor: current?.backgroundColor,
      tool, color, rainbow, brushSize, stamp, canUndo, panel, toolsVisible, fullscreen, saveStatus: session.status, busy: session.busy,
    });
    target.advanceTime = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
    return () => { delete target.render_game_to_text; delete target.advanceTime; };
  }, [current, tool, color, rainbow, brushSize, stamp, canUndo, panel, toolsVisible, fullscreen, session.status, session.busy]);

  /** Download a background-composited PNG; iPad Safari presents its normal file/download UI. */
  const exportPicture = async (savedArtwork?: Artwork) => {
    if (!current || !canvasRef.current || exporting) return;
    finish();
    setExporting(true);
    setNotice('');
    try {
      const blob = savedArtwork ? await artworkToPng(savedArtwork) : await canvasRef.current.exportPng(current.backgroundColor);
      downloadPng(blob, savedArtwork ?? current);
      setNotice('画像ファイルを書き出しました');
    } catch { setNotice('画像を書き出せませんでした。もう一度お試しください。'); }
    finally { setExporting(false); }
  };

  return <div className={`art-desk${toolsVisible ? '' : ' tools-hidden'}`}>
    <h1 className="visually-hidden">おえかき</h1>
    <header className="desk-header" aria-label="さくひんと がめん">
      <button className="icon-button tools-toggle" aria-label={toolsVisible ? 'どうぐをかたづける' : 'どうぐをひらく'} aria-expanded={toolsVisible} onClick={() => { finish(); setToolsVisible(!toolsVisible); }}><ToolIcon name={toolsVisible ? 'collapse' : 'tools'} /><span>どうぐ</span></button>
      {toolsVisible && <div className="header-actions">
        <button className="header-button" onClick={() => openPanel('gallery')} disabled={!current || session.busy}><ToolIcon name="gallery" /><span>さくひん</span></button>
        <button className="header-button" aria-label="かみのいろ" onClick={() => openPanel('paper')} disabled={!current || session.busy}><ToolIcon name="paper" /><span>かみのいろ</span></button>
        <button className="icon-button settings-button" aria-label="おうちの方へ" onClick={() => openPanel('settings')} disabled={!current || session.busy}><ToolIcon name="settings" /></button>
        <button className="icon-button" aria-label={fullscreen ? 'ぜんがめんをやめる' : 'ぜんがめん'} onClick={() => void toggleFullscreen()}><ToolIcon name="fullscreen" /></button>
      </div>}
    </header>
    {toolsVisible && <div className="palette-area" inert={!current || session.busy}>
      <ColorPicker selectedColor={color} isRainbow={rainbow} onSelectColor={next => { finish(); setColor(next); setRainbow(false); if (tool === 'eraser') setTool('brush'); play(() => soundManager.playColorSelectSound()); }} onSelectRainbow={() => { finish(); setRainbow(true); if (tool === 'eraser') setTool('brush'); play(() => soundManager.playRainbowSelectSound()); }} />
    </div>}
    {session.status === 'error' && <div className="save-warning" role="alert"><span>{current ? 'この絵を保存できていません。' : '前の作品を開けませんでした。元のデータは残しています。'}{session.error}{current && ' 絵を残すには「画像を保存」を使ってください。'}</span>{!session.hasConflict && <button onClick={() => void session.retry()}>再試行</button>}{current && <button onClick={() => void exportPicture()} disabled={exporting}>画像を保存</button>}</div>}
    <main className="workspace" aria-label="おえかき" inert={session.busy}>
      {current ? <Canvas key={current.id} ref={canvasRef} document={current.drawing} tool={tool} color={color} brushSize={brushSize} isRainbow={rainbow} stampId={stamp} backgroundColor={current.backgroundColor} onChange={session.setDrawing} onHistoryChange={setCanUndo} onStrokeStart={() => play(() => soundManager.startDrawingSound())} onStrokeEnd={() => { soundManager.stopDrawingSound(); play(() => soundManager.playStrokeEndSound()); }} onStampPlaced={id => play(() => soundManager.playStampSound(id))} /> : <p className="loading-message" role="status">{session.status === 'error' ? 'おうちのひとと、もういちど ひらいてみよう' : 'かみを じゅんびしているよ…'}</p>}
    </main>
    {toolsVisible && <ControlBar tool={tool} brushSize={brushSize} canUndo={canUndo} busy={!current || session.busy} onTool={next => { finish(); setTool(next); if (next === 'stamp') openPanel('stamps'); else play(() => soundManager.playEraserSound(next === 'eraser')); }} onSize={size => { finish(); setBrushSize(size); play(() => soundManager.playBrushSizeSound(size)); }} onUndo={() => { canvasRef.current?.undo(); play(() => soundManager.playUndoSound()); }} onNew={() => { finish(); void session.newPaper().then(success => { if (success) setNotice('さっきの絵は「さくひん」にあるよ'); }); }} />}
    <div className="desk-status visually-hidden" role="status" aria-live="polite">{session.status === 'saving' ? '保存しています…' : session.status === 'saved' ? 'この端末に保存済み' : session.status === 'loading' ? '作品を開いています…' : '保存を確認してください'}</div>
    {notice && !panel && <div className="toast" role="status">{notice}</div>}
    {panel && <Dialog title={{ stamps: 'どの スタンプにする？', gallery: 'さくひんちょう', settings: 'おうちの方へ', paper: 'かみのいろ' }[panel]} wide={panel === 'gallery'} onClose={() => setPanel(null)}>
      {panel === 'stamps' && <StampPicker selected={stamp} color={color} rainbow={rainbow} onSelect={next => { setStamp(next); setTool('stamp'); setPanel(null); }} />}
      {panel === 'paper' && <div className="background-grid">{BACKGROUNDS.map(item => <button key={item.value} aria-label={`かみ ${item.name}`} aria-pressed={current?.backgroundColor === item.value} onClick={() => { session.setBackground(item.value); setPanel(null); }}><span style={{ backgroundColor: item.value }} /><span>{item.name}</span></button>)}</div>}
      {panel === 'gallery' && <>
        <p className="dialog-description">えを えらぶと、つづきが かけるよ。</p>
        <div className="artwork-grid">{session.artworks.map(art => <div key={art.id} className="artwork-card"><button className="artwork-open" aria-label={`${new Date(art.createdAt).toLocaleDateString('ja-JP')}の作品${art.id === current?.id ? ' いまのえ' : ''}`} disabled={session.busy} onClick={() => { finish(); void session.openArtwork(art).then(success => { if (success) setPanel(null); }); }}><div className="thumbnail-mat"><ArtworkPreview artwork={art} /></div><span className="artwork-caption"><span>{new Date(art.createdAt).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}</span>{art.id === current?.id && <strong>いまのえ</strong>}</span></button><button className="artwork-download" onClick={() => void exportPicture(art)} disabled={exporting}><ToolIcon name="download" /><span>画像を保存</span></button></div>)}</div>
        <p className="parent-note">このブラウザ・この端末の作品帳です。大切な絵は「おうちの方へ」から画像でも保存できます。</p>
      </>}
      {panel === 'settings' && <div className="settings-content">
        <section><h3>画面いっぱいで遊ぶ</h3><p>紙は画面の端まで描けます。右上の「どうぐ」で道具をたためます。iPad の Safari では、共有メニューの「ホーム画面に追加」から開くと、ブラウザのアドレスバーのない画面で遊べます。</p></section>
        <section className="setting-row"><div><h3>おとのあそび</h3><p>おえかきに合わせて音が鳴ります</p></div><button className="sound-toggle" aria-label={soundEnabled ? 'おとをオフ' : 'おとをオン'} aria-pressed={soundEnabled} onClick={() => { const next = !soundEnabled; soundManager.setEnabled(next); setSoundEnabled(next); if (next) { void soundManager.unlock(); soundManager.playColorSelectSound(); } }}><ToolIcon name={soundEnabled ? 'sound' : 'mute'} /><span>{soundEnabled ? 'オン' : 'オフ'}</span></button></section>
        <label className="volume-setting">音量 <output>{Math.round(volume * 100)}%</output><input type="range" min="0" max="200" step="5" value={Math.round(volume * 100)} onChange={event => setVolume(Number(event.target.value) / 100)} /></label>
        <section className="save-section"><h3>この絵を画像で保存</h3><p>{session.status === 'saved' ? 'この端末に保存済みです。' : session.status === 'saving' ? 'いま保存しています。' : '保存状態を確認してください。'}背景の色も一緒に PNG 画像へ書き出します。iPad ではダウンロード後に「ファイル」から開けます。</p><button className="primary-button" onClick={() => void exportPicture()} disabled={exporting}><ToolIcon name="download" />{exporting ? '書き出しています…' : '画像を保存'}</button></section>
        <section className="clear-section"><h3>いまの紙をまっさらにする</h3><p>間違えたら、画面下の「もどす」で取り消せます。新しい作品は「あたらしい かみ」で始められます。</p><button className="secondary-button" disabled={!current?.drawing.operations.length} onClick={() => { canvasRef.current?.clear(); setPanel(null); play(() => soundManager.playClearAllSound()); }}>この紙をまっさらにする</button></section>
        <p className="parent-note">作品は端末内に自動保存します。ブラウザのデータ消去や端末の空き容量不足で消える場合があるため、大切な絵は画像でも残してください。</p>
      </div>}
      {session.status === 'error' && <p className="dialog-error" role="alert">保存できていません。{session.error}</p>}
      {notice && <p className="dialog-notice" role="status">{notice}</p>}
    </Dialog>}
  </div>;
}
export default App;
