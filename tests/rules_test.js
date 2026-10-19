// tests/rules_test.js — 장기 규칙 자동 검증 (실행: node tests/rules_test.js)
'use strict';
const assert = require('assert');
const J = require('../janggi.js');
const AI = require('../ai.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  통과: ' + name);
  } catch (e) {
    console.error('  실패: ' + name);
    console.error('    ' + e.message);
    process.exitCode = 1;
  }
}

// 장군 자동 배치: 같은 세로줄에 두 장군이 서면 외통수가 되므로 서로 다른 열을 고른다
function placeKing(b, side) {
  if (J.findGeneral(b, side)) return;
  const spots = side === J.CHO ? [[1, 4], [0, 3], [1, 3], [0, 5]]
                               : [[8, 4], [9, 5], [9, 3], [8, 5]];
  for (const [r, c] of spots) {
    if (b[r][c]) continue;
    const foe = J.findGeneral(b, side === J.CHO ? J.HAN : J.CHO);
    if (foe && foe.c === c) continue;
    b[r][c] = { side, type: 'K' };
    return;
  }
}

// 임의 배치 보드 만들기: [r, c, side, type] (장군이 없으면 자동 배치)
function build(list) {
  const b = J.initialBoard().map((row) => row.map(() => null));
  for (const [r, c, side, type] of list) b[r][c] = { side, type };
  placeKing(b, J.CHO);
  placeKing(b, J.HAN);
  return b;
}
function key(m) { return m.tr + ',' + m.tc; }
function movesOf(b, r, c) {
  return J.legalMoves(b, b[r][c].side).filter((m) => m.fr === r && m.fc === c).map(key);
}

console.log('장기 규칙 테스트');

test('초기 배치: 기물 16개씩, 포·졸 위치 정확', () => {
  const b = J.initialBoard();
  for (const side of [J.CHO, J.HAN]) {
    let n = 0;
    for (const row of b) for (const p of row) if (p && p.side === side) n++;
    assert.strictEqual(n, 16, side + ' 기물 수');
  }
  assert.deepStrictEqual(b[2][1], { side: J.CHO, type: 'C' });
  assert.deepStrictEqual(b[3][0], { side: J.CHO, type: 'P' });
  assert.deepStrictEqual(b[7][7], { side: J.HAN, type: 'C' });
  assert.deepStrictEqual(b[6][8], { side: J.HAN, type: 'P' });
});

test('차(車): 초기 좌하단 차는 (1,0)·(2,0) 두 칸만 가능', () => {
  const b = J.initialBoard();
  assert.deepStrictEqual(movesOf(b, 0, 0).sort(), ['1,0', '2,0']); // (0,1)은 아군 마, (3,0)은 아군 졸
});

test('장군 잡기: 적 장군을 잡는 수는 합법', () => {
  const b = J.initialBoard();
  assert.strictEqual(J.isCheck(b, J.CHO), false);
  assert.strictEqual(J.isCheck(b, J.HAN), false);
});

test('炮(포): 모자를 넘어서만 이동/포획, 인접 기물은 못 잡음', () => {
  const b = build([
    [5, 4, J.CHO, 'C'],
    [5, 6, J.CHO, 'P'],   // 모자(아군 졸)
    [5, 8, J.HAN, 'R'],   // 잡을 대상
  ]);
  const ms = movesOf(b, 5, 4);
  assert.ok(ms.includes('5,8'), '모자 넘겨 적 차 포획 가능해야 함');
  assert.ok(ms.includes('5,7'), '모자 뒤 빈 칸으로 이동 가능해야 함');
  assert.ok(!ms.includes('5,5'), '모자 없이 한 칸은 못 감');
  assert.ok(!ms.includes('5,6'), '자기 모자는 못 잡음');
});

