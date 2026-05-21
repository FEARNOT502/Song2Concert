// data.js — venues. Each carries an `ir` block describing how to synthesize its
// impulse response (see audio/impulse.js). Acoustic feel ≈ visual feel.
// (Upload-only — there is no demo file library, and no per-seat selection: each
// venue models one representative "in the crowd" listening position, the way a
// distributed PA presents nearly the same mix everywhere in the house.)
//
// Sound design follows live-sound practice: keep LOW-FREQUENCY reverb short so
// bass stays tight/punchy (the dry path keeps the punch), let the mid carry the
// "space", and roll the highs off fastest — that's what real concert PA + room
// treatment do. See impulse.js for the lf/hf damping model.

export const VENUES = [
  {
    id: 'jazz',
    name: 'Blue Note',
    type: 'JAZZ CLUB',
    capacity: '300 seats',
    city: 'Roppongi · Tokyo',
    descKo: '낮은 천장 · 우드 디퓨저 · 친밀한 거리',
    // single listening position
    position: { label: 'Front table', distance: '4 m', wet: 26, firstReflection: '+12 ms' },
    acoustics: { rt60: '0.9 s', edt: '0.7 s', c80: '+6.0 dB', warmth: 'warm', level: '90 dB SPL' },
    // intimate, woody: short tail, tight bass, fast HF roll-off
    ir: { rt60: 0.9, predelay: 0.012, lfDamp: 0.45, hfDamp: 0.78, color: 0.6, density: 0.85, spread: 0.45 },
  },
  {
    id: 'hall',
    name: 'Symphony Hall',
    type: 'CONCERT HALL',
    capacity: '3,000 seats',
    city: 'Amsterdam',
    descKo: '슈박스 · 코퍼드 천장 · 자연 음향',
    position: { label: 'Mid stalls', distance: '20 m', wet: 40, firstReflection: '+28 ms' },
    acoustics: { rt60: '2.0 s', edt: '1.8 s', c80: '+2.4 dB', warmth: '+3.0 dB', level: '84 dB SPL' },
    // acoustic hall: longer lush mid tail, bass fuller than a PA room, wide
    ir: { rt60: 2.0, predelay: 0.028, lfDamp: 0.32, hfDamp: 0.6, color: 0.5, density: 0.92, spread: 0.72 },
  },
  {
    id: 'arena',
    name: 'City Arena',
    type: 'ARENA',
    capacity: '20,000 seats',
    city: 'London',
    descKo: '라인 어레이 PA · 점보트론 · 록/팝 튜닝',
    position: { label: 'Floor, mid', distance: '45 m', wet: 42, firstReflection: '+60 ms' },
    acoustics: { rt60: '2.4 s', edt: '1.9 s', c80: '−0.2 dB', warmth: 'tight LF', level: '104 dB SPL' },
    // PA-driven: mid space but DEEP LF damping so bass stays punchy not boomy
    ir: { rt60: 2.4, predelay: 0.04, lfDamp: 0.62, hfDamp: 0.72, color: 0.44, density: 0.7, spread: 0.8, slap: true },
  },
  {
    id: 'dome',
    name: 'Grand Dome',
    type: 'DOMED STADIUM',
    capacity: '45,000 seats',
    city: 'Bunkyo · Tokyo',
    descKo: '에어 서포트 돔 · 딜레이 타워 클러스터',
    position: { label: 'Arena, mid', distance: '70 m', wet: 50, firstReflection: '+95 ms' },
    acoustics: { rt60: '3.4 s', edt: '2.6 s', c80: '−2.4 dB', warmth: 'cavernous', level: '100 dB SPL' },
    // huge, washy mids; strong LF + HF damping; delay-tower slap cluster
    ir: { rt60: 3.4, predelay: 0.055, lfDamp: 0.66, hfDamp: 0.78, color: 0.38, density: 0.62, spread: 0.85, slap: true },
  },
  {
    id: 'stadium',
    name: 'Mega Stadium',
    type: 'OPEN STADIUM',
    capacity: '80,000 seats',
    city: 'Seoul',
    descKo: '개방형 야외 · 대형 PA + 딜레이 타워',
    position: { label: 'Lower bowl', distance: '90 m', wet: 48, firstReflection: '+110 ms' },
    acoustics: { rt60: '3.0 s', edt: '2.2 s', c80: '−3.0 dB', warmth: 'open-air PA', level: '105 dB SPL' },
    // open-air: thinner diffuse field, very tight bass (no walls), long PA delays
    ir: { rt60: 3.0, predelay: 0.06, lfDamp: 0.72, hfDamp: 0.82, color: 0.42, density: 0.5, spread: 0.9, slap: true },
  },
];

export const findVenue = (id) => VENUES.find((v) => v.id === id) || VENUES[0];
