# Fairy-Stockfish (WebAssembly) — 출처 · 빌드 방법 · 변경 사항

이 게임의 AI 대국은 이 폴더의 Fairy-Stockfish WebAssembly(WASM) 빌드를 사용한다.

장기 AI 엔진: Fairy-Stockfish
AI 대국에는 장기 엔진 'Fairy-Stockfish'를 브라우저에서 단일 스레드로 동작하도록 빌드한 WebAssembly 판을 씁니다.
Fairy-Stockfish(Fabian Fichter 외, GPL-3.0): https://github.com/fairy-stockfish/Fairy-Stockfish
WebAssembly 판의 원본: https://github.com/fairy-stockfish/fairy-stockfish.wasm
배포 중인 wasm 파일에 대응하는 소스 코드·변경 내용·빌드 방법: 저장소의 third_party/fairy-stockfish/

## 1. 배포 중인 파일

| 파일 | 크기 | 설명 |
| --- | --- | --- |
| `stockfish.js` | 178,111 B | Emscripten JS 런타임 + UCI 통신 래퍼 |
| `stockfish.wasm` | 1,678,854 B | Fairy-Stockfish 본체(장기 `janggi` 변형 포함) |
| `fsf-bundle.js` | 약 2,479,000 B | 위 둘과 `fs-worker.js` 를 base64 로 넣은 생성물. `file://` 에서 엔진까지 돌게 하는 핵심 파일(7장) |
| `uci.js` | 1,117 B | Node 용 UCI 콘솔 |
| `AUTHORS` / `Copying.txt` | — | 저자 목록 / GPL-3.0 원문 |
| `package.json` | — | npm 배포 메타데이터(참고용) |

`stockfish.js` / `stockfish.wasm` 는 **이 저장소가 직접 빌드한 단일 스레드 판**이다(4장).
`stockfish.worker.js` 는 pthread 빌드 전용이라 단일 스레드 빌드에서는 필요 없어 제외했다.

## 2. 출처와 버전

- 원본 저장소: https://github.com/fairy-stockfish/fairy-stockfish.wasm (기본 브랜치 `nnue`)
- **엔진 커밋: `b2e693ef1e111233ce3fb40685921708b3276ed6`** (npm 1.1.12 배포본과 동일)
- 런타임 식별 문자열: `Fairy-Stockfish [commit: b2e693ef, upstream: , emscripten: ] LB by Fabian Fichter`
- 빌드 도구: Emscripten 6.0.12 (clang/wasm-ld)
- 라이선스: **GPL-3.0** (`Copying.txt`가 원문)

## 3. 왜 다시 빌드했나

npm 으로 배포되는 판은 `-s USE_PTHREADS=1 -s PROXY_TO_PTHREAD=1` 로 빌드되어 **공유 메모리(`shared` WebAssembly.Memory)를 요구**한다. 그러면 브라우저에서 `SharedArrayBuffer` 가 필요한데, 이는 교차 출처 격리(COOP/COEP) 헤더가 있어야만 사용할 수 있다.

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

헤더 없이 열면(`python -m http.server`, GitHub Pages, 파일 직접 열기) `SharedArrayBuffer` 자체가 없어서 엔진이 아예 로드되지 않는다.

```
LinkError: memory import ... mismatch in shared state of memory, declared = 1, imported = 0
```

일반 메모리를 `wasmMemory` 로 주입해서는 해결되지 않는다. wasm 바이너리가 공유 메모리로 컴파일되어 있으므로 비공유 메모리를 넘기면 위와 같이 거부된다.

그래서 **`-s USE_PTHREADS` 없이 단일 스레드로 다시 빌드**했다. 결과적으로:

- `SharedArrayBuffer` · COOP/COEP 헤더가 필요 없다
- `stockfish.worker.js`(pthread 워커)가 필요 없다
- 신경망(NNUE, 47 MB)을 제외해 wasm 이 1.7 MB 로 가볍다
  (장기 `janggi` 변형은 애초에 NNUE 를 쓰지 않고 handcrafted 평가만 쓴다)

## 4. 변경 사항 (이 저장소가 배포하는 판)

### 4.1 원본 소스에 적용한 패치

원본 커밋 `b2e693ef` 기준으로 아래 파일을 고쳤다. 엔진 알고리즘은 건드리지 않고 **빌드 설정과 스레드 처리만** 바꾼 것이다.