test('炮(포): 포는 포를 잡지 못하고 포도 못 넘긴다', () => {
  const b = build([
    [5, 0, J.CHO, 'C'],   // 조사 대상
    [5, 2, J.CHO, 'C'],   // 모자가 될 수 없는 포
    [5, 6, J.HAN, 'R'],
  ]);
  assert.strictEqual(movesOf(b, 5, 0).length, 0, '같은 줄에서 포가 포를 못 넘김');

  const b2 = build([
    [5, 4, J.CHO, 'C'],
    [5, 6, J.CHO, 'P'],
    [5, 8, J.HAN, 'C'],   // 적 포
  ]);
  assert.ok(!movesOf(b2, 5, 4).includes('5,8'), '포는 포를 못 잡음');
});

test('馬(마): 다리에 기물이 있으면 막힘', () => {
  const b = build([
    [5, 5, J.CHO, 'N'],
    [4, 5, J.CHO, 'P'],   // 위쪽 다리 막기
  ]);
  const ms = movesOf(b, 5, 5);
  assert.ok(!ms.includes('3,4'), '위-왼 다리 막힘');
  assert.ok(!ms.includes('3,6'), '위-오른 다리 막힘');
  assert.ok(ms.includes('7,4'), '아래쪽은 영향 없음');
  assert.ok(ms.includes('4,3'), '옆으로 니은 가능');
});

test('象(상): 쓸용자(직진1+대각선2) — 경로 두 칸이 막힘', () => {
  // 도착점: (r±3,c±2), (r±2,c±3). 막는 칸: 직진 첫 칸 + 대각선 첫 칸
  const b = build([
    [5, 5, J.CHO, 'E'],
    [6, 5, J.CHO, 'P'],   // 아래 방향 직진 첫 칸 막기
  ]);
  const ms = movesOf(b, 5, 5);
  assert.ok(!ms.includes('8,3'), '아래-왼 직진 칸 막힘');
  assert.ok(!ms.includes('8,7'), '아래-오 직진 칸 막힘');
  assert.ok(ms.includes('2,3'), '위-왼 이동 가능');
  assert.ok(ms.includes('2,7'), '위-오 이동 가능');
  assert.ok(ms.includes('3,2'), '왼쪽 이동 가능');
  assert.ok(ms.includes('7,8'), '오른쪽 이동 가능');

  // 대각선 첫 칸만 막힌 경우: 그 도착점만 불가
  const b2 = build([
    [5, 5, J.CHO, 'E'],
    [7, 6, J.CHO, 'P'],   // (8,7)로 가는 대각선 첫 칸 막기
  ]);
  const ms2 = movesOf(b2, 5, 5);
  assert.ok(!ms2.includes('8,7'), '대각선 첫 칸 막힘');
  assert.ok(ms2.includes('8,3'), '다른 방향은 영향 없음');
});

test('士(사): 장과 동일 — 궁성 안에서 직선 + ✕ 선 위 대각선만, 밖으로 못 나감', () => {
  // 궁성 변중앙(0,4): 직선 3칸만. ✕ 선이 안 지나가므로 (1,3)·(1,5) 대각선은 금지
  // 내 장군은 build() 의 자동 배치가 검사할 칸(1,4)을 차지하지 않도록 직접 놓는다.
  const b = build([[0, 4, J.CHO, 'G'], [2, 4, J.CHO, 'K'], [9, 0, J.HAN, 'K']]);
  assert.deepStrictEqual(movesOf(b, 0, 4).sort(), ['0,3', '0,5', '1,4']);

  // 궁성 모서리(0,3): 직선 2칸 + ✕ 선 위 대각선 (1,4) 1칸 = 3칸
  const bc = build([[0, 3, J.CHO, 'G'], [2, 4, J.CHO, 'K'], [9, 0, J.HAN, 'K']]);
  assert.deepStrictEqual(movesOf(bc, 0, 3).sort(), ['0,4', '1,3', '1,4']);

  // 궁성 중앙(1,4): ✕ 선이 중앙을 지나므로 대각선까지 8방향 전부
  const b2 = build([[1, 4, J.CHO, 'G'], [0, 4, J.CHO, 'K'], [9, 0, J.HAN, 'K']]);
  assert.deepStrictEqual(movesOf(b2, 1, 4).sort(),
    ['0,3', '0,5', '1,3', '1,5', '2,3', '2,4', '2,5']);
});

