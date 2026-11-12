// Panels.jsx — the left and right rails over the scene: the venue's name,
// and what is playing.

import { memo } from 'react';
import { SEAT_ROOMS, seatText } from './Modals.jsx';

// Left rail — the venue
function LeftDataPanel({ venue, venueMode = 'general', seat = null, onSeatClick = null }) {
  return (
    <div className="absolute top-[100px] left-10 z-20 text-[12px] tracking-[0.2em] uppercase text-neutral-500 max-w-[280px] font-mono">
      <div className="text-neutral-300">VENUE</div>
      <div className="text-white text-[34px] font-light tracking-tight normal-case mt-1 leading-tight font-tight">{venue.name}{venueMode === '360' && <span className="ml-1.5 text-[0.62em] tracking-[0.2em] text-[oklch(0.78_0.16_55)] align-middle">360</span>}</div>
      {SEAT_ROOMS.includes(venue.id) && (
        <button
          type="button"
          onClick={onSeatClick}
          className="mt-2 inline-flex items-center gap-2 border border-white/15 bg-black/50 hover:border-[oklch(0.78_0.16_55)]/70 px-2.5 py-1 text-[11px] tracking-[0.15em] text-neutral-300 hover:text-white transition-colors tabular-nums"
        >
          <span className="text-[oklch(0.78_0.16_55)]">{seat ? seatText(seat).split(' · ')[0] : 'FOH'}</span>
          <span>{seat ? `ROW ${seat.row} · SEAT ${seat.num}` : venue.id === 'stadium' ? 'PITCH' : 'ARENA'}</span>
        </button>
      )}
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