| 파일 | 변경 내용 | 이유 |
| --- | --- | --- |
| `src/emscripten/Makefile` | `-s USE_PTHREADS=1`, `-s PROXY_TO_PTHREAD=1` 제거 | 공유 메모리 요구 제거 |
| `src/emscripten/Makefile` | `-s EXTRA_EXPORTED_RUNTIME_METHODS` → `-s EXPORTED_RUNTIME_METHODS` | emscripten 4.x+ `STRICT` 모드에서 옛 이름 거부 |
| `src/emscripten/Makefile` | `-s INCOMING_MODULE_JS_API=[...]` 추가 | emscripten 4.x+ 가 `Module.print`/`wasmBinary` 등을 기본 차단 |
| `src/emscripten/Makefile` | `-s STACK_SIZE=8388608` 추가 | 기본 64KB 스택으로는 Stockfish 탐색 스택(`MAX_PLY=246`)이 넘침 |
| `src/emscripten/Makefile` | `embedded_nnue = no` | 장기 변형은 NNUE 미사용, 47 MB 절감 |
| `src/Makefile` | `-DUSE_PTHREADS`, `-lpthread` 제거 | 공유 메모리 요구분 |
| `src/Makefile` | `-fexperimental-new-pass-manager` 제거 | clang 16 미만 전용 플래그. `em++` 가 버전을 알려주지 못해 잘못 붙음 |
| `src/thread_win32_osx.h` | `__EMSCRIPTEN__` 용 `NativeThread` 스텁 추가 | pthread·std::thread 모두 스레드를 만들 수 없어 죽음 |
| `src/thread.cpp` | 탐색을 메인 스레드에서 직접 수행(`main()->search()`) | `idle_loop()` 스레드가 없으므로 wake up 대상이 없음 |
| `src/thread.cpp` | `~Thread()`·`wait_for_search_finished()` 를 단일 스레드용으로 분기 | 스레드 종료/대기 처리가 불가능 |
| `src/emscripten/preamble.js` | `postCustomMessage` 가 단일 스레드면 입력 큐로 바로 전달 | `PThread` 가 없어 명령이 전달되지 않음 |
| `src/emscripten/preamble.js` | `Module.terminate()` 의 `PThread` 참조를 방어 | 단일 스레드에서 `PThread` 없음 |

### 4.2 이 저장소가 추가한 연동 코드

| 파일 | 위치 | 내용 |
| --- | --- | --- |
| `fs-engine.js` | 저장소 루트 | FEN·수 형식 변환, UCI 명령 처리, 난이도(Skill Level) 매핑 |
| `fs-worker.js` | 저장소 루트 | 엔진 구동을 Web Worker로 분리(탐색 중 UI 멈춤 방지) |
| `make-fsf-bundle.js` | 저장소 루트 | 엔진·워커 소스를 base64 로 내린 `fsf-bundle.js` 생성 (`file://` 대응, 7장) |
| `fsf-bundle.js` | 이 폴더 | 위 스크립트가 만든 생성물. 엔진 JS 178 KB + wasm 1.7 MB + 워커 2 KB (base64, 약 2.4 MB) |
| `build-fsf-wasm.ps1` | 저장소 루트 | 위 패치를 적용해 다시 빌드하는 스크립트 |
| `tests/fs_engine_test.js` | 저장소 루트 | FEN 왕복, perft 대조, 엔진 응답 검증 |

### 4.3 UCI 설정 (런타임)

- `UCI_Variant = janggi` — 장기 변형 사용
- `Threads = 1` — 단일 스레드
- `Hash = 16` — 메모리 절약
- `MultiPV = 6` — 우리 규칙에 어긋나는 수가 섞일 때 대체 후보 확보(5장 참고)
- `Skill Level` — 난이도: 초보 0 / 중급 8 / 고수 14 / 최강 20
- `go movetime` — 난이도별 탐색 시간: 초보 400ms / 중급 1000ms / 고수 2000ms / 최강 4000ms

## 5. 엔진과 게임 규칙의 차이

Fairy-Stockfish `janggi` 변형은 **패스(pass)** 를 허용하고(`v->pass[WHITE] = true`) **두 장이 마주 보는 상태(빅장)로 들어가는 수**도 허용한다. 본 게임은 대한장기협회 규칙에 따라 그 수를 불법으로 본다. 그래서 `fs-engine.js` 는 `MultiPV` 로 후보 여럿을 받아 **우리 규칙상 합법인 첫 수**를 고른다.

실측(초기 배치): 우리 합법 수 31 = 엔진 31(패스 제외). 이 기준은 `tests/fs_engine_test.js` 가 자동 검증한다.

### 5.1 궁성 안 장·사의 대각선 (규칙 일치)

장(將)과 사(士)는 궁성 안에서 한 칸 움직이되, **직선(상하좌우)은 궁성 어디로든** 갈 수 있고 **대각선은 궁성에 그려진 ✕ 선 위일 때만** 갈 수 있다.

| 출발 칸 | 이동 가능 | 비고 |
| --- | --- | --- |
| 궁 중앙 `(1,4)` | 8방향 전부 | ✕ 선이 중앙을 지나므로 대각선도 가능 |
| 궁 모서리 `(0,3)` | 3칸 | 직선 2칸 + ✕ 선 위 대각선 1칸 |
| 궁 변중앙 `(0,4)` | 3칸 | ✕ 선이 지나가지 않으므로 모서리 쪽 대각선 불가 |

