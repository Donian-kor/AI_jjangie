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

const REPO = process.argv[2] || path.join(process.env.TEMP || '.', 'opencode', 'chess-pieces');
const SRC = path.join(REPO, 'janggi_kakao_janggi_style_white');
const OUT = path.join(__dirname, '..', 'assets', 'pieces-kakao.js');

// 저장소 파일명 → 우리 코드 기물 문자
const PIECES = [
  ['chariot', 'R'], ['horse', 'N'], ['elephant', 'E'],
  ['cannon', 'C'], ['advisor', 'G'], ['king', 'K'], ['pawn', 'P'],
];
// 원본에서 '글자'에 쓰인 색 (fill 과 stroke 에 들어 있다)
const GLYPH_COLORS = /#e12810|#e1220a/gi;
const PLACEHOLDER = '%COLOR%';

const out = {};
let total = 0;
for (const [file, type] of PIECES) {
  const raw = fs.readFileSync(path.join(SRC, 'red_' + file + '.svg'), 'utf8');
  const hits = (raw.match(GLYPH_COLORS) || []).length;
  if (!hits) throw new Error('글자 색을 찾지 못함: ' + file);
  out[type] = raw.replace(GLYPH_COLORS, PLACEHOLDER);
  total += out[type].length;
  console.log(file.padEnd(9) + ' → ' + type + '  글자색 ' + hits + '곳 치환  ' +
              String(raw.length).padStart(5) + ' B');
}

const banner = [
  '// 자동 생성 파일 — tools/make-piece-assets.js 로 생성했다. 직접 수정하지 마세요.',
  '// 출처: https://github.com/Kadagaden/chess-pieces  (CC-BY-4.0, Kadagaden)',
  '// janggi_kakao_janggi_style_white 세트(카카오 장기 스타일) 원본 SVG.',
  "// '%COLOR%' 는 글자 색 자리표시자다. 이 문자열을 색으로 바꿔 data: URI 로 만들면",
  '// 어떤 색으로든 표시할 수 있다. 빨강·파랑 두 벌을 따로 넣지 않는다.',
  'window.JANGGI_KAKAO_SVG = ' + JSON.stringify(out, null, 1) + ';',
  '',
].join('\n');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, banner, 'utf8');
console.log('\n생성: ' + OUT);
console.log('  크기: ' + fs.statSync(OUT).size.toLocaleString() + ' B  (원본 합계 ' + total.toLocaleString() + ' B)');