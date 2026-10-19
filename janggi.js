// janggi.js — 장기 규칙 엔진
// 판·기물 배치, 합법 수 생성, 장군·멍군·무승부 판정, 무르기, 저장·복원.
(function (global) {
  'use strict';

  const ROWS = 10; // 가로 줄 (0 = 초 진영 맨 아래)
  const COLS = 9;  // 세로 줄
  const CHO = 'C'; // 초 (아래, 빨강)
  const HAN = 'H'; // 한 (위, 파랑)

  // 기물 표시 문자: 한자(전통 장기 표기) / 한글
  // 장군과 졸·병은 진영별로 다른 글자를 씀 (초=楚·卒, 한=漢·兵)
  const HANJA = {
    C: { K: '楚', R: '車', N: '馬', E: '象', C: '包', G: '士', P: '卒' },
    H: { K: '漢', R: '車', N: '馬', E: '象', C: '包', G: '士', P: '兵' },
  };
  const HANGUL = {
    C: { K: '장', R: '차', N: '마', E: '상', C: '포', G: '사', P: '졸' },
    H: { K: '장', R: '차', N: '마', E: '상', C: '포', G: '사', P: '병' },
  };
  function other(side) { return side === CHO ? HAN : CHO; }
  function inside(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }

  // 궁성 범위: 초 = 0~2행 3~5열, 한 = 7~9행 3~5열
  function inPalace(side, r, c) {
    if (c < 3 || c > 5) return false;
    return side === CHO ? r >= 0 && r <= 2 : r >= 7 && r <= 9;
  }

  // 차림: 뒷줄 좌우 마·상 배치 (마상상마 = 안상, 상마마상 = 바깥상 등)
  const LAYOUTS = {
    masangsangma: { name: '마상상마 (안상)', slots: ['N', 'E', 'E', 'N'] },
    sangmamasang: { name: '상마마상 (바깥상)', slots: ['E', 'N', 'N', 'E'] },
    masangmasang: { name: '마상마상', slots: ['N', 'E', 'N', 'E'] },
    sangmasangma: { name: '상마상마', slots: ['E', 'N', 'E', 'N'] },
  };

  function initialBoard(layoutCho, layoutHan) {
    const b = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    const sc = (LAYOUTS[layoutCho] || LAYOUTS.masangsangma).slots;
    const sh = (LAYOUTS[layoutHan] || LAYOUTS.masangsangma).slots;
    // 뒷줄: 차 · 차림 4칸 · 사 · (빈칸) · 사 · 차림 4칸 · 차
    // 장(楚/漢)은 궁성 중앙에 놓인다(공식 시작 배치)
    const back = (s, side) => ['R', s[0], s[1], 'G', null, 'G', s[2], s[3], 'R']
      .map((t) => (t ? { side, type: t } : null));
    b[0] = back(sc, CHO);
    b[9] = back(sh, HAN);
    b[1][4] = { side: CHO, type: 'K' };
    b[8][4] = { side: HAN, type: 'K' };
    b[2][1] = { side: CHO, type: 'C' };
    b[2][7] = { side: CHO, type: 'C' };
    b[7][1] = { side: HAN, type: 'C' };
    b[7][7] = { side: HAN, type: 'C' };
    for (const c of [0, 2, 4, 6, 8]) {
      b[3][c] = { side: CHO, type: 'P' };
      b[6][c] = { side: HAN, type: 'P' };
    }
    return b;
  }

  function cloneBoard(b) {
    return b.map((row) => row.map((p) => (p ? { side: p.side, type: p.type } : null)));
  }

  function findGeneral(b, side) {
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const p = b[r][c];
        if (p && p.side === side && p.type === 'K') return { r, c };
      }
    return null;
  }

  // ---- 이동 규칙 ---------------------------------------------------------

  const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const DIRS8 = [
    [-1, -1], [-1, 0], [-1, 1], [0, -1],
    [0, 1], [1, -1], [1, 0], [1, 1],
  ];
  // 마: [이동 dr, 이동 dc, 다리 dr, 다리 dc]
  const KNIGHT = [
    [-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0],
    [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1],
  ];
  // 상: [도착 dr, dc, 직진 첫 칸 dr, dc, 대각선 첫 칸 dr, dc]
  // 쓸용자 행마: 직선 1칸 + 같은 방향 대각선 2칸. 경로 2칸이 모두 비어야 함.
  const ELEPHANT = [
    [-3, -2, -1, 0, -2, -1], [-3, 2, -1, 0, -2, 1],
    [3, -2, 1, 0, 2, -1], [3, 2, 1, 0, 2, 1],
    [-2, -3, 0, -1, -1, -2], [-2, 3, 0, 1, -1, 2],
    [2, -3, 0, -1, 1, -2], [2, 3, 0, 1, 1, 2],
  ];

  function pushIfAvailable(moves, b, side, fr, fc, tr, tc) {
    if (!inside(tr, tc)) return;
    const target = b[tr][tc];
    if (target && target.side === side) return;
    moves.push({ fr, fc, tr, tc });
  }

  // 해당 칸이 궁성의 ✕ 대각선 위에 있는지 (양 진영 공통)
  function onPalaceDiag(r, c) {
    for (const r0 of [0, ROWS - 3]) {
      if (r >= r0 && r <= r0 + 2 && c >= 3 && c <= 5) {
        if (c - r === 3 - r0 || c + r === 5 + r0) return true;
      }
    }
    return false;
  }

  // 車: 직선 달리기 + 궁성 대각선 타고 달리기 (점프 없음)
  function chariotMoves(moves, b, r, c, side) {
    for (const [dr, dc] of DIRS4) {
      let tr = r + dr, tc = c + dc;
      while (inside(tr, tc)) {
        const q = b[tr][tc];
        if (!q) { moves.push({ fr: r, fc: c, tr, tc }); }
        else { if (q.side !== side) moves.push({ fr: r, fc: c, tr, tc }); break; }
        tr += dr; tc += dc;
      }
    }
    // 궁성 ✕ 대각선 이동: 대각선 위에 있을 때만, 그 선을 따라 전진
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      let tr = r + dr, tc = c + dc;
      if (!onPalaceDiag(r, c) || !onPalaceDiag(tr, tc)) continue;
      while (onPalaceDiag(tr, tc)) {
        const q = b[tr][tc];
        if (!q) { moves.push({ fr: r, fc: c, tr, tc }); }
        else { if (q.side !== side) moves.push({ fr: r, fc: c, tr, tc }); break; }
        tr += dr; tc += dc;
      }
    }
  }

  // 砲: 반드시 기물 하나(모자)를 넘어서만 이동/포획. 모자가 포일 수 없고, 포는 포를 잡지 못함
  // 궁성 대각선에서도 같은 규칙 (대각선 위 받침 하나를 넘어야 함)
  function cannonMoves(moves, b, r, c, side) {
    for (const [dr, dc] of DIRS4) {
      let tr = r + dr, tc = c + dc;
      let jumped = false;
      while (inside(tr, tc)) {
        const q = b[tr][tc];
        if (!jumped) {
          if (!q) { tr += dr; tc += dc; continue; }
          if (q.type === 'C') break; // 포는 포를 못 넘김
          jumped = true;
        } else {
          if (!q) { moves.push({ fr: r, fc: c, tr, tc }); }
          else {
            if (q.side !== side && q.type !== 'C') moves.push({ fr: r, fc: c, tr, tc });
            break;
          }
        }
        tr += dr; tc += dc;
      }
    }
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      let tr = r + dr, tc = c + dc;
      if (!onPalaceDiag(r, c) || !onPalaceDiag(tr, tc)) continue;
      let jumped = false;
      while (onPalaceDiag(tr, tc)) {
        const q = b[tr][tc];
        if (!jumped) {
          if (!q) { tr += dr; tc += dc; continue; }
          if (q.type === 'C') break;
          jumped = true;
        } else {
          if (!q) { moves.push({ fr: r, fc: c, tr, tc }); }
          else {
            if (q.side !== side && q.type !== 'C') moves.push({ fr: r, fc: c, tr, tc });
            break;
          }
        }
        tr += dr; tc += dc;
      }
    }
  }

  // 馬: 바둑판 니은형. 다리(직선 방향 첫 칸)에 기물이 있으면 막힘
  function horseMoves(moves, b, r, c, side) {
    for (const [dr, dc, lr, lc] of KNIGHT) {
      if (inside(r + lr, c + lc) && b[r + lr][c + lc]) continue;
      pushIfAvailable(moves, b, side, r, c, r + dr, c + dc);
    }
  }

  // 象: 쓸용자(직선 1칸 + 같은 방향 대각선 2칸). 직진 첫 칸과 대각선 첫 칸이 모두 비어야 함
  function elephantMoves(moves, b, r, c, side) {
    for (const [dr, dc, b1r, b1c, b2r, b2c] of ELEPHANT) {
      if (b[r + b1r] && b[r + b1r][c + b1c]) continue; // 직진 첫 칸
      if (b[r + b2r] && b[r + b2r][c + b2c]) continue; // 대각선 첫 칸
      pushIfAvailable(moves, b, side, r, c, r + dr, c + dc);
    }
  }

  // 將(궁)·士(사): 궁성 안에서 한 칸. 장과 사의 행마는 동일
  // 직선(상하좌우)은 궁성 안 어디로든 가되, 대각선은 **궁성에 그려진 ✕ 선 위**로만 갈 수 있다.
  //   → 궁 중앙·모서리는 대각선까지 쓸 수 있지만, 변중앙(0,4)·(2,4)·(1,3)·(1,5)에서는
  //     ✕ 선이 지나가지 않으므로 모서리 쪽 대각선으로 갈 수 없다.
  function kingMoves(moves, b, r, c, side) {
    for (const [dr, dc] of DIRS8) {
      const tr = r + dr, tc = c + dc;
      if (!inPalace(side, tr, tc)) continue;
      if (dr !== 0 && dc !== 0 && !onPalaceDiag(tr, tc)) continue; // 선 없는 대각선 금지
      pushIfAvailable(moves, b, side, r, c, tr, tc);
    }
  }

  // 卒/兵: 전진·좌우 한 칸만. 후퇴 금지.
  // 적 궁성 안에서는 궁성 ✕ 대각선 위에 있을 때 그 대각선으로 '전진'만 가능
  function pawnMoves(moves, b, r, c, side) {
    const fwd = side === CHO ? 1 : -1;
    const enemyPalace = side === CHO ? HAN : CHO;
    pushIfAvailable(moves, b, side, r, c, r + fwd, c); // 전진
    pushIfAvailable(moves, b, side, r, c, r, c - 1);   // 좌
    pushIfAvailable(moves, b, side, r, c, r, c + 1);   // 우
    if (inPalace(enemyPalace, r, c) && onPalaceDiag(r, c)) {
      // 궁성 ✕ 대각선 위에서만, 그 대각선으로 전진
      for (const dc of [-1, 1]) {
        const tr = r + fwd, tc = c + dc;
        if (onPalaceDiag(tr, tc)) pushIfAvailable(moves, b, side, r, c, tr, tc);
      }
    }
  }

  // 합법성 검사 전의 가짜 움직임 목록: 공격 판정용
  function genPseudoMoves(b, side) {
    const moves = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = b[r][c];
        if (!p || p.side !== side) continue;
        switch (p.type) {
          case 'R': chariotMoves(moves, b, r, c, side); break;
          case 'C': cannonMoves(moves, b, r, c, side); break;
          case 'N': horseMoves(moves, b, r, c, side); break;
          case 'E': elephantMoves(moves, b, r, c, side); break;
          case 'G': kingMoves(moves, b, r, c, side); break; // 사는 장과 동일
          case 'K': kingMoves(moves, b, r, c, side); break;
          case 'P': pawnMoves(moves, b, r, c, side); break;
        }
      }
    }
    return moves;
  }

  function applyMove(b, m) {
    const nb = cloneBoard(b);
    nb[m.tr][m.tc] = nb[m.fr][m.fc];
    nb[m.fr][m.fc] = null;
    return nb;
  }

  // 장군(체크): side의 장군이 적 기물의 공격 사정거리에 있는가
  function isCheck(b, side) {
    const k = findGeneral(b, side);
    if (!k) return true;
    const foes = genPseudoMoves(b, other(side));
    return foes.some((m) => m.tr === k.r && m.tc === k.c);
  }

  // 외통수: 두 장군이 같은 세로줄에 아무 기물 없이 마주보는 상태 (불법)
  function generalsFace(b) {
    const a = findGeneral(b, CHO);
    const z = findGeneral(b, HAN);
    if (!a || !z || a.c !== z.c) return false;
    const lo = Math.min(a.r, z.r), hi = Math.max(a.r, z.r);
    for (let r = lo + 1; r < hi; r++) if (b[r][a.c]) return false;
    return true;
  }

  // 합법 수: 상대 장군을 잡는 수는 항상 합법. 그 외에는 장군당함/외통수이면 불법
  function legalMoves(b, side) {
    const out = [];
    for (const m of genPseudoMoves(b, side)) {
      const target = b[m.tr][m.tc];
      if (target && target.type === 'K') { out.push(m); continue; }
      const nb = applyMove(b, m);
      if (!findGeneral(nb, side)) continue;
      if (isCheck(nb, side)) continue;
      if (generalsFace(nb)) continue;
      out.push(m);
    }
    return out;
  }

  // 같은 국면인지 견주기 위한 열쇠: 말 배치 + 둘 차례
  // (한 수마다 이 열쇠를 쌓아 두고, 같은 열쇠가 3번 나오면 무승부로 본다)
  function positionKey(board, turn) {
    let k = turn;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const pc = board[r][c];
        k += pc ? pc.side + pc.type : '.';
      }
    }
    return k;
  }
  function countSame(arr, key) {
    let n = 0;
    for (let i = 0; i < arr.length; i++) if (arr[i] === key) n++;
    return n;
  }

  // ---- 대국 진행 ---------------------------------------------------------

  class Game {
    // options: { layoutCho, layoutHan } — LAYOUTS 키 (기본 마상상마)
    constructor(options) {
      this.options = options || {};
      this.reset();
    }

    reset() {
      this.board = initialBoard(this.options.layoutCho, this.options.layoutHan);
      // 초(楚·빨강)가 먼저 둔다 (공식 장기 규칙).
      this.turn = CHO;
      this.lastMove = null;
      this.history = [];
      this.result = null; // {winner, reason: 'capture'|'mate'|'draw'} — winner 가 null 이면 무승부
      this.check = false;
      // 같은 국면이 3번 나오면 무승부로 본다(끝나지 않고 계속 도는 판을 막는다)
      this.repeats = [positionKey(this.board, this.turn)];
    }

    moves() {
      return this.result ? [] : legalMoves(this.board, this.turn);
    }

    play(m) {
      if (this.result) return false;
      if (!validMove(m)) return false;   // 모양이 어긋난 수(같은 칸 포함)는 거절
      const legal = legalMoves(this.board, this.turn);
      if (!legal.some((k) => k.fr === m.fr && k.fc === m.fc && k.tr === m.tr && k.tc === m.tc)) {
        return false;                    // 규칙상 둘 수 없는 수는 거절 (판을 건드리지 않는다)
      }
      this.history.push({
        board: this.board, turn: this.turn, lastMove: this.lastMove,
        result: this.result, check: this.check, repeatLen: this.repeats.length,
      });
      const captured = this.board[m.tr][m.tc];
      this.board = applyMove(this.board, m);
      this.lastMove = m;
      if (captured && captured.type === 'K') {
        this.result = { winner: this.turn, reason: 'capture' };
        return true;
      }
      this.turn = other(this.turn);
      this.check = isCheck(this.board, this.turn);
      if (legalMoves(this.board, this.turn).length === 0) {
        this.result = { winner: other(this.turn), reason: 'mate' };
        return true;
      }
      // 같은 국면이 3번째면 무승부 (장군이 아니어도 판이 계속 도는 것을 막는다)
      const key = positionKey(this.board, this.turn);
      this.repeats.push(key);
      if (countSame(this.repeats, key) >= 3) {
        this.result = { winner: null, reason: 'draw' };
      }
      return true;
    }

    undo() {
      if (!this.history.length) return false;
      const s = this.history.pop();
      this.board = s.board;
      this.turn = s.turn;
      this.lastMove = s.lastMove;
      this.result = s.result;
      this.check = s.check;
      this.repeats.length = s.repeatLen;
      return true;
    }

    // 저장용: 판 상태를 그대로(JSON 으로 만들 수 있는 값으로) 돌려준다.
    // 되살리기는 아래 gameFromData() 로 한다.
    toData() {
      return {
        board: this.board, turn: this.turn, lastMove: this.lastMove,
        history: this.history, result: this.result,
        check: this.check, repeats: this.repeats,
      };
    }
  }

  // ---- 저장·복원 (이어하기) -------------------------------------------------
  // 진행 중인 판을 저장했다가 되살린다. 형식이 어긋나면 null 을 돌려준다
  // (그때는 그냥 새 판을 시작하면 되므로 조용히 무시한다).
  const TYPES = { K: 1, R: 1, N: 1, E: 1, C: 1, G: 1, P: 1 };
  function validBoard(b) {
    if (!Array.isArray(b) || b.length !== ROWS) return false;
    for (const row of b) {
      if (!Array.isArray(row) || row.length !== COLS) return false;
      for (const p of row) {
        if (!p) continue;
        if ((p.side !== CHO && p.side !== HAN) || !TYPES[p.type]) return false;
      }
    }
    return true;
  }
  function validMove(m) {
    if (!m) return false;
    for (const v of [m.fr, m.fc, m.tr, m.tc]) {
      if (typeof v !== 'number' || !isFinite(v) || v !== Math.floor(v)) return false;
    }
    return inside(m.fr, m.fc) && inside(m.tr, m.tc);
  }
  function gameFromData(d) {
    if (!d || !validBoard(d.board)) return null;
    if (d.turn !== CHO && d.turn !== HAN) return null;
    if (d.result) return null;                     // 끝난 판은 저장하지 않는다
    if (!findGeneral(d.board, CHO) || !findGeneral(d.board, HAN)) return null;
    if (d.lastMove && !validMove(d.lastMove)) return null;
    const histData = d.history || [];
    if (!Array.isArray(histData)) return null;
    const history = [];
    for (const s of histData) {
      if (!s || !validBoard(s.board) || typeof s.repeatLen !== 'number') return null;
      if (s.turn !== CHO && s.turn !== HAN) return null;
      if (s.result) return null;
      if (s.lastMove && !validMove(s.lastMove)) return null;
      // 되살린 판은 play·undo 가 history·board 를 직접 고치므로 사본을 담는다
      history.push({
        board: cloneBoard(s.board), turn: s.turn,
        lastMove: s.lastMove || null, result: null,
        check: !!s.check, repeatLen: s.repeatLen,
      });
    }
    let repeats = Array.isArray(d.repeats) ? d.repeats.filter((k) => typeof k === 'string') : [];
    if (!repeats.length) repeats = [positionKey(d.board, d.turn)];   // 없으면 지금 국면으로 채운다
    const g = new Game();
    g.board = cloneBoard(d.board);                 // 입력 자료를 그대로 담지 않는다(사본)
    g.turn = d.turn;
    g.lastMove = d.lastMove || null;
    g.history = history;
    g.result = null;
    g.check = isCheck(g.board, g.turn);            // 저장된 값 대신 다시 계산한다
    g.repeats = repeats;
    return g;
  }

  const api = {
    ROWS, COLS, CHO, HAN, HANJA, HANGUL, LAYOUTS,
    other, inside, inPalace, initialBoard, cloneBoard, findGeneral,
    applyMove, isCheck, generalsFace, legalMoves, Game,
    gameFromData,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.Janggi = api;
  }
})(typeof window !== 'undefined' ? window : this);