이 정의는 Fairy-Stockfish `janggi` 변형과 완전히 일치한다(`diagonalLines` 비트보드가 궁성 ✕ 선 5칸을 정의하고, 장·사의 대각선을 그 선으로 제한한다). 궁성 9칸 × 왕/사 2종 = 18개 배치와 포 규칙 5개 배치를 `go perft 1` 로 대조해 **39건 전부 일치**함을 확인했다.

## 6. 빌드 방법

저장소 루트의 스크립트로 재현한다.

```powershell
.\build-fsf-wasm.ps1 -Emsdk C:\path\to\emsdk
```

수행 순서: ① Emscripten SDK 준비 → ② 원본 커밋의 소스 준비 → ③ 위 패치 적용 → ④ 빌드 → ⑤ 결과물 배치.

### 6.1 수동으로 빌드하기

```bash
# 1) Emscripten SDK
git clone https://github.com/emscripten-core/emsdk
cd emsdk && ./emsdk install latest && ./emsdk activate latest
source ./emsdk_env.sh          # Windows: emsdk_env.bat

# 2) 엔진 소스 (npm 1.1.12 배포본과 동일한 커밋)
git clone --branch nnue https://github.com/fairy-stockfish/fairy-stockfish.wasm
cd fairy-stockfish.wasm
git checkout b2e693ef1e111233ce3fb40685921708b3276ed6

# 3) 4.1 표의 패치를 적용한다
#    (build-fsf-wasm.ps1 의 4) 단일 스레드화 단계가 이 작업이다)

# 4) 빌드 — Makefile 이 uname/expr/grep/cp/curl/sha256sum 을 쓰므로
#    POSIX 셸이 필요하다. Windows 에서는 Git for Windows 의 bash 로 돌린다.
cd src/emscripten
make -C .. emscripten_build ARCH=wasm

# 결과물: src/stockfish.js, src/stockfish.wasm
```

빌드에 쓰이는 도구는 `emcc (Emscripten gcc/clang-like replacement) 6.0.12` 와 동봉된 `clang`/`wasm-ld` 이다.

### 6.2 원본(pthread) 빌드 그대로 재현하려면

```bash
cd fairy-stockfish.wasm/src/emscripten
npm install
make -C .. emscripten_build ARCH=wasm
node public/uci.js        # Node UCI 콘솔로 확인
```

## 7. 브라우저 동작 조건

- **`index.html` 을 더블클릭(`file://`)해도 동작한다.** 실행 파일이나 로컬 서버가 필요 없다.
- **교차 출처 격리 헤더(COOP/COEP)는 필요 없다.** 이 판은 공유 메모리를 쓰지 않는다.
- 엔진 로드에 실패하면 화면은 자동으로 내장 AI(`ai.js`)로 폴백한다.

`file://` 에서도 돌게 만든 방법은 다음과 같다. 원래는 아래 두 개가 막힌다.

| 막히는 것 | 이유 | 우회 |
| --- | --- | --- |
| `fetch('stockfish.wasm')` | `file://` 문서의 출처는 `null` 이라 CORS 를 통과하지 못한다 | `make-fsf-bundle.js` 가 엔진 JS·wasm·워커 소스를 base64 로 넣어 둔 `fsf-bundle.js` 를 만들고, 이를 `<script>` 태그로 읽어 디코드한다 |
| `new Worker('fs-worker.js')` | 로컬 파일을 스크립트로 참조할 수 없다 | 워커 소스 문자열로 `Blob` 을 만들어 `blob:` URL 로 생성한다 |

두 우회 모두 추가 설치·설정 없이 동작하며, `http://` 에서도 같은 코드를 쓴다.
`fsf-bundle.js` 는 `build-fsf-wasm.ps1` 마지막 단계에서 자동 생성된다(엔진만 단독 재생성할 때는 저장소 루트에서 `node make-fsf-bundle.js`).

브라우저가 Blob 워커까지 막으면 엔진 초기화가 실패하고 내장 AI로 폴백한다. 이 경우 상태 표시줄에 그 사실이 표시된다.

로컬 서버로 확인하려면 다음을 쓴다(필수 아님).

```
python -m http.server 8765
# → http://127.0.0.1:8765/index.html
```

## 8. 라이선스 고지

Fairy-Stockfish 및 이 WASM 빌드는 GPL-3.0이다. GPL-3.0은 파생 저작물에도 GPL-3.0을 요구하므로, 이 WASM과 함께 배포되는 본 프로젝트 전체 역시 GPL-3.0으로 배포되어야 한다. 라이선스 전문은 `Copying.txt`에 있다.

저자: Fabian Fichter 외 Fairy-Stockfish 기여자 전체 — `AUTHORS` 참조.