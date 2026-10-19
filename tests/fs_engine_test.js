// tests/fs_engine_test.js — Fairy-Stockfish 연동 검증 (실행: node tests/fs_engine_test.js)
// 검증: FEN 왕복 · 수 형식 · 시작 배치 일치 · 엔진이 두는 수가 우리 규칙상 합법인지 · 복기(analyze) 점수
// 주의: 엔진에 quit 을 보내면 Node 프로세스가 종료되므로 엔진은 테스트 전체에서 하나만 쓴다.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const J = require('../janggi.js');
const FS = require('../fs-engine.js');

const DIR = path.join(__dirname, '..', 'third_party', 'fairy-stockfish');
if (!fs.existsSync(path.join(DIR, 'stockfish.wasm'))) {
  console.log('third_party/fairy-stockfish/stockfish.wasm 없음 — 테스트 건너뜀');
  process.exit(0);
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  통과: ' + name);
  } catch (e) {
    console.error('  실패: ' + name);
    console.error('    ' + (e && e.message));
    process.exitCode = 1;
  }
}
async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  통과: ' + name);
  } catch (e) {
    console.error('  실패: ' + name);
    console.error('    ' + (e && e.message));
    process.exitCode = 1;
  }
}

// 엔진 startpos (janggi 변형). 대문자=초(아래), 뒷줄 중앙은 비고 장은 궁 중앙에 있다.
const STARTPOS = 'rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR w - - 0 1';

