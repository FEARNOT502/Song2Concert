# KSPO DOME 작업 핸드오프

다른 LLM이나 다른 세션이 바로 이어받을 수 있게 유지하는 문서다. 작업할 때마다 갱신한다.

- 마지막 갱신: 2026-11-22 (로컬 Claude Code 세션)
- 브랜치: `claude/beautiful-hopper-35idcn` (`origin/main`과 같은 `454a902`에서 시작)
- 전체 계획과 결정 기록: [KSPO_DOME_REMODEL_PLAN.ko.md](KSPO_DOME_REMODEL_PLAN.ko.md)의 7장. 자료 목록: [references/GYMNASTIC_ARENA_REFERENCES.ko.md](references/GYMNASTIC_ARENA_REFERENCES.ko.md)

## 1. 지금 상태

**아직 커밋하지 않은 변경**(이 세션). 커밋 전에 렌더를 확인한다.

| 파일 | 변경 |
|---|---|
| `src/three/venues/gymnastic-bowl.js` | 거의 새로 작성했다. 운영사 DAE 치수로 보미토리를 다시 만들었다(하부 12, 상부 11). 콘코스는 레이크 아래 한 층의 깔끔한 링이다. 레이크 메시에서 DAE 대용 형상(2F 평판, r≈57 m 벽)을 뺐다. 3F 콘코스와 계단 코어는 삭제했다. |
| `src/three/venues/gymnastic-arena.js` | 상단 열 뒤 통로와 벽(`TOP`)을 두었다. 1F 블록 사이 통로는 맨 뒤 벽만 막았다. 커튼은 블록마다 두른다. 블룸 `house`는 1.0에서 2.2로 올렸다. |
| `src/three/venues/gymnastic-show.js` | General 양옆 IMAG와 행어를 삭제했다. |
| `venue-lab/src/z-app.js` | 디버그용 `window.__pick(nx, ny)`를 추가했다. 화면의 한 점에 무엇이 있는지 알려준다. |
| `venue-lab/pipeline/gym_dae_region.py`, `gym_dae_views.py` | DAE 링 구역 삼각형 추출과 단면·평면 그림 도구다(새 파일). |
| `docs/KSPO_DOME_REMODEL_PLAN.ko.md` | 7.1절에 이번 작업과 남은 작업을 적었다. |

확인한 것: `npm run verify` 통과. Lab 렌더로 하부·상부 보미토리, 1F 블록 사이 통로, General IMAG 삭제, 콘코스 계단을 확인했다.
확인하지 않은 것: 콘코스 밝기·대비를 올린 마지막 수정분(바닥 타일 발광 맵), `npm run build`, `node venue-lab/uitest.mjs`, GI 재베이크.

## 2. 사용자가 정한 것 (되돌리지 말 것)

- 대화, 보고, 커밋 메시지는 한국어로 쓴다. 코드 주석은 영어다. 애매하면 먼저 묻는다. 렌더 스크린샷은 파일로 보여준다.
- **보미토리:** 앞이 열린 피트, 사선 흰 벽, 뒷벽 문. 번호판과 AISLE 패널은 넣지 않는다. 콘코스 쪽 BLOCK 안내판도 넣지 않는다.
- **콘코스:** 레이크 아래 단층 하나만 둔다. **최상단 열 뒤에는 콘코스를 두지 않는다.** 방·화장실·문 같은 세부 구조 없이 깔끔하게 만든다. 조명은 중성 흰색이다. 평소에는 꺼져 있다가 진입하면 켜진다.
- **1F 이동식 블록 사이 통로:** 열어 두고 맨 뒤 벽만 막는다.
- **General 무대:** IMAG를 두지 않는다(백월만). T자 돌출, 중앙 업스테이지 5인 밴드, 착석 플로어. FOH는 플로어 후방 중앙이다.
- **360 무대:** 검은 격자 트러스, 4면 LED 박스와 그 아래 2분할 IMAG, 박스 모서리 라인어레이. FOH는 19구역 비계 콘솔이고, FOH 카메라는 19구역 윗단에 둔다.
- **벽:** 리본 전광판을 두지 않는다.
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
cd .. && npm run verify && npm run build && node venue-lab/uitest.mjs
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

1. 콘코스 마지막 수정분을 렌더로 확인하고, 필요하면 밝기를 조정한다.
2. `npm run build`와 `node venue-lab/uitest.mjs`를 돌린다. GI 두 모드를 재베이크한다(`public/assets/gymnastic-arena-*.gi`).
3. 커밋하고 `claude/beautiful-hopper-35idcn`에 푸시한다.
4. 좌석 감사: `gymnastic_arena.py`의 구역 분할(`chart_sections`/`section_lookup`)이 44–52구역에서 틀린 원인을 찾아 다시 생성한다. 그다음 피커와 `src/data.js` 표시 수치를 확인한다.
5. General 펜스와 밴드 근접 렌더를 확인한다. 텍스처를 보강하고 2F 모자이크를 다듬는다.
