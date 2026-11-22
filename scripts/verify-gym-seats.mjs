// verify-gym-seats.mjs — KSPO DOME's 1F (rows 12-22) and 2F seats against the
// operator's seat chart, without the chart itself:
// docs/references/kspo-seat-audit-chart.json holds the chart's seats on the app's
// plan (venue-lab/pipeline/gym_seat_audit.py makes it from the EPS). Each chart
// seat is paired with the nearest app seat within the tolerance, one to one.
//   missing  a chart seat with no app seat: a seat lost
//   extra    an app seat with no chart seat: a seat that is not there
//   section  a pair in different sections: the split between sections moved
// Nothing missing, nothing extra and every pair in its own section means the
// rows, the aisles and the sections' splits are the chart's.
// usage: node scripts/verify-gym-seats.mjs [--list]
import fs from 'node:fs';
import { GYM_SEATS } from '../src/three/venues/gymnastic-data.js';

const ref = JSON.parse(fs.readFileSync(new URL('../docs/references/kspo-seat-audit-chart.json', import.meta.url), 'utf8'));
const TOL = ref.tolerance_m;
const list = process.argv.includes('--list');
const b = Buffer.from(GYM_SEATS, 'base64');
const a = new Int16Array(b.buffer, b.byteOffset, b.length / 2);
const all = [];
for (let i = 0; i < a.length; i += 6) all.push({ x: a[i] / 100, z: a[i + 2] / 100, n: a[i + 3], row: a[i + 4], num: a[i + 5] });

function verifyLevel(title, refSeats, labels, app, secMin, secMax) {
  // nearest within TOL through a 1 m grid
  const grid = new Map();
  const key = (x, z) => `${Math.floor(x)},${Math.floor(z)}`;
  app.forEach((s, i) => { const k = key(s.x, s.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
  const near = (x, z) => {
    let best = -1, bd = TOL;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const i of grid.get(key(x + dx, z + dz)) ?? []) {
        const d = Math.hypot(app[i].x - x, app[i].z - z);
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  };
  // pair closest first, one to one
  const cand = refSeats.map(([x, z], c) => { const i = near(x, z); return i < 0 ? null : { c, i, d: Math.hypot(app[i].x - x, app[i].z - z) }; })
    .filter(Boolean).sort((p, q) => p.d - q.d);
  const usedC = new Set(), usedA = new Set(), pairs = [];
  for (const p of cand) if (!usedC.has(p.c) && !usedA.has(p.i)) { usedC.add(p.c); usedA.add(p.i); pairs.push(p); }

  const per = {};
  for (let n = secMin; n <= secMax; n++) per[n] = { label: labels[n], chart: 0, app: 0, missing: 0, extra: 0, section: 0 };
  refSeats.forEach(([, , n], c) => { per[n].chart++; if (!usedC.has(c)) per[n].missing++; });
  app.forEach((s, i) => { per[s.n].app++; if (!usedA.has(i)) per[s.n].extra++; });
  for (const p of pairs) if (app[p.i].n !== refSeats[p.c][2]) per[refSeats[p.c][2]].section++;

  let bad = 0;
  const tot = { chart: refSeats.length, app: app.length, paired: pairs.length, missing: 0, extra: 0, section: 0 };
  console.log(`KSPO DOME ${title} vs the operator's chart (tolerance ${TOL} m)`);
  console.log('  sec  label  chart    app  missing  extra  section');
  for (const [n, e] of Object.entries(per)) {
    tot.missing += e.missing; tot.extra += e.extra; tot.section += e.section;
    const ok = !e.missing && !e.extra && !e.section;
    if (!ok) bad++;
    console.log(`  ${ok ? '  ' : '✗ '}${String(n).padStart(2)} ${String(e.label).padStart(6)} ${String(e.chart).padStart(6)} ${String(e.app).padStart(6)} ${String(e.missing).padStart(8)} ${String(e.extra).padStart(6)} ${String(e.section).padStart(8)}`);
  }
  console.log(`  total: chart ${tot.chart}, app ${tot.app}, paired ${tot.paired}, missing ${tot.missing}, extra ${tot.extra}, other section ${tot.section}`);
  if (list) {
    refSeats.forEach(([x, z, n], c) => { if (!usedC.has(c)) console.log(`  missing  ${n}  (${x}, ${z})`); });
    app.forEach((s, i) => { if (!usedA.has(i)) console.log(`  extra    ${s.n}-${s.row}-${s.num}  (${s.x}, ${s.z})`); });
  }
  return bad;
}

const bad = verifyLevel('1F (rows 12-22)', ref.seats1f, ref.labels1f, all.filter(s => s.n >= 1 && s.n <= 22), 1, 22)
  + verifyLevel('2F', ref.seats, ref.labels, all.filter(s => s.n >= 23 && s.n <= 52), 23, 52);
console.log(bad ? `FAIL: ${bad} sections differ from the chart` : 'PASS: every 1F (rows 12-22) and 2F seat, aisle and section split as the chart draws them');
process.exit(bad ? 1 : 0);
