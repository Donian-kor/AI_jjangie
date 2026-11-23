// tools/make-piece-assets.js — chess-pieces 저장소의 카카오 스타일 장기 말을
// 색만 바꿀 수 있게 JS 로 내린 파일을 만든다.
//
//   node tools/make-piece-assets.js [chess-pieces 저장소 경로]
//
// 왜 JS 로 내는가?
//   file:// 에서는 fetch() 가 막혀 SVG 원본을 읽어올 수 없다.
//   또한 <img> 로 그린 SVG 는 색을 바꿀 수 없다.
//   원본 문자열을 미리 넣어 두고, 글자 색만 치환한 data: URI 로 그리면
//   서버 없이도 어떤 색으로든 표시할 수 있다.
'use strict';
const fs = require('fs');
const path = require('path');

// 인수가 있으면 chess-pieces 저장소 루트로 보고, 없으면 이 프로젝트에 보관한 소스를 쓴다.
const SRC = process.argv[2]
  ? path.join(process.argv[2], 'janggi_kakao_janggi_style_white')
  : path.join(__dirname, '..', 'assets', 'janggi_kakao_janggi_style_white');
const OUT = path.join(__dirname, '..', 'assets', 'pieces-kakao.js');

// 저장소 파일명 → 우리 코드 기물 문자
const PIECES = [
  ['chariot', 'R'], ['horse', 'N'], ['elephant', 'E'],
  ['cannon', 'C'], ['advisor', 'G'], ['king', 'K'], ['pawn', 'P'],
];
// 진영별 원본 파일과 '글자'에 쓰인 색 (fill 과 stroke 에 들어 있다).
// 파랑 세트는 빨강 세트를 단순히 색만 바꾼 것이 아니라 모양도 다르므로 각각 내장한다.
const SIDES = {
  C: { prefix: 'blue_', glyph: /#112d94|#112c92|#112c91/gi },  // 초(파랑)
  H: { prefix: 'red_', glyph: /#e12810|#e1220a/gi },           // 한(빨강)
};
const PLACEHOLDER = '%COLOR%';

const out = {};
let total = 0;
for (const [file, type] of PIECES) {
  out[type] = {};
  for (const side of ['C', 'H']) {
    const cfg = SIDES[side];
    const raw = fs.readFileSync(path.join(SRC, cfg.prefix + file + '.svg'), 'utf8');
    const hits = (raw.match(cfg.glyph) || []).length;
    if (!hits) throw new Error('글자 색을 찾지 못함: ' + cfg.prefix + file);
    out[type][side] = raw.replace(cfg.glyph, PLACEHOLDER);
    total += out[type][side].length;
  }
  console.log(file.padEnd(9) + ' → ' + type + '  초/한 SVG 각각 내장  ' +
              String(out[type].C.length + out[type].H.length).padStart(5) + ' B');
}

const banner = [
  '// 자동 생성 파일 — tools/make-piece-assets.js 로 생성했다. 직접 수정하지 마세요.',
  '// 출처: assets/janggi_kakao_janggi_style_white/ (원본: Kadagaden/chess-pieces, CC-BY-4.0)',
  '// janggi_kakao_janggi_style_white 세트(카카오 장기 스타일) 원본 SVG.',
  "// '%COLOR%' 는 글자 색 자리표시자다. 이 문자열을 색으로 바꿔 data: URI 로 만든다.",
  '// 초(C)와 한(H) 원본의 모양이 다르므로 기물별로 두 벌을 함께 내장한다.',
  'window.JANGGI_KAKAO_SVG = ' + JSON.stringify(out, null, 1) + ';',
  '',
].join('\n');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, banner, 'utf8');
console.log('\n생성: ' + OUT);
console.log('  크기: ' + fs.statSync(OUT).size.toLocaleString() + ' B  (원본 합계 ' + total.toLocaleString() + ' B)');