test('卒(졸): 후퇴 없음. 적 궁성 ✕ 대각선 위에서만 전진 대각선', () => {
  const b = build([[8, 4, J.CHO, 'P'], [9, 0, J.HAN, 'K']]);
  const ms = movesOf(b, 8, 4);
  for (const want of ['8,3', '8,5', '9,3', '9,4', '9,5']) {
    assert.ok(ms.includes(want), want + ' 이동 가능해야 함');
  }
  assert.ok(!ms.includes('7,4'), '후퇴 불가');
  assert.ok(!ms.includes('7,3'), '뒤 대각선 불가');
  assert.ok(!ms.includes('7,5'), '뒤 대각선 불가');

  // 궁성 밖 졸: 전진·좌우만
  const b2 = build([[5, 4, J.CHO, 'P'], [9, 0, J.HAN, 'K']]);
  assert.deepStrictEqual(movesOf(b2, 5, 4).sort(), ['5,3', '5,5', '6,4']);

  // 궁성 안이어도 ✕ 대각선 위에 없으면 대각선 불가 (7,4는 대각선 위 아님)
  const b3 = build([[7, 4, J.CHO, 'P'], [9, 0, J.HAN, 'K']]);
  const ms3 = movesOf(b3, 7, 4);
  assert.ok(!ms3.includes('8,3'), '대각선 위 아니면 전진 대각선 불가');
  assert.ok(!ms3.includes('8,5'), '대각선 위 아니면 전진 대각선 불가');
  assert.ok(ms3.includes('8,4'), '직선 전진은 가능');
});

test('車(차): 궁성 ✕ 대각선을 타고 이동', () => {
  const b = build([[8, 4, J.CHO, 'R'], [9, 0, J.HAN, 'K']]);
  const ms = movesOf(b, 8, 4);
  for (const want of ['7,3', '7,5', '9,3', '9,5']) {
    assert.ok(ms.includes(want), '궁성 대각선 ' + want);
  }
  // 대각선 위에서 직선처럼 연속 이동
  const b2 = build([[7, 3, J.CHO, 'R'], [9, 0, J.HAN, 'K']]);
  const ms2 = movesOf(b2, 7, 3);
  assert.ok(ms2.includes('9,5'), '대각선을 따라 (7,3)→(9,5) 슬라이드');
});

test('炮(포): 궁성 대각선도 모자 하나를 넘어야 이동', () => {
  const b = build([
    [7, 3, J.CHO, 'C'],
    [8, 4, J.CHO, 'P'],   // 대각선 모자
    [9, 5, J.HAN, 'N'],   // 잡을 대상
    [9, 0, J.HAN, 'K'],
  ]);
  const ms = movesOf(b, 7, 3);
  assert.ok(ms.includes('9,5'), '대각선 모자 넘겨 포획');
  assert.ok(!ms.includes('8,4'), '모자(아군)는 못 잡음');
  assert.ok(!ms.includes('8,3'), '모자 없는 직선 방향 불가');
});

test('외통수: 두 장군이 마주 보는 칸으로는 못 감', () => {
  const b = build([
    [0, 4, J.CHO, 'K'],
    [9, 4, J.HAN, 'K'],
    [5, 4, J.CHO, 'R'],   // 줄을 막고 있는 차
  ]);
  const ms = movesOf(b, 5, 4);
  assert.ok(ms.includes('4,4'), '세로줄을 계속 막는 이동은 합법');
  assert.ok(ms.includes('9,4'), '상대 장군을 잡는 수는 합법');
  for (const m of ms) {
    assert.strictEqual(m.split(',')[1], '4', '세로줄을 벗어나면 외통수 → 불법: ' + m);
  }
});

