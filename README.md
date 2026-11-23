# 장기AI — 장기AI가 힘을 숨기지 않음 (beta v0.3)

브라우저에서 바로 실행되는 **장기(將棋 계열 한국 장기) 웹 게임**입니다. 2000년대 Windows 장기 게임을 HTML5로 재구현했고, AI는 **Fairy-Stockfish(WebAssembly)** 를 사용합니다. 서버 없이 `index.html`을 더블클릭만 해도 동작합니다.

- **플레이어는 항상 아래쪽** (초=파랑 / 한=빨강)
- **UI는 한국어**
- **file:// 더블클릭**으로 실행 (fetch 사용 안 함)
- **웹에서 바로 두기**: https://donian-kor.github.io/AI_jjangie/

## 주요 기능

### 대국
- 진영 선택 (초·한), 난이도 6단계 (애기·초보·중급·고수·최강·장기의 신), 차림 4종 (마상상마 등)
  - `애기`: 초보보다 훨씬 쉬운 단계 — 후보 중 무작위로 두어 실수를 자주 합니다
  - `장기의 신`: Skill Level 상한(20)에 탐색 시간 8초·해시 64MB를 적용한 최상위 단계 (빨강 표시)
- AI: Fairy-Stockfish WASM (인터넷 불필요), **AI 차림을 내 차림과 별도로 선택** 가능
- 반복수 방지: 엔진에 지금까지의 수순을 전달해 같은 국면 반복을 인식하게 하고, 3회 반복 무승부로 이어지는 수는 다른 후보가 있으면 피함 (내장 AI 폴백에도 적용)
- 빅장 규칙: 두 장이 마주 보는 수를 허용하며, 상대 응수 후에도 마주 보면 무승부 (궁을 피하거나 사이를 막으면 계속 진행)
- AI 항복: 엔진 평가가 크게 불리(약 -35점 이하 또는 4수 내 패배 예상)하면 항복해 끝까지 두지 않음
- 사람끼리 대국 (2인용) 모드
- 장군 연출 (붉은 링·번쩍임), 마지막 수 표시

### 전적·기보
- 난이도별 승·패·무, 연승·승률 표시
- 중단(새 게임·새로고침·창 닫기)은 패로 자동 기록
- 잡은 말·잃은 말 그림 표시
- 기보 창: 되짚기(리플레이), 이 자리부터 다시 두기, 복사·저장(.txt)
- 전적 백업: 내보내기·가져오기 (.json)
- 연승 도전 모드

### 도움·편의
- 무르기 (AI 대국은 한 쌍씩), 힌트 (파란 점선)
- 무승부 규칙 (같은 국면 3번 반복, 빅장 응수 실패)
- 애기 난이도 도움: 상대 말을 누르면 그 말이 갈 수 있는 곳을 파란 점으로 표시 (연습용)
- 소리 (두기·잡기·장군·결과)
- 한글 ↔ 한자 표기 전환
- 초보자 도움 (말 설명 풍선: 마우스 올리기 + 손가락으로 눌러 보기, 장군 시 방어 표시, **기본 꺼짐**)
- 두기 전 실수 확인 (기본 꺼짐), 외통수 경고, 위험한 내 말 표시
- 판 크기 조절 (60~100%, 창에 맞게 최대, 좁은 화면은 좌우에 꽉 차게·한 칸 최소 크기 유지)
- 이어하기 (창을 닫아도 저장, 다른 탭 저장 덮어쓰기 방지), 닫기 경고
- 결과 창 (승리·패배·무승부)

### 디자인
- 말 2종 (카카오·목재), 보드 6종
- 버전 표기 `beta v0.3`
- **PC 화면 배치**: 제목·버전 딱지는 상단에 유지, 설정 패널·상태·안내는 장기판 왼쪽 세로 기둥(폭 195px)에 배치
  - 상단을 차지하던 UI가 왼쪽으로 이동해 장기판이 화면 높이에 맞게 더 크게 표시됨
  - 새 게임·무르기·힌트·기보 버튼과 전적 패널은 장기판 오른쪽에 유지
  - 전적 패널 하단의 기록 지우기·내보내기·가져오기 버튼은 한 줄에 하나씩 3행으로 표시
- **모바일 화면 배치**: 기존과 동일 (헤더·설정이 상단, 장기판, 전적이 아래)

## 이용 정책 (페어플레이)

이 프로그램은 **혼자 연습하고 학습하기 위한 도구**입니다.

- 다른 사이트에서 진행 중인 대국에 이 앱의 AI·힌트·엔진 평가를 이용해 수를 따라 두는 등, **외부 서비스의 승률이나 랭킹을 조작하는 용도로 사용하지 마세요.**
- 힌트는 **대국당 최대 3회, 사용 간격 1분**으로 제한됩니다.
- 엔진 평가와 추천 수는 **대국이 끝난 뒤 `복기`에서만** 확인할 수 있습니다.
- 다른 장기 서비스를 이용할 때는 해당 서비스의 이용약관을 지켜 주세요.

## 실행 방법

### 가장 간단한 방법
1. 저장소를 받습니다 (zip 다운로드 또는 `git clone`)
2. `index.html`을 더블클릭합니다
3. 브라우저에서 바로 실행됩니다 (서버 불필요)

