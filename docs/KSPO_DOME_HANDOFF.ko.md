# KSPO DOME 작업 핸드오프

다른 LLM이나 다른 세션이 바로 이어받을 수 있게 유지하는 문서다. 작업할 때마다 갱신한다.

- 마지막 갱신: 2026-11-23 02:25 KST
- 브랜치: `claude/beautiful-hopper-35idcn` (`origin/main`과 같은 `454a902`에서 시작)
- 전체 계획과 결정 기록: [KSPO_DOME_REMODEL_PLAN.ko.md](KSPO_DOME_REMODEL_PLAN.ko.md)의 7장. 자료 목록: [references/GYMNASTIC_ARENA_REFERENCES.ko.md](references/GYMNASTIC_ARENA_REFERENCES.ko.md)

## 1. 지금 상태

### 2026-11-23 층간 통로와 360 FOH 보수

- 로컬 브랜치 `codex/kspo-concourse-connection`은 `63d5f3af3262ee9eeabd06043723afb6bbffe5c6`에서 시작했다.
- `gymnastic-bowl.js`에서 1F 교차 통로와 2F 첫 단 사이에 바닥을 이어 붙였다. 하부 보미토리 13곳에는 입구 폭과 계단을 남겼다. 19구역 뒤쪽 원본 메시가 비어 있던 구간에는 인접 2F 단 높이에 맞춘 단과 수직 면을 추가했다.
- `gymnastic-show.js`에서 360 FOH 비계의 뒷면을 하부 단과 연결하고, 좌우 스커트를 각각 같은 방향의 경사에 맞췄다.
- 콘코스 조명은 실제 소핏 아래와 보미토리 문 안쪽에서 켜진다. 개방된 상부 피트, 터널 위 객석과 일반 관객 동선에서는 꺼진다.
- `node scripts/verify-gym-bowl.mjs`에서 위·아래에서 조사한 바닥 72,000점, 360 FOH 뒤 수직 면, 하부 보미토리 13개, 두 모드의 2F 시점 12,419개를 검증했다. `npm.cmd run verify:gym-seats`에서 1F 3,770석과 2F 7,587석이 도면에 일치했다.
- Venue Lab의 일반·360 렌더 4장과 내부·외부 조명 상태를 확인했다. 로컬 캡처는 `venue-lab/shots/kspo/concourse-connection/`에 있다.
- `venue-lab`에서 `node build.mjs`, `node bake-gi.mjs gymnastic-arena general 1.0`, `node bake-gi.mjs gymnastic-arena 360 1.0`을 실행해 두 모드의 GI를 재베이크했다.

- 커밋 `a710ba2`: 보미토리, 콘코스, 1F 통로, IMAG, 글레어 작업.
- `e414844`: Codex 커밋 `ebc6b2d`(조명 정리, FOH 콘솔 단순화, KSPO FOH 카메라·카메라 패드·지브 삭제)를 main에서 병합. 브랜치에 푸시까지 끝남.
- `c2eb7a0`: 2F 좌석을 운영사 도면 기호로 재생성하고 `verify:gym-seats` 추가. 푸시 완료.
- `ee5afd6`: 보미토리 도면 위치 재배치, 1·2층 바닥 구멍·`overTunnel`·`underConsole`·360 라인어레이(`GYM_PA['360']`) 수정.
- `4ab3379`: `scripts/audio-smoke.mjs` Vite `open: false` 추가, `ee5afd6` 반영 GI 재베이크(`general`/`360`), `npm run verify`·`npm run verify:gym-seats`·`npm run build`·`uitest.mjs`(12뷰) 통과 후 커밋·푸시 완료.
- `5fa6c02`: 1F 고정석(12–22열, C블록 12–21열) 3,770석 도면 정합·재생성(`11,357`석), `verify:gym-seats` 1F+2F PASS, GI 재베이크, 메인 앱 스크린샷 8장 검수 완료.

### 3단계: 구조 마감·펜스·보미토리·모자이크·텍스처 정비 (현재 작업)

