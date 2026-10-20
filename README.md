# 장기AI — 장기AI가 힘을 숨기지 않음 (beta v0.1)

브라우저에서 바로 실행되는 **장기(將棋 계열 한국 장기) 웹 게임**입니다. 2000년대 Windows 장기 게임을 HTML5로 재구현했고, AI는 **Fairy-Stockfish(WebAssembly)** 를 사용합니다. 서버 없이 `index.html`을 더블클릭만 해도 동작합니다.

- **플레이어는 항상 아래쪽** (초=파랑 / 한=빨강)
- **UI는 한국어**
- **file:// 더블클릭**으로 실행 (fetch 사용 안 함)
- **웹에서 바로 두기**: https://donian-kor.github.io/AI_jjangie/

## 주요 기능

### 대국
- 진영 선택 (초·한), 난이도 4단계 (초보·중급·고수·최강), 차림 4종 (마상상마 등)
- AI: Fairy-Stockfish WASM (인터넷 불필요)
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
- 무승부 규칙 (같은 국면 3번 반복)
- 소리 (두기·잡기·장군·결과)
- 한글 ↔ 한자 표기 전환
- 초보자 도움 (말 설명 풍선: 마우스 올리기 + 손가락으로 눌러 보기, 장군 시 방어 표시, **기본 꺼짐**)
- 두기 전 실수 확인 (기본 꺼짐), 외통수 경고, 위험한 내 말 표시
- 판 크기 조절 (60~100%, 창에 맞게 최대, 좁은 화면은 좌우에 꽉 차게·한 칸 최소 크기 유지)
- 이어하기 (창을 닫아도 저장, 다른 탭 저장 덮어쓰기 방지), 닫기 경고
- 결과 창 (승리·패배·무승부)

### 디자인
- 말 2종 (카카오·목재), 보드 6종
- 버전 표기 `beta v0.1`

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

- **말·보드 이미지**: [Kadagaden/chess-pieces](https://github.com/Kadagaden/chess-pieces) (CC-BY-4.0)
  - 라이선스 전문: `assets/LICENSE-chess-pieces.txt`
  - `index.html` 하단 footer에 저작자 표시 유지 필요
- **AI 엔진**: Fairy-Stockfish (GPL) — `third_party/fairy-stockfish/`
- **게임 코드**: (프로젝트 소유자)

## 알려진 한계

- Fairy-Stockfish의 반복 감지(IRI) 미지원 → 우리 쪽 무승부 판정으로 커버
- `file://` 환경에서는 `fetch()` 사용 불가 → 모든 자산을 인라인/번들로 처리
- 단일 HTML 파일 구조 (~2800줄) → 유지보수 시 주의

## 참고 문서

- `아이디어.html` — 구현된/예정 기능 목록
- `assets/README.md` — 이미지 자산 출처·재생성 방법
- `third_party/fairy-stockfish/README.md` — 엔진 빌드·연동 상세