test('장군(체크)과 체크메이트 판정', () => {
  // 체크 상태
  const b1 = build([[0, 4, J.CHO, 'K'], [0, 6, J.HAN, 'R'], [9, 0, J.HAN, 'K']]);
  assert.strictEqual(J.isCheck(b1, J.CHO), true);

  // 메이트: 초 장군이 도망칠 곳이 없음 → 초는 수가 0개
  const bm = build([
    [0, 4, J.CHO, 'K'],
    [0, 6, J.HAN, 'R'],   // 0행 공격(장군 + 0,3/0,5 커버)
    [1, 6, J.HAN, 'R'],   // 1행 커버
    [9, 0, J.HAN, 'K'],
  ]);
  assert.strictEqual(J.legalMoves(bm, J.CHO).length, 0, '메이트면 합법 수 0');
});

test('Game: 승리 처리와 무르기(undo) 복원', () => {
  const g = new J.Game();
  const before = JSON.stringify(g.board);
  const mv = g.moves()[0];
  g.play(mv);
  assert.notStrictEqual(JSON.stringify(g.board), before, '두면 보드 바뀜');
  g.undo();
  assert.strictEqual(JSON.stringify(g.board), before, '무르면 원위치');
  assert.strictEqual(g.turn, J.CHO);
});

test('Game: 장군 잡으면 즉시 승리', () => {
  const g = new J.Game();
  g.board = build([
    [0, 4, J.CHO, 'R'],
    [1, 4, J.CHO, 'K'],
    [0, 5, J.HAN, 'K'],   // 초 차가 잡을 수 있음
  ]);
  g.turn = J.CHO;
  const cap = J.legalMoves(g.board, J.CHO).find((m) => m.tr === 0 && m.tc === 5);
  assert.ok(cap, '적 장군 포획 수 존재해야 함');
  g.play(cap);
  assert.ok(g.result && g.result.winner === J.CHO);
});

test('AI: 난이도 3단계 모두 합법 수를 냄', () => {
  const b = J.initialBoard();
  for (const level of [1, 2, 3]) {
    const mv = AI.chooseMove(b, J.CHO, level);
    assert.ok(mv, '레벨 ' + level + ' 수 반환');
    const legal = J.legalMoves(b, J.CHO);
    assert.ok(legal.some((m) => m.fr === mv.fr && m.fc === mv.fc && m.tr === mv.tr && m.tc === mv.tc),
      '레벨 ' + level + ' 합법 수여야 함');
  }
});

test('AI: AI끼리 12수 이상 무사히 진행', () => {
  const g = new J.Game();
  for (let i = 0; i < 12; i++) {
    const mv = AI.chooseMove(g.board, g.turn, 1);
    if (!mv) break;
    const legal = g.moves();
    assert.ok(legal.some((m) => m.fr === mv.fr && m.fc === mv.fc && m.tr === mv.tr && m.tc === mv.tc),
      i + '수째 비합법 수');
    g.play(mv);
    if (g.result) break;
  }
});

test('AI: 잡기 수를 놓치지 않음 (고수)', () => {
  // 고수가 그냥 두면 포획할 수 있는 무방비 기물을 무시하면 안 됨
  const b = build([
    [0, 4, J.CHO, 'K'],
    [5, 4, J.CHO, 'R'],
    [5, 8, J.HAN, 'R'],   // 잡히는 무방비 차
    [9, 3, J.HAN, 'K'],
  ]);
  const mv = AI.chooseMove(b, J.CHO, 3);
  const nb = J.applyMove(b, mv);
  const isCapture = mv.tr === 5 && mv.tc === 8;
  const isForcedMate = J.isCheck(nb, J.HAN) && J.legalMoves(nb, J.HAN).length <= 1;
  assert.ok(isCapture || isForcedMate,
    '무방비 차를 잡거나(5,8), 장군 후 상대가 강제로 막는 수만 남겨야 함 — 실제: ' +
    mv.fr + ',' + mv.fc + ' → ' + mv.tr + ',' + mv.tc);
});