| 파일 | 변경 |
|---|---|
| `src/three/concert-equipment.js`, `src/three/venues/gymnastic-equipment.js` | `data.fences`가 `{ points, face: 'origin' }` 옵션을 지원하도록 확장하고 General 외곽 플로어 바리케이드(`edge = GYM_FLOOR_R - .8`)의 경사 킥플레이트가 안쪽 플로어 관객(원점) 방향을 향하도록 교정. |
| `src/three/venues/gymnastic-arena.js` | ① `lowerStands` 블록 끝면 뒤쪽(`r = end..44.8`, `y = 0..4.77`) 빈 틈을 콘크리트 벽으로 막아 터널 형태·뒷벽은 유지한 채 검은 틈 제거, 양측 끝면 경사 난간(`railRadial` + 충돌판) 추가. ② `upperStands` 최후면 `BOX 1-8` 어두운 사각 패치를 제거하고 `TOP.r1` 연속 외벽(`10.72..22 m`)과 트림 밴드로 깔끔하게 마감. ③ `mat.wall`·`mat.parapet`에 무광 콘크리트 텍스처(`roughnessMap: null`) 보강. ④ `chairs` 2F 노랑→하늘색 비율을 `smoothstep`으로 다듬고, `hash` 내 `^=`의 부호 있는 32비트 반전(`color.setHex(undefined)` → 검정 사선 띠 유발)을 `Math.imul` + `>>> 0`으로 수정. `seatedCrowd` 빌보드를 `s.yaw` 기준 `+0.03 m` 앞으로 옮겨 좌석 좌판 교차 제거. |
| `src/three/venues/gymnastic-bowl.js` | 공식 KSPO DOME 내부 사진(`s3_01_03_pic2.jpg`)에 맞춰 상·하부 보미토리 옆 벽(`addVomCurb`)을 트레드 위 ~`0.42 m`(하부 터널 상단 `+0.22 m`) 낮은 콘크리트 턱 + 상단 금속 난간(`W.rail`) 구조로 낮추고, 벽 색감을 차분한 베이지-회색 무광(`0xa8a59e`)으로 조정. 보미토리 계단·트레드에 콘크리트 텍스처 적용. |
| `public/assets/gymnastic-arena-*.gi` | 1F 끝면 벽·2F 후면 벽·낮춘 보미토리 벽을 반영해 general(4.3 MB) / 360(7.5 MB) GI 재베이크 완료. |

확인한 것: `npm run verify:gym-seats` PASS, `npm run verify` PASS, `npm run build` PASS (`built in 42.23s`), 메인 앱(`vite preview`, `?debug`, `--use-angle=d3d11`) 13개 뷰 캡처(`Errors: none`)에서 외곽 바리케이드 방향, 1F 터널·끝면 벽·난간, General 5인 밴드, 2F 후면 벽·모자이크·사선 검은 띠 완전 제거, 낮춘 보미토리 옆 벽·난간 모두 육안 확인 완료.

**보미토리 위치를 도면에서 직접 배치** (이전 커밋 `ee5afd6` 참고)

- `gymnastic-bowl.js`의 `LOWER_VOMS`는 [각도, 피트 반폭], `UPPER_VOMS`는 [각도, 피트 앞, 뒷벽, 반폭]이다. 각도와 폭은 EPS 도면의 회색 계단 해칭에서 뽑았고, 좌석과 같은 정합 변환을 썼다. 상부 11곳은 이전 값과 0.05° 안으로 일치했다. 하부는 **33.49°의 보미토리를 추가해 13곳**이 됐다(대칭인 326.57°는 원래 있었음). 345.42°는 344.96°로 바로잡았다. 폭은 보미토리마다 다르다: 14.98°와 344.96°는 약 2.0 m, 나머지는 2.5–2.9 m. 157.33°, 202.81°, 296.46°는 옆 좌석과 0.25 m 이상 떨어지도록 조금 좁혔다.

남은 의문/확인 사항:
- 도면의 44구역에는 좌석 기호가 435개 있지만 라벨은 288석(+147)이며 사용자 결정에 따라 **도면 기호(435석)를 그대로 따른다**.
- 도면의 1F B/C/D블록은 `c` 4모서리+`l` 테두리로 그려져 있고, A블록(`16–22`)은 `qu`/`ququ`/`lll` 사각형으로 그려져 있으며 도면 인쇄 배치상 A블록만 약 `(+1.0 m, +0.5 m)` 이동되어 있어 1F는 블록별 정합을 사용한다.

### 사용자 결정 및 이전 수정 반영 이력 (`ee5afd6`)

