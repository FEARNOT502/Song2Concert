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
import { VENUE_ROOMS, roomAbsorption, sourcePositions, listenerPosition, listeningDistance, DIRECTIVITY, fillArrivals } from './audio/venuerooms.js';

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
    // Delay towers and side hangs, where the venue has them. They carry real
    // early lateral energy, so the spaciousness figure has to see them — see
    // fillArrivals(). The initial time delay gap skips them, because that
    // measures the ROOM.
    .concat(fillArrivals(id).flat())
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
    id: 'club',
    name: 'Club',
    type: 'CLUB',
    capacity: '300 seats',
    descKo: '낮은 천장 · 우드 디퓨저 · 친밀한 거리',
    position: fmtPosition('club', 'Front table', 46),
    acoustics: fmtAcoustics('club', '90 dB SPL'),
    pa: { glue: 0.20, drive: 0.20 },
  },
  {
    id: 'theater',
    name: 'Theater',
    type: 'THEATER',
    capacity: '3,000 seats',
    descKo: '프로시니엄 · 발코니 박스 · 짧고 또렷한 잔향',
    position: fmtPosition('theater', 'Mid stalls', 48),
    acoustics: fmtAcoustics('theater', '96 dB SPL'),
    pa: { glue: 0.15, drive: 0.12 },
  },
  {
    id: 'concerthall',
    name: 'Concert Hall',
    type: 'CONCERT HALL · VINEYARD',
    capacity: '2,000 seats',
    descKo: '빈야드 테라스 · 반사판 · 완전 자연 음향',
    position: fmtPosition('concerthall', 'Terrace block', 52),
    acoustics: fmtAcoustics('concerthall', '86 dB SPL'),
    // No PA at all: nothing to glue, nothing to drive.
    pa: { glue: 0, drive: 0 },
  },
  {
    id: 'arena',
    name: 'Arena',
    type: 'ARENA',
    capacity: '22,500 seats',
    descKo: '라인 어레이 PA · 대형 아레나 · FOH 자리',
    position: fmtPosition('arena', 'FOH, floor', 60),
    acoustics: fmtAcoustics('arena', '104 dB SPL'),
    pa: { glue: 0.25, drive: 0.20 },
  },
  {
    id: 'dome',
    name: 'Dome',
    type: 'DOMED STADIUM',
    capacity: '45,000 (concert)',
    descKo: '에어 서포트 돔 · 124만 m³ · 가장 긴 잔향',
    position: fmtPosition('dome', 'FOH, field', 62),
    acoustics: fmtAcoustics('dome', '100 dB SPL'),
    pa: { glue: 0.30, drive: 0.25 },
  },
  {
    id: 'stadium',
    name: 'Stadium',
    type: 'OPEN STADIUM',
    capacity: '90,000 seats',
    descKo: '관중석만 지붕 · 피치는 개방 · 가장 건조',
    position: fmtPosition('stadium', 'FOH, pitch', 56),
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
  club: {
    headline: '짧고 타이트한 잔향 — 클럽의 친밀함',
    points: [
      '벽·천장의 우드 패널은 전형적인 판 흡음체라 저역을 가장 많이 먹습니다. 그래서 베이스비가 1보다 작게(0.85) 나오고, 작은 클럽 특유의 "따뜻하지만 붕 뜨지 않는" 저역이 됩니다 — 설정값이 아니라 재질에서 나온 결과입니다.',
      '첫 반사가 +6ms. 앞 테이블이라 천장 반사가 거의 곧바로 따라붙습니다.',
      '초기 반사 밀도가 80ms 안에 2,000회/초를 넘습니다. 좁은 방이라 사방의 벽이 가깝고, 그 촘촘함이 밀착감의 정체입니다.',
      '측면 반사 비율 0.14 — 무대가 가까워 직접음이 지배하지만 옆에서 감싸는 성분도 분명히 있습니다.',
    ],
    params: chip('club'),
  },
  theater: {
    headline: '프로시니엄 극장 — 짧고 또렷하게',
    points: [
      '같은 규모의 콘서트홀보다 건조합니다. 두꺼운 업홀스터리, 드레이프, 그리고 저역에서 휘는 경량 골조 마감이 홀의 석조가 남겨두는 저역을 가져갑니다 — 베이스비가 1.01로 거의 평탄합니다.',
      '프로시니엄 아치 뒤의 무대 공간(플라이 타워)은 음향적으로 벽에 뚫린 구멍에 가깝습니다. 무대로 들어간 소리는 상당수가 돌아오지 않습니다.',
      'RT60 1.28초 — 대사와 또렷함을 위해 지어진 방입니다. 잔향이 짧아 리듬이 뭉치지 않습니다.',
      '첫 반사 +16ms, 측면 반사 비율 0.39. 객석이 좁고 발코니 박스가 양옆에 붙어 있어 측면 에너지는 오히려 풍부합니다.',
    ],
    params: chip('theater'),
  },
  concerthall: {
    headline: '빈야드 콘서트홀 — 완전 자연 음향',
    points: [
      '베를린 필하모니나 산토리 홀처럼, 중앙 무대를 둘러싸고 객석이 테라스로 계단을 이룹니다. 이 형식이 음향적으로 통하는 이유는 각 블록이 자기 낮은 벽으로 둘려 있어 **모든 좌석이 몇 미터 옆의 면에서 측면 반사를 받는다**는 점입니다 — 슈박스는 20m 떨어진 옆벽에서, 그것도 1층에서만 받습니다.',
      '첫 반사 +12ms. 무대가 가깝고 테라스 벽이 바로 옆이라 친밀함(intimacy)이 최고 수준입니다.',
      '베이스비 1.20 · RT60 2.02초 · 측면 반사 비율 0.31 — 좋은 콘서트홀의 지표를 모두 만족합니다. PA가 없으므로 버스 컴프레션도 새추레이션도 걸리지 않습니다.',
      '천장에 매달린 반사판(클라우드)과 테라스 앞면이 이 홀에서 가장 확산이 강한 표면입니다. 테라스는 방을 모든 좌석 가까이의 작은 반사면들로 쪼개기 위해 존재합니다.',
    ],
    params: chip('concerthall'),
  },
  arena: {
    headline: '대형 아레나 — FOH 자리',
    points: [
      '가동석을 닫은 22,500석 구성을 모델링합니다(사이타마 슈퍼 아레나 아레나 모드 기준). 닫아도 아레나치고는 대단히 큰 방이고, 믹스하기 까다로운 이유가 대부분 여기 있습니다.',
      '청취 위치는 FOH(콘솔) 자리입니다. 타협이 아니라, 공연이 실제로 그 지점에서 제대로 들리도록 믹스되는 자리입니다.',
      '라인 어레이는 뒤쪽으로 약 20dB를 죽입니다. 그래서 RT60이 2.6초여도 FOH에서는 직접음이 명확히 앞서고, 무대 뒤 구조물이 되받아치지 않습니다 — 대형 공연장 음향이 성립하는 핵심입니다.',
      '건물만 놓고 보면 80ms 안의 측면 "반사"는 여전히 0에 가깝습니다. 폭 110m 공간에서 옆 스탠드는 너무 멀어 초기 반사가 도달할 시간이 없습니다. 그런데 이 규모의 공연에서 옆에서 오는 초기 에너지는 벽이 만드는 게 아닙니다 — 딜레이 타워가 만듭니다.',
      '메인 행 두 개만으로 모델링하고 있었고, 그건 이 규모의 어떤 쇼도 아닙니다. 30~40m를 넘어가면 하나의 행으로 뒷좌석을 커버하면서 앞줄이 견딜 수 있는 레벨을 유지하는 게 불가능해서, 객석 안에 어레이를 추가로 세우고 딜레이를 걸어 무대 쪽으로 상이 남게 만듭니다. FOH에서 그 타워들은 90도 옆에서 10~30ms 뒤에 도착하고, 건물 안에서 가장 감싸는 성분이 바로 이겁니다.',
    ],
    params: chip('arena'),
  },
  dome: {
    headline: '돔 구장 — 124만 m³, 가장 긴 잔향',
    points: [
      '부피 1,240,000 m³는 공표된 수치이고, 일본에서는 부피의 단위로 쓰일 만큼 알려진 값입니다. 스팬 약 201m의 에어 서포트 이중막 지붕 아래 공간입니다.',
      '도쿄 돔이 공연 음향으로 악명 높은 이유를 페널티로 넣지 않았습니다 — 계산에서 나옵니다. 가벼운 막은 저역을 거의 흡수하지 못하고, 124만 m³는 그냥 거대합니다. 결과가 5개 중 가장 긴 잔향(3.6초)과 가장 무거운 베이스비(1.50)입니다.',
      '첫 반사가 +84ms. 이 공백 자체가 공간의 크기를 알려주는 단서라 잔향의 상승은 이 시점부터 시작합니다 — 공백을 메우면 거리감이 사라집니다.',
      '측정해 보면 125Hz 잔향이 6초 가까이 남습니다. "소리가 도는" 그 느낌의 정체입니다. 잔향장 자체를 올리면 이 대역이 그대로 따라 올라오므로, 잔향 센드의 저역 컷도 같이 따라갑니다.',
      '딜레이 링 4개(안쪽 2, 바깥쪽 2)가 서 있습니다. 좌우가 서로 다른 거리·다른 딜레이인 것이 핵심입니다 — 대칭인 한 쌍을 같은 시각에 울리게 했더니 초기 양귀 상관도가 0.06에서 0.75로 뛰었습니다. 두 귀에 거의 같은 신호가 도착하면 그건 넓은 게 아니라 좁은 겁니다.',
    ],
    params: chip('dome'),
  },
  stadium: {
    headline: '개방형 스타디움 — 가장 건조한 공간',
    points: [
      '보울 내부 1,139,100 m³, 90,000석, 그리고 40,000 m²의 지붕. 지붕은 모든 좌석을 덮지만 피치는 일부러 열어 둡니다 — 머리 위 약 63%가 구조물, 37%가 하늘입니다.',
      '그 열린 피치가 5개 중 가장 건조한 이유입니다. 위로 나간 소리는 돌아오지 않고, 9만 명이 나머지를 흡수합니다. 야외 공연이 얇게 들리는 이유가 그대로 재현됩니다.',
      '+112ms에 반대편 스탠드에서 돌아오는 반사가 있습니다. 250m 가까운 거리라 실제로 그만큼 늦게 도착합니다. 스탠드가 사람으로 덮여 있고 스치는 각도의 반사는 산란하므로 조용하지만(-29dB), 분명히 존재하고 그게 스타디움의 소리입니다.',
      '음원 지향성을 넣기 전에는 무대 뒤 구조물이 -4.7dB로 되받아쳐 모든 타격음에 슬랩백이 붙었습니다. 실제 스타디움 공연에 없는 소리이고, 라인 어레이가 뒤를 죽인다는 사실을 빠뜨린 결과였습니다.',
      '딜레이 타워가 이 공연장에서 가장 큽니다. 65m 떨어진 포인트 소스 하나로는 9만 명을 채울 수 없고, 실제로 아무도 그렇게 하지 않습니다. 방이 받는 총 음향 파워가 메인 행만의 2.2배로 잡혀 있고, 그만큼 잔향장도 올라갑니다.',
    ],
    params: chip('stadium'),
  },
};

