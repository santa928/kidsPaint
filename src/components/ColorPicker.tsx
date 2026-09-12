import type { CSSProperties } from 'react';
import './ColorPicker.css';
import { COLORS } from '../palette';
interface Props { selectedColor: string; isRainbow: boolean; onSelectColor: (color: string) => void; onSelectRainbow: () => void; }
/** Keep every crayon visible and indicate selection through shape as well as color. */
export function ColorPicker({ selectedColor, isRainbow, onSelectColor, onSelectRainbow }: Props) {
  return <div className="color-picker" role="group" aria-label="いろ">
    {COLORS.map(item => <button key={item.value} className="crayon-button" aria-label={item.name} aria-pressed={!isRainbow && selectedColor === item.value} style={{ '--crayon': item.value } as CSSProperties} onClick={() => onSelectColor(item.value)}>
      <span className="crayon" aria-hidden="true"><span className="crayon-band" /></span><span className="color-name">{item.name}</span>
    </button>)}
    <button className="crayon-button rainbow-button" aria-label="にじいろ" aria-pressed={isRainbow} onClick={onSelectRainbow}><span className="crayon" aria-hidden="true"><span className="crayon-band" /></span><span className="color-name">にじ</span></button>
  </div>;
}