test('차림: 마·상 위치를 선택할 수 있다', () => {
  // 안상(마상상마) 기본
  const b0 = J.initialBoard();
  assert.deepStrictEqual(b0[0].map((p) => (p ? p.type : null)),
    ['R', 'N', 'E', 'G', null, 'G', 'E', 'N', 'R']);
  assert.deepStrictEqual(b0[1][4], { side: J.CHO, type: 'K' });
  assert.deepStrictEqual(b0[8][4], { side: J.HAN, type: 'K' });
  // 바깥상(상마마상)
  const b1 = J.initialBoard('sangmamasang', 'sangmamasang');
  assert.deepStrictEqual(b1[0].map((p) => (p ? p.type : null)),
    ['R', 'E', 'N', 'G', null, 'G', 'N', 'E', 'R']);
  assert.deepStrictEqual(b1[9].map((p) => (p ? p.type : null)),
    ['R', 'E', 'N', 'G', null, 'G', 'N', 'E', 'R']);
  // 좌우 비대칭(마상마상)
  const b2 = J.initialBoard('masangmasang', 'masangmasang');
  assert.deepStrictEqual(b2[0].map((p) => (p ? p.type : null)),
    ['R', 'N', 'E', 'G', null, 'G', 'N', 'E', 'R']);
});

test('무승부: 같은 국면이 3번 반복되면 무승부', () => {
  const g = new J.Game();
  // 초 마(0,1)와 한 마(9,1)가 나갔다 제자리로 돌아오는 4수를 되풀이한다
  const round = [[0, 1, 2, 2], [9, 1, 7, 2], [2, 2, 0, 1], [7, 2, 9, 1]];
  const playRound = () => {
    for (const [fr, fc, tr, tc] of round) {
      const m = g.moves().find((x) => x.fr === fr && x.fc === fc && x.tr === tr && x.tc === tc);
      assert.ok(m, '합법 수여야 함: ' + fr + ',' + fc + ' → ' + tr + ',' + tc);
      g.play(m);
    }
  };
  playRound();
  assert.strictEqual(g.result, null, '한 번 반복(4수)만으로는 무승부가 아니다');
  playRound();
  assert.ok(g.result && g.result.reason === 'draw', '두 번 반복(8수)째에 무승부여야 함');
  assert.strictEqual(g.result.winner, null, '무승부는 winner 가 null');
  assert.strictEqual(g.moves().length, 0, '무승부 뒤에는 둘 수가 없다');
  g.undo();
  assert.strictEqual(g.result, null, '무르기로 무승부가 풀려야 함');
});

test('무승부: 무르기로 되돌린 뒤 다시 반복해도 같은 판정', () => {
  // 무르기 때 반복 기록 길이를 되돌리지 않으면 여기서 판정이 어긋난다
  const g = new J.Game();
  const round = [[0, 1, 2, 2], [9, 1, 7, 2], [2, 2, 0, 1], [7, 2, 9, 1]];
  const playRound = () => {
    for (const [fr, fc, tr, tc] of round) {
      g.play(g.moves().find((x) => x.fr === fr && x.fc === fc && x.tr === tr && x.tc === tc));
    }
  };
  playRound();
  playRound();
  assert.ok(g.result && g.result.reason === 'draw', '먼저 무승부가 나야 함');
  for (let i = 0; i < 4; i++) g.undo();
  assert.strictEqual(g.result, null, '무르기로 무승부가 풀려야 함');
  playRound();
  assert.ok(g.result && g.result.reason === 'draw', '다시 두어도 무승부로 판정돼야 함');
});

