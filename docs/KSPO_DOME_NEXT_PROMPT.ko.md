# 다음 작업자(Gemini 등)에게 줄 프롬프트

아래를 그대로 붙여 넣는다.

---

Song2Concert 저장소(`FEARNOT502/Song2Concert`)에서 KSPO DOME 베뉴(앱 내부 ID `gymnastic-arena`) 작업을 이어서 해 줘. 이전 세션(Claude Code)에서 넘겨받는 작업이야.

## 작업 규칙
- 대화, 진행 보고, 커밋 메시지는 한국어로 쓴다. 코드 주석은 저장소 관례대로 영어다.
- 애매한 건 먼저 물어본다. 렌더 스크린샷을 자주 보여준다(파일로 보내거나 경로를 알려준다).
- 작업 브랜치는 `claude/beautiful-hopper-35idcn`이다. 커밋하고 푸시한다. 루트의 추적되지 않는 `PLAN-*.md` 등, `venue-lab/src/n-*.js`·`o-*.js`, 운영사 원본 파일(DAE·EPS·PDF)은 커밋하지 않는다.
- 오디오 신호 처리 코드는 건드리지 않는다.

## 먼저 읽을 것
1. `docs/KSPO_DOME_HANDOFF.ko.md`: 현재 상태, 사용자가 정한 것(되돌리지 말 것), 파일 지도, 명령, 실측 수치, 남은 일. **가장 중요하다.**
2. `docs/KSPO_DOME_REMODEL_PLAN.ko.md`의 7장: 진행 기록.
3. `docs/references/GYMNASTIC_ARENA_REFERENCES.ko.md`: 운영사 자료 링크와 SHA-256.

## 바로 할 일
1. **마지막 커밋 검증.** `npm run verify`, `npm run verify:gym-seats`(PASS여야 함), `npm run build`를 돌린다. 그다음 `cd venue-lab && node build.mjs && node bake-gi.mjs gymnastic-arena general 1.0 && node bake-gi.mjs gymnastic-arena 360 1.0`으로 GI를 다시 굽고 `node venue-lab/uitest.mjs`를 돌린다. 바뀐 `public/assets/gymnastic-arena-*.gi`를 커밋한다.
2. **1층 좌석을 운영사 도면대로 맞추기**(사용자 요청). 핸드오프의 "1F 도면 대조 현황"을 읽는다.
   - 2F는 이미 도면 기호로 다시 만들었고 `verify:gym-seats`가 PASS다. 1F는 좌석 기호가 여러 조각이라 아직 못 했다.
   - 원본: 운영사 상세 좌석도 EPS ZIP(`popimg_acro_seat.zip`)을 받아 Ghostscript로 PDF로 바꾼다(`gswin64c -dSAFER -dBATCH -dNOPAUSE -dEPSCrop -sDEVICE=pdfwrite -o seat.pdf seat.eps`). DAE ZIP(`kspodome_dae.zip`)도 받는다.
   - 도구: `venue-lab/pipeline/gym_seat_audit.py`(2F 도면 대조와 참조 JSON), `venue-lab/pipeline/gymnastic_arena.py`(좌석 데이터 생성, 2F는 `chart_upper`), `scripts/verify-gym-seats.mjs`(EPS 없이 참조 JSON으로 검증).
   - 목표: 1F 12–22열(고정석)을 도면과 한 석씩 대조한다. 빠진 좌석, 추가된 좌석, 통로·구역 분리 차이가 없게 한다. 1–11열은 가동석이라 접힌 상태로 두고 좌석을 만들지 않는다. 1F 결과도 `verify:gym-seats`에 넣는다.
3. 남은 일(핸드오프 6장): General 펜스와 밴드 근접 렌더 확인, 텍스처 보강, 2F 좌석 색 모자이크 다듬기.

## 렌더 확인 방법
Lab이 앱의 `stage.js`를 그대로 쓴다. 코드를 바꾼 뒤에는 반드시 다시 빌드한다.
```
cd venue-lab && node build.mjs
node rxshot.mjs gymnastic-arena shots/kspo/x '[{"name":"a","q":"layout=general&house=1&cam=x,y,z,tx,ty,tz&frames=30&settle=8"}]' 1280 720
EVAL='JSON.stringify(window.__pick(0.5,0))' node rxshot.mjs ...   # 화면의 한 점에 무엇이 있는지
```
카메라 예시는 핸드오프 4장에 있다. 카메라는 보행 시스템이 바닥에서 1.6 m 높이로 붙인다.
