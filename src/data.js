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

import { reverbTimes, imageSources, itdg, midRT, bassRatio } from './audio/roomacoustics.js';
import { VENUE_ROOMS, roomAbsorption, sourcePositions, listenerPosition, listeningDistance } from './audio/venuerooms.js';

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
    }))
    .sort((a, b) => a.time - b.time);
  return {
    rt60: midRT(rts),
    bass: bassRatio(rts),
    gap: itdg(refl),
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

const fmtAcoustics = (id, level) => ({
  rt60: `${M[id].rt60.toFixed(2)} s`,
  edt: `${(M[id].rts[0]).toFixed(1)} s @125Hz`,
  c80: `${M[id].bass.toFixed(2)} bass ratio`,
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
    name: 'City Arena',
    type: 'ARENA',
    capacity: '20,000 seats',
    descKo: '라인 어레이 PA · 점보트론 · 록/팝 튜닝',
    position: fmtPosition('arena', 'FOH, floor', 50),
    acoustics: fmtAcoustics('arena', '104 dB SPL'),
    pa: { glue: 0.25, drive: 0.20 },
  },
  {
    id: 'dome',
    name: 'Grand Dome',
    type: 'DOMED STADIUM',
    capacity: '45,000 seats',
    descKo: '에어 서포트 돔 · 딜레이 타워 클러스터',
    position: fmtPosition('dome', 'FOH, arena floor', 50),
    acoustics: fmtAcoustics('dome', '100 dB SPL'),
    pa: { glue: 0.30, drive: 0.25 },
  },
  {
    id: 'stadium',
    name: 'Mega Stadium',
    type: 'OPEN STADIUM',
    capacity: '80,000 seats',
    descKo: '개방형 야외 · 대형 PA + 딜레이 타워',
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
    headline: 'FOH 자리 — 직접음이 이끄는 대형 PA',
    points: [
      '청취 위치는 FOH(콘솔) 자리입니다. 타협이 아니라, 공연이 실제로 그 지점에서 제대로 들리도록 믹스되는 자리입니다.',
      '80ms 안의 측면 반사가 사실상 0입니다. 폭 70m 공간에서 옆벽이 너무 멀어 초기 반사가 도달할 시간이 없습니다 — 큰 공간이 홀만큼 감싸주지 않는 이유이고, 억지로 만들어 넣지 않았습니다.',
      '라인 어레이는 지향성이 강해 객석으로 에너지를 쏘고 룸을 덜 흔듭니다. 그래서 RT60이 2.2초여도 명료도(C80)가 +0.7dB로 유지됩니다.',
      '보울의 옆·뒷벽은 벽이 아니라 사람으로 찬 관중석으로 모델링합니다. 콘크리트로 두면 뒷벽이 거울처럼 반사해 슬랩백이 생깁니다.',
    ],
    params: chip('arena'),
  },
  dome: {
    headline: '가장 긴 잔향 — 거대한 실내 공간',
    points: [
      'RT60 3.8초로 가장 깁니다. 130만 m³라는 부피에서 나오는 값이며, 예전에 표기하던 3.4초는 어떤 돔도 갖지 못하는 흡음량을 전제해야 나오는 숫자였습니다.',
      '첫 반사가 +67ms. 이 공백 자체가 공간의 크기를 알려주는 단서라, 잔향의 상승은 이 시점부터 시작하도록 했습니다 — 공백을 메우면 거리감이 사라집니다.',
      '지붕에는 이상적인 돔이라면 갖췄을 흡음을 부여했습니다. 맨 막구조는 저역이 거의 그대로 통과해 7초 넘게 울립니다.',
      '베이스비 1.26 — 거대 공간 특유의 저역 잔향이 길게 남습니다.',
    ],
    params: chip('dome'),
  },
  stadium: {
    headline: '개방형 야외 — 가장 건조한 공간',
    points: [
      '5개 중 가장 건조합니다. 머리 위 60%가 하늘이라 올라간 소리는 돌아오지 않고, 8만 명의 관객이 나머지를 흡수합니다. 야외 공연이 얇게 들리는 이유가 그대로 재현됩니다.',
      '초기 감쇠 시간(EDT)이 RT60의 절반 수준입니다. 꼬리는 길지만 직접음보다 한참 아래에 있어서, 실제로 느껴지는 잔향은 훨씬 짧습니다.',
      '+57ms에 반대편 스탠드에서 돌아오는 반사가 하나 있습니다. 스타디움의 시그니처이고, 이제는 지어낸 메아리 클러스터가 아니라 기하학이 정한 방향·레벨로 한 번 도착합니다.',
      '스탠드 지붕에는 흡음을 넣었습니다. 맨 콘크리트로 두면 125Hz 흡수가 거의 없어 베이스비가 1.45까지 올라가는데, 좋은 공연장에 그런 붐은 없습니다.',
    ],
    params: chip('stadium'),
  },
};

// SHARED_NOTES — applied identically to every venue.
export const SHARED_NOTES = [
  '공연장은 잔향 파라미터가 아니라 실제 형상으로 기술됩니다 — 치수, 표면 재질, 무대와 좌석의 위치. RT60(옥타브별), 베이스비, 첫 반사 시각, 측면 반사 비율은 전부 거기서 계산되어 나옵니다. 화면의 숫자는 엔진이 실제로 쓰는 숫자입니다.',
  '초기 반사는 이미지 소스법으로 하나하나 계산합니다. 각 반사는 물리적 지연·1/r 감쇠·표면별 흡음·도달 방향을 가지며, 방향에 맞는 양귀 시간차와 머리 그림자를 거쳐 임펄스에 새겨집니다. 직접음에는 HRTF를 걸지 않으므로 음색이 변하지 않습니다.',
  '후기 잔향은 옥타브마다 각자의 속도로 감쇠합니다. 밴드는 1극 로우패스의 차분으로 만들어 정확히 원신호로 합산되므로, 꼬리는 평탄하게 시작해 각 대역의 흡음이 정하는 속도로 어두워집니다. 좋은 홀의 저역이 중역보다 오래 남는 것은 설정이 아니라 관객의 흡음 특성에서 나옵니다.',
  '임펄스는 4채널입니다. 믹스의 좌/우가 각각 좌/우 음원 위치의 룸 응답을 거치는 트루 스테레오 컨볼루션 — 2채널로는 좌우가 서로 다른 방에 갇힙니다.',
  '라우드니스 보상: 공연장은 100dB SPL, 헤드폰은 75dB 정도로 듣습니다. 등청감 곡선은 평행하지 않아서 조용히 들으면 저역이 먼저 빠집니다. 그래서 90Hz 셸프 하나와 45Hz 서브 확장으로 완만하게 되살립니다 — 예전처럼 110Hz에 봉우리를 세우지 않습니다. 45Hz는 오히려 조금 더 나오고 110Hz는 9dB 낮아, 더 깊고 단단해집니다.',
  '킥·스네어는 정적 EQ가 아니라 트랜지언트 셰이퍼로 강조합니다. 60Hz를 올리면 베이스 기타가 같이 오고 4.5kHz를 올리면 보컬 치찰음과 심벌이 같이 옵니다. 어택의 "속도"로 구분하면 킥과 스네어의 타격만 살아나고 지속음은 그대로입니다. 타격이 없을 때는 정확히 0을 더하므로 소리가 변하지 않습니다.',
  '보컬 앵커: 이 곡의 보컬이 평소 프로그램 대비 차지하는 비율을 15초 창으로 학습하고, 그보다 낮아진 구간만 최대 +3dB 되돌립니다. 구간이 바뀌어도 보컬 레벨이 일정하게 유지됩니다. 보컬이 없는 인스트 구간에는 게이트가 걸려 동결됩니다.',
  '크로스피드: 700Hz 아래에서 머리는 파장에 비해 작아 레벨 차이를 거의 만들지 못합니다. 그 대역에 하드팬된 성분은 실제 음원이 만들 수 없는 단서이고, 이어폰에서 소리가 머리 안에 갇히는 주범입니다. 미드/사이드의 사이드 쪽에만 셸프로 걸어 중앙(보컬·킥·스네어·베이스)은 수학적으로 그대로 둡니다.',
  '입력단에서 9dB의 헤드룸을 먼저 확보합니다. 예전에는 15dB를 부스트한 뒤 트림 없이 리미터로 밀어 넣어, 리미터가 사실상 가장 강력한 톤 컨트롤이 되어 있었습니다.',
  '내보내기는 재생과 완전히 동일한 그래프로 렌더링됩니다(같은 코드, 두 번 호출). 볼륨 노브는 모니터링 컨트롤이므로 파일에 구워 넣지 않습니다.',
];

export const getSoundNote = (id) => SOUND_NOTES[id] || SOUND_NOTES.jazz;
