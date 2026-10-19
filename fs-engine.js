// fs-engine.js — Fairy-Stockfish(WebAssembly) 연동 계층
// 보드 ⇄ FEN 변환, UCI 명령 처리, 엔진 호출.
// 브라우저에서는 Web Worker(fspawn.js)에서, Node에서는 stockfish.js를 직접 구동한다.
// 엔진 로드 실패 시 호출자가 내장 AI(ai.js)로 폴백할 수 있다.
(function (global) {
  'use strict';

  const Janggi = typeof require === 'function' && typeof window === 'undefined'
    ? require('./janggi.js')
    : global.Janggi;

  // ---- 기물 표기 변환 --------------------------------------------------
  // 우리 기물 문자 → Fairy-Stockfish 장기(janggi) FEN 문자
  //   車=r  馬=n  象=b  包=c  士=a  將=k  卒/兵=p
  const TO_FEN = { R: 'r', N: 'n', E: 'b', C: 'c', G: 'a', K: 'k', P: 'p' };
  const FROM_FEN = { r: 'R', n: 'N', b: 'E', c: 'C', a: 'G', k: 'K', p: 'P' };
  const FILES = 'abcdefghi';

  // 좌표 대응: 우리 (행, 열) = FS (랭크 = 행+1, 파일 = 열)
  //   우리 행 0(초 뒷줄) = FS 1번 랭크, 한은 FS 10번 랭크.
  //   FEN 은 첫 줄이 가장 높은 랭크이므로(boardToFen 은 우리 9행부터 쓴다)
  //   초(대문자=white)는 FEN 마지막 줄 = 1번 랭크에 놓인다.
  function boardToFen(board, turn) {
    const rows = [];
    for (let r = Janggi.ROWS - 1; r >= 0; r--) {
      let s = '';
      let gap = 0;
      for (let c = 0; c < Janggi.COLS; c++) {
        const p = board[r][c];
        if (!p) { gap++; continue; }
        if (gap) { s += gap; gap = 0; }
        const ch = TO_FEN[p.type];
        if (!ch) throw new Error('알 수 없는 기물: ' + p.type);
        s += p.side === Janggi.CHO ? ch.toUpperCase() : ch.toLowerCase();
      }
      if (gap) s += gap;
      rows.push(s);
    }
    return rows.join('/') + ' ' + (turn === Janggi.CHO ? 'w' : 'b') + ' - - 0 1';
  }

  function fenToBoard(fen) {
    const board = Array.from({ length: Janggi.ROWS }, () => Array(Janggi.COLS).fill(null));
    const rows = fen.trim().split(' ')[0].split('/');   // ' w - - 0 1' 부분을 버린다
    if (rows.length !== Janggi.ROWS) throw new Error('잘못된 FEN(줄 수): ' + fen);
    rows.forEach((rowStr, i) => {
      const r = Janggi.ROWS - 1 - i; // FEN 첫 줄이 10번 랭크 = 우리 9행
      let c = 0;
      let gap = 0;
      for (const ch of rowStr) {
        if (ch >= '1' && ch <= '9') { gap += Number(ch); continue; }
        const type = FROM_FEN[ch.toLowerCase()];
        if (!type) throw new Error('잘못된 FEN(기물): ' + fen);
        if (c + gap >= Janggi.COLS) throw new Error('잘못된 FEN(열 수): ' + fen);
        board[r][c + gap] = { side: ch === ch.toLowerCase() ? Janggi.HAN : Janggi.CHO, type };
        c += gap + 1;   // 기물이 놓인 열까지 건너뛴다
        gap = 0;
      }
      if (c + gap !== Janggi.COLS) throw new Error('잘못된 FEN(열 수): ' + fen);
    });
    return board;
  }

  // UCI 수 형식: "열a~i + 행1~10" 두 개 이어붙임 (예: b1c3, i10h9)
  function moveToUci(m) {
    return FILES[m.fc] + (m.fr + 1) + FILES[m.tc] + (m.tr + 1);
  }
  function uciToMove(s) {
    if (typeof s !== 'string') return null;
    // 10번 행은 두 자리이므로 숫자를 구분해서 읽는다
    const m = /^([a-i])([0-9]+)([a-i])([0-9]+)$/.exec(s);
    if (!m) return null;
    const fr = Number(m[2]) - 1, tr = Number(m[4]) - 1;
    if (fr < 0 || fr > Janggi.ROWS - 1 || tr < 0 || tr > Janggi.ROWS - 1) return null;
    return { fr, fc: FILES.indexOf(m[1]), tr, tc: FILES.indexOf(m[3]) };
  }

  // ---- 난이도 설정 -----------------------------------------------------
  // 1 = 초보, 2 = 중급, 3 = 고수, 4 = 최강
  // Skill Level 로 실력을 제한하고, movetime 으로 탐색 시간을 정한다.
  // (3번과 4번이 둘 다 skill 20 이면 실력 차이가 거의 없어서 3번을 확실히 낮췄다)
  const LEVELS = {
    1: { skill: 0, movetime: 400 },
    2: { skill: 8, movetime: 1000 },
    3: { skill: 14, movetime: 2000 },
    4: { skill: 20, movetime: 4000 },   // 베타: 힘을 숨기지 않고 전력으로 둔다
  };

  const UCI_HANDSHAKE_TIMEOUT = 15000;
  const SEARCH_EXTRA_MS = 8000;

  // ---- 엔진 핸들 ------------------------------------------------------
  // send(cmd)          : 엔진에 UCI 명령 전달
  // ready()            : uci + 변형 설정 + isready 완료까지 대기
  // bestMove(fen,lv)   : 최선의 수(UCI 문자열) 반환. 없으면 null
  // perft(fen,depth)   : perft 노드 수 반환
  // stop()             : 엔진 종료
  function makeHandle(send) {
    let chain = Promise.resolve();      // 탐색 직렬화(요청이 겹쳐도 순서 보장)
    let waiting = null;                 // 현재 대기 중인 탐색 결과
    let searching = false;              // 엔진이 아직 탐색 중인가 (멈춤·배출이 필요할 수 있다)
    let searchTimeouts = 0;             // 잇달아 생긴 탐색 응답 시간 초과 횟수
    let dead = null;                    // 엔진을 못 쓰게 된 이유 (있으면 모든 요청을 즉시 거절)
    let readyPromise = null;
    const listeners = [];             // 엔진 출력 구경용 콜백

    function waitFor(pred, timeout, sink) {
      return new Promise((resolve, reject) => {
        const w = { pred, sink, resolve, reject, timer: null };
        w.timer = setTimeout(() => {
          // 엔진이 아직 탐색 중이면 일단 멈춰 세운다. 늦게 도착한 bestmove 는
          // 다음 요청이 cancelPending() 에서 배출(소비)해 엉뚱한 수로 배달되지 않게 한다.
          if (waiting === w) {
            waiting = null;
            if (searching) { try { send('stop'); } catch (e) { /* 무시 */ } }
          }
          reject(new Error('엔진 응답 시간 초과'));
        }, timeout);
        waiting = w;
      });
    }

    // 엔진 출력 한 줄을 받을 때: 외부 청취자 통지 + 대기 중인 요청에 배달
    function onLine(line) {
      if (/^bestmove/.test(line)) searching = false;
      for (const fn of listeners) fn(line);
      const w = waiting;
      if (!w) return;
      // info depth ... multipv N ... pv <수들> → 후보 수집
      if (w.sink && /^info /.test(line)) {
        const mp = /\bmultipv (\d+)/.exec(line);
        const pvs = /\bpv (.+)$/.exec(line);
        if (mp && pvs) w.sink[mp[1]] = pvs[1].trim().split(/\s+/)[0];
      }
      if (w.pred(line)) {
        waiting = null;
        clearTimeout(w.timer);
        w.resolve(line);
      }
    }

    function handshake() {
      if (readyPromise) return readyPromise;
      readyPromise = (async () => {
        send('uci');
        await waitFor((l) => /^uciok/.test(l), UCI_HANDSHAKE_TIMEOUT);
        // 장기 변형 고정 + 단일 스레드(모바일 메모리 절약)
        send('setoption name UCI_Variant value janggi');
        send('setoption name Threads value 1');
        send('setoption name Hash value 16');
        send('isready');
        await waitFor((l) => /^readyok/.test(l), UCI_HANDSHAKE_TIMEOUT);
      })();
      readyPromise.catch(() => { readyPromise = null; });
      return readyPromise;
    }

    // 탐색 직전에 아직 돌고 있는 탐색이 있으면 멈추고, 늦게 오는 bestmove 를
    // 여기서 배출(소비)해 다음 요청에 섞이지 않게 한다.
    async function cancelPending() {
      if (!searching) return;
      send('stop');
      try { await waitFor((l) => /^bestmove/.test(l), SEARCH_EXTRA_MS); } catch (e) { /* 무시 */ }
      waiting = null;
      searching = false;
    }

    // bestmove 를 기다린다. 시간 초과가 잇따르면 엔진을 버리고 내장 AI 로 넘긴다.
    function expectingBestmove(timeout, sink) {
      return waitFor((l) => /^bestmove/.test(l), timeout, sink).then(
        (line) => { searchTimeouts = 0; return line; },
        (err) => {
          if (++searchTimeouts >= 2) fail(new Error('엔진이 응답하지 않습니다'));
          throw err;
        });
    }

    function enqueue(fn) {
      const run = () => (dead ? Promise.reject(dead) : Promise.resolve(fn()));
      const p = chain.then(run, run);
      chain = p.catch(() => {});
      return p;
    }

    // 엔진을 더 이상 쓸 수 없게 됐을 때(워커 종료 등): 대기 중인 요청을 깨우고
    // 앞으로의 요청은 곧바로 실패시킨다 (호출자가 내장 AI 로 폴백한다).
    function fail(err) {
      if (dead) return;
      dead = err || new Error('엔진을 더 이상 쓸 수 없습니다');
      if (waiting) {
        const w = waiting;
        waiting = null;
        clearTimeout(w.timer);
        w.reject(dead);
      }
      if (handle.onFail) {
        try { handle.onFail(dead); } catch (e) { /* 무시 */ }
      }
    }

    // 후보 수: 엔진이 1순위로 고른 수가 우리 규칙에 어긋나도 대체 수를 고를 수 있게 한다
    const MULTI_PV = 6;

    // bestMove → ['b1c3', 'e3e5', ...]
    //   [0]은 엔진이 실제로 두려던 수(난이도 조절 결과), 나머지는 예비 후보.
    function bestMove(fen, level) {
      const cfg = LEVELS[level] || LEVELS[2];
      return enqueue(async () => {
        await handshake();
        await cancelPending();
        const pv = {};                       // multipv 번호 → 최선 수
        send('setoption name MultiPV value ' + MULTI_PV);
        send('setoption name Skill Level value ' + cfg.skill);
        send('position fen ' + fen);
        searching = true;
        send('go movetime ' + cfg.movetime);
        const line = await expectingBestmove(cfg.movetime + SEARCH_EXTRA_MS, pv);
        const best = line.split(/\s+/)[1];
        if (!best || best === '(none)' || best === '0000') return null;
        const alternates = Object.keys(pv)
          .map(Number).sort((a, b) => a - b)
          .map((k) => pv[k])
          .filter((m, i, arr) => m && m !== best && arr.indexOf(m) === i);
        return [best].concat(alternates);
      });
    }

    // 복기용 분석: 국면을 깊이 보고 최선 수와 점수(둔 쪽 관점)를 돌려준다.
    // cp 는 1/100점 단위, 메이트가 보이면 mate(남은 수)로 알려 준다.
    function analyze(fen, movetime) {
      return enqueue(async () => {
        await handshake();
        await cancelPending();
        const info = { cp: null, mate: null, depth: 0 };
        const watcher = (line) => {
          if (!/^info /.test(line)) return;
          const d = /^info depth (\d+)/.exec(line);
          if (d) info.depth = Number(d[1]);
          const mt = /score mate (-?\d+)/.exec(line);
          if (mt) { info.mate = Number(mt[1]); }
          const cp = /score cp (-?\d+)/.exec(line);
          if (cp) { info.cp = Number(cp[1]); }
        };
        listeners.push(watcher);
        let line;
        try {
          send('setoption name MultiPV value 1');
          send('setoption name Skill Level value 20');
          send('position fen ' + fen);
          searching = true;
          send('go movetime ' + movetime);
          line = await expectingBestmove(movetime + SEARCH_EXTRA_MS);
        } finally {
          const i = listeners.indexOf(watcher);
          if (i >= 0) listeners.splice(i, 1);
        }
        const best = line.split(/\s+/)[1];
        return {
          uci: (!best || best === '(none)' || best === '0000') ? null : best,
          cp: info.cp,
          mate: info.mate,
          depth: info.depth,
        };
      });
    }

    function perft(fen, depth) {
      return enqueue(async () => {
        await handshake();
        await cancelPending();
        send('position fen ' + fen);
        send('go perft ' + depth);
        const line = await waitFor((l) => /^Nodes searched:/i.test(l), 120000);
        return Number(line.split(':')[1].trim());
      });
    }

    const handle = {
      send, onLine, handshake, bestMove, analyze, perft, fail,
      onFail: null,               // 엔진을 못 쓰게 됐을 때 알림 받을 콜백(호출자가 지정)
      addListener(fn) { listeners.push(fn); },
      stop() { try { send('quit'); } catch (e) { /* 무시 */ } },
    };
    return handle;
  }

  // ---- Node 전용: stockfish.js 를 직접 구동 ----------------------------
  function createNodeEngine() {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, 'third_party', 'fairy-stockfish');
    const Stockfish = require(path.join(dir, 'stockfish.js'));
    const wasmBinary = fs.readFileSync(path.join(dir, 'stockfish.wasm'));
    return Stockfish({ wasmBinary }).then((mod) => {
      const handle = makeHandle((cmd) => mod.postMessage(cmd));
      mod.addMessageListener((line) => handle.onLine(line));
      return handle;
    });
  }

  // ---- 브라우저 전용: Web Worker(fs-worker.js) 경유 --------------------
  // 워커는 Blob URL 로 만든다. file:// 로 열면 브라우저가 외부 Worker 파일
  // 생성과 fetch() 를 막는데, Blob URL 과 인라인 base64 는 둘 다 허용된다.
  //
  // 워커 소스도 번들 안에 넣어 두어 file:// 에서는 fetch 없이 쓸 수 있게 한다.
  function loadBundle() {
    const isFile = typeof location !== 'undefined' && location.protocol === 'file:';
    const src = 'third_party/fairy-stockfish/fsf-bundle.js' + (isFile ? '' : '?v=' + Date.now());
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => {
        s.remove();                     // 다 읽은 <script> 는 치운다
        if (global.FSF_BUNDLE) resolve(global.FSF_BUNDLE);
        else reject(new Error('엔진 번들이 비어 있습니다'));
      };
      s.onerror = () => {
        s.remove();
        reject(new Error('엔진 번들 스크립트를 불러오지 못했습니다'));
      };
      document.head.appendChild(s);
    });
  }

  // 워커 소스: 번들에 들어 있으면 그것을 쓰고, 없으면 파일에서 읽는다.
  function loadWorkerSource(bundle) {
    if (bundle && bundle.worker) {
      return Promise.resolve(new TextDecoder().decode(base64ToBytes(bundle.worker)));
    }
    return fetch('fs-worker.js?v=' + Date.now(), { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error('워커 스크립트를 읽지 못했습니다: ' + r.status);
        return r.text();
      });
  }

  function base64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function createBrowserEngine() {
    return loadBundle()
      .then((bundle) => loadWorkerSource(bundle).then((workerSrc) => ({ workerSrc, bundle })))
      .then(({ workerSrc, bundle }) => {
        const blob = new Blob([workerSrc], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        let worker;
        try {
          worker = new global.Worker(url);
        } catch (e) {
          URL.revokeObjectURL(url);
          throw new Error('Web Worker 생성 실패: ' + e.message);
        }
        return { worker, url, bundle };
      })
      .then(({ worker, url, bundle }) => new Promise((resolve, reject) => {
        let settled = false;
        let handle = null;
        const buffer = [];        // 워커 준비 전에 도착한 출력 보관
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          try { worker.terminate(); } catch (e) { /* 무시 */ }
          try { URL.revokeObjectURL(url); } catch (e) { /* 무시 */ }
          reject(new Error('엔진 초기화 시간 초과'));
        }, 60000);

        worker.onerror = (ev) => {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            reject(new Error('엔진 워커 오류: ' + (ev.message || 'unknown')));
            return;
          }
          // 준비 뒤 워커가 죽으면 대기 중인 요청을 깨우고 앞으로는 내장 AI 로 넘어가게 한다
          if (handle) handle.fail(new Error('엔진 워커가 멈췄습니다'));
        };

        worker.onmessage = (ev) => {
          const msg = ev.data;
          if (msg && msg.type === 'line') {
            if (handle) handle.onLine(msg.line);
            else buffer.push(msg.line);   // 준비 전 수신분 보관
            return;
          }
          if (msg && msg.type === 'ready' && !settled) {
            settled = true;
            clearTimeout(timeout);
            try { URL.revokeObjectURL(url); } catch (e) { /* 무시 */ }
            handle = makeHandle((cmd) => worker.postMessage({ type: 'cmd', cmd }));
            for (const line of buffer) handle.onLine(line);
            resolve(handle);
            return;
          }
          if (msg && msg.type === 'error') {
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              reject(new Error(msg.message || '엔진 초기화 실패'));
            } else if (handle) {
              handle.fail(new Error(msg.message || '엔진 오류'));
            }
          }
        };

        worker.postMessage({ type: 'init', bundle });
      }));
  }

  function createEngine() {
    if (typeof window !== 'undefined' && typeof global.Worker === 'function') {
      return createBrowserEngine();
    }
    return createNodeEngine();
  }

  const api = {
    boardToFen, fenToBoard, moveToUci, uciToMove,
    createEngine,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.JanggiFS = api;
})(typeof window !== 'undefined' ? window : this);