// make-fsf-bundle.js — Fairy-Stockfish 를 base64 로 내장한 번들 생성
// (실행: node make-fsf-bundle.js)
//
// 왜 필요하나?
//   file:// 로 열면 브라우저가 fetch() 와 외부 Worker 생성을 막는다.
//   그래서 wasm 과 엔진 스크립트를 base64 문자열로 미리 넣어 두고,
//   페이지에서 곧바로 디코드해 쓰도록 만든다.
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'third_party', 'fairy-stockfish');
const OUT = path.join(DIR, 'fsf-bundle.js');

const js = fs.readFileSync(path.join(DIR, 'stockfish.js'));
const wasm = fs.readFileSync(path.join(DIR, 'stockfish.wasm'));
const worker = fs.readFileSync(path.join(__dirname, 'fs-worker.js'));

const parts = [
  '// 자동 생성 파일 — make-fsf-bundle.js 로 생성했다. 직접 수정하지 마세요.',
  '// Fairy-Stockfish (WebAssembly) 단일 스레드 빌드, GPL-3.0',
  '// 원본: https://github.com/fairy-stockfish/fairy-stockfish.wasm',
  '(function (g) {',
  '  g.FSF_BUNDLE = {',
  '    engine: ' + JSON.stringify(js.toString('base64')) + ',',
  '    wasm: ' + JSON.stringify(wasm.toString('base64')) + ',',
  '    worker: ' + JSON.stringify(worker.toString('base64')) + ',',
  '  };',
  '})(typeof self !== "undefined" ? self : this);',
  '',
].join('\n');

fs.writeFileSync(OUT, parts, 'utf8');
console.log('생성: ' + OUT);
console.log('  크기: ' + fs.statSync(OUT).size.toLocaleString() + ' B');
console.log('  엔진 JS: ' + js.length.toLocaleString() + ' B');
console.log('  wasm   : ' + wasm.length.toLocaleString() + ' B');
console.log('  워커   : ' + worker.length.toLocaleString() + ' B');
