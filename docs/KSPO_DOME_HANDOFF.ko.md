# KSPO DOME 작업 핸드오프

다른 LLM이나 다른 세션이 바로 이어받을 수 있게 유지하는 문서다. 작업할 때마다 갱신한다.

- 마지막 갱신: 2026-11-22 23:00 KST (로컬 Claude Code 세션)
- 브랜치: `claude/beautiful-hopper-35idcn` (`origin/main`과 같은 `454a902`에서 시작)
- 전체 계획과 결정 기록: [KSPO_DOME_REMODEL_PLAN.ko.md](KSPO_DOME_REMODEL_PLAN.ko.md)의 7장. 자료 목록: [references/GYMNASTIC_ARENA_REFERENCES.ko.md](references/GYMNASTIC_ARENA_REFERENCES.ko.md)

## 1. 지금 상태

- 커밋 `a710ba2`: 보미토리, 콘코스, 1F 통로, IMAG, 글레어 작업.
- `e414844`: Codex 커밋 `ebc6b2d`(조명 정리, FOH 콘솔 단순화, KSPO FOH 카메라·카메라 패드·지브 삭제)를 main에서 병합. 브랜치에 푸시까지 끝남.

- `c2eb7a0`: 2F 좌석을 운영사 도면 기호로 재생성하고 `verify:gym-seats` 추가. 푸시 완료. 아래 표가 그 내용이다.

**보미토리 위치를 도면에서 직접 배치** (커밋됨, 아래 참조)

- `gymnastic-bowl.js`의 `LOWER_VOMS`는 [각도, 피트 반폭], `UPPER_VOMS`는 [각도, 피트 앞, 뒷벽, 반폭]이다. 각도와 폭은 EPS 도면의 회색 계단 해칭에서 뽑았고, 좌석과 같은 정합 변환을 썼다. 상부 11곳은 이전 값과 0.05° 안으로 일치했다. 하부는 **33.49°의 보미토리를 추가해 13곳**이 됐다(대칭인 326.57°는 원래 있었음). 345.42°는 344.96°로 바로잡았다. 폭은 보미토리마다 다르다: 14.98°와 344.96°는 약 2.0 m, 나머지는 2.5–2.9 m. 157.33°, 202.81°, 296.46°는 옆 좌석과 0.25 m 이상 떨어지도록 조금 좁혔다.
- 렌더 확인, GI 재베이크, `verify`·`verify:gym-seats`·uitest 통과 후 커밋·푸시했다.

(이전 커밋 `c2eb7a0`의 내용)


| 파일 | 변경 |
|---|---|
| `venue-lab/pipeline/gym_seat_audit.py` | 새 파일. EPS 도면의 2F 좌석 기호(청록 아치 `cc`, 앞줄 사각형 `qu` 3–4pt)를 하나하나 추출해 앱 평면에 정합(ICP 유사변환, 축척 1.0002, 회전 0.19°)한다. 앱 좌석과 짝지어 누락, 추가, 구역 어긋남을 보고하고, 참조 데이터 `docs/references/kspo-seat-audit-chart.json`을 쓴다. |
| `venue-lab/pipeline/gymnastic_arena.py` | 2F 좌석을 DAE 대신 도면 기호로 생성한다(`chart_upper`). 높이는 가장 가까운 DAE 좌석에서 가져온다. 1F는 그대로 DAE다. |
| `src/three/venues/gymnastic-data.js` | 다시 생성: 1F 3,766석, 2F 7,587석. 기존 2F는 7,744석이었고 도면 대비 누락 512, 추가 667이었다. |
| `scripts/verify-gym-seats.mjs`, `package.json`의 `verify:gym-seats` | 새 검증 절차. EPS 없이 참조 JSON으로 2F 좌석 하나하나, 통로, 구역 분리가 도면과 같은지 본다. 현재 **PASS**(7,587석 전부 짝, 위치 차이 중앙값 4 mm). |
| `docs/references/kspo-seat-audit.json` | 감사 보고(구역별 도면, 라벨, 앱, 누락, 추가). |
| `src/three/venues/gymnastic-bowl.js` | 새 좌석에 맞춰 상부 보미토리 피트 범위와 하부 보미토리 중심 각도를 다시 계산했다. |
| `public/assets/gymnastic-arena-*.gi` | 재베이크함. 좌석 재생성 뒤 다시 구워야 한다. |

확인한 것: `npm run verify:gym-seats` PASS, `npm run verify` 통과, `npm run build` 통과(병합 직후).
확인한 것(추가): 새 좌석의 렌더(D블록 안착, 보미토리 간섭 없음), uitest, GI 재베이크.
확인하지 않은 것: 앱 피커와 블록맵의 새 좌석 수 표시(앱 실행으로 확인 필요).

남은 의문(사용자 확인 필요):
- 도면의 44구역에는 좌석 기호가 435개 있지만 라벨은 288석이다(+147). 그 밖의 구역은 라벨보다 0–6석 적다. 그래서 2F 합계는 7,587로, 라벨 합계 7,477보다 110석 많다. 지금은 도면에 그려진 기호를 그대로 따른다.
- 1F는 아직 도면 대조를 하지 않았다. 도면 구역 분할이 1F에서는 맞지 않는다(5–11구역 0석). 1F 기호는 `qu` 1/3/4/6pt이고, 1–22열에 가동석 1–11열이 포함된다.

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

## 6. 다음 할 일 (순서대로)

1. 44구역 라벨 불일치(도면 기호 435, 라벨 288)를 사용자에게 확인받는다.
2. 1F 도면 대조: 1F 기호 추출과 구역 분할을 고치고, 12–22열을 대조한다. 결과를 `verify:gym-seats`에 넣는다.
3. 앱에서 KSPO 피커와 블록맵(새 2F 좌석 수)을 확인한다.
4. General 펜스와 밴드 근접 렌더를 확인한다. 텍스처와 2F 모자이크를 다듬는다.
