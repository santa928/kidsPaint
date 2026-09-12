import type { CSSProperties } from 'react';
export type IconName = 'brush' | 'stamp' | 'eraser' | 'undo' | 'new' | 'gallery' | 'settings' | 'close' | 'download' | 'sound' | 'mute' | 'paper' | 'check' | 'collapse' | 'fullscreen' | 'tools';
const paths: Record<IconName, string> = {
  brush: 'M7 22l-1 5 5-1L27 10 22 5 7 22ZM18 9l5 5M7 22l4 4',
  stamp: 'M7 24h18v4H7zM10 21v-5h4v-5a5 5 0 1 1 4 0v5h4v5',
  eraser: 'M5 19 18 6a3 3 0 0 1 4 0l5 5a3 3 0 0 1 0 4L16 26H11L5 20ZM12 12l10 10M16 26h12',
  undo: 'M12 8 5 15l7 7M6 15h12a8 8 0 0 1 8 8',
  new: 'M21 4H7v24h20V10l-6-6ZM21 4v7h6M12 19h10M17 14v10',
  gallery: 'M6 5h21v23H6zM6 10H3M6 16H3M6 22H3M11 22l4-5 3 3 4-6 3 8M12 11h.01',
  settings: 'M16 11a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM16 4v3M16 25v3M4 16h3M25 16h3M7.5 7.5l2 2M22.5 22.5l2 2M7.5 24.5l2-2M22.5 9.5l2-2',
  close: 'M9 9l14 14M23 9 9 23',
  download: 'M16 4v16M10 14l6 6 6-6M6 22v6h20v-6',
  sound: 'M6 12h5l7-6v20l-7-6H6zM23 10a9 9 0 0 1 0 12M26 6a15 15 0 0 1 0 20',
  mute: 'M6 12h5l7-6v20l-7-6H6zM23 13l6 6M29 13l-6 6',
  paper: 'M7 4h18v24H7zM11 20l5-8 5 8z',
  check: 'M7 16l6 6L26 9',
  collapse: 'M6 11l10 10 10-10M6 5l10 10L26 5',
  fullscreen: 'M5 12V5h7M20 5h7v7M27 20v7h-7M12 27H5v-7',
  tools: 'M5 16h22v12H5zM9 16V7l3-4 3 4v9M19 16V5h5v11M10 22h12',
};
/** A consistent, non-text silhouette for each drawing action. */
export function ToolIcon({ name, style }: { name: IconName; style?: CSSProperties }) {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="tool-icon" style={style}><path d={paths[name]} /></svg>;
}
