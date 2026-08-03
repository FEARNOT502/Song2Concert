// data.js — venues, as presented to the UI.
//
// The acoustic figures shown here are DERIVED from the room model
// (audio/venuerooms.js + audio/roomacoustics.js), not typed in. They used to be
// typed in, and were therefore decorative: nothing computed them, nothing
// enforced them, and one of them — a 3.4 s reverberation time for a dome — was
// not physically attainable at all. Now the number on screen is the number the
// engine is using.
//
// Each venue keeps only what the room model cannot know: its name, how it looks,
// and its `pa` block, which is the SYSTEM rather than the room:
//   glue  — 0..1 live mix-bus compression depth
//   drive — tanh saturation, the harmonic density of a large rig working hard
// Both are far lighter than they were. The source is already a finished master
// that has been through a mastering engineer's bus compressor, and a second
// helping on top of that is what congestion sounds like.

import { reverbTimes, imageSources, itdg, midRT, bassRatio, lateralFraction } from './audio/roomacoustics.js';
import { VENUE_ROOMS, roomAbsorption, sourcePositions, listenerPosition, listeningDistance, DIRECTIVITY } from './audio/venuerooms.js';

// Measure a venue from its room model, for display.
function derive(id) {
  const room = VENUE_ROOMS[id];
  const rts = reverbTimes(roomAbsorption(id));
  const refl = sourcePositions(id)
    .flatMap((src) => imageSources({
      room: { dims: room.dims, surfaces: room.surfaces },
      source: src,
      listener: listenerPosition(id),
      maxOrder: 4,
      maxTime: 0.15,
      directivity: DIRECTIVITY[id] ?? 0,
    }))
    .sort((a, b) => a.time - b.time);
  return {
    rt60: midRT(rts),
    bass: bassRatio(rts),
    gap: itdg(refl),
    lf: lateralFraction(refl),
    distance: listeningDistance(id),
    rts,
  };
}

const fmtPosition = (id, label, wet) => ({
  label,
  wet,
  distance: `${M[id].distance.toFixed(0)} m`,
  // The real initial time delay gap for this seat, straight out of the geometry.
  firstReflection: `+${(M[id].gap * 1000).toFixed(0)} ms`,
});

// Only quantities the room model computes exactly and cheaply are shown. A
// predicted clarity figure was tried and dropped: approximating it well enough
// to be worth displaying meant reimplementing the synthesiser's own build-up,
// and it still read about 4 dB optimistic. Clarity is measured properly by
// scripts/verify-ir.mjs, against the response actually generated.
const fmtAcoustics = (id, level) => ({
  rt60: `${M[id].rt60.toFixed(2)} s`,
  'rt60 @125Hz': `${M[id].rts[0].toFixed(2)} s`,
  'bass ratio': M[id].bass.toFixed(2),
  // Share of early energy arriving from the sides — what makes a room feel like
  // it wraps around you. The single figure that most separates a great hall from
  // a large one.
  spaciousness: M[id].lf.toFixed(2),
  warmth: M[id].bass >= 1.1 ? 'warm' : M[id].bass >= 0.95 ? 'neutral' : 'tight',
  level,
});

const M = Object.fromEntries(Object.keys(VENUE_ROOMS).map((id) => [id, derive(id)]));

export const VENUES = [
  {
    id: 'jazz',
    name: 'Blue Note',
    type: 'JAZZ CLUB',
    capacity: '300 seats',
    descKo: '낮은 천장 · 우드 디퓨저 · 친밀한 거리',
    position: fmtPosition('jazz', 'Front table', 50),
    acoustics: fmtAcoustics('jazz', '90 dB SPL'),
    // A small wood-lined club: gentle console glue, a touch of system drive.
    pa: { glue: 0.20, drive: 0.20 },
  },
  {
    id: 'hall',
    name: 'Symphony Hall',
    type: 'CONCERT HALL',
    capacity: '3,000 seats',
    descKo: '슈박스 · 코퍼드 천장 · 자연 음향',
    position: fmtPosition('hall', 'Mid stalls', 50),
    acoustics: fmtAcoustics('hall', '84 dB SPL'),
    // No PA at all: nothing to glue, nothing to drive.
    pa: { glue: 0, drive: 0 },
  },
  {
    id: 'arena',
    name: 'Saitama Super Arena',
    type: 'ARENA · 아레나 모드',
    capacity: '22,500 seats',
    descKo: '가동석 폐쇄 · 라인 어레이 PA · 대형 아레나',
    position: fmtPosition('arena', 'FOH, floor', 50),
    acoustics: fmtAcoustics('arena', '104 dB SPL'),
    pa: { glue: 0.25, drive: 0.20 },
  },
  {
    id: 'dome',
    name: 'Tokyo Dome',
    type: 'DOMED STADIUM',
    capacity: '45,000 (concert)',
    descKo: '에어 서포트 돔 · 124만 m³ · 가장 긴 잔향',
    position: fmtPosition('dome', 'FOH, field', 50),
    acoustics: fmtAcoustics('dome', '100 dB SPL'),
    pa: { glue: 0.30, drive: 0.25 },
  },
  {
    id: 'stadium',
    name: 'Wembley Stadium',
    type: 'OPEN STADIUM',
    capacity: '90,000 seats',
    descKo: '관중석만 지붕 · 피치는 개방 · 가장 건조',
    position: fmtPosition('stadium', 'FOH, pitch', 50),
    acoustics: fmtAcoustics('stadium', '105 dB SPL'),
    pa: { glue: 0.30, drive: 0.25 },
  },
];

