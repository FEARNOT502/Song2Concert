// Panels.jsx — left/right data rails + center listening chip.
// No per-seat selection: each venue exposes one representative listening
// `position` (distributed-PA model — the mix is ~the same across the house).

// Left rail — "where you are" + the wet/direct balance at this position
export function LeftDataPanel({ venue }) {
  const pos = venue.position;
  const direct = 100 - pos.wet;
  return (
    <div className="absolute top-[100px] left-10 z-20 text-[12px] tracking-[0.2em] uppercase text-neutral-500 max-w-[260px] font-mono">
      <div className="text-neutral-300">LISTENING POSITION</div>
      <div className="text-white text-[34px] font-light tracking-tight normal-case mt-1 leading-tight font-tight">{pos.label}</div>
      <div className="mt-2 text-[12px]">{pos.distance} from stage</div>

      <div className="mt-7 text-neutral-300">DIRECT / REVERB</div>
      <div className="mt-2 flex items-center gap-2">
        <div className="text-white text-[28px] font-light normal-case tabular-nums leading-none font-tight">
          {direct}<span className="text-[15px] text-neutral-500">%</span>
        </div>
        <div className="text-neutral-600 text-[20px]">/</div>
        <div className="text-white text-[28px] font-light normal-case tabular-nums leading-none font-tight">
          {pos.wet}<span className="text-[15px] text-neutral-500">%</span>
        </div>
      </div>
      <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden flex">
        <div className="h-full bg-white/50" style={{ width: `${direct}%` }} />
        <div className="h-full bg-[oklch(0.78_0.16_55)]" style={{ width: `${pos.wet}%` }} />
      </div>

      <div className="mt-7 text-neutral-300">First reflection</div>
      <div className="text-white text-[19px] mt-2 normal-case tabular-nums font-tight">{pos.firstReflection}</div>

      <div className="mt-7 text-neutral-300">{venue.type}</div>
      <div className="text-[13px] mt-1.5 normal-case tracking-normal text-neutral-400 leading-relaxed font-tight">{venue.descKo}</div>
    </div>
  );
}

// Right rail — "what you're hearing" (file + venue signature)
export function RightDataPanel({ venue, file }) {
  return (
    <div className="absolute top-[100px] right-10 z-20 text-[12px] tracking-[0.2em] uppercase text-neutral-500 text-right max-w-[300px] font-mono">
      <div className="text-neutral-300">PLAYING</div>
      <div className="text-white text-[22px] font-light mt-1 normal-case leading-tight font-tight truncate">{file.name}</div>
      <div className="mt-1.5 text-[12px] truncate">{file.track}</div>
      <div className="text-[11px] text-neutral-600 mt-1 normal-case tracking-normal truncate">{file.artist}</div>

      <div className="mt-7 text-neutral-300">{venue.type} signature</div>
      <div className="mt-2.5 space-y-1.5">
        {Object.entries(venue.acoustics).map(([k, v]) => (
          <div key={k} className="flex justify-end items-baseline gap-3">
            <span className="text-neutral-500 text-[12px]">{k}</span>
            <span className="text-white text-[18px] normal-case tabular-nums font-tight">{v}</span>
          </div>
        ))}
      </div>

      <div className="mt-7 text-neutral-300">Capacity</div>
      <div className="text-white text-[17px] mt-1 normal-case font-tight">{venue.capacity}</div>
      <div className="text-[11px] text-neutral-600 mt-1 normal-case tracking-normal">{venue.city}</div>
    </div>
  );
}

// Center chip — "You are listening …"
export function SeatChip({ venue }) {
  return (
    <div className="absolute top-[100px] left-1/2 -translate-x-1/2 z-20 border border-white/15 px-4 py-2 text-[12px] tracking-[0.25em] uppercase text-neutral-400 bg-black/40 backdrop-blur-sm flex items-center gap-3 font-mono">
      <span>◧ You are listening · {venue.name}</span>
    </div>
  );
}