(async function main() {
  console.log('Fairy-Stockfish 연동 테스트');

  test('FEN: 초기 배치가 엔진 startpos와 일치', () => {
    assert.strictEqual(FS.boardToFen(J.initialBoard(), J.CHO), STARTPOS);
  });

  test('FEN: 왕복 변환 (초/한 진영, 차림 4종 전부)', () => {
    for (const layout of ['masangsangma', 'sangmamasang', 'masangmasang', 'sangmasangma']) {
      for (const turn of [J.CHO, J.HAN]) {
        const b = J.initialBoard(layout, layout);
        assert.deepStrictEqual(FS.fenToBoard(FS.boardToFen(b, turn)), b, layout);
      }
    }
  });

  test('FEN: 잘못된 FEN 은 오류를 낸다', () => {
    assert.throws(() => FS.fenToBoard('rnba1abnr/4k4'), /줄 수/, '줄 수가 모자람');
    assert.throws(() => FS.fenToBoard(
      'rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABN'),
      /열 수/, '마지막 줄이 한 칸 모자람');
    assert.throws(() => FS.fenToBoard(
      'xnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR'),
      /기물/, '모르는 기물 글자');
  });

  test('FEN: 한(위)은 소문자, 초(아래)는 대문자', () => {
    const rows = FS.boardToFen(J.initialBoard(), J.CHO).split(' ');
    assert.strictEqual(rows[0].split('/')[0], 'rnba1abnr', '첫 줄 = 한 뒷줄');
    assert.strictEqual(rows[0].split('/')[9], 'RNBA1ABNR', '마지막 줄 = 초 뒷줄');
  });

  test('수 형식: 엔진 좌표 ↔ 우리 좌표 왕복', () => {
    for (const m of [
      { fr: 0, fc: 0, tr: 3, tc: 4 },
      { fr: 1, fc: 4, tr: 0, tc: 4 },
      { fr: 9, fc: 8, tr: 6, tc: 7 },
    ]) {
      assert.deepStrictEqual(FS.uciToMove(FS.moveToUci(m)), m);
    }
    assert.strictEqual(FS.moveToUci({ fr: 0, fc: 0, tr: 3, tc: 4 }), 'a1e4');
    assert.strictEqual(FS.moveToUci({ fr: 1, fc: 4, tr: 0, tc: 4 }), 'e2e1');
    assert.strictEqual(FS.moveToUci({ fr: 9, fc: 0, tr: 3, tc: 2 }), 'a10c4');   // 10 랭크
    assert.deepStrictEqual(FS.uciToMove('a10c4'), { fr: 9, fc: 0, tr: 3, tc: 2 });
    assert.strictEqual(FS.uciToMove('bad!'), null);
  });

  const engine = await FS.createEngine();
  const uciLines = [];
  engine.addListener((l) => uciLines.push(l));
  await engine.handshake();

  test('엔진: uci 응답에 janggi 변형이 포함됨', () => {
    assert.ok(uciLines.some((l) => /UCI_Variant/.test(l) && /janggi/.test(l)), 'janggi 변형 없음');
  });

  await testAsync('복기: analyze 가 최선 수와 점수(둔 쪽 관점)를 돌려줌', async () => {
    const r = await engine.analyze(FS.boardToFen(J.initialBoard(), J.CHO), 300);
    assert.ok(r.uci === null || /^[a-i][0-9]{1,2}[a-i][0-9]{1,2}$/.test(r.uci), '수 형식 이상: ' + r.uci);
    assert.ok(r.cp !== null || r.mate !== null, '점수가 없음');
    if (r.cp !== null) assert.ok(Math.abs(r.cp) < 2000, '시작 배치인데 점수가 크게 기움: ' + r.cp);
  });

  await testAsync('복기: 초 차를 뺀 국면이 더 나쁘게 평가됨 (눈금 확인)', async () => {
    const full = await engine.analyze(FS.boardToFen(J.initialBoard(), J.HAN), 300);
    const b = J.initialBoard();
    b[0][0] = null;            // 초 차 하나 제거 → 한(둔 쪽)이 유리해져야 한다
    const less = await engine.analyze(FS.boardToFen(b, J.HAN), 300);
    assert.ok(full.cp !== null && less.cp !== null, '점수 없음');
    assert.ok(less.cp - full.cp > 200, '차를 뺐는데 유리해지지 않음: ' + (less.cp - full.cp));
  });

  await testAsync('규칙 정합: 시작 배치의 합법 수가 엔진과 일치 (31 = 31)', async () => {
    const fen = FS.boardToFen(J.initialBoard(), J.CHO);
    // 엔진은 '패스'를 허용하므로 perft(1) 에 1 이 더한다
    const engineMoves = await engine.perft(fen, 1) - 1;
    assert.strictEqual(J.legalMoves(J.initialBoard(), J.CHO).length, engineMoves);
    assert.strictEqual(engineMoves, 31);
  });

  await testAsync('엔진: 시작 배치에서 최선의 수를 반환', async () => {
    const cands = await engine.bestMove(FS.boardToFen(J.initialBoard(), J.CHO), 3);
    assert.ok(Array.isArray(cands) && cands.length > 0, '후보 수 없음');
    for (const c of cands) assert.ok(/^[a-i][0-9]{1,2}[a-i][0-9]{1,2}$/.test(c), '수 형식 이상: ' + c);
  });

  await testAsync('규칙 정합: 엔진 후보 중 우리 규칙상 합법인 수가 반드시 있음', async () => {
    const g = new J.Game();
    let played = 0;
    for (let i = 0; i < 12; i++) {
      const cands = await engine.bestMove(FS.boardToFen(g.board, g.turn), 1);
      const legal = g.moves();
      const pick = (cands || []).map((c) => FS.uciToMove(c)).find((mv) => mv &&
        !(mv.fr === mv.tr && mv.fc === mv.tc) &&
        legal.some((m) => m.fr === mv.fr && m.fc === mv.fc && m.tr === mv.tr && m.tc === mv.tc));
      assert.ok(pick, (i + 1) + '수째: 엔진 후보 ' + JSON.stringify(cands) + ' 중 합법 수가 없음');
      g.play(pick);
      played++;
      if (g.result) break;
    }
    assert.ok(played >= 8, '대국이 진행되지 않음: ' + played + '수');
  });

  await testAsync('규칙 정합: 후보를 걸러 두는 대국이 외통수 국면에 빠지지 않음', async () => {
    // 엔진 규칙은 '외통수 진입'을 허용하므로, 우리 규칙으로 한 수씩 걸러 두면서
    // 판이 깨지거나(외통수 국면) 멈추지 않는지 확인한다.
    const g = new J.Game();
    let played = 0;
    for (let i = 0; i < 6; i++) {
      const cands = await engine.bestMove(FS.boardToFen(g.board, g.turn), 1);
      const legal = g.moves();
      const pick = (cands || []).map((c) => FS.uciToMove(c)).find((mv) => mv &&
        !(mv.fr === mv.tr && mv.fc === mv.tc) &&
        legal.some((m) => m.fr === mv.fr && m.fc === mv.fc && m.tr === mv.tr && m.tc === mv.tc));
      assert.ok(pick, (i + 1) + '수째 합법 후보가 없음');
      g.play(pick);
      played++;
      assert.strictEqual(J.generalsFace(g.board), false, '외통수 국면이 되면 안 됨');
      if (g.result) break;
    }
    assert.ok(played >= 5, '대국이 진행되지 않음: ' + played + '수');
  });

  if (process.exitCode) console.log('\n일부 테스트 실패');
  else console.log('\n전체 ' + passed + '개 테스트 통과');
  engine.stop();
  process.exit(process.exitCode || 0);
})();