| 요청 | 처리 |
|---|---|
| 44구역 | **도면 기호대로 유지**(435석). 라벨 288에 맞추지 않는다. |
| 보미토리 천장부 연결 | 하부 터널 지붕을 열 단 높이(`L_TREAD` 6.3 m, r 47.3–48.7)로 두었다. 그 위 좌석은 지붕 위에 앉힌다(`gymnastic-seats.js`의 `overTunnel`). |
| 보미토리 옆 바닥 구멍 | `cutRake`가 큰 DAE 삼각형을 통째로 지워 생긴 구멍이었다. 구멍 근처 삼각형을 0.16 m까지 잘게 나눈 뒤 자르도록 고쳤다. 렌더에서 구멍이 사라진 것을 확인했다. |
| 보미토리 앞 기둥 2개 | 삭제했다. |
| 1·2층 사이 바닥 뚫림 | DAE 평판을 지우는 조건이 2F 첫 열 단까지 지웠던 것이다. 넓게 뻗은 수평 삼각형(꼭짓점 r>49)만 지우도록 고쳤다. 렌더에서 막힌 것을 확인했다. |
| FOH 뒤 텅 빔 | 360에서 19구역 전체를 비웠던 것이다. 콘솔 비계 밑 좌석(147석)만 비우고 나머지는 관객으로 채운다(`gymOpenSeat`). |
| 어레이 하단이 스크린 침범 | 360 모서리 라인어레이를 대각선 12.4 m에서 13.6 m로 옮겨 박스 면과 IMAG의 가로 범위 밖에 매달았다(`GYM_PA['360']`). 렌더로 확인했다. |
| 1층도 도면대로 | **완료.** Fixed 12–22열 3,770석을 도면 기호에서 생성·검증 완료(`verify:gym-seats` 1F+2F PASS). 1–11열은 가동석 접힘 유지. |

## 2. 사용자가 정한 것 (되돌리지 말 것)

- 대화, 보고, 커밋 메시지는 한국어로 쓴다. 코드 주석은 영어다. 애매하면 먼저 묻는다. 렌더 스크린샷은 파일로 보여준다.
- **보미토리:** 앞이 열린 피트, 사선 흰 벽, 뒷벽 문. 번호판과 AISLE 패널은 넣지 않는다. 콘코스 쪽 BLOCK 안내판도 넣지 않는다.
- **콘코스:** 레이크 아래 단층 하나만 둔다. **최상단 열 뒤에는 콘코스를 두지 않는다.** 방·화장실·문 같은 세부 구조 없이 깔끔하게 만든다. 조명은 중성 흰색이다. 평소에는 꺼져 있다가 진입하면 켜진다.
- **1F 이동식 블록 사이 통로:** 열어 두고 맨 뒤 벽만 막는다.
- **General 무대:** IMAG를 두지 않는다(백월만). T자 돌출, 중앙 업스테이지 5인 밴드, 착석 플로어. FOH는 플로어 후방 중앙이다.
- **360 무대:** 검은 격자 트러스, 4면 LED 박스와 그 아래 2분할 IMAG, 박스 모서리 라인어레이. FOH는 19구역 비계 콘솔이다. (FOH 카메라와 카메라 패드·지브는 사용자의 Codex 커밋 `ebc6b2d`에서 삭제됐다. 되살리지 않는다.)
- **벽:** 리본 전광판을 두지 않는다.
- **좌석 검증:** 실제 배치도와 완전히 같아야 한다. 없어진 좌석이 없고 통로와 구역 분리가 같아야 한다(`npm run verify:gym-seats`).
- **마감:** 1층 가동석 앞은 검은 커튼, 플로어는 밝은 회색 콘크리트. 좌석 색은 2025 사진 기준(1층 노랑, 2층은 아래 노랑에서 위로 하늘색 모자이크).
- **분위기:** 하우스 조명 상태는 선명하게(뿌옇지 않게). 반사와 글레어를 줄인다. 공연 중에 벽이 띠처럼 빛나면 안 된다.
- Lab 전용 소스(`venue-lab/src/n-*.js`, `o-*.js`)와 루트의 `PLAN-*.md` 등 추적되지 않는 파일은 커밋하지 않는다. 운영사 원본 파일(DAE·EPS·PDF)도 커밋하지 않는다.

## 3. 파일 지도

- `src/three/venues/gymnastic-arena.js`: 볼, 1F 스탠드(`TREAD_SECTORS`, `lowerStands`, `foldedCurtain`), 레이크(`RAKE`, `rakeAt`), 지붕, 좌석 의자, 하우스 조명, 베뉴 반환값(블룸·그레이드).
- `src/three/venues/gymnastic-bowl.js`: 보미토리(`LOWER_VOMS`, `UPPER_VOMS` = [각도, 피트 앞, 뒷벽]), 콘코스(`C2`), 상단 통로(`TOP`), `cutRake`, 콘코스 점등 영역.
- `src/three/venues/gymnastic-show.js`: General·360 리그, PA, 마스킹. `gymnastic-equipment.js`: 장비 배치. `gymnastic-seats.js`: 좌석 카탈로그와 플로어 블록. `gymnastic-data.js`: 생성물(좌석, 레이크 메시. 직접 고치지 않는다).
- `src/three/gymnastic-arena-plan.js`: 좌표 규약 `gymPoint(deg, r) = [sin·r, -cos·r]`, 무대 평면, FOH·PA 좌표.
- `src/three/rx/index.js`의 `LOOK['gymnastic-arena']`: 헤이즈, 노출, 프로브 박스.
- `venue-lab/pipeline/gymnastic_arena.py`: DAE와 EPS로 `gymnastic-data.js`를 생성한다.

