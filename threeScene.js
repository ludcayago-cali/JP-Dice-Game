/**
 * threeScene.js — 2D Canvas renderer for Dice Corner Duel 2v2
 * Supports 4 characters: hero, archer (team A) vs bot1, bot2 (team B)
 * Shared dice roll, individual path planning per unit.
 */

const ThreeScene = (() => {
  'use strict';

  const GRID     = 10;
  const CELL     = 60;
  const CANVAS_W = GRID * CELL;
  const CANVAS_H = GRID * CELL;

  let canvas, ctx;
  let blockedMap = {};

  // Per-character state
  // chars: { hero, archer, bot1, bot2 }
  let charPositions = {
    hero:   { col: 0, row: 9 },
    archer: { col: 1, row: 9 },
    bot1:   { col: 9, row: 0 },
    bot2:   { col: 8, row: 0 },
  };
  let charHP = { hero: 10, archer: 10, bot1: 10, bot2: 10 };

  // FX
  let shakeX = 0, shakeY = 0;
  let healFX  = [];
  let hitFX   = null;
  let flashFX = null;

  // Path-planning state — per unit
  let allPaths    = { hero: [], archer: [] }; // active planned paths
  let activePlanId = null;   // which unit is currently being planned
  let tileClickCB  = null;

  // Team colors
  const TEAM_COLOR = {
    hero:   '#4a90e2',
    archer: '#22aaff',
    bot1:   '#c0392b',
    bot2:   '#e67e22',
  };
  const TEAM_HP_COLOR = {
    hero:   '#2e72b8',
    archer: '#1a6aaa',
    bot1:   '#b82e2e',
    bot2:   '#b86a10',
  };

  const IMG = {};

  // Smooth anim state per character
  const anim = {
    hero:   { x: 0,      y: 9*CELL, tx: 0,      ty: 9*CELL },
    archer: { x: 1*CELL, y: 9*CELL, tx: 1*CELL, ty: 9*CELL },
    bot1:   { x: 9*CELL, y: 0,      tx: 9*CELL, ty: 0      },
    bot2:   { x: 8*CELL, y: 0,      tx: 8*CELL, ty: 0      },
  };

  // Which characters exist (deleted when killed)
  let liveChars = { hero: true, archer: true, bot1: true, bot2: true };

  // ── Asset loading ──────────────────────────────────────────────────
  function loadImage(name, src) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload  = () => { IMG[name] = img; resolve(); };
      img.onerror = resolve;
      img.src     = src;
    });
  }
  async function loadAllAssets() {
    await Promise.all(Object.entries(SPRITE_ASSETS).map(([k,v]) => loadImage(k,v)));
  }

  // ── Init ──────────────────────────────────────────────────────────
  async function init(blocked) {
    blockedMap = blocked || {};
    buildUI();
    await loadAllAssets();
    startLoop();
  }

  // ── Build HTML ────────────────────────────────────────────────────
  function buildUI() {
    if (!document.querySelector('link[href*="Cinzel"]')) {
      const lnk = document.createElement('link');
      lnk.rel  = 'stylesheet';
      lnk.href = 'https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Cinzel:wght@400;600;700&display=swap';
      document.head.appendChild(lnk);
    }
    ['hud','roll-area','game-log','action-modal','result-overlay'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    const heroSrc  = SPRITE_ASSETS.hero_sprite  || '';
    const enemySrc = SPRITE_ASSETS.enemy_sprite || '';

    const wrap = document.createElement('div');
    wrap.id = 'gw';
    wrap.innerHTML = `
      <div id="gw-header">
        <button id="gw-menu" aria-label="Menu">☰</button>
        <div class="gw-team-block" id="gw-team-a">
          <div class="gw-avatar" id="gw-av-hero">
            <img src="${heroSrc}" alt="Hero"/>
            <span class="gw-badge blue">H</span>
          </div>
          <div class="gw-avatar" id="gw-av-archer">
            <img src="${heroSrc}" alt="Archer"/>
            <span class="gw-badge cyan">A</span>
          </div>
        </div>
        <div id="gw-title">
          <div id="gw-turn-title">Player Turn</div>
          <div id="gw-turn-sub">Roll the dice to start.</div>
          <div id="gw-turn-meta">Round 1 &nbsp;|&nbsp; Dice: -</div>
        </div>
        <div class="gw-team-block" id="gw-team-b">
          <div class="gw-avatar" id="gw-av-bot1">
            <img src="${enemySrc}" alt="Bot1"/>
            <span class="gw-badge red">E1</span>
          </div>
          <div class="gw-avatar" id="gw-av-bot2">
            <img src="${enemySrc}" alt="Bot2"/>
            <span class="gw-badge orange">E2</span>
          </div>
        </div>
      </div>

      <div id="gw-board-wrap">
        <canvas id="gw-canvas"></canvas>
      </div>

      <div id="gw-stats">
        <div class="gw-stat hero-stat" id="gw-stat-hero">
          <div class="gw-sname">Hero</div>
          <div class="gw-shp" id="gw-hp-hero">10</div>
          <div class="gw-smeta" id="gw-pos-hero">(0,9)</div>
        </div>
        <div class="gw-stat archer-stat" id="gw-stat-archer">
          <div class="gw-sname">Archer</div>
          <div class="gw-shp" id="gw-hp-archer">10</div>
          <div class="gw-smeta" id="gw-pos-archer">(1,9)</div>
        </div>
        <div class="gw-stat bot1-stat" id="gw-stat-bot1">
          <div class="gw-sname">Bot-1</div>
          <div class="gw-shp" id="gw-hp-bot1">10</div>
          <div class="gw-smeta" id="gw-pos-bot1">(9,0)</div>
        </div>
        <div class="gw-stat bot2-stat" id="gw-stat-bot2">
          <div class="gw-sname">Bot-2</div>
          <div class="gw-shp" id="gw-hp-bot2">10</div>
          <div class="gw-smeta" id="gw-pos-bot2">(8,0)</div>
        </div>
      </div>

      <div id="gw-roll-row">
        <button id="gw-roll-btn">🎲 ROLL</button>
        <button id="gw-confirm-btn" style="display:none">✔ CONFIRM PATH</button>
        <div id="gw-result-block">
          <div class="gw-rlabel">DICE</div>
          <div id="gw-result-num">-</div>
        </div>
      </div>

      <div id="gw-bottom">
        <button class="gw-bbtn" id="gw-endturn">End Turn</button>
        <button class="gw-bbtn dim" id="gw-nextround">Next Round</button>
        <button class="gw-bbtn" id="gw-lobby">Return Lobby</button>
      </div>

      <!-- Action modal -->
      <div id="gw-action-modal" class="gw-overlay gw-hide">
        <div class="gw-mbox">
          <h2 id="gw-action-title">⚔️ ADJACENT!</h2>
          <p id="gw-action-sub">Choose your action:</p>
          <button id="gw-btn-attack" class="gw-abtn red-btn">⚔️ Attack (-2 HP)</button>
          <button id="gw-btn-heal"   class="gw-abtn grn-btn">💚 Heal (+2 HP)</button>
          <button id="gw-btn-skip"   class="gw-abtn skp-btn">⏭ Skip</button>
        </div>
      </div>

      <!-- Return Lobby confirm -->
      <div id="gw-lobby-confirm" class="gw-overlay gw-hide">
        <div class="gw-mbox">
          <h2>🏰 Return to Lobby?</h2>
          <p>Game progress will be lost.</p>
          <button id="gw-lobby-yes" class="gw-abtn red-btn">✔ Yes, Return</button>
          <button id="gw-lobby-no"  class="gw-abtn skp-btn">✕ Resume</button>
        </div>
      </div>

      <!-- Result overlay -->
      <div id="gw-result-overlay" class="gw-overlay gw-hide">
        <div class="gw-mbox">
          <div id="gw-res-title"  style="font-size:2.2rem;font-weight:900;margin-bottom:.4rem"></div>
          <div id="gw-res-sub"    style="font-size:.85rem;opacity:.65;margin-bottom:1.5rem;letter-spacing:1px"></div>
          <button id="gw-restart" class="gw-abtn" style="background:#7b4010;border-color:#c9a84c;color:#ffe08a">🔄 Play Again</button>
        </div>
      </div>

      <!-- Log -->
      <div id="gw-log"><div id="gw-log-inner"></div></div>
    `;
    document.body.appendChild(wrap);
    injectCSS();
    hookGameJS();
  }

  function injectCSS() {
    const s = document.createElement('style');
    s.textContent = `
:root{--br:#3a1e08;--bg1:#6b3d1a;--bg2:#3d1e08;--gold:#c9a84c;--gold2:#ffe08a;--text:#e8d0a0;--muted:#a08060;}
*{box-sizing:border-box;margin:0;padding:0;}
html,body{width:100%;height:100%;background:#2e1604;font-family:'Cinzel',Georgia,serif;overflow:hidden;display:flex;align-items:center;justify-content:center;}
#gw{display:flex;flex-direction:column;width:clamp(340px,540px,99vw);max-height:99dvh;
  background:linear-gradient(180deg,var(--bg1),var(--bg2));border-radius:14px;
  border:3px solid #1a0c03;box-shadow:0 10px 50px rgba(0,0,0,.85);overflow:hidden;position:relative;}

/* Header */
#gw-header{display:flex;align-items:center;gap:8px;padding:9px 12px 8px;
  background:linear-gradient(180deg,#2e1604,#200e02);border-bottom:2.5px solid #1a0c03;flex-shrink:0;}
#gw-menu{background:#200e02;border:2px solid #5a3010;color:var(--gold);
  width:36px;height:36px;border-radius:8px;cursor:pointer;font-size:16px;flex-shrink:0;}
.gw-team-block{display:flex;gap:6px;flex-shrink:0;}
.gw-avatar{position:relative;width:50px;height:50px;border-radius:50%;
  border:2.5px solid var(--gold);background:rgba(0,0,0,.4);
  display:flex;align-items:center;justify-content:center;overflow:visible;}
.gw-avatar img{width:38px;height:38px;object-fit:contain;border-radius:50%;}
.gw-avatar.active-plan{border-color:#fff;box-shadow:0 0 10px #fff8,0 0 0 3px rgba(255,255,255,0.3);}
.gw-avatar.dead{opacity:.3;filter:grayscale(1);}
.gw-badge{position:absolute;top:-4px;right:-5px;font-size:8px;font-weight:700;
  border-radius:10px;padding:2px 4px;border:1.5px solid #fff;line-height:1.2;color:#fff;}
.gw-badge.blue{background:#3a7bd5;}
.gw-badge.cyan{background:#0099bb;}
.gw-badge.red{background:#c0392b;}
.gw-badge.orange{background:#c07030;}
#gw-title{flex:1;text-align:center;}
#gw-turn-title{font-size:1.1rem;font-weight:700;color:var(--gold2);}
#gw-turn-sub{font-size:.58rem;color:#b09070;margin:.15rem 0 .1rem;}
#gw-turn-meta{font-size:.58rem;color:var(--muted);letter-spacing:.5px;}

/* Board */
#gw-board-wrap{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;
  padding:8px;background:linear-gradient(180deg,#4a2a0e,#341404);
  border-top:2px solid #1a0c03;border-bottom:2px solid #1a0c03;overflow:hidden;}
#gw-canvas{display:block;border:3px solid #200e02;
  box-shadow:inset 0 0 20px rgba(0,0,0,.4);image-rendering:pixelated;
  max-width:100%;max-height:100%;cursor:pointer;}

/* Stats — 4 columns */
#gw-stats{display:flex;flex-shrink:0;background:#3d1e08;border-bottom:2px solid #1a0c03;}
.gw-stat{flex:1;padding:7px 8px;text-align:center;border-right:2px solid #1a0c03;}
.gw-stat:last-child{border-right:none;}
.gw-sname{font-size:.58rem;color:var(--muted);font-weight:600;letter-spacing:.3px;margin-bottom:1px;}
.gw-shp{font-size:1.8rem;font-weight:900;color:var(--gold2);line-height:1;}
.gw-smeta{font-size:.52rem;color:var(--muted);margin-top:1px;}
.hero-stat   .gw-shp{color:#6ab4ff;}
.archer-stat .gw-shp{color:#44ddff;}
.bot1-stat   .gw-shp{color:#ff7070;}
.bot2-stat   .gw-shp{color:#ffaa50;}
.gw-stat.planning-active{background:rgba(255,255,255,0.07);outline:2px solid rgba(255,255,255,0.4);}

/* Roll row */
#gw-roll-row{display:flex;align-items:stretch;flex-shrink:0;border-bottom:2.5px solid #1a0c03;}
#gw-roll-btn{flex:1;background:linear-gradient(180deg,#f0e0b0,#d4b870);border:none;
  font-family:'Cinzel',serif;font-size:1.5rem;font-weight:900;color:#4a2a08;letter-spacing:3px;
  padding:12px 0;cursor:pointer;transition:filter .12s;}
#gw-roll-btn:hover:not([disabled]){filter:brightness(1.08);}
#gw-roll-btn[disabled]{opacity:.4;cursor:not-allowed;}
#gw-confirm-btn{flex:1;background:linear-gradient(180deg,#3a8a3a,#226022);border:none;
  font-family:'Cinzel',serif;font-size:1rem;font-weight:700;color:#afffaf;letter-spacing:2px;
  padding:12px 0;cursor:pointer;transition:filter .12s;border-left:2px solid #1a0c03;}
#gw-confirm-btn:hover:not([disabled]){filter:brightness(1.12);}
#gw-confirm-btn[disabled]{opacity:.4;cursor:not-allowed;}
#gw-result-block{width:76px;flex-shrink:0;background:#200e02;border-left:2px solid #1a0c03;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;}
.gw-rlabel{font-size:.48rem;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase;}
#gw-result-num{font-size:1.5rem;font-weight:900;color:var(--gold2);}

/* Bottom row */
#gw-bottom{display:flex;flex-shrink:0;}
.gw-bbtn{flex:1;background:linear-gradient(180deg,#5a3010,#3a1e08);border:none;
  border-top:2px solid #1a0c03;border-right:2px solid #1a0c03;
  font-family:'Cinzel',serif;font-size:.65rem;font-weight:700;color:var(--text);
  padding:11px 6px;cursor:pointer;transition:background .15s,color .15s;}
.gw-bbtn:last-child{border-right:none;}
.gw-bbtn:hover:not(.dim){background:linear-gradient(180deg,#7a4a20,#5a2e10);color:var(--gold2);}
.gw-bbtn.dim{opacity:.38;cursor:default;}

/* Modals */
.gw-overlay{position:absolute;inset:0;z-index:600;
  display:flex;align-items:center;justify-content:center;
  background:rgba(0,0,0,.68);backdrop-filter:blur(4px);}
.gw-hide{display:none!important;}
.gw-mbox{background:linear-gradient(180deg,#3e1f08,#260e02);
  border:2px solid var(--gold);border-radius:12px;padding:26px 38px;text-align:center;
  box-shadow:0 0 50px rgba(201,168,76,.2),0 24px 64px rgba(0,0,0,.8);animation:gwIn .22s ease;}
@keyframes gwIn{from{opacity:0;transform:scale(.9) translateY(18px)}to{opacity:1;transform:none}}
.gw-mbox h2{font-size:1.1rem;color:var(--gold2);margin-bottom:7px;}
.gw-mbox p{font-size:.72rem;color:rgba(232,223,192,.65);margin-bottom:16px;letter-spacing:.8px;}
.gw-abtn{display:block;width:100%;margin-bottom:9px;padding:10px 16px;
  font-family:'Cinzel',serif;font-size:.78rem;letter-spacing:1px;border-radius:6px;cursor:pointer;transition:all .14s;border:1.5px solid;}
.gw-abtn:last-child{margin-bottom:0;}
.red-btn{background:rgba(224,68,68,.12);border-color:#e04444;color:#ffa0a0;}
.red-btn:hover{background:rgba(224,68,68,.3);}
.grn-btn{background:rgba(68,201,122,.12);border-color:#44c97a;color:#90ffc0;}
.grn-btn:hover{background:rgba(68,201,122,.3);}
.skp-btn{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.14);color:rgba(232,223,192,.45);}
.skp-btn:hover{background:rgba(255,255,255,.1);}

/* Log */
#gw-log{position:absolute;bottom:100px;left:6px;width:175px;pointer-events:none;z-index:300;}
#gw-log-inner{display:flex;flex-direction:column;gap:3px;}
.gw-le{font-size:.58rem;color:rgba(232,223,192,.72);background:rgba(15,6,0,.8);
  border-left:2.5px solid rgba(201,168,76,.5);padding:3px 6px;border-radius:0 3px 3px 0;animation:gwLog .18s ease;}
@keyframes gwLog{from{opacity:0;transform:translateX(-6px)}to{opacity:1}}
.gw-le.attack{border-color:#e04444;color:#ffa0a0;}
.gw-le.heal{border-color:#44c97a;color:#90ffc0;}
.gw-le.move{border-color:rgba(100,150,255,.5);color:#b0c8ff;}
.gw-le.dice{border-color:var(--gold);color:var(--gold2);}

/* Path legend indicator */
#gw-path-legend{position:absolute;bottom:100px;right:8px;z-index:300;pointer-events:none;
  font-family:'Cinzel',serif;font-size:.55rem;color:var(--muted);display:flex;flex-direction:column;gap:4px;}
.gw-legend-row{display:flex;align-items:center;gap:5px;}
.gw-legend-dot{width:10px;height:10px;border-radius:50%;}
    `;
    document.head.appendChild(s);

    // Path legend
    const legend = document.createElement('div');
    legend.id = 'gw-path-legend';
    legend.innerHTML = `
      <div class="gw-legend-row"><div class="gw-legend-dot" style="background:#4a90e2"></div>Hero path</div>
      <div class="gw-legend-row"><div class="gw-legend-dot" style="background:#22aaff"></div>Archer path</div>
    `;
    document.getElementById('gw') && document.getElementById('gw').appendChild(legend);
  }

  // ── Shim: proxy old IDs → new UI ──────────────────────────────────
  function hookGameJS() {
    const btnMap = {
      'roll-btn':         'gw-roll-btn',
      'confirm-move-btn': 'gw-confirm-btn',
      'btn-attack':       'gw-btn-attack',
      'btn-heal':         'gw-btn-heal',
      'btn-skip':         'gw-btn-skip',
      'restart-btn':      'gw-restart',
    };
    Object.entries(btnMap).forEach(([oldId, newId]) => {
      const proxy = document.createElement('button');
      proxy.id = oldId;
      proxy.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;';
      document.body.appendChild(proxy);
      const real = document.getElementById(newId);
      if (real) real.addEventListener('click', () => proxy.click());
      new MutationObserver(() => {
        if (!real) return;
        real.disabled = proxy.disabled;
        if (oldId === 'confirm-move-btn') {
          real.style.display = proxy.style.display === 'none' ? 'none' : '';
        }
      }).observe(proxy, { attributes: true, attributeFilter: ['disabled','style'] });
    });

    const textShims = {
      'turn-info':           'gw-turn-title',
      'dice-result-display': 'gw-result-num',
      'result-title':        'gw-res-title',
      'result-subtitle':     'gw-res-sub',
    };
    Object.entries(textShims).forEach(([oldId, newId]) => {
      const el = document.createElement('div');
      el.id = oldId;
      el.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;overflow:hidden;';
      document.body.appendChild(el);
      new MutationObserver(() => {
        const real = document.getElementById(newId);
        if (!real) return;
        real.textContent = el.textContent;
        if (el.style.color) real.style.color = el.style.color;
      }).observe(el, { childList: true, subtree: true, characterData: true, attributes: true });
    });

    const logShim = document.createElement('div');
    logShim.id = 'log-entries';
    logShim.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;overflow:hidden;';
    document.body.appendChild(logShim);
    new MutationObserver(() => {
      const inner = document.getElementById('gw-log-inner');
      if (!inner) return;
      inner.innerHTML = '';
      Array.from(logShim.children).forEach(child => {
        const div = document.createElement('div');
        div.className   = 'gw-le ' + child.className.replace('log-entry','').trim();
        div.textContent = child.textContent;
        inner.appendChild(div);
      });
    }).observe(logShim, { childList: true, subtree: true });

    ['player-hp-bar','bot-hp-bar','player-hp-text','bot-hp-text'].forEach(id => {
      const el = document.createElement('div');
      el.id = id;
      el.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;';
      document.body.appendChild(el);
    });

    const actionShim = document.createElement('div');
    actionShim.id = 'action-modal';
    actionShim.className = 'hidden';
    actionShim.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;';
    document.body.appendChild(actionShim);

    const resultShim = document.createElement('div');
    resultShim.id = 'result-overlay';
    resultShim.className = 'hidden';
    resultShim.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;';
    document.body.appendChild(resultShim);

    document.getElementById('gw-restart').addEventListener('click', () => {
      document.getElementById('gw-result-overlay').classList.add('gw-hide');
    });

    document.getElementById('gw-lobby').addEventListener('click', () => {
      document.getElementById('gw-lobby-confirm').classList.remove('gw-hide');
    });
    document.getElementById('gw-lobby-no').addEventListener('click', () => {
      document.getElementById('gw-lobby-confirm').classList.add('gw-hide');
    });
    document.getElementById('gw-lobby-yes').addEventListener('click', () => {
      document.getElementById('gw-lobby-confirm').classList.add('gw-hide');
      document.dispatchEvent(new CustomEvent('returnToLobby'));
    });
    document.getElementById('gw-endturn').addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('forceEndTurn'));
    });
  }

  // ── Canvas setup & loop ───────────────────────────────────────────
  function startLoop() {
    canvas = document.getElementById('gw-canvas');
    canvas.width  = CANVAS_W;
    canvas.height = CANVAS_H;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    scaleCanvas();
    window.addEventListener('resize', scaleCanvas);
    canvas.addEventListener('click', onCanvasClick);
    let lastT = 0;
    function loop(ts) {
      ts = ts || 0;
      requestAnimationFrame(loop);
      const dt = Math.min((ts - lastT) / 1000, 0.05);
      lastT = ts;
      tick(dt);
      draw();
    }
    requestAnimationFrame(loop);
  }

  function scaleCanvas() {
    const wrap = document.getElementById('gw-board-wrap');
    if (!wrap || !canvas) return;
    const avW = wrap.clientWidth  - 16;
    const avH = wrap.clientHeight - 16;
    const sc  = Math.min(avW / CANVAS_W, avH / CANVAS_H, 1.5);
    canvas.style.width  = Math.floor(CANVAS_W * sc) + 'px';
    canvas.style.height = Math.floor(CANVAS_H * sc) + 'px';
  }

  function canvasToGrid(e) {
    const rect  = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top)  * scaleY;
    const col = Math.floor(px / CELL);
    const row = Math.floor(py / CELL);
    if (col < 0 || col >= GRID || row < 0 || row >= GRID) return null;
    return { col, row };
  }

  function onCanvasClick(e) {
    const tile = canvasToGrid(e);
    if (tile && tileClickCB) tileClickCB(tile.col, tile.row);
  }

  function colRowToXY(col, row) { return { x: col*CELL, y: row*CELL }; }

  function tick(dt) {
    const spd = 10;
    for (const id of Object.keys(anim)) {
      const a = anim[id];
      a.x += (a.tx - a.x) * Math.min(spd*dt, 1);
      a.y += (a.ty - a.y) * Math.min(spd*dt, 1);
    }
    for (let i = healFX.length-1; i >= 0; i--) {
      const p = healFX[i];
      p.x += p.vx; p.y += p.vy; p.vy -= 0.12;
      p.life -= dt * 1.6;
      if (p.life <= 0) healFX.splice(i, 1);
    }
    shakeX *= 0.82; shakeY *= 0.82;
    if (hitFX)   { hitFX.t   -= dt; if (hitFX.t   <= 0) hitFX   = null; }
    if (flashFX) { flashFX.t -= dt; if (flashFX.t <= 0) flashFX = null; }
  }

  // ── Draw ──────────────────────────────────────────────────────────
  function draw() {
    ctx.save();
    ctx.translate(Math.round(shakeX), Math.round(shakeY));

    // Floor
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const x = col*CELL, y = row*CELL;
        if (IMG.tile_floor) {
          ctx.drawImage(IMG.tile_floor, x, y, CELL+1, CELL+1);
        } else {
          ctx.fillStyle = (col+row)%2===0 ? '#8a7a62' : '#7a6a52';
          ctx.fillRect(x, y, CELL+1, CELL+1);
        }
      }
    }

    // Draw planned paths for both heroes (different colors per unit)
    const pathColors = {
      hero:   { line: '#6ab4ff', tile: '#2255aa', last: '#4488ff' },
      archer: { line: '#22ddff', tile: '#115577', last: '#22bbdd' },
    };
    for (const id of ['hero', 'archer']) {
      const path = allPaths[id];
      if (!path || path.length === 0) continue;
      if (!liveChars[id]) continue;
      const pc = pathColors[id];

      // Line
      ctx.save();
      ctx.strokeStyle = pc.line;
      ctx.lineWidth   = id === activePlanId ? 4 : 2.5;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.setLineDash([6, 4]);
      ctx.globalAlpha = id === activePlanId ? 0.9 : 0.5;
      ctx.beginPath();
      const originX = anim[id].x + CELL/2;
      const originY = anim[id].y + CELL/2;
      ctx.moveTo(originX, originY);
      for (const step of path) ctx.lineTo(step.col*CELL + CELL/2, step.row*CELL + CELL/2);
      ctx.stroke();
      ctx.restore();

      // Step markers
      path.forEach((step, idx) => {
        const cx = step.col*CELL + CELL/2;
        const cy = step.row*CELL + CELL/2;
        const isLast = idx === path.length - 1;

        ctx.save();
        ctx.globalAlpha = id === activePlanId ? 0.4 : 0.2;
        ctx.fillStyle   = isLast ? pc.last : pc.tile;
        ctx.fillRect(step.col*CELL, step.row*CELL, CELL, CELL);
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = isLast ? pc.last : pc.line;
        ctx.lineWidth   = isLast ? 2.5 : 1.5;
        ctx.globalAlpha = id === activePlanId ? 0.8 : 0.4;
        ctx.strokeRect(step.col*CELL+1, step.row*CELL+1, CELL-2, CELL-2);
        ctx.restore();

        if (id === activePlanId) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, 10, 0, Math.PI*2);
          ctx.fillStyle   = isLast ? pc.last : '#223344';
          ctx.globalAlpha = 0.88;
          ctx.fill();
          ctx.fillStyle   = '#fff';
          ctx.globalAlpha = 1;
          ctx.font        = 'bold 10px Arial,sans-serif';
          ctx.textAlign   = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(idx+1), cx, cy+1);
          ctx.restore();
        }
      });
    }

    // Obstacles
    for (const [key, type] of Object.entries(blockedMap)) {
      const [col, row] = key.split(',').map(Number);
      const x = col*CELL, y = row*CELL;
      const img = type === 'crate' ? IMG.crate : IMG.bush;
      if (img) {
        const ar = img.naturalWidth / img.naturalHeight;
        const dh = CELL * 0.9;
        const dw = dh * ar;
        ctx.drawImage(img, x + (CELL-dw)/2, y + (CELL-dh)/2 + 2, dw, dh);
      } else {
        ctx.fillStyle = type === 'crate' ? '#8b5e2a' : '#2d7a3a';
        ctx.fillRect(x+8, y+8, CELL-16, CELL-16);
      }
    }

    // Draw all characters (bots first, then heroes on top)
    for (const id of ['bot2','bot1','archer','hero']) {
      if (!liveChars[id]) continue;
      drawChar(id);
    }

    // Heal particles
    for (const p of healFX) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life * 0.9);
      ctx.fillStyle   = '#50ff90';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4*Math.max(p.life, 0.1), 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    // Flash
    if (flashFX && flashFX.t > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(flashFX.t * 2.5, 0.38);
      ctx.fillStyle   = flashFX.color;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawChar(id) {
    const a  = anim[id];
    const hp = charHP[id];
    const isTeamA = (id === 'hero' || id === 'archer');
    const isHit   = hitFX && hitFX.who === id;
    const isActivePlanning = id === activePlanId;
    const cx = a.x + CELL/2;

    // Glow ring if actively planning
    if (isActivePlanning) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, a.y + CELL/2, CELL*0.42, 0, Math.PI*2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 2.5;
      ctx.globalAlpha = 0.6 + Math.sin(Date.now()/300)*0.3;
      ctx.stroke();
      ctx.restore();
    }

    // Try to use sprite — hero sprite for team A, enemy for team B
    const spriteKey = isTeamA ? 'hero_sprite' : 'enemy_sprite';
    const img = IMG[spriteKey];

    if (img) {
      const drawW = CELL * 1.2;
      const drawH = drawW * (img.naturalHeight / img.naturalWidth);
      const dx = cx - drawW/2;
      const dy = a.y + CELL - drawH + CELL*0.12;
      ctx.save();
      // Tint archer slightly different
      if (id === 'archer') ctx.globalAlpha = 0.85;
      if (id === 'bot2')   ctx.globalAlpha = 0.85;
      if (isHit && Math.floor(Date.now()/50) % 2 === 0) ctx.filter = 'brightness(3) saturate(0.1)';
      ctx.drawImage(img, dx, dy, drawW, drawH);
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = TEAM_COLOR[id];
      ctx.beginPath();
      ctx.arc(cx, a.y + CELL/2, CELL*0.32, 0, Math.PI*2);
      ctx.fill();
      // Label inside
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px Arial,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(id.charAt(0).toUpperCase(), cx, a.y + CELL/2);
      ctx.restore();
    }

    // HP bubble
    const bx = cx, by = a.y + 5, br = 12;
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI*2);
    ctx.fillStyle   = TEAM_HP_COLOR[id];
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.fillStyle   = '#fff';
    ctx.font        = `bold ${hp >= 10 ? 8 : 10}px Arial,sans-serif`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(hp), bx, by+1);
    ctx.restore();

    // Small label below
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font      = '7px Arial,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const labelMap = { hero:'Hero', archer:'Arch', bot1:'Bot1', bot2:'Bot2' };
    ctx.fillText(labelMap[id] || id, cx, a.y + CELL - 10);
    ctx.restore();
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── Public: set positions for all chars ───────────────────────────
  function setAllCharPositions(chars) {
    liveChars = { hero: false, archer: false, bot1: false, bot2: false };
    for (const [id, ch] of Object.entries(chars)) {
      charPositions[id] = { col: ch.col, row: ch.row };
      charHP[id] = ch.hp;
      liveChars[id] = true;
      const p = colRowToXY(ch.col, ch.row);
      if (anim[id]) {
        anim[id].x = anim[id].tx = p.x;
        anim[id].y = anim[id].ty = p.y;
      }
    }
    syncStatPositions(chars);
  }

  function syncStatPositions(chars) {
    for (const id of ['hero','archer','bot1','bot2']) {
      const el = document.getElementById('gw-pos-' + id);
      if (!el) continue;
      const ch = chars && chars[id];
      if (ch) el.textContent = '(' + ch.col + ',' + ch.row + ')';
    }
  }

  function updateAllHP(chars) {
    for (const [id, ch] of Object.entries(chars)) {
      charHP[id] = ch.hp;
      const el = document.getElementById('gw-hp-' + id);
      if (el) el.textContent = ch.hp;
    }
    // Mark dead chars
    for (const id of ['hero','archer','bot1','bot2']) {
      liveChars[id] = !!chars[id];
      const av = document.getElementById('gw-av-' + id.replace('bot','bot'));
      const avMap = { hero:'gw-av-hero', archer:'gw-av-archer', bot1:'gw-av-bot1', bot2:'gw-av-bot2' };
      const avEl = document.getElementById(avMap[id]);
      if (avEl) {
        if (!chars[id]) avEl.classList.add('dead');
        else            avEl.classList.remove('dead');
      }
      const statEl = document.getElementById('gw-stat-' + id);
      if (statEl) {
        if (!chars[id]) statEl.style.opacity = '0.35';
        else            statEl.style.opacity = '';
      }
    }
  }

  // ── Public: rebuild ───────────────────────────────────────────────
  function rebuildBoard(blocked) {
    blockedMap = blocked || {};
    allPaths   = { hero: [], archer: [] };
    activePlanId = null;
    healFX  = []; hitFX = null; flashFX = null;
    shakeX  = 0;  shakeY = 0;
    liveChars = { hero: true, archer: true, bot1: true, bot2: true };
  }

  // ── Public: path API ──────────────────────────────────────────────
  function setActivePlanningUnit(id) {
    activePlanId = id;
    // Highlight stat block
    ['hero','archer'].forEach(cid => {
      const el = document.getElementById('gw-stat-' + cid);
      if (el) {
        if (cid === id) el.classList.add('planning-active');
        else            el.classList.remove('planning-active');
      }
      const avMap = { hero:'gw-av-hero', archer:'gw-av-archer' };
      const avEl = document.getElementById(avMap[cid]);
      if (avEl) {
        if (cid === id) avEl.classList.add('active-plan');
        else            avEl.classList.remove('active-plan');
      }
    });
  }

  function showPath(id, path) {
    allPaths[id] = path || [];
  }

  function clearPathUI() {
    allPaths     = { hero: [], archer: [] };
    activePlanId = null;
    ['hero','archer'].forEach(id => {
      const el = document.getElementById('gw-stat-' + id);
      if (el) el.classList.remove('planning-active');
      const avMap = { hero:'gw-av-hero', archer:'gw-av-archer' };
      const avEl = document.getElementById(avMap[id]);
      if (avEl) avEl.classList.remove('active-plan');
    });
  }

  function setTileClickHandler(cb) { tileClickCB = cb; }

  // ── Public: UI setters ────────────────────────────────────────────
  function setTurnInfo(title, sub, meta) {
    const t = document.getElementById('gw-turn-title');
    const s = document.getElementById('gw-turn-sub');
    const m = document.getElementById('gw-turn-meta');
    if (t) t.textContent = title;
    if (s) s.textContent = sub || '';
    if (m) m.textContent = meta || '';
  }

  function setRollEnabled(on) {
    const btn = document.getElementById('roll-btn');
    if (btn) btn.disabled = !on;
    const real = document.getElementById('gw-roll-btn');
    if (real) real.disabled = !on;
  }

  function setConfirmEnabled(on) {
    const btn = document.getElementById('confirm-move-btn');
    if (btn) { btn.disabled = !on; btn.style.display = on ? '' : 'none'; }
    const real = document.getElementById('gw-confirm-btn');
    if (real) { real.disabled = !on; real.style.display = on ? '' : 'none'; }
  }

  function showActionModal(attackerLabel, targetLabel) {
    const modal = document.getElementById('gw-action-modal');
    const title = document.getElementById('gw-action-title');
    const sub   = document.getElementById('gw-action-sub');
    if (title) title.textContent = '⚔️ ' + attackerLabel + ' is adjacent!';
    if (sub)   sub.textContent   = attackerLabel + ' can act against ' + targetLabel + ':';
    if (modal) modal.classList.remove('gw-hide');
  }

  function hideActionModal() {
    const modal = document.getElementById('gw-action-modal');
    if (modal) modal.classList.add('gw-hide');
  }

  function showResultOverlay(playerWon) {
    const overlay = document.getElementById('gw-result-overlay');
    const title   = document.getElementById('gw-res-title');
    const sub     = document.getElementById('gw-res-sub');
    if (playerWon) {
      if (title) { title.textContent = '⚔️ VICTORY!'; title.style.color = '#ffe08a'; }
      if (sub)   sub.textContent = 'All enemies have been vanquished!';
    } else {
      if (title) { title.textContent = '💀 DEFEAT'; title.style.color = '#ff6666'; }
      if (sub)   sub.textContent = 'Your team has fallen...';
    }
    if (overlay) overlay.classList.remove('gw-hide');
  }

  function hideResultOverlay() {
    const overlay = document.getElementById('gw-result-overlay');
    if (overlay) overlay.classList.add('gw-hide');
  }

  // ── Public: animate move ──────────────────────────────────────────
  async function animateCharMoveTo(id, fc, fr, tc, tr) {
    const a = anim[id];
    if (!a) return sleep(330);
    const p = colRowToXY(tc, tr);
    a.tx = p.x; a.ty = p.y;
    charPositions[id] = { col: tc, row: tr };
    const posEl = document.getElementById('gw-pos-' + id);
    if (posEl) posEl.textContent = '(' + tc + ',' + tr + ')';
    return sleep(330);
  }

  // Legacy compat
  async function animatePlayerMoveTo(fc, fr, tc, tr) { return animateCharMoveTo('hero', fc, fr, tc, tr); }
  async function animateBotMoveTo(fc, fr, tc, tr)    { return animateCharMoveTo('bot1', fc, fr, tc, tr); }

  // ── Public: attack ────────────────────────────────────────────────
  async function animateAttack(attackerId, targetId) {
    const att = anim[attackerId];
    const def = anim[targetId];
    if (!att || !def) return sleep(400);
    const ox = att.tx, oy = att.ty;
    att.tx = ox + (def.tx-ox)*0.38;
    att.ty = oy + (def.ty-oy)*0.38;
    await sleep(140);
    flashFX = { color: '#e00', t: 0.22 };
    shakeX  = 7; shakeY = 5;
    hitFX   = { who: targetId, t: 0.5 };
    def.tx = def.tx + (def.tx-ox)*0.08;
    def.ty = def.ty + (def.ty-oy)*0.08;
    await sleep(80);
    att.tx = ox; att.ty = oy;
    await sleep(170);
  }

  // ── Public: heal ─────────────────────────────────────────────────
  async function animateHeal(id) {
    const a = anim[id];
    if (!a) return sleep(420);
    flashFX = { color: '#0e0', t: 0.22 };
    const cx = a.tx + CELL/2, cy = a.ty + CELL/2;
    for (let i = 0; i < 14; i++) {
      healFX.push({ x:cx, y:cy, vx:(Math.random()-.5)*3, vy:-(1.5+Math.random()*2), life:1 });
    }
    await sleep(420);
  }

  // ── Public: dice roll animation ───────────────────────────────────
  async function animateDiceRoll(result, team) {
    const numEl   = document.getElementById('gw-result-num');
    const titleEl = document.getElementById('gw-turn-title');
    const metaEl  = document.getElementById('gw-turn-meta');
    const dur     = 900;
    const start   = performance.now();
    const teamLabel = team === 'teamB' ? 'Enemy' : 'Player';
    await new Promise(resolve => {
      function tick(ts) {
        const p = Math.min((ts-start)/dur, 1);
        if (numEl)   numEl.textContent   = p < 1 ? Math.ceil(Math.random()*6) : result;
        if (titleEl) titleEl.textContent = p < 1 ? 'Rolling…' : teamLabel + ' Rolled ' + result;
        p < 1 ? requestAnimationFrame(tick) : resolve();
      }
      requestAnimationFrame(tick);
    });
    if (metaEl) metaEl.textContent = 'Dice: ' + result + (team === 'teamA' ? ' (shared by both heroes)' : ' (enemy shared)');
    await sleep(200);
  }

  // ── Public: death ─────────────────────────────────────────────────
  async function animateDeath(id) {
    liveChars[id] = false;
    flashFX = { color: '#f00', t: 1.0 };
    // Dim the avatar
    const avMap = { hero:'gw-av-hero', archer:'gw-av-archer', bot1:'gw-av-bot1', bot2:'gw-av-bot2' };
    const avEl = document.getElementById(avMap[id]);
    if (avEl) avEl.classList.add('dead');
    await sleep(700);
  }

  // Legacy compat (kept so old wiring doesn't break)
  function setPlayerPos(col, row) { animateCharMoveTo('hero', col, row, col, row); }
  function setBotPos(col, row)    { animateCharMoveTo('bot1', col, row, col, row); }
  function updateHP(pHP, pMax, bHP, bMax) {
    charHP.hero = pHP; charHP.bot1 = bHP;
    const h1 = document.getElementById('gw-hp-hero');
    const h2 = document.getElementById('gw-hp-bot1');
    if (h1) h1.textContent = pHP;
    if (h2) h2.textContent = bHP;
  }
  function triggerFlash(type) { flashFX = { color: type==='red'?'#e00':'#0e0', t:0.22 }; }
  function cameraShake()      { shakeX = 7; shakeY = 5; }

  // Legacy path shims
  function showReachable(tiles) {}
  function showPathLegacy(path) { allPaths.hero = path || []; }

  return {
    _initialized: false,
    init: async (blocked) => { await init(blocked); ThreeScene._initialized = true; },
    rebuildBoard,
    // 2v2 API
    setAllCharPositions,
    updateAllHP,
    animateCharMoveTo,
    setActivePlanningUnit,
    showPath,
    clearPathUI,
    setTileClickHandler,
    setTurnInfo,
    setRollEnabled,
    setConfirmEnabled,
    showActionModal,
    hideActionModal,
    showResultOverlay,
    hideResultOverlay,
    animateAttack,
    animateHeal,
    animateDiceRoll,
    animateDeath,
    // Legacy compat
    setPlayerPos, setBotPos,
    animatePlayerMoveTo, animateBotMoveTo,
    updateHP, triggerFlash, cameraShake,
    showReachable, showPath,
  };
})();
