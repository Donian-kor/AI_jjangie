// tests/eval_panel_test.js — 기보 창의 'AI 평가' 패널 검증 (실행: node tests/eval_panel_test.js)
// index.html 안에 있는 실제 함수들을 그대로 꺼내 실행한다 (복사본이 아니라 진짜 코드).
// 점수 변환 · 표시 문구 · 추천 수 · 오래된 응답 버리기 등을 확인한다.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const J = require('../janggi.js');
const FS = require('../fs-engine.js');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// index.html 에서 이름으로 함수를 찾아 통째로 뽑아 낸다
// (async 함수라면 `async` 키워드도 함께 가져와야 한다)
function extractFunc(name) {
  const start = HTML.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('index.html 에 ' + name + ' 이(가) 없습니다');
  const before = HTML.slice(Math.max(0, start - 6), start);
  const isAsync = /\basync\s+$/.test(before);
  let i = HTML.indexOf('{', start);
  let depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) throw new Error(name + ' 의 끝을 찾지 못했습니다');
  const body = HTML.slice(start, i + 1);
  return isAsync ? 'async ' + body : body;
}

// 실행 환경 (display 를 흉내 낸 가짜 DOM)
function makeCtx(over) {
  const ctx = {
    console,
    J,
    JanggiFS: FS,
    lang: 'hanja',
    game: { board: J.initialBoard(), turn: J.CHO },
    vsHuman: false,
    humanSide: J.CHO,
    thinking: false,
    anim: null,
    guardBusy: false,
    viewState: null,
    evalToken: 0,
    evalInfo: null,
    engine: null,
    engineState: 'ready',
    EVAL_MS: 400,
    engineEvalEl: { hidden: true, innerHTML: '', className: '' },
    // 기보 창이 열려 있어야 평가를 한다 (movesBoxEl.hidden 이 true 면 평가 안 함)
    movesBoxEl: { hidden: false },
  };
  Object.assign(ctx, over || {});
  vm.createContext(ctx);
  // index.html 은 이 둘을 `let` 으로 선언하지만, 테스트에서 값을 살펴볼 수 있게
  // 같은 이름의 `var` 로 바꿔 붙인다(동작은 동일).
  const src = 'var evalToken = 0;\nvar evalInfo = null;\n' +
    ['evalCp', 'evalSide', 'evalSideName', 'renderEngineEval', 'clearEngineEval', 'refreshEngineEval',
      'moveParts', 'posText'].map(extractFunc).join('\n');
  vm.runInContext(src, ctx);
  return ctx;
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

(async function main() {
  console.log('AI 평가 패널 테스트');

  test('evalCp: cp 를 그대로 돌려준다', () => {
    assert.strictEqual(makeCtx().evalCp({ cp: 120, mate: null }), 120);
    assert.strictEqual(makeCtx().evalCp({ cp: -85, mate: null }), -85);
  });

  test('evalCp: null 입력·cp 없음 은 null', () => {
    const ctx = makeCtx();
    assert.strictEqual(ctx.evalCp(null), null);
    assert.strictEqual(ctx.evalCp({ cp: null, mate: null }), null);
  });

  test('evalCp: mate 0 은 0 (버그 아님)', () => {
    assert.strictEqual(makeCtx().evalCp({ cp: null, mate: 0 }), 0);
  });

  test('evalCp: mate 는 ±30000 안쪽의 비교 점수로 바뀐다', () => {
    const ctx = makeCtx();
    assert.strictEqual(ctx.evalCp({ cp: null, mate: 1 }), 29990);
    assert.strictEqual(ctx.evalCp({ cp: null, mate: 3 }), 29970);
    assert.strictEqual(ctx.evalCp({ cp: null, mate: -1 }), -29990);
    assert.strictEqual(ctx.evalCp({ cp: null, mate: -5 }), -29950);
  });

  test('evalSide: AI와 두면 내(사람) 쪽, 사람끼리면 지금 차례', () => {
    const ctx = makeCtx({ vsHuman: false, humanSide: J.CHO });
    assert.strictEqual(ctx.evalSide(), J.CHO);
    ctx.humanSide = J.HAN;
    assert.strictEqual(ctx.evalSide(), J.HAN);
    ctx.vsHuman = true;
    ctx.game.turn = J.HAN;
    assert.strictEqual(ctx.evalSide(), J.HAN);
  });

  test('evalSideName: 초/한', () => {
    const ctx = makeCtx();
    assert.strictEqual(ctx.evalSideName(J.CHO), '초');
    assert.strictEqual(ctx.evalSideName(J.HAN), '한');
  });

  // ---- 표시(renderEngineEval) -----------------------------------------

  test('표시: cp 가 음수면 불리, 양수면 유리 라고 쓴다', () => {
    const ctx = makeCtx();
    ctx.evalInfo = { cp: 150, uci: null, turn: J.CHO };
    ctx.renderEngineEval();
    assert.strictEqual(ctx.engineEvalEl.hidden, false);
    assert.ok(/초 쪽 \+1\.5점 \(유리\)/.test(ctx.engineEvalEl.innerHTML), ctx.engineEvalEl.innerHTML);
    assert.ok(/plus/.test(ctx.engineEvalEl.className), ctx.engineEvalEl.className);
  });

  test('표시: 불리할 때 minus 색이 된다', () => {
    const ctx = makeCtx();
    ctx.evalInfo = { cp: -150, uci: null, turn: J.CHO };
    ctx.renderEngineEval();
    assert.ok(/초 쪽 -1\.5점 \(불리\)/.test(ctx.engineEvalEl.innerHTML), ctx.engineEvalEl.innerHTML);
    assert.ok(/minus/.test(ctx.engineEvalEl.className), ctx.engineEvalEl.className);
  });

  test('표시: 거의 비김이면 유리/불리가 아니다', () => {
    const ctx = makeCtx();
    ctx.evalInfo = { cp: 10, uci: null, turn: J.CHO };
    ctx.renderEngineEval();
    assert.ok(/거의 비김/.test(ctx.engineEvalEl.innerHTML), ctx.engineEvalEl.innerHTML);
    assert.ok(!/plus|minus/.test(ctx.engineEvalEl.className), ctx.engineEvalEl.className);
  });

  test('표시: 아주 작은 점수는 +0.0 이 아니라 0.0 으로 쓴다', () => {
    const ctx = makeCtx();
    ctx.evalInfo = { cp: 4, uci: null, turn: J.CHO };
    ctx.renderEngineEval();
    assert.ok(/0\.0점 \(거의 비김\)/.test(ctx.engineEvalEl.innerHTML), ctx.engineEvalEl.innerHTML);
  });

  test('표시: 메이트는 승리/패배 임박 으로 쓴다', () => {
    const ctx = makeCtx();
    ctx.evalInfo = { cp: 29990, uci: null, turn: J.CHO };
    ctx.renderEngineEval();
    assert.ok(/초 쪽 승리 임박/.test(ctx.engineEvalEl.innerHTML), ctx.engineEvalEl.innerHTML);
    ctx.evalInfo = { cp: -29990, uci: null, turn: J.CHO };
    ctx.renderEngineEval();
    assert.ok(/초 쪽 패배 임박/.test(ctx.engineEvalEl.innerHTML), ctx.engineEvalEl.innerHTML);
  });



  test('표시: 추천 수는 지금 판에 있는 기물일 때만 보여 준다', () => {
    const ctx = makeCtx();
    // a1 = 우리 좌표 (0,0) 에 한(검정) 차가 있다 → FS 좌표 a10? 아니, 우리 행0 = FS 1번 랭크
    const mv = { fr: 0, fc: 0, tr: 3, tc: 4 };
    ctx.evalInfo = { cp: 50, uci: FS.moveToUci(mv), turn: J.CHO };
    ctx.renderEngineEval();
    assert.ok(/추천 수: /.test(ctx.engineEvalEl.innerHTML), ctx.engineEvalEl.innerHTML);
    assert.ok(/車 1열 10줄 → 5열 7줄/.test(ctx.engineEvalEl.innerHTML), ctx.engineEvalEl.innerHTML);
  });

  test('표시: 빈 칸에서 출발하는 추천 수는 보여 주지 않는다', () => {
    const ctx = makeCtx();
    const mv = { fr: 4, fc: 4, tr: 5, tc: 4 };   // 가운데 빈 칸
    ctx.evalInfo = { cp: 50, uci: FS.moveToUci(mv), turn: J.CHO };
    ctx.renderEngineEval();
    assert.ok(!/추천 수/.test(ctx.engineEvalEl.innerHTML), ctx.engineEvalEl.innerHTML);
  });

  test('표시: 판이 바뀌었으면(차례가 바뀌었으면) 숨긴다', () => {
    const ctx = makeCtx();
    ctx.evalInfo = { cp: 100, uci: null, turn: J.CHO };
    ctx.game.turn = J.HAN;                     // 판이 넘어감
    ctx.renderEngineEval();
    assert.strictEqual(ctx.engineEvalEl.hidden, true);
    assert.strictEqual(ctx.engineEvalEl.innerHTML, '');
  });

  test('표시: 기보를 되짚어 보는 중이면 숨긴다', () => {
    const ctx = makeCtx();
    ctx.evalInfo = { cp: 100, uci: null, turn: J.CHO };
    ctx.viewState = { idx: 0 };
    ctx.renderEngineEval();
    assert.strictEqual(ctx.engineEvalEl.hidden, true);
  });

  test('표시: 평가값이 없으면 숨긴다', () => {
    const ctx = makeCtx();
    ctx.evalInfo = null;
    ctx.renderEngineEval();
    assert.strictEqual(ctx.engineEvalEl.hidden, true);
    ctx.evalInfo = { cp: null, uci: null, turn: J.CHO };
    ctx.renderEngineEval();
    assert.strictEqual(ctx.engineEvalEl.hidden, true);
  });

  // ---- 새로 고침(refreshEngineEval) -------------------------------------

  // 엔진 흉내: analyze 를 호출하면 정해진 답을 돌려준다
  function fakeEngine(answers) {
    const calls = [];
    return {
      calls,
      analyze(fen, ms) {
        calls.push({ fen, ms });
        const a = answers.shift();
        return Promise.resolve(a === undefined ? { cp: 0, mate: null, uci: null } : a);
      },
    };
  }

  await testAsync('새로고침: 엔진 답을 받아 점수와 추천 수를 보여 준다', async () => {
    const ctx = makeCtx();
    ctx.engine = fakeEngine([{ cp: 220, mate: null, uci: 'a1e4' }]);
    await ctx.refreshEngineEval();
    assert.strictEqual(ctx.engineEvalEl.hidden, false);
    assert.ok(/초 쪽 \+2\.2점 \(유리\)/.test(ctx.engineEvalEl.innerHTML), ctx.engineEvalEl.innerHTML);
    assert.ok(/추천 수: /.test(ctx.engineEvalEl.innerHTML), ctx.engineEvalEl.innerHTML);
  });

  await testAsync('새로고침: AI 차례에는 평가하지 않는다', async () => {
    const ctx = makeCtx({ humanSide: J.CHO });
    ctx.game.turn = J.HAN;                 // AI(한) 차례
    ctx.engine = fakeEngine([{ cp: 100, mate: null, uci: null }]);
    await ctx.refreshEngineEval();
    assert.strictEqual(ctx.engine.calls.length, 0, 'AI 차례에도 엔진을 부름');
    assert.strictEqual(ctx.engineEvalEl.hidden, true);
  });

  await testAsync('새로고침: 사람이 두는 차례에는 평가한다', async () => {
    const ctx = makeCtx({ humanSide: J.CHO });
    ctx.game.turn = J.CHO;
    ctx.engine = fakeEngine([{ cp: 100, mate: null, uci: null }]);
    await ctx.refreshEngineEval();
    assert.strictEqual(ctx.engine.calls.length, 1);
    assert.strictEqual(ctx.engineEvalEl.hidden, false);
  });

  await testAsync('새로고침: 사람이 한(위) 쪽이면 그쪽 차례로 평가한다', async () => {
    const ctx = makeCtx({ humanSide: J.HAN });
    ctx.game.turn = J.HAN;
    ctx.engine = fakeEngine([{ cp: -100, mate: null, uci: null }]);
    await ctx.refreshEngineEval();
    assert.strictEqual(ctx.engine.calls.length, 1);
    assert.ok(/한 쪽 -1\.0점 \(불리\)/.test(ctx.engineEvalEl.innerHTML), ctx.engineEvalEl.innerHTML);
  });

  await testAsync('새로고침: 사람끼리 대국이면 지금 차례 기준으로 평가한다', async () => {
    const ctx = makeCtx({ vsHuman: true, humanSide: J.CHO });
    ctx.game.turn = J.HAN;                 // 한 차례여도 평가한다
    ctx.engine = fakeEngine([{ cp: 100, mate: null, uci: null }]);
    await ctx.refreshEngineEval();
    assert.strictEqual(ctx.engine.calls.length, 1);
    assert.ok(/한 쪽 \+1\.0점/.test(ctx.engineEvalEl.innerHTML), ctx.engineEvalEl.innerHTML);
  });

  await testAsync('새로고침: AI 가 생각하는 중이거나 애니메이션 중이면 건드리지 않는다', async () => {
    const ctx = makeCtx();
    ctx.engine = fakeEngine([{ cp: 100, mate: null, uci: null }]);
    ctx.thinking = true;
    await ctx.refreshEngineEval();
    assert.strictEqual(ctx.engine.calls.length, 0);
    ctx.thinking = false;
    ctx.anim = {};
    await ctx.refreshEngineEval();
    assert.strictEqual(ctx.engine.calls.length, 0);
  });

  await testAsync('새로고침: 기보 되보기 중에는 평가하지 않는다', async () => {
    const ctx = makeCtx();
    ctx.engine = fakeEngine([{ cp: 100, mate: null, uci: null }]);
    ctx.viewState = { idx: 0 };
    await ctx.refreshEngineEval();
    assert.strictEqual(ctx.engine.calls.length, 0);
  });

  await testAsync('새로고침: 엔진이 없으면 패널을 숨긴다', async () => {
    const ctx = makeCtx();
    ctx.engine = null;
    await ctx.refreshEngineEval();
    assert.strictEqual(ctx.engineEvalEl.hidden, true);
  });

  await testAsync('새로고침: 기보 창이 닫혀 있으면 엔진을 부르지 않는다', async () => {
    const ctx = makeCtx();
    ctx.engine = fakeEngine([{ cp: 100, mate: null, uci: null }]);
    ctx.movesBoxEl.hidden = true;      // 기보 창을 닫아 둔 상태
    await ctx.refreshEngineEval();
    assert.strictEqual(ctx.engine.calls.length, 0, '닫힌 기보 창에 대해서도 엔진을 탐색함');
    assert.strictEqual(ctx.engineEvalEl.hidden, true);
  });

  await testAsync('새로고침: 기보 창을 열면 다시 평가한다', async () => {
    const ctx = makeCtx();
    ctx.engine = fakeEngine([{ cp: 100, mate: null, uci: null }]);
    ctx.movesBoxEl.hidden = true;
    await ctx.refreshEngineEval();
    assert.strictEqual(ctx.engine.calls.length, 0);
    ctx.movesBoxEl.hidden = false;     // 기보 창을 열었다
    await ctx.refreshEngineEval();
    assert.strictEqual(ctx.engine.calls.length, 1);
    assert.strictEqual(ctx.engineEvalEl.hidden, false);
  });

  test('clearEngineEval: 평가를 지우고 패널을 숨긴다', () => {
    const ctx = makeCtx();
    ctx.evalInfo = { cp: 100, uci: null, turn: J.CHO };
    ctx.renderEngineEval();
    assert.strictEqual(ctx.engineEvalEl.hidden, false);
    ctx.clearEngineEval();
    assert.strictEqual(ctx.evalInfo, null);
    assert.strictEqual(ctx.engineEvalEl.hidden, true);
    assert.strictEqual(ctx.engineEvalEl.innerHTML, '');
  });

  test('clearEngineEval: 늦게 도착할 평가 답을 버린다', async () => {
    const ctx = makeCtx();
    let resolveFn = null;
    ctx.engine = {
      analyze() { return new Promise((res) => { resolveFn = res; }); },
    };
    const p = ctx.refreshEngineEval();      // 평가 시작 (답을 늦게 준다)
    ctx.clearEngineEval();                  // 창을 닫아서 취소
    resolveFn({ cp: 500, mate: null, uci: null });
    await p;
    assert.strictEqual(ctx.evalInfo, null, '취소된 평가 답이 반영됨');
    assert.strictEqual(ctx.engineEvalEl.hidden, true);
  });

  await testAsync('새로고침: 늦게 온 옛 답은 버린다 (evalToken)', async () => {
    const ctx = makeCtx();
    let resolveFirst;
    const engine = {
      calls: [],
      analyze(fen, ms) {
        this.calls.push(fen);
        if (this.calls.length === 1) {
          return new Promise((res) => { resolveFirst = res; });
        }
        return Promise.resolve({ cp: 880, mate: null, uci: null });
      },
    };
    ctx.engine = engine;
    const p1 = ctx.refreshEngineEval();       // 1번 요청(답을 늦게 준다)
    const p2 = ctx.refreshEngineEval();       // 2번 요청(즉시 답)
    await p2;
    assert.ok(/8\.8점/.test(ctx.engineEvalEl.innerHTML), ctx.engineEvalEl.innerHTML);
    resolveFirst({ cp: 111, mate: null, uci: null });
    await p1;
    // 늦게 온 1번 답은 무시되어야 한다 (1.11점이 찍히면 안 된다)
    assert.ok(!/1\.11점/.test(ctx.engineEvalEl.innerHTML), ctx.engineEvalEl.innerHTML);
    assert.ok(/8\.8점/.test(ctx.engineEvalEl.innerHTML), ctx.engineEvalEl.innerHTML);
  });

  await testAsync('새로고침: 판이 바뀌었으면 늦게 온 답은 표시하지 않는다', async () => {
    const ctx = makeCtx();
    let resolveFn;
    ctx.engine = {
      analyze() { return new Promise((res) => { resolveFn = res; }); },
    };
    const p = ctx.refreshEngineEval();
    ctx.game.turn = J.HAN;                    // 수를 두어 판이 바뀜
    resolveFn({ cp: 100, mate: null, uci: null });
    await p;
    assert.strictEqual(ctx.engineEvalEl.hidden, true, '옛 국면의 점수가 보임');
  });

  await testAsync('새로고침: 엔진이 죽어도 화면은 조용히 숨겨진다', async () => {
    const ctx = makeCtx();
    ctx.engine = { analyze() { return Promise.reject(new Error('엔진 오류')); } };
    await ctx.refreshEngineEval();
    assert.strictEqual(ctx.engineEvalEl.hidden, true);
  });

  // ---- 실제 엔진 연동 ---------------------------------------------------
  const DIR = path.join(__dirname, '..', 'third_party', 'fairy-stockfish');
  if (!fs.existsSync(path.join(DIR, 'stockfish.wasm'))) {
    console.log('  건너뜀: third_party/fairy-stockfish/stockfish.wasm 이 없어 엔진 연동 테스트를 하지 않음');
  } else {
    const engine = await FS.createEngine();
    await engine.handshake();

    await testAsync('실제 엔진: 지금 국면을 평가하면 점수와 추천 수가 나온다', async () => {
      const ctx = makeCtx();
      ctx.engine = engine;
      await ctx.refreshEngineEval();
      assert.strictEqual(ctx.engineEvalEl.hidden, false, '평가가 보이지 않음');
      assert.ok(/AI 평가: /.test(ctx.engineEvalEl.innerHTML), ctx.engineEvalEl.innerHTML);
      assert.ok(/추천 수: /.test(ctx.engineEvalEl.innerHTML), ctx.engineEvalEl.innerHTML);
    });

    await testAsync('실제 엔진: 추천 수가 지금 판에서 둘 수 있는 수다', async () => {
      const ctx = makeCtx();
      ctx.engine = engine;
      await ctx.refreshEngineEval();
      const m = /추천 수: .*?(\d+)열 (\d+)줄 → (\d+)열 (\d+)줄/.exec(ctx.engineEvalEl.innerHTML);
      assert.ok(m, '추천 수 문구를 못 찾음: ' + ctx.engineEvalEl.innerHTML);
      const from = { fr: 10 - Number(m[2]), fc: Number(m[1]) - 1 };
      const to = { tr: 10 - Number(m[4]), tc: Number(m[3]) - 1 };
      const legal = J.legalMoves(ctx.game.board, ctx.game.turn);
      const ok = legal.some((k) => k.fr === from.fr && k.fc === from.fc && k.tr === to.tr && k.tc === to.tc);
      assert.ok(ok, '추천 수가 규칙상 둘 수 없는 수: ' + JSON.stringify({ from, to }));
    });

    await testAsync('실제 엔진: 평가와 AI 탐색이 겹쳐도 서로 방해하지 않는다', async () => {
      const ctx = makeCtx();
      ctx.engine = engine;
      const fen = FS.boardToFen(J.initialBoard(), J.CHO);
      const pEval = ctx.refreshEngineEval();                       // 평가 시작
      const cands = await engine.bestMove(fen, 2);                  // AI 탐색
      await pEval;
      assert.ok(Array.isArray(cands) && cands.length > 0, 'AI 탐색 결과 없음');
      const r = await engine.analyze(fen, 200);
      assert.ok(r.cp !== null || r.mate !== null, '탐색 뒤 평가가 깨짐: ' + JSON.stringify(r));
    });
  }

  console.log('\n' + passed + '개 통과');
})();