### 개발·테스트
```powershell
# 로컬 서버 (선택)
python -m http.server 8790

# 규칙 테스트
node tests/rules_test.js

# 엔진 연동 테스트 (third_party/fairy-stockfish/stockfish.wasm 필요)
node tests/fs_engine_test.js
```

## 프로젝트 구조

```
장기게임/
├── index.html                  # 게임 본체 (UI + 로직, ~2800줄)
├── janggi.js                   # 장기 규칙 엔진 (이동 생성, 장군/멍군/무승부, 저장·복원)
├── ai.js                       # 내장 폴백 AI (minimax + alpha-beta)
├── fs-engine.js                # Fairy-Stockfish 연동 (FEN 변환, UCI, 난이도 매핑)
├── fs-worker.js                # 엔진을 Web Worker로 분리
├── assets/                     # 말·보드 이미지 (CC-BY-4.0, Kadagaden/chess-pieces)
├── tests/                      # 규칙·엔진 자동 테스트
├── tools/                      # 말 이미지 자산 생성 스크립트
├── third_party/fairy-stockfish/ # 엔진 바이너리 + 빌드 스크립트
├── 아이디어.html               # 구현 아이디어 목록 (참고용)
└── _원본보관/                  # 2000년작 원본 자료 (수정·커밋 금지)
```

## 기술 스택

- **프론트엔드**: 순수 HTML/CSS/JavaScript (프레임워크 없음)
- **AI 엔진**: Fairy-Stockfish (WebAssembly, 단일 스레드)
- **이미지**: SVG (보드) + JS 내장 SVG (말, 색 변경용)
- **저장**: `localStorage` (이어하기·전적·설정)

## 주요 설정 (localStorage)

| 키 | 값 | 설명 |
|---|---|---|
| `janggi.hints` | `on`/`off` | 초보자 도움 |
| `janggi.challenge` | `1`/`0` | 연승 도전 모드 |
| `janggi.sound` | `1`/`0` | 소리 |
| `janggi.zoom` | `60`~`100` | 판 크기 (%) |
| `janggi.record` | JSON | 전적 |
| `janggi.game` | JSON | 이어하기 저장본 |

## 엔진 빌드 (필요 시)

엔진 바이너리(`stockfish.wasm`, `fsf-bundle.js`)는 이미 포함되어 있어 **빌드 없이** 동작합니다. 재빌드가 필요하면:

```powershell
# third_party/fairy-stockfish/README.md 의 3장 참고
.\build-fsf-wasm.ps1
```

## 라이선스·크레딧

- **말·보드 이미지**: [Kadagaden/chess-pieces](https://github.com/Kadagaden/chess-pieces), 커밋 `b035b0cc`
  - 라이선스: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — 저작자 표시 필수
  - 라이선스 전문: `assets/LICENSE-chess-pieces.txt`
  - 카카오 말 원본: [`assets/janggi_kakao_janggi_style_white/`](assets/janggi_kakao_janggi_style_white/) — 위 저장소의 동일 세트(커밋 `b035b0cc`)를 로컬에 보관한 생성 소스, CC BY 4.0
  - `pieces-kakao.js`는 원본 SVG의 글자 색만 치환한 수정본이므로 "색상 수정" 사실을 함께 표기
  - 재배포 시 `index.html` footer의 저작자·라이선스 표시를 유지할 것
- **AI 엔진**: Fairy-Stockfish — `third_party/fairy-stockfish/`
  - 원본: [fairy-stockfish.wasm](https://github.com/fairy-stockfish/fairy-stockfish.wasm), 커밋 `b2e693ef1e111233ce3fb40685921708b3276ed6` (npm 1.1.12)
  - 라이선스: [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html) — 라이선스 전문 `Copying.txt`, 저자 목록 `AUTHORS`
  - 이 프로젝트의 바이너리는 `SharedArrayBuffer` 없이 동작하도록 단일 스레드로 재빌드한 수정본
  - 수정 내역은 `third_party/fairy-stockfish/README.md` 4장, 재빌드 스크립트는 `build-fsf-wasm.ps1`에 있음
  - **웹으로 공개/배포할 때**: GPL-3.0 조건(엔진 소스 제공, 라이선스·저작권 고지 유지, 파생물 동일 라이선스)을 지킬 것. 자체 게임 코드까지 GPL로 공개할 필요는 없음(별개 저작물)
- **게임 코드**: (프로젝트 소유자)

## 알려진 한계

- Fairy-Stockfish에는 장기 IRI 규칙이 없음 → 같은 국면 3회 반복 무승부는 우리 규칙으로 판정 (엔진에는 수순 기록을 넘겨 반복 국면을 인식시킴)
- `file://` 환경에서는 `fetch()` 사용 불가 → 모든 자산을 인라인/번들로 처리
- 단일 HTML 파일 구조 (~2800줄) → 유지보수 시 주의

## 참고 문서

- `아이디어.html` — 구현된/예정 기능 목록
- `assets/README.md` — 이미지 자산 출처·재생성 방법
- `third_party/fairy-stockfish/README.md` — 엔진 빌드·연동 상세