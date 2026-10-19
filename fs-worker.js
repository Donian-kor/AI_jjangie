// fs-worker.js — Fairy-Stockfish(WebAssembly)를 별도 스레드에서 돌리는 워커
// 브라우저 UI가 탐색 중 멈추지 않도록 엔진은 이 워커 안에서 구동한다.
//
// third_party 에 있는 판은 -s USE_PTHREADS 없이 빌드한 단일 스레드 판이라
// 공유 메모리(SharedArrayBuffer)도 COOP/COEP 헤더도 필요 없다.
//
// 이 워커는 Blob URL 로 만들어 진다. file:// 로 열면 브라우저가 외부 Worker
// 파일 생성과 fetch() 를 막는데, Blob URL Worker 와 인라인 base64 는 둘 다
// 허용되므로 서버 없이도 엔진이 동작한다.

'use strict';

let fsEngine = null;

function decodeBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function boot(bundle) {
  // 엔진 스크립트를 평가해 전역에 정의한다
  const src = new TextDecoder().decode(decodeBase64(bundle.engine));
  (0, eval)(src + '\nself.Stockfish = Stockfish;\n//# sourceURL=fs-stockfish.js');
  if (typeof self.Stockfish !== 'function') throw new Error('엔진 스크립트를 불러오지 못했습니다');

  // wasm 는 base64 로 들어왔으므로 파일 로드가 필요 없다
  const wasmBinary = decodeBase64(bundle.wasm);
  fsEngine = await self.Stockfish({ wasmBinary });

  // 엔진 런타임이 완전히 초기화될 때까지 uciok 을 한 번 받아낸 뒤 'ready' 를 알린다.
  // (바로 명령을 보내면 엔진이 아직起步하지 않아 응답이 사라진다)
  const uciOk = new Promise((resolve) => {
    fsEngine.addMessageListener((line) => {
      if (/^uciok/.test(line)) resolve();
    });
  });
  fsEngine.addMessageListener((line) => self.postMessage({ type: 'line', line }));
  fsEngine.postMessage('uci');
  await uciOk;
  self.postMessage({ type: 'ready' });
}

self.onmessage = async function (ev) {
  const msg = ev.data;
  try {
    if (msg.type === 'init') { await boot(msg.bundle); return; }
    if (msg.type === 'cmd') {
      if (!fsEngine) throw new Error('엔진이 아직 준비되지 않았습니다');
      fsEngine.postMessage(msg.cmd);
    }
  } catch (e) {
    self.postMessage({ type: 'error', message: (e && e.message) || String(e) });
  }
};