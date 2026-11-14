import { useMemo } from 'react';

const ACCENT='#ff9745';
export function TheaterMapControls({catalog,floor,onFloor}) {
  return <div className="absolute top-2 left-2 right-2 z-10 flex items-center justify-between gap-1 text-[9px]">
    <div className="flex border border-white/20 bg-[#08090b]" role="group" aria-label="Floor tabs">
      {catalog.blocks.map(f=><button key={f} type="button" aria-pressed={f===floor} onClick={e=>{e.stopPropagation();onFloor(f);}}
        className={`px-2 py-1.5 ${f===floor?'text-white bg-white/15':'text-neutral-500 hover:text-white'}`}>{f}</button>)}
    </div>
    <span className="text-neutral-500 tabular-nums bg-black/80 px-1">{catalog.seats.filter(s=>s.level===floor).length} SEATS</span>
  </div>;
}
export default function TheaterSeatMap({catalog,floor='1F',seat,onSeat}) {
  const seats=useMemo(()=>catalog.seats.filter(s=>s.level===floor),[catalog,floor]);
  const front=Math.min(...seats.map(s=>s.z))-4.5;
  const back=Math.max(...seats.map(s=>s.z))+1.8;
  const rowLabels=catalog.getRows(floor).map(r=>{
    const ss=seats.filter(s=>s.row===r),centre=ss.filter(s=>Math.abs(s.x)<4.9);
    return {row:r,z:(centre.length?centre:ss).reduce((a,s)=>a+s.z,0)/(centre.length||ss.length)};
  });
  const pick=(s)=>onSeat(s);
  const key=(e,s)=>{
    s=seat?.level===floor?seat:s;
    if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();pick(s);return;}
    if(!e.key.startsWith('Arrow'))return;
    e.preventDefault();e.stopPropagation();
    const rows=catalog.getRows(floor), nums=catalog.getNums(floor,s.row);
    if(e.key==='ArrowLeft'||e.key==='ArrowRight') {
      const n=nums.indexOf(s.num)+(e.key==='ArrowLeft'?-1:1);
      const next=catalog.getSeat(floor,s.row,nums[Math.max(0,Math.min(nums.length-1,n))]);if(next)pick(next);
    } else {
      const r=rows.indexOf(s.row)+(e.key==='ArrowUp'?-1:1);
      const row=rows[Math.max(0,Math.min(rows.length-1,r))],ns=catalog.getNums(floor,row);
      const n=ns.reduce((best,n)=>Math.abs(n-s.num)<Math.abs(best-s.num)?n:best,ns[0]);
      const next=catalog.getSeat(floor,row,n);if(next)pick(next);
    }
  };
  return <div className="absolute inset-0">
    <svg viewBox={`-15.5 ${front} 31 ${back-front}`} className="absolute top-10 bottom-7 left-0 w-full h-[calc(100%-68px)]" aria-label={`${floor} seat map`}>
      <path d={`M-14.6 ${front+1}H14.6V${back-.3}L5.8 ${back}H-5.8L-14.6 ${back-.3}Z`} fill="#111315" stroke="#46413a" strokeWidth=".08"/>
      <rect x="-7.45" y={front+.35} width="14.9" height="1.4" fill={ACCENT} rx=".08"/>
      <text x="0" y={front+1.3} textAnchor="middle" fill="#101010" fontSize=".7" fontFamily="monospace" fontWeight="600">STAGE</text>
      {floor==='1F'&&<text x="0" y={front+2.55} textAnchor="middle" fill="#b2a188" fontSize=".38">{catalog.seats.some(s=>s.kind==='op')?'OP SEATING':'ORCHESTRA PIT'}</text>}
      <g fontFamily="ui-monospace,monospace" textAnchor="middle" dominantBaseline="central">
        {seats.map(s=>{
          const selected=seat?.level===s.level&&String(seat.row)===String(s.row)&&seat.num===s.num;
          const colour=s.kind==='wheelchair'?'#437f83':s.kind==='family'?'#73628b':s.kind==='op'?'#877244':'#274a75';
          return <g key={`${s.row}-${s.num}`} role="button" aria-label={`${floor} Row ${s.row} Seat ${s.num}${s.kind==='standard'?'':` ${s.kind}`}`} aria-pressed={selected}
            tabIndex={selected?0:-1} data-floor={floor} data-row={s.row} data-seat={s.num}
            onKeyDown={e=>key(e,s)} onClick={e=>{e.stopPropagation();pick(s);}} className="cursor-pointer outline-none group"
            transform={`translate(${s.x} ${s.z}) rotate(${(s.yaw-Math.PI)*180/Math.PI})`}>
            <title>{`${floor} · ROW ${s.row} · SEAT ${s.num}${s.kind==='standard'?'':` · ${s.kind.toUpperCase()}`}`}</title>
            <rect x="-.24" y="-.25" width=".48" height=".49" rx=".07" fill={selected?ACCENT:colour} stroke={selected?'#fff1dd':'#8ea2b6'} strokeWidth={selected ? .065 : .025} className="group-hover:stroke-white group-focus:stroke-white"/>
            <text y=".01" fontSize=".235" fill={selected?'#101010':'#f1f1f1'} pointerEvents="none">{s.num}</text>
          </g>;
        })}
        {rowLabels.map(r=><g key={r.row} fill="#acaaa6" fontSize={typeof r.row==='number'?'.33':'.28'} pointerEvents="none">
          <text x="-5.05" y={r.z}>{typeof r.row==='number'?r.row:r.row==='FAMILY'?'FAM':r.row}</text>
          <text x="5.05" y={r.z}>{typeof r.row==='number'?r.row:r.row==='FAMILY'?'FAM':r.row}</text>
        </g>)}
      </g>
    </svg>
    <div className="absolute bottom-2 left-2 text-[8px] tracking-normal text-neutral-500 pointer-events-none">CLICK A SEAT · SCROLL TO ZOOM</div>
  </div>;
}
