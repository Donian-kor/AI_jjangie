// ai.js — 장기 인공지능 (minimax + alpha-beta + 반복 심화)
(function (global) {
  'use strict';

  const Janggi = typeof require === 'function' && typeof window === 'undefined'
    ? require('./janggi.js')
    : global.Janggi;

  // 기물 점수 (공식 점수: 차13·포7·마5·상3·사3·졸2, ×100)
  const VALUES = { R: 1300, C: 700, N: 500, E: 300, G: 300, P: 200, K: 0 };
  const MATE = 900000;

  // 평가 함수: side 관점에서 양수면 side가 유리
  function evaluate(b, side) {
    let score = 0;
    for (let r = 0; r < Janggi.ROWS; r++) {
      for (let c = 0; c < Janggi.COLS; c++) {
        const p = b[r][c];
        if (!p) continue;
        let v = VALUES[p.type];
        if (p.type === 'P') {
          // 졸은 전진할수록, 적 궁성에 들어갈수록 가치 상승
          const adv = p.side === Janggi.CHO ? r : (Janggi.ROWS - 1 - r);
          v += adv * 8;
          if (Janggi.inPalace(Janggi.other(p.side), r, c)) v += 60;
        }
        score += p.side === side ? v : -v;
      }
    }
    return score;
  }

  // 이동 정렬: 많이 잡는 수(높은 값 기물)부터 → 가지치기 효율 ↑
  function orderMoves(b, moves) {
    return moves
      .map((m) => {
        const t = b[m.tr][m.tc];
        return { m, k: t ? VALUES[t.type] : 0 };
      })
      .sort((a, z) => z.k - a.k)
      .map((x) => x.m);
  }

  // 평가만으로 끝나는 정적 기물 교환(과도한 잡기 손실 방지)
  function quiesce(b, side, alpha, beta, ctx) {
    if (++ctx.nodes % 512 === 0 && Date.now() > ctx.deadline) ctx.abort = true;
    if (ctx.abort) return 0;
    const stand = evaluate(b, side);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    const caps = Janggi.legalMoves(b, side).filter((m) => b[m.tr][m.tc]);
    for (const m of orderMoves(b, caps)) {
      const sc = -quiesce(Janggi.applyMove(b, m), Janggi.other(side), -beta, -alpha, ctx);
      if (ctx.abort) return 0;
      if (sc >= beta) return beta;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }

  function negamax(b, side, depth, alpha, beta, ctx) {
    if (++ctx.nodes % 512 === 0 && Date.now() > ctx.deadline) ctx.abort = true;
    if (ctx.abort) return 0;
    const moves = Janggi.legalMoves(b, side);
    // 수를 못 둠 = 패배 (장군 잡힘 포함)
    if (moves.length === 0) return -MATE;
    if (depth <= 0) return quiesce(b, side, alpha, beta, ctx);
    let best = -Infinity;
    for (const m of orderMoves(b, moves)) {
      const sc = -negamax(Janggi.applyMove(b, m), Janggi.other(side), depth - 1, -beta, -alpha, ctx);
      if (ctx.abort) return best === -Infinity ? 0 : best;
      if (sc > best) best = sc;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  // 특정 깊이 탐색. 시간 초과 시 abort = true
  function searchRoot(b, side, depth, deadline) {
    const ctx = { nodes: 0, deadline, abort: false };
    const moves = Janggi.legalMoves(b, side);
    let best = moves[0], bestScore = -Infinity;
    for (const m of orderMoves(b, moves)) {
      const sc = -negamax(Janggi.applyMove(b, m), Janggi.other(side), depth - 1, -Infinity, Infinity, ctx);
      if (ctx.abort) break;
      // 거의 같은 점수면 무작위로 골라 매번 같은 수를 두지 않게 함
      const jitter = (Math.random() - 0.5) * 4;
      if (sc + jitter > bestScore) { bestScore = sc + jitter; best = m; }
    }
    return { move: best, aborted: ctx.abort, nodes: ctx.nodes };
  }

  // level: 1 = 초보, 2 = 중급, 3 = 고수, 4 = 최강
  function chooseMove(board, side, level) {
    const moves = Janggi.legalMoves(board, side);
    if (moves.length === 0) return null;

    if (level <= 1) {
      // 초보: 35% 확률로 아무 수나, 나머지는 한 수 미리 본 점수 상위 6개 중에서 고른다
      if (Math.random() < 0.35) return moves[(Math.random() * moves.length) | 0];
      const scored = orderMoves(board, moves)
        .map((m) => ({ m, s: -evaluate(Janggi.applyMove(board, m), Janggi.other(side)) }))
        .sort((a, z) => z.s - a.s);
      const pool = scored.slice(0, Math.min(6, scored.length));
      return pool[(Math.random() * pool.length) | 0].m;
    }

    const maxDepth = level === 2 ? 3 : 4;
    const budget = level === 2 ? 1000 : 2500; // 모바일 멈춤 방지용 시간 제한(밀리초)
    const deadline = Date.now() + budget;
    let best = moves[0];
    for (let d = 1; d <= maxDepth; d++) {
      const r = searchRoot(board, side, d, deadline);
      if (r.aborted) break;      // 시간이 다 돼 끝나지 못한 탐색 결과는 쓰지 않는다
      best = r.move;
      if (Date.now() > deadline) break;
    }
    return best;
  }

  const api = { chooseMove };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.JanggiAI = api;
})(typeof window !== 'undefined' ? window : this);
