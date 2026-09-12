import { StampPreview } from './ArtworkPreview';
import type { StampId } from '../types';
import './StampPicker.css';
const STAMPS: { id: StampId; label: string }[] = [
  { id: 'circle', label: 'まる' }, { id: 'cross', label: 'ばつ' },
  { id: 'square', label: 'しかく' }, { id: 'triangle', label: 'さんかく' },
  { id: 'rabbit', label: 'うさぎ' }, { id: 'bird', label: 'とり' }, { id: 'train', label: 'でんしゃ' },
];
/** Seven recognizable stamp choices, matching the resulting marks exactly. */
export function StampPicker({ selected, color, rainbow, onSelect }: { selected: StampId; color: string; rainbow: boolean; onSelect: (stamp: StampId) => void }) {
  return <div className="stamp-grid" role="group" aria-label="スタンプのかたち">{STAMPS.map(stamp => <button className="stamp-choice" aria-pressed={selected === stamp.id} key={stamp.id} onClick={() => onSelect(stamp.id)}><StampPreview stampId={stamp.id} color={color} rainbow={rainbow} /><span>{stamp.label}</span></button>)}</div>;
}