export const findVenue = (id) => VENUES.find((v) => v.id === id) || VENUES[0];

// SOUND_NOTES — per-venue explanation, surfaced by the "?" help popup.
// `points` are the bullet lines; `params` is a chip row of the venue's measured
// figures, which are read from the room model rather than written down.
const chip = (id) => `RT60 ${M[id].rt60.toFixed(2)}s · 베이스비 ${M[id].bass.toFixed(2)} · 첫 반사 +${(M[id].gap * 1000).toFixed(0)}ms · 거리 ${M[id].distance.toFixed(0)}m`;

export const SOUND_NOTES = {
  jazz: {
    headline: '짧고 타이트한 잔향 — 클럽의 친밀함',
    points: [
      '벽·천장의 우드 패널은 전형적인 판 흡음체라 저역을 가장 많이 먹습니다. 그래서 베이스비가 1보다 작게(0.85) 나오고, 작은 클럽 특유의 "따뜻하지만 붕 뜨지 않는" 저역이 됩니다 — 설정값이 아니라 재질에서 나온 결과입니다.',
      '첫 반사가 +6ms. 앞 테이블이라 천장 반사가 거의 곧바로 따라붙습니다.',
      '초기 반사 밀도가 80ms 안에 2,000회/초를 넘습니다. 좁은 방이라 사방의 벽이 가깝고, 그 촘촘함이 밀착감의 정체입니다.',
      '측면 반사 비율 0.17 — 무대가 가까워 직접음이 지배하지만 옆에서 감싸는 성분도 분명히 있습니다.',
    ],
    params: chip('jazz'),
  },
  hall: {
    headline: '길고 따뜻한 잔향 — 자연 음향 홀',
    points: [
      '베이스비 1.20. 좋은 콘서트홀의 결정적 지표로, 저역이 중역보다 더 오래 울린다는 뜻입니다. 흡음의 대부분을 담당하는 관객이 125Hz에서는 1kHz의 절반도 흡수하지 못하기 때문에 물리적으로 그렇게 됩니다.',
      '첫 반사가 +16ms — 좋은 좌석의 조건입니다. 직접음을 깨끗하게 먼저 듣고 나서 공간이 열립니다.',
      '측면 반사 비율 0.31로 5개 공연장 중 가장 높습니다. 소리가 좌우 측면에서 감싸오는 포위감(envelopment)은 거의 전적으로 이 측면 반사에서 나옵니다.',
      '각 반사음은 도달 방향에 맞는 양귀 시간차와 머리 그림자를 거쳐 임펄스에 새겨집니다. 직접음은 건드리지 않으므로 음색은 그대로입니다.',
    ],
    params: chip('hall'),
  },
  arena: {
    headline: '사이타마 슈퍼 아레나 (아레나 모드) — FOH 자리',
    points: [
      '15,000톤 가동석을 밀어 넣어 공간을 닫은 아레나 모드(약 22,500석)를 모델링합니다. 닫아도 아레나치고는 대단히 큰 방이고, 믹스하기 까다로운 공연장으로 꼽히는 이유가 대부분 여기 있습니다.',
      '청취 위치는 FOH(콘솔) 자리입니다. 타협이 아니라, 공연이 실제로 그 지점에서 제대로 들리도록 믹스되는 자리입니다.',
      '라인 어레이는 뒤쪽으로 약 20dB를 죽입니다. 그래서 RT60이 2.6초여도 FOH에서는 직접음이 명확히 앞서고, 무대 뒤 구조물이 되받아치지 않습니다 — 대형 공연장 음향이 성립하는 핵심입니다.',
      '80ms 안의 측면 반사가 사실상 0입니다. 폭 110m 공간에서 옆 스탠드가 너무 멀어 초기 반사가 도달할 시간이 없습니다. 큰 공간이 홀만큼 감싸주지 않는 이유이고, 억지로 만들어 넣지 않았습니다.',
    ],
    params: chip('arena'),
  },
  dome: {
    headline: '도쿄 돔 — 124만 m³, 가장 긴 잔향',
    points: [
      '부피 1,240,000 m³는 공표된 수치이고, 일본에서는 부피의 단위로 쓰일 만큼 알려진 값입니다. 스팬 약 201m의 에어 서포트 이중막 지붕 아래 공간입니다.',
      '도쿄 돔이 공연 음향으로 악명 높은 이유를 페널티로 넣지 않았습니다 — 계산에서 나옵니다. 가벼운 막은 저역을 거의 흡수하지 못하고, 124만 m³는 그냥 거대합니다. 결과가 5개 중 가장 긴 잔향(3.6초)과 가장 무거운 베이스비(1.50)입니다.',
      '첫 반사가 +84ms. 이 공백 자체가 공간의 크기를 알려주는 단서라 잔향의 상승은 이 시점부터 시작합니다 — 공백을 메우면 거리감이 사라집니다.',
      '측정해 보면 125Hz 잔향이 6초 가까이 남습니다. "소리가 도는" 그 느낌의 정체입니다.',
    ],
    params: chip('dome'),
  },
  stadium: {
    headline: '웸블리 스타디움 — 5개 중 가장 건조',
    points: [
      '보울 내부 1,139,100 m³, 90,000석, 그리고 40,000 m²의 지붕. 지붕은 모든 좌석을 덮지만 피치는 일부러 열어 둡니다 — 머리 위 약 63%가 구조물, 37%가 하늘입니다.',
      '그 열린 피치가 5개 중 가장 건조한 이유입니다. 위로 나간 소리는 돌아오지 않고, 9만 명이 나머지를 흡수합니다. 야외 공연이 얇게 들리는 이유가 그대로 재현됩니다.',
      '+112ms에 반대편 스탠드에서 돌아오는 반사가 있습니다. 250m 가까운 거리라 실제로 그만큼 늦게 도착합니다. 스탠드가 사람으로 덮여 있고 스치는 각도의 반사는 산란하므로 조용하지만(-29dB), 분명히 존재하고 그게 스타디움의 소리입니다.',
      '음원 지향성을 넣기 전에는 무대 뒤 구조물이 -4.7dB로 되받아쳐 모든 타격음에 슬랩백이 붙었습니다. 실제 스타디움 공연에 없는 소리이고, 라인 어레이가 뒤를 죽인다는 사실을 빠뜨린 결과였습니다.',
    ],
    params: chip('stadium'),
  },
};