test('한자 표기: 초=楚·卒, 한=漢·兵, 포는 양 진영 包', () => {
  assert.strictEqual(J.HANJA.C.K, '楚');
  assert.strictEqual(J.HANJA.H.K, '漢');
  assert.strictEqual(J.HANJA.C.P, '卒');
  assert.strictEqual(J.HANJA.H.P, '兵');
  assert.strictEqual(J.HANJA.C.C, '包');
  assert.strictEqual(J.HANJA.H.C, '包');
  assert.strictEqual(J.HANGUL.C.P, '졸');
  assert.strictEqual(J.HANGUL.H.P, '병');
});

test('저장·복원: toData → gameFromData 로 판이 그대로 되살아난다', () => {
  const g = new J.Game();
  const round = [[0, 1, 2, 2], [9, 1, 7, 2], [2, 2, 0, 1], [7, 2, 9, 1]];
  for (const [fr, fc, tr, tc] of round.slice(0, 3)) {
    g.play(g.moves().find((x) => x.fr === fr && x.fc === fc && x.tr === tr && x.tc === tc));
  }
  const d = JSON.parse(JSON.stringify(g.toData()));   // localStorage 를 거친 것처럼
  const r = J.gameFromData(d);
  assert.ok(r, '복원에 성공해야 함');
  assert.deepStrictEqual(r.board, g.board);
  assert.strictEqual(r.turn, g.turn);
  assert.deepStrictEqual(r.lastMove, g.lastMove);
  assert.strictEqual(r.history.length, g.history.length);
  assert.deepStrictEqual(r.repeats, g.repeats);
  assert.strictEqual(r.result, null);
  // 되살린 판과 원래 판이 같은 합법 수를 낸다
  const fmt = (m) => [m.fr, m.fc, m.tr, m.tc].join(',');
  assert.deepStrictEqual(r.moves().map(fmt).sort(), g.moves().map(fmt).sort());
  // 되살린 판에서 이어 두기와 무르기도 된다
  r.play(r.moves()[0]);
  assert.ok(r.undo(), '무르기 가능');
  assert.deepStrictEqual(r.board, g.board, '무른 뒤에도 원래 판과 같아야 함');
});

test('저장·복원: 무승부 판정도 그대로 이어진다', () => {
  // 반복 기록(repeats)을 함께 저장하지 않으면 여기서 무승부가 나지 않는다
  const round = [[0, 1, 2, 2], [9, 1, 7, 2], [2, 2, 0, 1], [7, 2, 9, 1]];
  const playRound = (gm) => {
    for (const [fr, fc, tr, tc] of round) {
      gm.play(gm.moves().find((x) => x.fr === fr && x.fc === fc && x.tr === tr && x.tc === tc));
    }
  };
  const g = new J.Game();
  playRound(g);
  const r = J.gameFromData(JSON.parse(JSON.stringify(g.toData())));
  assert.ok(r, '복원에 성공해야 함');
  playRound(r);                       // 복원한 판에서 한 번 더 반복
  assert.ok(r.result && r.result.reason === 'draw', '복원해도 무승부 판정이 이어져야 함');
});

