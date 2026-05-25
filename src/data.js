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
    position: { label: 'Front table', distance: '4 m', wet: 30, firstReflection: '+12 ms' },
    acoustics: { rt60: '0.9 s', edt: '0.7 s', c80: '+6.0 dB', warmth: 'warm', level: '90 dB SPL' },
    // intimate, woody: short tail, tight bass, fast HF roll-off; mostly frontal
    ir: { rt60: 0.9, predelay: 0.012, lfDamp: 0.45, hfDamp: 0.78, color: 0.6, density: 0.85, spread: 0.5, lateral: 0.25 },
    dryWidth: 1.0, // acoustic, close — full natural stereo
  },
  {
    id: 'hall',
    name: 'Symphony Hall',
    type: 'CONCERT HALL',
    capacity: '3,000 seats',
    city: 'Amsterdam',
    descKo: '슈박스 · 코퍼드 천장 · 자연 음향',
    position: { label: 'Mid stalls', distance: '20 m', wet: 46, firstReflection: '+28 ms' },
    acoustics: { rt60: '2.0 s', edt: '1.8 s', c80: '+2.4 dB', warmth: '+3.0 dB', level: '84 dB SPL' },
    // acoustic hall: longer lush mid tail, bass fuller than a PA room, wide;
    // STRONG lateral early reflections → the hall's signature side-envelopment
    ir: { rt60: 2.0, predelay: 0.028, lfDamp: 0.32, hfDamp: 0.6, color: 0.5, density: 0.92, spread: 0.8, lateral: 0.95 },
    dryWidth: 1.0, // natural acoustic hall — full stereo
  },
  {
    id: 'arena',
    name: 'City Arena',
    type: 'ARENA',
    capacity: '20,000 seats',
    city: 'London',
    descKo: '라인 어레이 PA · 점보트론 · 록/팝 튜닝',
    position: { label: 'Floor, mid', distance: '45 m', wet: 48, firstReflection: '+60 ms' },
    acoustics: { rt60: '2.4 s', edt: '1.9 s', c80: '−0.2 dB', warmth: 'tight LF', level: '104 dB SPL' },
    // PA-driven: mid space but DEEP LF damping so bass stays punchy not boomy
    ir: { rt60: 2.4, predelay: 0.04, lfDamp: 0.62, hfDamp: 0.72, color: 0.44, density: 0.7, spread: 0.88, lateral: 0.5, slap: true },
    dryWidth: 0.85, // slight PA narrowing — keep most stereo separation for clarity
  },
  {
    id: 'dome',
    name: 'Grand Dome',
    type: 'DOMED STADIUM',
    capacity: '45,000 seats',
    city: 'Bunkyo · Tokyo',
    descKo: '에어 서포트 돔 · 딜레이 타워 클러스터',
    position: { label: 'Arena, mid', distance: '70 m', wet: 56, firstReflection: '+95 ms' },
    acoustics: { rt60: '3.4 s', edt: '2.6 s', c80: '−2.4 dB', warmth: 'cavernous', level: '100 dB SPL' },
    // huge, washy mids; strong LF + HF damping; delay-tower slap cluster
    ir: { rt60: 3.4, predelay: 0.055, lfDamp: 0.66, hfDamp: 0.78, color: 0.38, density: 0.62, spread: 0.92, lateral: 0.6, slap: true },
    dryWidth: 0.82, // gentle narrowing — preserve instrument separation
  },
  {
    id: 'stadium',
    name: 'Mega Stadium',
    type: 'OPEN STADIUM',
    capacity: '80,000 seats',
    city: 'Seoul',
    descKo: '개방형 야외 · 대형 PA + 딜레이 타워',
    position: { label: 'Lower bowl', distance: '90 m', wet: 54, firstReflection: '+110 ms' },
    acoustics: { rt60: '3.0 s', edt: '2.2 s', c80: '−3.0 dB', warmth: 'open-air PA', level: '105 dB SPL' },
    // open-air: thinner diffuse field, very tight bass (no walls), long PA delays
    ir: { rt60: 3.0, predelay: 0.06, lfDamp: 0.72, hfDamp: 0.82, color: 0.42, density: 0.5, spread: 0.96, lateral: 0.55, slap: true },
    dryWidth: 0.8, // gentle narrowing — keep the kit/instruments distinct
  },
];

export const findVenue = (id) => VENUES.find((v) => v.id === id) || VENUES[0];