// SHARED_NOTES — applied identically to every venue.
export const SHARED_NOTES = [
  '공연장은 잔향 파라미터가 아니라 실제 형상으로 기술됩니다 — 치수, 표면 재질, 무대와 좌석의 위치. RT60(옥타브별), 베이스비, 첫 반사 시각, 측면 반사 비율은 전부 거기서 계산되어 나옵니다. 화면의 숫자는 엔진이 실제로 쓰는 숫자입니다.',
  '초기 반사는 이미지 소스법으로 하나하나 계산합니다. 각 반사는 물리적 지연·1/r 감쇠·표면별 흡음·도달 방향을 가지며, 방향에 맞는 양귀 시간차와 머리 그림자를 거쳐 임펄스에 새겨집니다. 직접음에는 HRTF를 걸지 않으므로 음색이 변하지 않습니다.',
  '후기 잔향은 옥타브마다 각자의 속도로 감쇠합니다. 밴드는 1극 로우패스의 차분으로 만들어 정확히 원신호로 합산되므로, 꼬리는 평탄하게 시작해 각 대역의 흡음이 정하는 속도로 어두워집니다. 좋은 홀의 저역이 중역보다 오래 남는 것은 설정이 아니라 관객의 흡음 특성에서 나옵니다.',
  '리미터는 스레숄드 아래에서 완전히 투명해야 합니다. 이전에 쓰던 Web Audio DynamicsCompressor는 그렇지 않아서, 스레숄드보다 34dB 낮은 신호에 11.6dB의 게인 리덕션을 걸었습니다 — 타격음마다 전체를 눌렀다가 그 뒤의 잔향으로 풀려서, 킥이 칠 때마다 보컬이 내려가고 룸이 올라왔습니다. 룩어헤드 리미터로 교체해 지금은 스레숄드 아래에서 게인 변화 0.00dB입니다.',
  '잔향 센드는 완성된 믹스에서 뽑습니다. 예전에는 입력단에서 뽑아서, 트랜지언트 강조와 보컬 앵커가 직접음에만 존재하고 잔향에는 전혀 없었습니다 — 주변은 전부 젖어 있는데 그 둘만 말라 있으니 보컬이 밴드와 다른 공간에 있는 것처럼 들렸고, 잔향이 짧고 타이트한 클럽에서 가장 두드러졌습니다. 실제 공연장은 엔지니어가 보낸 것을 그대로 듣습니다.',
  '음원 지향성은 주파수에 따라 달라집니다. 사람 목소리는 250Hz보다 4kHz에서 6dB쯤 더 지향적이고, 라인 어레이는 그보다 훨씬 더합니다. 그래서 잔향장에 들어가는 고역은 직접음보다 적습니다 — 이걸 빼먹으면 프레즌스 대역이 통째로 잔향에 실려 자음 위에 얹히고, 그게 보컬이 묻히는 메커니즘입니다. 대형 리그의 서브는 카디오이드/엔드파이어라 저역도 덜 실립니다.',
  '음원 지향성을 모델링합니다. 라인 어레이는 객석을 향해 쏘고 뒤쪽을 15~25dB 죽입니다 — 이게 3초씩 울리는 방에서도 FOH가 또렷한 이유이고, 무대 뒤 구조물이 슬랩백으로 되받아치지 않는 이유입니다. 어쿠스틱 무대는 반대로 거의 전방위로 퍼지고, 홀은 그 반사를 원합니다.',
  '임펄스는 4채널입니다. 믹스의 좌/우가 각각 좌/우 음원 위치의 룸 응답을 거치는 트루 스테레오 컨볼루션 — 2채널로는 좌우가 서로 다른 방에 갇힙니다.',
  '라우드니스 보상: 공연장은 100dB SPL, 헤드폰은 75dB 정도로 듣습니다. 등청감 곡선은 평행하지 않아서 조용히 들으면 저역이 먼저 빠집니다. 그래서 90Hz 셸프 하나와 45Hz 서브 확장으로 완만하게 되살립니다 — 예전처럼 110Hz에 봉우리를 세우지 않습니다. 45Hz는 오히려 조금 더 나오고 110Hz는 9dB 낮아, 더 깊고 단단해집니다.',
  '킥·스네어는 정적 EQ가 아니라 트랜지언트 셰이퍼로 강조합니다. 60Hz를 올리면 베이스 기타가 같이 오고 4.5kHz를 올리면 보컬 치찰음과 심벌이 같이 옵니다. 어택의 "속도"로 구분하면 킥과 스네어의 타격만 살아나고 지속음은 그대로입니다. 타격이 없을 때는 정확히 0을 더하므로 소리가 변하지 않습니다.',
  '보컬 앵커: 이 곡의 보컬이 평소 프로그램 대비 차지하는 비율을 15초 창으로 학습하고, 그보다 낮아진 구간만 최대 +3dB 되돌립니다. 구간이 바뀌어도 보컬 레벨이 일정하게 유지됩니다. 보컬이 없는 인스트 구간에는 게이트가 걸려 동결됩니다.',
  '크로스피드: 700Hz 아래에서 머리는 파장에 비해 작아 레벨 차이를 거의 만들지 못합니다. 그 대역에 하드팬된 성분은 실제 음원이 만들 수 없는 단서이고, 이어폰에서 소리가 머리 안에 갇히는 주범입니다. 미드/사이드의 사이드 쪽에만 셸프로 걸어 중앙(보컬·킥·스네어·베이스)은 수학적으로 그대로 둡니다.',
  '입력단에서 9dB의 헤드룸을 먼저 확보합니다. 예전에는 15dB를 부스트한 뒤 트림 없이 리미터로 밀어 넣어, 리미터가 사실상 가장 강력한 톤 컨트롤이 되어 있었습니다.',
  '내보내기는 재생과 완전히 동일한 그래프로 렌더링됩니다(같은 코드, 두 번 호출). 볼륨 노브는 모니터링 컨트롤이므로 파일에 구워 넣지 않습니다.',
];

export const getSoundNote = (id) => SOUND_NOTES[id] || SOUND_NOTES.jazz;
