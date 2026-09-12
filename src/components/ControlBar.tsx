import type { DrawingTool } from '../drawing/types';
import { ToolIcon } from './ToolIcon';
import './ControlBar.css';
interface Props { tool: DrawingTool; brushSize: number; canUndo: boolean; busy: boolean; onTool: (tool: DrawingTool) => void; onSize: (size: number) => void; onUndo: () => void; onNew: () => void; }
/** Place reversible child actions beside the three explicit, mutually exclusive tools. */
export function ControlBar({ tool, brushSize, canUndo, busy, onTool, onSize, onUndo, onNew }: Props) {
  return <footer className="tool-tray">
    <div className="tool-group" role="group" aria-label="どうぐ">
      {([{ id: 'brush', label: 'クレヨン' }, { id: 'stamp', label: 'スタンプ' }, { id: 'eraser', label: 'けしゴム' }] as const).map(item => <button key={item.id} className="tool-button" aria-pressed={tool === item.id} onClick={() => onTool(item.id)} disabled={busy}><ToolIcon name={item.id} /><span>{item.label}</span></button>)}
    </div>
    <div className="size-group" role="group" aria-label="ふとさ">
      {[8, 16, 28].map((size, index) => <button key={size} className="size-button" aria-label={['ほそい', 'ふつう', 'ふとい'][index]} aria-pressed={brushSize === size} onClick={() => onSize(size)} disabled={busy}><span style={{ width: [9, 16, 25][index], height: [9, 16, 25][index] }} /></button>)}
    </div>
    <div className="tool-group action-group">
      <button className="tool-button" aria-label="ひとつもどす" onClick={onUndo} disabled={!canUndo || busy}><ToolIcon name="undo" /><span>もどす</span></button>
      <button className="tool-button new-paper-button" aria-label="あたらしいかみ" onClick={onNew} disabled={busy}><ToolIcon name="new" /><span>あたらしい かみ</span></button>
    </div>
  </footer>;
}