// SOUND_NOTES — per-venue explanation of how the convolution reverb is tuned,
// surfaced by the "?" help popup. Each entry maps the venue's `ir` params
// (audio/impulse.js) + engine processing (audio/engine.js) to plain language.
// `points` are the bullet lines; `params` is the raw tuning shown as a chip row.
export const SOUND_NOTES = {
  jazz: {
    headline: '짧고 따뜻한 잔향 — 클럽의 친밀함',
    points: [
      'RT60 0.9초의 아주 짧은 꼬리. 낮은 천장·우드 디퓨저의 흡음을 모사해 잔향이 빠르게 사라집니다.',
      '프리딜레이 +12ms — 앞 테이블 청취 위치라 첫 반사음이 거의 즉시 도착합니다.',
      '저역 감쇠(lfDamp 0.45)는 중간 정도, 고역(hfDamp 0.78)은 빠르게 굴려 어쿠스틱 악기의 따뜻함을 살립니다.',
      '밀도 0.85로 초기 반사가 촘촘해 작은 공간 특유의 밀착감을 줍니다.',
    ],
    params: 'RT60 0.9s · PreDelay +12ms · lfDamp 0.45 · hfDamp 0.78 · density 0.85',
  },
  hall: {
    headline: '길고 풍성한 중역 — 자연 음향 홀',
    points: [
      'RT60 2.0초의 길고 매끄러운 꼬리. 슈박스 콘서트홀의 자연 잔향을 재현합니다.',
      '프리딜레이 +28ms — 메인플로어 중앙이라 무대에서 소리가 도달하는 시간이 깁니다.',
      '저역 감쇠가 약해(lfDamp 0.32) PA 룸보다 베이스가 풍성하고, 스테레오 확산(spread 0.8)이 넓습니다.',
      '측면 초기반사를 양귀 시간차(~0.5ms)로 배치해(lateral 0.95) 소리가 좌우 측면에서 감싸오는 콘서트홀 특유의 포위감(envelopment)을 만듭니다.',
    ],
    params: 'RT60 2.0s · PreDelay +28ms · lfDamp 0.32 · spread 0.8 · lateral 0.95',
  },
  arena: {
    headline: 'PA 주도 — 타이트한 베이스 + 넓은 공간',
    points: [
      'RT60 2.4초지만 저역 감쇠를 깊게(lfDamp 0.62) 걸어 베이스가 부밍하지 않고 펀치를 유지합니다.',
      '프리딜레이 +60ms — 플로어 중앙. 라인 어레이 PA가 만드는 첫 반사 지연을 반영합니다.',
      '딜레이 타워는 실제 공연처럼 시간 정렬됐다고 보고, 개별 메아리(슬랩백) 대신 확산 반사 클러스터로 큰 공간의 양감만 더합니다.',
      '대형 PA의 모노 특성을 직접음 폭을 살짝만 좁혀(dryWidth 0.85) 반영하되, 악기 분리감(또렷함)은 유지하고 공간감은 넓은 측면 잔향이 담당합니다.',
    ],
    params: 'RT60 2.4s · PreDelay +60ms · lfDamp 0.62 · dryWidth 0.85 · 확산 타워',
  },
  dome: {
    headline: '거대하고 동굴 같은 잔향',
    points: [
      'RT60 3.4초 — 가장 긴 꼬리. 에어 서포트 돔의 광대한 내부 반사를 모사합니다.',
      '프리딜레이 +95ms — 메인 스탠드 중앙이라 첫 반사음이 한참 뒤에 도착합니다.',
      '저·고역을 모두 강하게 감쇠(lfDamp 0.66 / hfDamp 0.78)해 중역이 워싱되며 동굴 같은 색을 냅니다.',
      '딜레이 타워는 시간 정렬됐다고 보고 개별 메아리 대신 확산 반사로 거대 공간의 양감을 채우며, 직접음 폭은 악기 분리감을 위해 살짝만 좁힙니다(dryWidth 0.82).',
    ],
    params: 'RT60 3.4s · PreDelay +95ms · lfDamp 0.66 · hfDamp 0.78 · dryWidth 0.82',
  },
  stadium: {
    headline: '개방형 야외 — 얇은 확산 + 매우 타이트한 베이스',
    points: [
      'RT60 3.0초의 긴 꼬리지만 벽이 없어 확산이 얇습니다(density 0.5).',
      '프리딜레이 +110ms — 필드 중앙. 대형 PA + 딜레이 타워의 긴 지연을 반영합니다.',
      '저역 감쇠가 가장 강해(lfDamp 0.72) 벽 반사가 없는 야외처럼 베이스가 매우 타이트합니다.',
      '잔향의 스테레오 확산은 0.96으로 가장 넓게, 직접음은 악기 분리감을 위해 살짝만 좁힙니다(dryWidth 0.8). 딜레이 타워는 메아리 대신 확산 반사로 처리합니다.',
    ],
    params: 'RT60 3.0s · PreDelay +110ms · lfDamp 0.72 · spread 0.96 · dryWidth 0.8',
  },
};

// SHARED_NOTES — applied identically to every venue (engine.js graph).
export const SHARED_NOTES = [
  '대형 PA의 서브우퍼 양감을 모사해, 입력단 로우셸프(~120Hz, +7dB) + 킥 펀치 피크(~60Hz, +3.5dB) + 베이스 바디(~110Hz, +5dB)로 킥·베이스 바디를 직접음에 묵직하게 실어 줍니다 — 꼬리는 로우컷+머드컷+lfDamp로 타이트하게 유지.',
  '초기 반사를 촘촘하고 불규칙하게 배치해 스네어 같은 타격음의 잔향이 플러터(메아리)로 어색하게 울리지 않고 매끄럽게 퍼지도록 했습니다.',
  '웻 경로 EQ: 로우컷(~170Hz)으로 킥·베이스 바디를 직접음에 몰아 또렷하게 + 머드 컷(~300Hz) · 보컬/스네어 컷(~3.6kHz) · 에어 컷(6kHz)으로 잔향이 리듬 섹션을 덮지 않게 합니다.',
  '등전력 크로스페이더로 웻/드라이를 섞고, 마지막 단 리미터가 어떤 설정에서도 클리핑을 막습니다.',
  '임펄스 응답은 공연장 음향 파라미터로부터 실시간 합성됩니다(측정 IR로 교체 가능).',
];

export const getSoundNote = (id) => SOUND_NOTES[id] || SOUND_NOTES.jazz;
