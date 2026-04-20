(function () {
  'use strict';

  const GRID       = 10;
  const MAX_HP     = 10;
  const ATTACK_DMG = 2;
  const HEAL_AMT   = 2;
  const MAX_LOG    = 8;
  const DIRS       = [[0,-1],[0,1],[-1,0],[1,0]];
  const NUM_CRATES = 8;
  const NUM_BUSHES = 8;

  let state;

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function genMap() {
    const interior = [];
    for (let r = 1; r < GRID - 1; r++)
      for (let c = 1; c < GRID - 1; c++)
        interior.push([c, r]);
    shuffle(interior);

    const blocked = {};
    let cratesLeft = NUM_CRATES, bushesLeft = NUM_BUSHES;
    for (const [c, r] of interior) {
      if (cratesLeft === 0 && bushesLeft === 0) break;
      const key = `${c},${r}`;
      if (cratesLeft > 0) { blocked[key] = 'crate'; cratesLeft--; }
      else                { blocked[key] = 'bush';  bushesLeft--; }
    }

    const free = [];
    for (let r = 0; r < GRID; r++)
      for (let c = 0; c < GRID; c++)
        if (!blocked[`${c},${r}`]) free.push([c, r]);
    shuffle(free);

    const starts = [];
    for (let i = 0; i < free.length && starts.length < 4; i++) {
      const [fc, fr] = free[i];
      const ok = starts.every(([sc, sr]) => Math.abs(fc-sc)+Math.abs(fr-sr) >= 3);
      if (ok) starts.push([fc, fr]);
    }
    while (starts.length < 4) starts.push(free[starts.length] || [0,0]);
    starts.sort((a, b) => b[1] - a[1]);

    return {
      blocked,
      heroStart:   { col: starts[0][0], row: starts[0][1] },
      archerStart: { col: starts[1][0], row: starts[1][1] },
      bot1Start:   { col: starts[2][0], row: starts[2][1] },
      bot2Start:   { col: starts[3][0], row: starts[3][1] },
    };
  }

  function initGame() {
    const { blocked, heroStart, archerStart, bot1Start, bot2Start } = genMap();

    state = {
      chars: {
        hero:   { col: heroStart.col,   row: heroStart.row,   hp: MAX_HP, team: 'A', label: 'Hero'   },
        archer: { col: archerStart.col, row: archerStart.row, hp: MAX_HP, team: 'A', label: 'Archer' },
        bot1:   { col: bot1Start.col,   row: bot1Start.row,   hp: MAX_HP, team: 'B', label: 'Bot-1'  },
        bot2:   { col: bot2Start.col,   row: bot2Start.row,   hp: MAX_HP, team: 'B', label: 'Bot-2'  },
      },
      blocked,
      teamTurn: 'teamA',
      planningUnit: 'hero',
      phase: 'roll',
      diceVal: 0,
      paths: { hero: [], archer: [] },
      confirmedUnits: { hero: false, archer: false },
      currentAction: null,
      busy: false,
      roundNum: 1,
    };

    ThreeScene.rebuildBoard(blocked);
    ThreeScene.setAllCharPositions(state.chars);
    ThreeScene.updateAllHP(state.chars);
    ThreeScene.clearPathUI();
    setUIForRoll();
    hideModals();
    clearLog();
    log('⚔️ 2v2 Battle begins!', 'dice');
    log('Roll — both heroes share the dice result', '');
  }

  function setUIForRoll() {
    ThreeScene.setTurnInfo('YOUR TURN', 'Roll the dice — both heroes share the result.', 'Round ' + state.roundNum);
    ThreeScene.setRollEnabled(true);
    ThreeScene.setConfirmEnabled(false);
  }

  function hideModals() {
    ThreeScene.hideActionModal();
    ThreeScene.hideResultOverlay();
  }

  function log(msg, type) {
    type = type || '';
    const el  = document.getElementById('log-entries');
    const div = document.createElement('div');
    div.className   = 'log-entry' + (type ? ' '+type : '');
    div.textContent = msg;
    el.appendChild(div);
    while (el.children.length > MAX_LOG) el.removeChild(el.firstChild);
  }

  function clearLog() { document.getElementById('log-entries').innerHTML = ''; }
  function sleep(ms)  { return new Promise(function(r) { setTimeout(r, ms); }); }
  function rollDice() { return Math.floor(Math.random()*6)+1; }

  function isWalkable(col, row, id) {
    if (col < 0 || col >= GRID || row < 0 || row >= GRID) return false;
    if (state.blocked[col+','+row]) return false;
    var myTeam = state.chars[id].team;
    for (var cid in state.chars) {
      if (cid === id) continue;
      var ch = state.chars[cid];
      if (ch.team !== myTeam && ch.col === col && ch.row === row) return false;
    }
    return true;
  }

  function isAdjacent(a, b) {
    return Math.abs(a.col-b.col)+Math.abs(a.row-b.row) === 1;
  }

  function adjacentEnemy(id) {
    var ch = state.chars[id];
    if (!ch) return null;
    var myTeam = ch.team;
    for (var eid in state.chars) {
      var en = state.chars[eid];
      if (en.team === myTeam) continue;
      if (isAdjacent(ch, en)) return eid;
    }
    return null;
  }

  async function onRollClick() {
    if (state.busy || state.phase !== 'roll' || state.teamTurn !== 'teamA') return;
    state.busy = true;
    ThreeScene.setRollEnabled(false);

    var val = rollDice();
    state.diceVal = val;
    state.paths = { hero: [], archer: [] };
    state.confirmedUnits = { hero: false, archer: false };
    state.planningUnit = 'hero';

    log('🎲 Rolled a ' + val + ' — both heroes get ' + val + ' steps', 'dice');
    await ThreeScene.animateDiceRoll(val, 'teamA');

    state.phase = 'pathPlanning';
    state.busy  = false;
    beginPlanningFor('hero');
  }

  function beginPlanningFor(id) {
    state.planningUnit = id;
    var val   = state.diceVal;
    var path  = state.paths[id];
    var label = state.chars[id].label;
    ThreeScene.setActivePlanningUnit(id);
    ThreeScene.showPath(id, path);
    ThreeScene.setConfirmEnabled(false);
    var stepsLeft = val - path.length;
    ThreeScene.setTurnInfo(
      label.toUpperCase() + ' PATH',
      stepsLeft + ' step' + (stepsLeft!==1?'s':'') + ' remaining — click tiles to plan route.',
      'Dice: ' + val + '  |  Step ' + path.length + '/' + val
    );
  }

  function onTileClick(col, row) {
    if (state.phase !== 'pathPlanning' || state.busy) return;
    var id = state.planningUnit;
    if (!id) return;

    var path      = state.paths[id];
    var stepsUsed = path.length;
    var stepsLeft = state.diceVal - stepsUsed;
    var ch        = state.chars[id];
    var tip       = stepsUsed > 0 ? path[stepsUsed-1] : { col: ch.col, row: ch.row };

    if (stepsUsed > 0 && tip.col === col && tip.row === row) {
      path.pop();
      refreshPathUI(id);
      return;
    }
    if (Math.abs(col-tip.col)+Math.abs(row-tip.row) !== 1) return;
    if (stepsLeft <= 0) return;
    if (!isWalkable(col, row, id)) return;

    path.push({ col: col, row: row });
    refreshPathUI(id);
  }

  function refreshPathUI(id) {
    var path      = state.paths[id];
    var stepsUsed = path.length;
    var stepsLeft = state.diceVal - stepsUsed;
    var allUsed   = stepsUsed === state.diceVal;
    var label     = state.chars[id].label;

    ThreeScene.showPath(id, path);
    ThreeScene.setConfirmEnabled(allUsed);

    var tip = stepsUsed > 0 ? path[stepsUsed-1] : null;
    var adjEnemy = false;
    if (tip) {
      for (var eid in state.chars) {
        var en = state.chars[eid];
        if (en.team === state.chars[id].team) continue;
        if (isAdjacent(tip, en)) { adjEnemy = true; break; }
      }
    }

    if (allUsed && adjEnemy) {
      ThreeScene.setTurnInfo(label.toUpperCase() + ' PATH', 'Adjacent to enemy! Confirm path ✔', 'Dice: ' + state.diceVal);
    } else if (allUsed) {
      ThreeScene.setTurnInfo(label.toUpperCase() + ' PATH', 'All steps used — Confirm path ✔', 'Dice: ' + state.diceVal);
    } else {
      ThreeScene.setTurnInfo(label.toUpperCase() + ' PATH', stepsLeft + ' step' + (stepsLeft!==1?'s':'') + ' remaining', 'Step ' + stepsUsed + '/' + state.diceVal);
    }
  }

  async function onConfirmPath() {
    if (state.phase !== 'pathPlanning' || state.busy) return;
    var id = state.planningUnit;
    if (!id || state.paths[id].length !== state.diceVal) return;

    state.confirmedUnits[id] = true;
    ThreeScene.setConfirmEnabled(false);
    log('✔ ' + state.chars[id].label + ' path locked', 'move');

    if (id === 'hero') {
      // Check if archer still exists
      if (state.chars.archer) {
        beginPlanningFor('archer');
      } else {
        await executeTeamAMoves();
      }
    } else {
      await executeTeamAMoves();
    }
  }

  async function executeTeamAMoves() {
    state.phase = 'moving';
    state.busy  = true;
    ThreeScene.clearPathUI();
    ThreeScene.setTurnInfo('MOVING…', 'Heroes advance!', '');

    for (var i = 0; i < ['hero','archer'].length; i++) {
      var id = ['hero','archer'][i];
      if (!state.chars[id]) continue;
      var path = state.paths[id];
      var ch   = state.chars[id];
      if (!path) continue;
      for (var j = 0; j < path.length; j++) {
        var step = path[j];
        if (!state.chars[id]) break;
        var blocked = false;
        for (var eid in state.chars) {
          var en = state.chars[eid];
          if (en.team === ch.team) continue;
          if (en.col === step.col && en.row === step.row) { blocked = true; break; }
        }
        if (blocked) break;
        var prev = { col: ch.col, row: ch.row };
        ch.col = step.col; ch.row = step.row;
        await ThreeScene.animateCharMoveTo(id, prev.col, prev.row, step.col, step.row);
      }
      if (state.chars[id]) log(state.chars[id].label + ' → (' + state.chars[id].col + ',' + state.chars[id].row + ')', 'move');
    }

    ThreeScene.updateAllHP(state.chars);
    state.busy = false;
    await checkAndDoPlayerActions();
  }

  var actionQueue = [];

  async function checkAndDoPlayerActions() {
    actionQueue = [];
    var ids = ['hero','archer'];
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (!state.chars[id]) continue;
      var eid = adjacentEnemy(id);
      if (eid) actionQueue.push({ attackerId: id, targetId: eid });
    }
    await processNextAction();
  }

  async function processNextAction() {
    if (actionQueue.length === 0) {
      endTeamATurn();
      return;
    }
    var pair = actionQueue[0];
    if (!state.chars[pair.attackerId] || !state.chars[pair.targetId]) {
      actionQueue.shift();
      await processNextAction();
      return;
    }
    state.phase = 'action';
    state.currentAction = pair;
    var aLabel = state.chars[pair.attackerId].label;
    var tLabel = state.chars[pair.targetId].label;
    ThreeScene.setTurnInfo('CHOOSE ACTION', aLabel + ' is adjacent to ' + tLabel + '!', '');
    ThreeScene.showActionModal(aLabel, tLabel);
  }

  async function onAttack() {
    if (state.busy || state.phase !== 'action') return;
    state.busy = true;
    ThreeScene.hideActionModal();

    var attackerId = state.currentAction.attackerId;
    var targetId   = state.currentAction.targetId;
    var attacker   = state.chars[attackerId];
    var target     = state.chars[targetId];
    if (!attacker || !target) { state.busy = false; actionQueue.shift(); await processNextAction(); return; }

    log('⚔️ ' + attacker.label + ' attacks ' + target.label + ' for ' + ATTACK_DMG + '!', 'attack');
    await ThreeScene.animateAttack(attackerId, targetId);
    target.hp = Math.max(0, target.hp - ATTACK_DMG);
    ThreeScene.updateAllHP(state.chars);

    if (target.hp <= 0) {
      log('💀 ' + target.label + ' defeated!', 'attack');
      await ThreeScene.animateDeath(targetId);
      delete state.chars[targetId];
      actionQueue = actionQueue.filter(function(a) { return a.targetId !== targetId && a.attackerId !== targetId; });
      var surviving = Object.values(state.chars).filter(function(c) { return c.team === 'B'; });
      if (surviving.length === 0) {
        state.phase = 'over'; state.busy = false;
        ThreeScene.showResultOverlay(true);
        return;
      }
    }

    actionQueue.shift();
    state.busy = false;
    await processNextAction();
  }

  async function onHeal() {
    if (state.busy || state.phase !== 'action') return;
    state.busy = true;
    ThreeScene.hideActionModal();

    var id = state.currentAction.attackerId;
    var ch = state.chars[id];
    if (!ch) { state.busy = false; actionQueue.shift(); await processNextAction(); return; }
    var healed = Math.min(HEAL_AMT, MAX_HP - ch.hp);
    ch.hp = Math.min(MAX_HP, ch.hp + HEAL_AMT);
    log('💚 ' + ch.label + ' heals ' + healed + ' HP!', 'heal');
    await ThreeScene.animateHeal(id);
    ThreeScene.updateAllHP(state.chars);

    actionQueue.shift();
    state.busy = false;
    await processNextAction();
  }

  function onSkip() {
    if (state.busy || state.phase !== 'action') return;
    ThreeScene.hideActionModal();
    var id = state.currentAction.attackerId;
    if (state.chars[id]) log('⏭ ' + state.chars[id].label + ' skips action', '');
    actionQueue.shift();
    processNextAction();
  }

  function endTeamATurn() {
    state.teamTurn = 'teamB';
    state.phase    = 'botTurn';
    ThreeScene.setTurnInfo('ENEMY TURN…', 'Enemies are planning…', '');
    ThreeScene.setRollEnabled(false);
    setTimeout(doBotTurn, 700);
  }

  function botShortestPath(botId) {
    var bot = state.chars[botId];
    if (!bot) return null;
    var targets = Object.values(state.chars).filter(function(c) { return c.team === 'A'; });
    if (targets.length === 0) return null;

    for (var ti = 0; ti < targets.length; ti++) {
      if (isAdjacent(bot, targets[ti])) return [];
    }

    var adjTargets = {};
    for (var ti2 = 0; ti2 < targets.length; ti2++) {
      var t = targets[ti2];
      for (var di = 0; di < DIRS.length; di++) {
        var nc = t.col+DIRS[di][0], nr = t.row+DIRS[di][1];
        if (nc<0||nc>=GRID||nr<0||nr>=GRID) continue;
        if (state.blocked[nc+','+nr]) continue;
        var occ = false;
        for (var cid in state.chars) {
          if (cid===botId) continue;
          var ch2 = state.chars[cid];
          if (ch2.col===nc && ch2.row===nr) { occ=true; break; }
        }
        if (!occ) adjTargets[nc+','+nr] = true;
      }
    }

    var visited = {}; visited[bot.col+','+bot.row] = true;
    var queue = [{ col: bot.col, row: bot.row, path: [] }];
    while (queue.length) {
      var cur = queue.shift();
      for (var di2 = 0; di2 < DIRS.length; di2++) {
        var nc2 = cur.col+DIRS[di2][0], nr2 = cur.row+DIRS[di2][1];
        var key2 = nc2+','+nr2;
        if (visited[key2]) continue;
        if (nc2<0||nc2>=GRID||nr2<0||nr2>=GRID) continue;
        if (state.blocked[key2]) continue;
        var occ2 = false;
        for (var cid2 in state.chars) {
          if (cid2===botId) continue;
          var ch3 = state.chars[cid2];
          if (ch3.team==='B' && ch3.col===nc2 && ch3.row===nr2) { occ2=true; break; }
        }
        if (occ2) continue;
        visited[key2] = true;
        var newPath = cur.path.concat([{ col: nc2, row: nr2 }]);
        if (adjTargets[key2]) return newPath;
        queue.push({ col: nc2, row: nr2, path: newPath });
      }
    }
    return null;
  }

  function botBuildFullPath(botId, totalSteps) {
    var bfsPath = botShortestPath(botId);
    if (bfsPath === null) return null;
    var bot = state.chars[botId];
    var startTip = { col: bot.col, row: bot.row };
    if (bfsPath.length === 0) return burnSteps(botId, [], startTip, totalSteps);
    if (bfsPath.length >= totalSteps) return bfsPath.slice(0, totalSteps);
    var remainder = totalSteps - bfsPath.length;
    var tipAfterBFS = bfsPath[bfsPath.length-1];
    return burnSteps(botId, bfsPath, tipAfterBFS, remainder);
  }

  function burnSteps(botId, basePath, tip, stepsToAdd) {
    if (stepsToAdd === 0) return basePath;
    var bounceTarget = null;
    for (var di = 0; di < DIRS.length; di++) {
      var nc = tip.col+DIRS[di][0], nr = tip.row+DIRS[di][1];
      if (nc<0||nc>=GRID||nr<0||nr>=GRID) continue;
      if (state.blocked[nc+','+nr]) continue;
      var occ = false;
      for (var cid in state.chars) {
        if (cid===botId) continue;
        var ch = state.chars[cid];
        if (ch.team==='B' && ch.col===nc && ch.row===nr) { occ=true; break; }
      }
      if (!occ) { bounceTarget={ col:nc, row:nr }; break; }
    }
    var path = basePath.slice();
    if (!bounceTarget) {
      for (var i=0;i<stepsToAdd;i++) path.push({ col:tip.col, row:tip.row });
      return path;
    }
    var onBounce = false;
    for (var j=0;j<stepsToAdd;j++) {
      path.push(onBounce ? { col:tip.col, row:tip.row } : { col:bounceTarget.col, row:bounceTarget.row });
      onBounce = !onBounce;
    }
    return path;
  }

  async function doBotTurn() {
    if (state.phase === 'over') return;
    state.busy = true;

    var val = rollDice();
    log('🎲 Enemies rolled ' + val + ' — both get ' + val + ' steps', 'dice');
    await ThreeScene.animateDiceRoll(val, 'teamB');
    await sleep(300);

    var botIds = Object.keys(state.chars).filter(function(id) { return state.chars[id] && state.chars[id].team === 'B'; });
    for (var bi = 0; bi < botIds.length; bi++) {
      var botId = botIds[bi];
      if (!state.chars[botId]) continue;
      var bot = state.chars[botId];
      var fullPath = botBuildFullPath(botId, val);
      if (!fullPath) { log(bot.label + ' is blocked!', ''); continue; }
      ThreeScene.setTurnInfo(bot.label.toUpperCase() + ' MOVES', val + ' steps', '');
      for (var pi = 0; pi < fullPath.length; pi++) {
        var next = fullPath[pi];
        if (!state.chars[botId]) break;
        var stopBefore = false;
        for (var cid in state.chars) {
          var ch4 = state.chars[cid];
          if (ch4.team==='A' && ch4.col===next.col && ch4.row===next.row) { stopBefore=true; break; }
        }
        if (stopBefore) break;
        var cur2 = state.chars[botId];
        var prev2 = { col: cur2.col, row: cur2.row };
        cur2.col = next.col; cur2.row = next.row;
        await ThreeScene.animateCharMoveTo(botId, prev2.col, prev2.row, next.col, next.row);
      }
      if (state.chars[botId]) log(state.chars[botId].label + ' → (' + state.chars[botId].col + ',' + state.chars[botId].row + ')', 'move');
    }

    // Bot attack phase
    for (var bi2 = 0; bi2 < botIds.length; bi2++) {
      var botId2 = botIds[bi2];
      if (!state.chars[botId2]) continue;
      var bot2 = state.chars[botId2];
      for (var tid in state.chars) {
        if (!state.chars[botId2]) break;
        var target2 = state.chars[tid];
        if (target2.team !== 'A') continue;
        if (!isAdjacent(bot2, target2)) continue;
        await sleep(250);
        if (botShouldHeal(bot2)) {
          var healed2 = Math.min(HEAL_AMT, MAX_HP - bot2.hp);
          bot2.hp = Math.min(MAX_HP, bot2.hp + HEAL_AMT);
          log('💚 ' + bot2.label + ' heals ' + healed2 + ' HP!', 'heal');
          await ThreeScene.animateHeal(botId2);
        } else {
          log('💀 ' + bot2.label + ' attacks ' + target2.label + ' for ' + ATTACK_DMG + '!', 'attack');
          await ThreeScene.animateAttack(botId2, tid);
          target2.hp = Math.max(0, target2.hp - ATTACK_DMG);
          ThreeScene.updateAllHP(state.chars);
          if (target2.hp <= 0) {
            log('💀 ' + target2.label + ' is slain!', 'attack');
            await ThreeScene.animateDeath(tid);
            delete state.chars[tid];
            var surviving2 = Object.values(state.chars).filter(function(c) { return c.team === 'A'; });
            if (surviving2.length === 0) {
              state.phase = 'over'; state.busy = false;
              ThreeScene.showResultOverlay(false);
              return;
            }
          }
        }
        break;
      }
    }

    ThreeScene.updateAllHP(state.chars);
    state.busy = false;
    endBotTurn();
  }

  function botShouldHeal(bot) { return bot.hp <= HEAL_AMT + 2; }

  function endBotTurn() {
    state.teamTurn = 'teamA';
    state.phase    = 'roll';
    state.roundNum++;
    setUIForRoll();
    log('── Round ' + state.roundNum + ' ──', 'dice');
  }

  function wireButtons() {
    document.getElementById('roll-btn').addEventListener('click', onRollClick);
    document.getElementById('confirm-move-btn').addEventListener('click', onConfirmPath);
    document.getElementById('btn-attack').addEventListener('click', onAttack);
    document.getElementById('btn-heal').addEventListener('click', onHeal);
    document.getElementById('btn-skip').addEventListener('click', onSkip);
    document.getElementById('restart-btn').addEventListener('click', function() {
      document.getElementById('result-overlay').classList.add('hidden');
      initGame();
    });
    ThreeScene.setTileClickHandler(onTileClick);
  }

  function wireLobby() {
    document.getElementById('btn-play-bot').addEventListener('click', async function() {
      document.getElementById('lobby').style.display = 'none';
      if (!ThreeScene._initialized) {
        await ThreeScene.init({});
        wireButtons();
      }
      initGame();
    });
    document.addEventListener('returnToLobby', function() {
      if (state) { state.phase = 'over'; state.busy = false; }
      document.getElementById('lobby').style.display = '';
    });
    document.addEventListener('forceEndTurn', function() {
      if (!state || state.teamTurn !== 'teamA' || state.phase === 'over' || state.busy) return;
      ThreeScene.hideActionModal();
      endTeamATurn();
    });
    document.getElementById('btn-create').addEventListener('click', function() {});
    document.getElementById('btn-join').addEventListener('click', function() {});
  }

  function bootstrap() { wireLobby(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
