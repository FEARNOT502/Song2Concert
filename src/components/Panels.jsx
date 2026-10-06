// Panels.jsx — the left and right rails over the scene: the venue's name,
// and what is playing.

import { memo } from 'react';

// Left rail — the venue
function LeftDataPanel({ venue }) {
  return (
    <div className="absolute top-[100px] left-10 z-20 text-[12px] tracking-[0.2em] uppercase text-neutral-500 max-w-[260px] font-mono">
      <div className="text-neutral-300">VENUE</div>
      <div className="text-white text-[34px] font-light tracking-tight normal-case mt-1 leading-tight font-tight">{venue.name}</div>
    </div>
  );
}

// Right rail — what is playing
function RightDataPanel({ file }) {
  return (
    <div className="absolute top-[100px] right-10 z-20 text-[12px] tracking-[0.2em] uppercase text-neutral-500 text-right max-w-[300px] font-mono">
      <div className="text-neutral-300">PLAYING</div>
      {/* track / album / artist — a missing tag is left out, not shown empty */}
      <div className="text-white text-[22px] font-light mt-1 normal-case leading-tight font-tight truncate">{file.name}</div>
      {file.album && <div className="mt-1.5 text-[12px] normal-case tracking-normal truncate">{file.album}</div>}
      {file.artist && <div className="text-[11px] text-neutral-600 mt-1 normal-case tracking-normal truncate">{file.artist}</div>}
      {file.hint && <div className="mt-1.5 text-[12px] truncate">{file.hint}</div>}
    </div>
  );
}

// Memoised: the playback clock re-renders the app several times a second and
// none of these change with it.
const LeftDataPanelMemo = memo(LeftDataPanel);
const RightDataPanelMemo = memo(RightDataPanel);
export { LeftDataPanelMemo as LeftDataPanel, RightDataPanelMemo as RightDataPanel };