## 4. 명령

```
cd venue-lab && node build.mjs          # 앱 코드를 바꾼 뒤 렌더 전에 반드시 실행
node rxshot.mjs gymnastic-arena shots/kspo/x '[{"name":"a","q":"layout=general&house=1&cam=x,y,z,tx,ty,tz&frames=90&settle=8"}]' 1280 720
EVAL='JSON.stringify(window.__pick(0.5,0))' node rxshot.mjs ...   # 화면의 한 점에 무엇이 있는지
node bake-gi.mjs gymnastic-arena general 1.0 && node bake-gi.mjs gymnastic-arena 360 1.0   # 구조나 조명이 바뀌면
cd .. && npm run verify && npm run verify:gym-seats && npm run build && node venue-lab/uitest.mjs
# 2F 좌석을 도면에서 다시 만들고 감사하기 (원본은 커밋하지 않는 운영사 파일)
python -I venue-lab/pipeline/gymnastic_arena.py kspodome_dae.zip seat.pdf src/three/venues/gymnastic-data.js
python -I venue-lab/pipeline/gym_seat_audit.py seat.pdf src/three/venues/gymnastic-data.js docs/references/kspo-seat-audit.json
```

- 콘코스 안에서 찍을 때는 `frames=90`을 준다. 점등이 서서히 올라오기 때문이다.
- 카메라는 보행 시스템이 바닥에서 1.6 m 높이로 붙인다.
- 렌더 결과는 `venue-lab/shots/kspo/`(git 무시)에 둔다.
- 쓸 만한 카메라:
  - 2F 콘코스: `-44.5,5.77,32.3,-50.2,6.5,22.4`
  - 상부 보미토리 계단: `-54.8,5.77,20.49,-50.05,7,20.27`
  - 360 20구역 21열 6번 좌석: `8.38,5.8,-41.36,11.52,5.8,-44.53`
  - 1F 블록 사이 통로: `24.73,1.6,-16.99,36.27,2,-24.92`
  - General FOH: `0,2.41,24.6,0,6,-17`

## 5. 실측 자료와 수치

- 운영사 원본 다운로드 링크와 SHA-256은 레퍼런스 문서에 있다. 로컬에서는 Ghostscript 10.08(`C:\Program Files\gs`)로 EPS를 PDF로 변환했다: `gswin64c -dSAFER -dBATCH -dNOPAUSE -dEPSCrop -sDEVICE=pdfwrite -o seat.pdf seat.eps`.
- DAE에서 확인한 치수:
  - **하부 보미토리:** 크로스 아일 4.77 m에서 4단을 내려가 4.17 m. 피트는 r 45.0–47.3 m, 터널 천장은 6.2 m, 안쪽 폭은 약 2.7 m.
  - **상부 보미토리:** 피트 바닥이 앞 열 높이(약 7.4 m)에서 6.5 m로 내려가고, 뒷벽 문 높이는 약 1.9 m. 앞 모서리에 손잡이 기둥이 있고, 옆벽 윗선은 트레드보다 약 1 m 높다.
- EPS 구역별 좌석 수:
  - 1–4구역: 282
  - 5–11구역: 292
  - 12–15구역: 282
  - 16–22구역: 308–312
  - 23–52구역(순서대로): 417 270 236 217 248 247 244 259 306 326 250 245 326 306 269 241 248 248 219 245 277 288 329 221 206 116 104 176 160 233
  - BOX 1–8: 14 12 17 10 10 19 21 12
  - 장애인석: 84
- 현재 데이터의 2F 구역 수: 44구역 412, 45구역 238, 46구역 161, 47구역 174, 48구역 192, 49구역 116, 50구역 206, 51구역 222, 52구역 330, 23구역 450. 44–52구역의 구역 경계가 어긋나 있고, 2F 초과 267석의 대부분이 여기서 나온다.

## 6. 완료 현황 및 참고

1. ~~1F 도면 대조: 1F 기호 추출·구역 분할·12–22열 재생성 및 `verify:gym-seats` 1F+2F PASS~~ (완료, `5fa6c02`)
2. ~~메인 앱에서 KSPO 피커·블록맵(1F·2F 좌석) 및 1F 단차·360 콘솔 주변 렌더 확인~~ (완료, `5fa6c02`)
3. ~~General 외곽 바리케이드 플로어 방향·5인 밴드 근접 확인, 1F 블록 끝면 뒤 벽 마감·경사 난간, 2F 최후면 벽 정리~~ (완료)
4. ~~보미토리 옆 벽 높이 실측 사진 정합·난간 추가, 콘크리트·벽·파라펫 텍스처 보강, 2F smoothstep 모자이크 및 좌석 해시 사선 버그 수정~~ (완료)
