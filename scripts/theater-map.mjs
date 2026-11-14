// Static fallback/overview regenerated from the same catalogue as the live picker.
import { writeFileSync } from 'node:fs';
import { getTheaterSeatCatalog } from '../src/three/venues/theater-seats.js';
const cat=getTheaterSeatCatalog('op');
const out=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 2160" role="img" aria-label="Theater seating, all three floors"><rect width="1080" height="2160" fill="#090b0e"/>'];
for(let floor=1;floor<=3;floor++) {
  const seats=cat.seats.filter(s=>s.floor===floor),top=Math.min(...seats.map(s=>s.z))-3.3;
  const scale=30;
  const y0=floor===1?70:floor===2?1150:1800;
  const factor=1;
  out.push(`<g transform="translate(540 ${y0}) scale(${scale} ${scale*factor})"><text x="-16" y="-1" font-size=".75" fill="#ddd" font-family="monospace">${floor}F</text><rect x="-7.45" y="-.4" width="14.9" height="1.2" fill="#ff9745"/><text x="0" y=".45" font-size=".65" text-anchor="middle" font-family="monospace">STAGE</text>`);
  for(const s of seats) {
    const col=s.kind==='wheelchair'?'#437f83':s.kind==='family'?'#73628b':s.kind==='op'?'#877244':'#274a75';
    out.push(`<g transform="translate(${s.x} ${s.z-top}) rotate(${(s.yaw-Math.PI)*180/Math.PI})"><rect x="-.24" y="-.25" width=".48" height=".49" rx=".06" fill="${col}" stroke="#899bad" stroke-width=".025"/><text y=".08" font-size=".23" text-anchor="middle" fill="#eee" font-family="monospace">${s.num}</text><title>${floor}F · ROW ${s.row} · SEAT ${s.num}</title></g>`);
  }
  out.push('</g>');
}
out.push('</svg>');
writeFileSync(new URL('../public/venue-maps/theater.svg',import.meta.url),out.join(''));
console.log('Regenerated public/venue-maps/theater.svg');