test('저장·복원: 잘못된 자료는 null 로 거절', () => {
  const g = new J.Game();
  const copy = () => JSON.parse(JSON.stringify(g.toData()));
  assert.strictEqual(J.gameFromData(null), null);
  assert.strictEqual(J.gameFromData({}), null);
  assert.strictEqual(J.gameFromData({ board: [[null]], turn: 'C' }), null, '판 크기 어긋남');
  const d1 = copy(); d1.turn = 'X';
  assert.strictEqual(J.gameFromData(d1), null, '잘못된 차례');
  const d2 = copy(); d2.board[0] = d2.board[0].slice(0, 8);
  assert.strictEqual(J.gameFromData(d2), null, '줄 길이 어긋남');
  const d3 = copy(); d3.history = [{ board: d3.board, turn: 'C' }];
  assert.strictEqual(J.gameFromData(d3), null, '무르기 자료에 repeatLen 없음');
  const d4 = copy(); d4.result = { winner: 'C', reason: 'capture' };
  assert.strictEqual(J.gameFromData(d4), null, '끝난 판은 저장 대상이 아님');
  const d5 = copy(); d5.board[1][4] = null;
  assert.strictEqual(J.gameFromData(d5), null, '장군이 없으면 거절');
  const d6 = copy(); delete d6.repeats;
  const r6 = J.gameFromData(d6);
  assert.ok(r6 && r6.repeats.length === 1, '반복 기록이 없으면 지금 국면으로 채운다');
});

test('Game: 규칙에 없는 수는 거절하고 판을 건드리지 않는다', () => {
  const g = new J.Game();
  const before = JSON.stringify(g.toData());
  assert.strictEqual(g.play(null), false, 'null 거절');
  assert.strictEqual(g.play({ fr: 0, fc: 0, tr: 0, tc: 0 }), false, '같은 칸 거절');
  assert.strictEqual(g.play({ fr: 9, fc: 4, tr: 8, tc: 4 }), false, '남의 말·상대 차례 거절');
  assert.strictEqual(g.play({ fr: 0, fc: 0, tr: 0, tc: 1 }), false, '아군 말 잡기 거절');
  assert.strictEqual(g.play({ fr: 0, fc: 0, tr: 5, tc: 0 }), false, '가로막힌 길 거절');
  assert.strictEqual(JSON.stringify(g.toData()), before, '거절된 수는 상태를 바꾸지 않아야 함');
  assert.strictEqual(g.play(g.moves()[0]), true, '합법 수는 그대로 받아들여야 함');
});

test('저장·복원: 무르기 기록·기물 검사가 엄격하다', () => {
  const g = new J.Game();
  g.play(g.moves()[0]);
  const copy = () => JSON.parse(JSON.stringify(g.toData()));
  const e1 = copy(); e1.history[0].turn = 'X';
  assert.strictEqual(J.gameFromData(e1), null, '무르기 기록의 차례가 어긋남');
  const e2 = copy(); e2.history[0].result = { winner: 'C', reason: 'capture' };
  assert.strictEqual(J.gameFromData(e2), null, '끝난 상태가 섞인 기록');
  const e3 = copy(); e3.board[8][4].type = 'X';   // 한 장군 자리(항상 있음)
  assert.strictEqual(J.gameFromData(e3), null, '모르는 기물');
  const e4 = copy(); e4.lastMove = { fr: -1, fc: 0, tr: 3, tc: 0 };
  assert.strictEqual(J.gameFromData(e4), null, '판 밖 좌표');
  const e5 = copy(); e5.lastMove = null;
  assert.ok(J.gameFromData(e5), 'null 마지막 수는 허용');
});

test('저장·복원: 되살린 판이 원본 자료를 함께 고치지 않는다', () => {
  const g = new J.Game();
  g.play(g.moves()[0]);
  const d = JSON.parse(JSON.stringify(g.toData()));
  const r = J.gameFromData(d);
  assert.ok(r);
  assert.notStrictEqual(r.board, d.board, '판은 사본이어야 함');
  assert.notStrictEqual(r.history, d.history, '무르기 기록도 사본이어야 함');
  const len = d.history.length;
  r.play(r.moves()[0]);            // 되살린 판에서 두어도
  assert.strictEqual(d.history.length, len, '원본 자료가 늘면 안 됨');
  r.undo();
  assert.strictEqual(d.history.length, len, '원본 자료가 줄어도 안 됨');
});

if (process.exitCode) {
  console.log('\n일부 테스트 실패');
} else {
  console.log('\n전체 ' + passed + '개 테스트 통과');
}