// SHARED_NOTES — applied identically to every venue.
export const SHARED_NOTES = [
  '공연장은 잔향 파라미터가 아니라 실제 형상으로 기술됩니다 — 치수, 표면 재질, 무대와 좌석의 위치. RT60(옥타브별), 베이스비, 첫 반사 시각, 측면 반사 비율은 전부 거기서 계산되어 나옵니다. 화면의 숫자는 엔진이 실제로 쓰는 숫자입니다.',
  '초기 반사는 이미지 소스법으로 하나하나 계산합니다. 각 반사는 물리적 지연·1/r 감쇠·표면별 흡음·도달 방향을 가지며, 방향에 맞는 양귀 시간차와 머리 그림자를 거쳐 임펄스에 새겨집니다. 직접음에는 HRTF를 걸지 않으므로 음색이 변하지 않습니다.',
  '후기 잔향은 옥타브마다 각자의 속도로 감쇠합니다. 밴드는 1극 로우패스의 차분으로 만들어 정확히 원신호로 합산되므로, 꼬리는 평탄하게 시작해 각 대역의 흡음이 정하는 속도로 어두워집니다. 좋은 홀의 저역이 중역보다 오래 남는 것은 설정이 아니라 관객의 흡음 특성에서 나옵니다.',
  '공연장을 바꿔도 그래프를 다시 짓지 않습니다. 공연장이 정하는 것은 전부 파라미터라 새 노드가 필요 없는데, 예전에는 통째로 재구성하느라 소스가 잠깐 끊기고 잔향 꼬리가 잘려 나가고, 남은 그래프가 완전히 끊기지 않아 워크릿이 계속 돌았습니다 — 전환할 때마다 하나씩 새는 구조였습니다. 임펄스는 두 개의 컨볼버 슬롯을 두고, 새 공간은 빠르게 올라오고 떠나는 공간은 1.2초에 걸쳐 울려 나가도록 교차합니다.',
  '리미터는 스레숄드 아래에서 완전히 투명해야 합니다. 이전에 쓰던 Web Audio DynamicsCompressor는 그렇지 않아서, 스레숄드보다 34dB 낮은 신호에 11.6dB의 게인 리덕션을 걸었습니다 — 타격음마다 전체를 눌렀다가 그 뒤의 잔향으로 풀려서, 킥이 칠 때마다 보컬이 내려가고 룸이 올라왔습니다. 룩어헤드 리미터로 교체해 지금은 스레숄드 아래에서 게인 변화 0.00dB입니다.',
  '잔향 센드는 완성된 믹스에서 뽑습니다. 예전에는 입력단에서 뽑아서, 트랜지언트 강조와 보컬 앵커가 직접음에만 존재하고 잔향에는 전혀 없었습니다 — 주변은 전부 젖어 있는데 그 둘만 말라 있으니 보컬이 밴드와 다른 공간에 있는 것처럼 들렸고, 잔향이 짧고 타이트한 클럽에서 가장 두드러졌습니다. 실제 공연장은 엔지니어가 보낸 것을 그대로 듣습니다.',
  '음원 지향성은 주파수에 따라 달라집니다. 사람 목소리는 250Hz보다 4kHz에서 6dB쯤 더 지향적이고, 라인 어레이는 그보다 훨씬 더합니다. 그래서 잔향장에 들어가는 고역은 직접음보다 적습니다 — 이걸 빼먹으면 프레즌스 대역이 통째로 잔향에 실려 자음 위에 얹히고, 그게 보컬이 묻히는 메커니즘입니다. 대형 리그의 서브는 카디오이드/엔드파이어라 저역도 덜 실립니다.',
  '음원 지향성을 모델링합니다. 라인 어레이는 객석을 향해 쏘고 뒤쪽을 15~25dB 죽입니다 — 이게 3초씩 울리는 방에서도 FOH가 또렷한 이유이고, 무대 뒤 구조물이 슬랩백으로 되받아치지 않는 이유입니다. 어쿠스틱 무대는 반대로 거의 전방위로 퍼지고, 홀은 그 반사를 원합니다.',
  '임펄스는 4채널입니다. 믹스의 좌/우가 각각 좌/우 음원 위치의 룸 응답을 거치는 트루 스테레오 컨볼루션 — 2채널로는 좌우가 서로 다른 방에 갇힙니다.',
  '라우드니스 보상: 공연장은 100dB SPL, 헤드폰은 75dB 정도로 듣습니다. 등청감 곡선은 평행하지 않아서 조용히 들으면 저역이 먼저 빠집니다. 그래서 90Hz 셸프 하나와 45Hz 서브 확장으로 완만하게 되살립니다 — 예전처럼 110Hz에 봉우리를 세우지 않습니다. 45Hz는 오히려 조금 더 나오고 110Hz는 9dB 낮아, 더 깊고 단단해집니다.',
  '킥·스네어는 정적 EQ가 아니라 트랜지언트 셰이퍼로 강조합니다. 60Hz를 올리면 베이스 기타가 같이 오고 4.5kHz를 올리면 보컬 치찰음과 심벌이 같이 옵니다. 어택의 "속도"로 구분하면 킥과 스네어의 타격만 살아나고 지속음은 그대로입니다. 타격이 없을 때는 정확히 0을 더하므로 소리가 변하지 않습니다.',
  '잔향은 방이 뭐라도 되돌려 보내는 순간부터 시작합니다 — 바로 앞 관객에게 산란된 에너지까지 포함해서요. 예전에는 첫 "정반사" 도달 시각부터 시작하게 돼 있었는데, 그건 훨씬 나중의 다른 사건입니다(아레나 44ms, 돔 84ms, 웸블리 112ms). 그래서 모든 타격음의 잔향이 0.1초 동안 아예 없다가 갑자기 부풀어 올랐고, 성긴 반복 패턴에서는 이게 명확히 들립니다 — 128BPM EDM 인트로의 16분음표가 117ms라, 킥마다 잔향이 엇박에 떨어져 딜레이 이펙트처럼 그루브와 싸웠습니다. 공간감은 정반사가 담당하고 그건 기하학이 정한 시각에 그대로 도착하므로, 산란으로 만들어지는 확산 잔향만 제때 시작하도록 고쳤습니다.',
  '저역이 방으로 들어가는 양은 그 방이 실제로 얼마나 울리는지에 맞춥니다. 대형 리그의 서브는 카디오이드/엔드파이어로 조향하는데, 얼마나 세게 조향할지는 건물이 얼마나 붐붐한지에 달려 있습니다 — 그게 그 기법이 존재하는 이유입니다. 예전에는 지향성만으로 정했는데 대형 3곳의 지향성이 거의 같아서, 125Hz 잔향이 6초가 넘는 도쿄 돔이 2.7초인 야외 스타디움과 똑같은 4.6dB만 받고 있었습니다. 지금은 방의 저역 감쇠 시간에 비례합니다(돔 −10dB, 아레나 −7.1, 스타디움 −6.5).',
  '잔향 센드의 저역 셸프는 160Hz입니다. 100Hz였을 때가 첫 시도가 거의 안 먹힌 이유였습니다 — 125Hz 옥타브는 88~177Hz라 붐이 코너보다 위에 있었고, 컷을 1.3dB 늘려도 실측 저역 잔향은 0.2dB밖에 안 움직였습니다. 실제로 울리는 자리로 옮기니 대형 공연장마다 2~3dB를 벌었습니다.',
  '악기 분리를 위해 잔향 센드의 로우미드(320Hz)를 2.5dB 깎습니다. 베이스·기타·피아노·목소리의 몸통이 전부 겹치는 대역이고, 그 대역의 잔향이 믹스를 하나의 워싱으로 뭉치게 합니다. 센드에서만 빼므로 직접음의 양감과 타격감은 그대로입니다.',
  '킥·스네어 강조는 트랜지언트로만 합니다. 어택만 올리고 서스테인은 안 건드리므로 킥이 앞으로 나오되 길어지지는 않습니다 — 저역 EQ 부스트와 정반대이고, 양감과 타격감을 동시에 올리면서 부밍은 줄일 수 있는 이유입니다.',
  '보컬 잔향은 밴드보다 적게 걸립니다. 리드는 중앙에 있고 밴드는 양옆으로 퍼지므로, 잔향 센드의 미드(중앙) 성분에서만 보컬 대역을 깎으면 목소리에서는 룸이 빠지고 기타·건반·심벌은 자기 잔향을 그대로 유지합니다 — 센드 전체를 깎으면 방 자체가 말라버립니다. 측정하면 중앙이 사이드보다 2.3dB 또렷합니다. 이건 건물의 성질이 아니라 믹스 판단이고, 대음량에서 워싱이 가사를 잡아먹기 때문에 라이브 엔지니어가 항상 하는 선택입니다.',
  '보컬 앵커: 이 곡의 보컬이 평소 프로그램 대비 차지하는 비율을 15초 창으로 학습하고, 그보다 낮아진 구간만 최대 +3dB 되돌립니다. 구간이 바뀌어도 보컬 레벨이 일정하게 유지됩니다. 보컬이 없는 인스트 구간에는 게이트가 걸려 동결됩니다.',
  '크로스피드: 700Hz 아래에서 머리는 파장에 비해 작아 레벨 차이를 거의 만들지 못합니다. 그 대역에 하드팬된 성분은 실제 음원이 만들 수 없는 단서이고, 이어폰에서 소리가 머리 안에 갇히는 주범입니다. 미드/사이드의 사이드 쪽에만 셸프로 걸어 중앙(보컬·킥·스네어·베이스)은 수학적으로 그대로 둡니다.',
  '입력단에서 9dB의 헤드룸을 먼저 확보합니다. 예전에는 15dB를 부스트한 뒤 트림 없이 리미터로 밀어 넣어, 리미터가 사실상 가장 강력한 톤 컨트롤이 되어 있었습니다.',
  '대형 공연장의 리그는 메인 행 두 개가 아닙니다. 아레나·돔·스타디움에는 객석 안에 딜레이 링이 서 있고, 각 타워는 수천 석을 담당하며 자기 구역 안에서는 메인과 비슷한 레벨로 웁니다. FOH에서는 90도 옆에서 10~38ms 뒤에 도착하는데, 이게 큰 방에서 초기 측면 에너지의 거의 전부입니다 — 옆 스탠드는 50m 넘게 떨어져 있어 초기에 도달할 수가 없거든요. 대칭으로 한 쌍만 세우면 오히려 좁아집니다(초기 IACC 0.06→0.75). 좌우를 서로 다른 거리·다른 딜레이로 엇갈리게 두는 것이 조건입니다.',
  '잔향장의 세기는 방에 들어가는 총 음향 파워로 정해지는데, 통계식은 음원 하나를 가정합니다. 딜레이 링까지 포함하면 아레나 2.0배, 돔 2.4배, 스타디움 2.2배입니다. 이게 없으면 타워를 넣을수록 오히려 건조하게 들립니다 — 초기 에너지만 늘어나 EDT(초기 감쇠 시간)가 돔 기준 0.60에서 0.40으로 떨어지고, 그건 꼬리보다 마른 소리로 들린다는 뜻입니다.',
  'Dry/Wet 슬라이더의 중앙값은 공연장마다 다릅니다. 예전에는 6개 전부 50이었고, 더 나쁘게는 그 값을 바꿔도 소리가 안 바뀌었습니다 — 트림이 슬라이더와 중앙값의 "차이"로 계산돼서 둘을 같이 옮기면 정확히 상쇄됐거든요. 지금은 공연장별 기준 레벨이 따로 있고 슬라이더는 그 주위 ±12dB입니다.',
  '대형 공연장의 저역 "양감"은 직접음에, 저역 "잔향"은 방에 따로 걸립니다. 서브 어레이의 무게(70Hz 셸프)는 잔향 센드가 이미 분기된 뒤의 드라이 경로에만 얹히므로 방으로는 한 방울도 안 갑니다. 트랜지언트 셰이퍼가 킥의 어택만 올리고 길이는 안 건드리는 것과 같은 원리입니다.',
  '내보내기는 재생과 완전히 동일한 그래프로 렌더링됩니다(같은 코드, 두 번 호출). 볼륨 노브는 모니터링 컨트롤이므로 파일에 구워 넣지 않습니다.',
  '탭을 벗어나면 오디오 컨텍스트를 재우고, 돌아오면 깨웁니다. 예전에는 pagehide에서 엔진을 통째로 파괴했는데, 모바일에서 pagehide는 페이지가 사라진다는 뜻이 아니라 캐시에 들어갔다가 곧 복원된다는 뜻입니다 — 탭 전환이나 파일 선택기마다 실행 중인 그래프 밑에서 컨텍스트가 닫히고 있었습니다. 돌아온 뒤에는 컨텍스트 시계가 실제 시간과 같은 속도로 가는지 확인하고, 어긋나 있으면(출력 장치가 바뀐 경우) 컨텍스트를 재생 위치 그대로 새로 만듭니다.',
];

export const getSoundNote = (id) => SOUND_NOTES[id] || SOUND_NOTES.jazz;
