const SIZE = 8;
const WIN_ROUNDS = 2;
const BOT_PLAYER = 2;
const BOT_THINK_DELAY = 500;
const blockedTiles = [];

const state = {
  players: {
    1: { row: 0, col: 0, score: 0 },
    2: { row: SIZE - 1, col: SIZE - 1, score: 0 }
  },
  currentPlayer: 1,
  phase: 'roll', // roll | move | roundOver | matchOver
  dice: null,
  movesRemaining: 0,
  round: 1,
  winner: null,
  validMoves: [],
  selectedTile: null,
  log: [],
  lastMove: null,
  winnerAnimPlayer: null,
  blockedAnimPlayer: null,
  attackFlashTile: null
};

const boardEl = document.getElementById('board');
const rollBtn = document.getElementById('rollBtn');
const endTurnBtn = document.getElementById('endTurnBtn');
const newRoundBtn = document.getElementById('newRoundBtn');
const resetMatchBtn = document.getElementById('resetMatchBtn');

const turnText = document.getElementById('turnText');
const phaseText = document.getElementById('phaseText');
const diceText = document.getElementById('diceText');
const roundText = document.getElementById('roundText');
const p1Score = document.getElementById('p1Score');
const p2Score = document.getElementById('p2Score');
const p1Pos = document.getElementById('p1Pos');
const p2Pos = document.getElementById('p2Pos');
const logEl = document.getElementById('log');

const winnerPopup = document.getElementById('winnerPopup');
const winnerPopupText = document.getElementById('winnerPopupText');
const nextRoundPopupBtn = document.getElementById('nextRoundPopupBtn');

const menuToggle = document.getElementById('menuToggle');
const closeDrawer = document.getElementById('closeDrawer');
const sideDrawer = document.getElementById('sideDrawer');
const drawerOverlay = document.getElementById('drawerOverlay');

function showWinnerPopup(player) {
  winnerPopupText.textContent = `${player === BOT_PLAYER ? 'Bot' : `Player ${player}`} Wins!`;
  winnerPopup.classList.add('show');
}

function hideWinnerPopup() {
  winnerPopup.classList.remove('show');
}

function addLog(message) {
  state.log.unshift(message);
  state.log = state.log.slice(0, 16);
  renderLog();
}

function renderLog() {
  logEl.innerHTML = state.log
    .map(entry => `<div class="log-entry">${entry}</div>`)
    .join('');
}

function getOpponent(player) {
  return player === 1 ? 2 : 1;
}

function isBotTurn() {
  return state.currentPlayer === BOT_PLAYER &&
    state.phase !== 'roundOver' &&
    state.phase !== 'matchOver';
}

function getPlayerLabel(player) {
  return player === BOT_PLAYER ? 'Bot' : `Player ${player}`;
}

function samePos(a, b) {
  return a.row === b.row && a.col === b.col;
}

function inBounds(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

function manhattan(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function isWallTile(row, col) {
  return blockedTiles.some(b => b.row === row && b.col === col);
}

function getReachableTiles(player) {
  const start = state.players[player];
  const opponent = state.players[getOpponent(player)];
  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 }
  ];

  const reachable = [];

  for (const dir of dirs) {
    const nr = start.row + dir.dr;
    const nc = start.col + dir.dc;

    if (!inBounds(nr, nc)) continue;
    if (nr === opponent.row && nc === opponent.col) continue;
    if (isWallTile(nr, nc)) continue;

    reachable.push({ row: nr, col: nc });
  }

  return reachable;
}

function hasAdjacentEscape(player) {
  const me = state.players[player];
  const opponent = state.players[getOpponent(player)];
  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 }
  ];

  for (const dir of dirs) {
    const nr = me.row + dir.dr;
    const nc = me.col + dir.dc;

    if (!inBounds(nr, nc)) continue;
    if (nr === opponent.row && nc === opponent.col) continue;
    if (isWallTile(nr, nc)) continue;

    return true;
  }

  return false;
}

function isDirectlyFacing(player) {
  const me = state.players[player];
  const opponent = state.players[getOpponent(player)];
  return Math.abs(me.row - opponent.row) + Math.abs(me.col - opponent.col) === 1;
}

function hasPathBetween(start, target) {
  const queue = [{ row: start.row, col: start.col }];
  const visited = new Set([`${start.row},${start.col}`]);
  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 }
  ];

  while (queue.length) {
    const current = queue.shift();
    if (current.row === target.row && current.col === target.col) {
      return true;
    }

    for (const dir of dirs) {
      const nr = current.row + dir.dr;
      const nc = current.col + dir.dc;
      const key = `${nr},${nc}`;

      if (!inBounds(nr, nc)) continue;
      if (visited.has(key)) continue;
      if (isWallTile(nr, nc)) continue;

      visited.add(key);
      queue.push({ row: nr, col: nc });
    }
  }

  return false;
}

function generateRandomBlockedTiles(count = 18) {
  const start1 = { row: 0, col: 0 };
  const start2 = { row: SIZE - 1, col: SIZE - 1 };
  const forbidden = new Set([
    `0,0`,
    `${SIZE - 1},${SIZE - 1}`
  ]);

  let success = false;

  for (let attempts = 0; attempts < 500; attempts++) {
    blockedTiles.length = 0;

    while (blockedTiles.length < count) {
      let row, col;

      const shouldCluster =
        blockedTiles.length > 0 &&
        Math.random() < 0.25;

      if (shouldCluster) {
        const base = blockedTiles[Math.floor(Math.random() * blockedTiles.length)];
        row = base.row + Math.floor(Math.random() * 3) - 1;
        col = base.col + Math.floor(Math.random() * 3) - 1;
      } else {
        row = Math.floor(Math.random() * SIZE);
        col = Math.floor(Math.random() * SIZE);
      }

      const key = `${row},${col}`;

      if (!inBounds(row, col)) continue;
      if (forbidden.has(key)) continue;
      if (blockedTiles.some(t => t.row === row && t.col === col)) continue;

      blockedTiles.push({ row, col });
    }

    if (hasPathBetween(start1, start2)) {
      success = true;
      break;
    }
  }

  if (!success) {
    blockedTiles.length = 0;

    while (blockedTiles.length < count) {
      const row = Math.floor(Math.random() * SIZE);
      const col = Math.floor(Math.random() * SIZE);
      const key = `${row},${col}`;

      if (forbidden.has(key)) continue;
      if (blockedTiles.some(t => t.row === row && t.col === col)) continue;

      blockedTiles.push({ row, col });
    }
  }
}

function coordLabel(pos) {
  return `(${pos.row + 1},${pos.col + 1})`;
}

function countEscapesFromPositions(me, opponent) {
  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 }
  ];

  let count = 0;

  for (const dir of dirs) {
    const nr = me.row + dir.dr;
    const nc = me.col + dir.dc;

    if (!inBounds(nr, nc)) continue;
    if (nr === opponent.row && nc === opponent.col) continue;
    if (isWallTile(nr, nc)) continue;

    count += 1;
  }

  return count;
}

function evaluateBotMove(move) {
  const botPos = { row: move.row, col: move.col };
  const playerPos = state.players[1];

  const distance = manhattan(botPos, playerPos);
  const playerEscapes = countEscapesFromPositions(playerPos, botPos);
  const botEscapes = countEscapesFromPositions(botPos, playerPos);

  let score = 0;

  if (state.movesRemaining === 1 && distance === 1) {
    score += 5000;
  }

  if (state.movesRemaining > 1 && distance === 1) {
    score -= 1500;
  }

  score += (4 - playerEscapes) * 120;
  score += botEscapes * 40;

  if (botEscapes === 0 && !(state.movesRemaining === 1 && distance === 1)) {
    score -= 500;
  }

  score += (8 - distance) * 18;

  const center = (SIZE - 1) / 2;
  const distToCenter = Math.abs(botPos.row - center) + Math.abs(botPos.col - center);
  score += (6 - distToCenter) * 5;

  return score;
}

function chooseBotMove() {
  const moves = getReachableTiles(BOT_PLAYER);
  if (!moves.length) return null;

  const playerPos = state.players[1];

  if (state.movesRemaining === 1) {
    for (const move of moves) {
      const dist = Math.abs(move.row - playerPos.row) + Math.abs(move.col - playerPos.col);
      if (dist === 1) {
        return move;
      }
    }
  }

  let bestMove = moves[0];
  let bestScore = -Infinity;

  for (const move of moves) {
    const score = evaluateBotMove(move);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

function botTakeTurn() {
  if (!isBotTurn()) return;

  if (state.phase === 'roll') {
    phaseText.textContent = 'Bot is thinking...';
    setTimeout(() => {
      if (isBotTurn() && state.phase === 'roll') {
        rollDice(true);
      }
    }, BOT_THINK_DELAY);
    return;
  }

  if (state.phase !== 'move') return;

  const move = chooseBotMove();

  if (!move) {
    nextTurn();
    return;
  }

  phaseText.textContent = 'Bot is thinking...';

  setTimeout(() => {
    if (!isBotTurn() || state.phase !== 'move') return;

    onTileClick(move.row, move.col, true);

    if (!isBotTurn() || state.phase !== 'move') return;

    if (state.movesRemaining > 0) {
      botTakeTurn();
      return;
    }

    endTurnEarly(true);
  }, BOT_THINK_DELAY);
}

function animateRollButton(callback) {
  rollBtn.classList.remove('rolling');
  void rollBtn.offsetWidth;
  rollBtn.classList.add('rolling');

  setTimeout(() => {
    rollBtn.classList.remove('rolling');
    callback();
  }, 700);
}

function renderBoard() {
  boardEl.innerHTML = '';

  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const tile = document.createElement('button');
      tile.className = 'tile';

      const wall = isWallTile(row, col);
      if (wall) {
        tile.classList.add('wall');

        const top = isWallTile(row - 1, col);
        const right = isWallTile(row, col + 1);
        const bottom = isWallTile(row + 1, col);
        const left = isWallTile(row, col - 1);

        if (top) tile.classList.add('join-top');
        if (right) tile.classList.add('join-right');
        if (bottom) tile.classList.add('join-bottom');
        if (left) tile.classList.add('join-left');
      }

      const valid = state.validMoves.some(m => m.row === row && m.col === col);
      const selected = state.selectedTile &&
        state.selectedTile.row === row &&
        state.selectedTile.col === col;

      if (valid) tile.classList.add('valid');
      if (selected) tile.classList.add('selected');

      if (
        state.attackFlashTile &&
        state.attackFlashTile.row === row &&
        state.attackFlashTile.col === col
      ) {
        tile.classList.add('attack-flash');
      }

      tile.dataset.row = row;
      tile.dataset.col = col;

      if (state.players[1].row === row && state.players[1].col === col) {
        const piece = document.createElement('div');
        const moved =
          state.lastMove &&
          state.lastMove.player === 1 &&
          state.lastMove.row === row &&
          state.lastMove.col === col;
        const won = state.winnerAnimPlayer === 1;
        const blocked = state.blockedAnimPlayer === 1;

        piece.className = `piece p1 ${moved ? 'move' : ''} ${won ? 'win' : ''} ${blocked ? 'blocked' : ''}`.trim();
        piece.innerHTML = `<img src="./assets/blue.png" draggable="false" alt="Player 1">`;
        tile.appendChild(piece);
      }

      if (state.players[2].row === row && state.players[2].col === col) {
        const piece = document.createElement('div');
        const moved =
          state.lastMove &&
          state.lastMove.player === 2 &&
          state.lastMove.row === row &&
          state.lastMove.col === col;
        const won = state.winnerAnimPlayer === 2;
        const blocked = state.blockedAnimPlayer === 2;

        piece.className = `piece p2 ${moved ? 'move' : ''} ${won ? 'win' : ''} ${blocked ? 'blocked' : ''}`.trim();
        piece.innerHTML = `<img src="./assets/red.png" draggable="false" alt="Bot">`;
        tile.appendChild(piece);
      }

      tile.addEventListener('click', () => onTileClick(row, col));
      boardEl.appendChild(tile);
    }
  }
}

function renderUI() {
  turnText.textContent = state.phase === 'matchOver'
    ? `${getPlayerLabel(state.winner)} wins the match`
    : state.phase === 'roundOver'
      ? `${getPlayerLabel(state.winner)} wins Round ${state.round}`
      : `${getPlayerLabel(state.currentPlayer)} turn`;

  let phaseMsg = '';
  if (state.phase === 'roll') {
    phaseMsg = 'Click Roll Dice to begin.';
  } else if (state.phase === 'move') {
    phaseMsg = 'Click a green tile to move, or end turn without moving.';
  } else if (state.phase === 'roundOver') {
    phaseMsg = 'Round complete. Start the next round.';
  } else {
    phaseMsg = 'Match complete. Press Reset Match to play again.';
  }
  phaseText.textContent = phaseMsg;

  diceText.textContent = state.dice == null
    ? 'Dice: -'
    : `Dice: ${state.dice}${state.phase === 'move' ? ` | Moves left: ${state.movesRemaining}` : ''}`;

  roundText.textContent = `Round ${Math.min(state.round, 3)} of 3`;
  p1Score.textContent = state.players[1].score;
  p2Score.textContent = state.players[2].score;
  p1Pos.textContent = coordLabel(state.players[1]);
  p2Pos.textContent = coordLabel(state.players[2]);

  rollBtn.disabled = state.phase !== 'roll' || isBotTurn();
  endTurnBtn.disabled = state.phase !== 'move' || isBotTurn();
  newRoundBtn.disabled = state.phase !== 'roundOver';
}

function onTileClick(row, col, byBot = false) {
  if (state.phase !== 'move') return;
  if (isBotTurn() && !byBot) return;
  if (isWallTile(row, col)) return;

  const isValid = state.validMoves.some(m => m.row === row && m.col === col);
  if (!isValid) return;

  state.players[state.currentPlayer].row = row;
  state.players[state.currentPlayer].col = col;
  state.selectedTile = { row, col };
  state.lastMove = { player: state.currentPlayer, row, col };
  state.movesRemaining -= 1;

  addLog(
    `${getPlayerLabel(state.currentPlayer)} stepped to ${coordLabel({ row, col })}. ${state.movesRemaining} move(s) left.`
  );

  const opponent = getOpponent(state.currentPlayer);

  if (!hasAdjacentEscape(opponent)) {
    state.blockedAnimPlayer = opponent;
    state.attackFlashTile = { row, col };
    renderBoard();
    renderUI();

    setTimeout(() => {
      state.blockedAnimPlayer = null;
      endRound(state.currentPlayer);
    }, 350);

    return;
  }

  if (state.movesRemaining <= 0) {
    if (isDirectlyFacing(state.currentPlayer)) {
      state.attackFlashTile = { row, col };
      addLog(
        `${getPlayerLabel(state.currentPlayer)} ended the turn directly facing ${getPlayerLabel(opponent)} and wins the round.`
      );
      endRound(state.currentPlayer);
      return;
    }

    nextTurn();
    return;
  }

  state.validMoves = getReachableTiles(state.currentPlayer);

  if (state.validMoves.length === 0) {
    addLog(`${getPlayerLabel(state.currentPlayer)} has no legal 1-tile step remaining and ends the turn.`);
    nextTurn();
    return;
  }

  renderBoard();
  renderUI();
}

function rollDice(byBot = false) {
  state.dice = Math.floor(Math.random() * 6) + 1;
  state.movesRemaining = state.dice;
  state.validMoves = getReachableTiles(state.currentPlayer);
  state.selectedTile = null;
  state.phase = 'move';

  addLog(`${getPlayerLabel(state.currentPlayer)} rolled a ${state.dice}.`);
  showDicePop(state.dice);

  if (state.validMoves.length === 0) {
    addLog(`${getPlayerLabel(state.currentPlayer)} has no legal 1-tile move and ends the turn.`);
    nextTurn();
    return;
  }

  renderBoard();
  renderUI();

  if (byBot && isBotTurn()) {
    botTakeTurn();
  }
}

function nextTurn() {
  state.currentPlayer = getOpponent(state.currentPlayer);
  state.phase = 'roll';
  state.dice = null;
  state.movesRemaining = 0;
  state.validMoves = [];
  state.selectedTile = null;
  state.lastMove = null;
  state.blockedAnimPlayer = null;
  state.attackFlashTile = null;

  renderBoard();
  renderUI();

  if (isBotTurn()) {
    botTakeTurn();
  }
}

function endTurnEarly(byBot = false) {
  if (state.phase !== 'move') return;
  if (isBotTurn() && !byBot) return;

  if (state.movesRemaining > 0) {
    return;
  }

  if (isDirectlyFacing(state.currentPlayer)) {
    state.attackFlashTile = {
      row: state.players[state.currentPlayer].row,
      col: state.players[state.currentPlayer].col
    };
    addLog(
      `${getPlayerLabel(state.currentPlayer)} ended the turn directly facing ${getPlayerLabel(getOpponent(state.currentPlayer))} and wins the round.`
    );
    endRound(state.currentPlayer);
    return;
  }

  addLog(`${getPlayerLabel(state.currentPlayer)} ended the turn.`);
  nextTurn();
}

function endRound(winner) {
  state.winnerAnimPlayer = winner;
  showWinBubble(winner);
  showWinnerPopup(winner);

  state.players[winner].score += 1;
  state.winner = winner;
  state.phase = 'roundOver';
  state.dice = null;
  state.movesRemaining = 0;
  state.validMoves = [];
  state.selectedTile = null;

  addLog(`${getPlayerLabel(winner)} trapped ${getPlayerLabel(getOpponent(winner))} and won Round ${state.round}.`);

  if (state.players[winner].score >= WIN_ROUNDS) {
    state.phase = 'matchOver';
    addLog(`${getPlayerLabel(winner)} wins the match.`);
    document.querySelector('#winnerPopup .popup-title').textContent = 'Match Winner';
    document.querySelector('#winnerPopup .popup-subtext').textContent = 'Tap Next Game to start a fresh match.';
    nextRoundPopupBtn.textContent = 'New Match';
  } else {
    document.querySelector('#winnerPopup .popup-title').textContent = 'Round Winner';
    document.querySelector('#winnerPopup .popup-subtext').textContent = 'Start the next round when you are ready.';
    nextRoundPopupBtn.textContent = 'Next Game';
  }

  renderBoard();
  renderUI();

  setTimeout(() => {
    state.winnerAnimPlayer = null;
    state.attackFlashTile = null;
    renderBoard();
  }, 700);
}

function startNextRound() {
  if (state.phase !== 'roundOver') return;

  hideWinnerPopup();
  state.round += 1;
  state.players[1].row = 0;
  state.players[1].col = 0;
  state.players[2].row = SIZE - 1;
  state.players[2].col = SIZE - 1;
  state.currentPlayer = state.round % 2 === 1 ? 1 : 2;
  state.phase = 'roll';
  state.dice = null;
  state.movesRemaining = 0;
  state.winner = null;
  state.validMoves = [];
  state.selectedTile = null;
  state.lastMove = null;
  state.winnerAnimPlayer = null;
  state.blockedAnimPlayer = null;
  state.attackFlashTile = null;

  generateRandomBlockedTiles(18);
  addLog(`Round ${state.round} started. ${getPlayerLabel(state.currentPlayer)} goes first.`);

  renderBoard();
  renderUI();

  if (isBotTurn()) {
    botTakeTurn();
  }
}

function resetMatch() {
  hideWinnerPopup();
  state.players[1] = { row: 0, col: 0, score: 0 };
  state.players[2] = { row: SIZE - 1, col: SIZE - 1, score: 0 };
  state.currentPlayer = 1;
  state.phase = 'roll';
  state.dice = null;
  state.movesRemaining = 0;
  state.round = 1;
  state.winner = null;
  state.validMoves = [];
  state.selectedTile = null;
  state.log = [];
  state.lastMove = null;
  state.winnerAnimPlayer = null;
  state.blockedAnimPlayer = null;
  state.attackFlashTile = null;

  generateRandomBlockedTiles(18);

  document.querySelector('#winnerPopup .popup-title').textContent = 'Round Winner';
  document.querySelector('#winnerPopup .popup-subtext').textContent = 'Start the next round when you are ready.';
  nextRoundPopupBtn.textContent = 'Next Game';

  addLog('New match started. Player 1 goes first.');
  renderBoard();
  renderUI();

  if (isBotTurn()) {
    botTakeTurn();
  }
}

function showDicePop(value) {
  const bubble = document.getElementById('dicePopBubble');
  if (!bubble) return;

  bubble.textContent = value;
  bubble.classList.remove('show');
  void bubble.offsetWidth;
  bubble.classList.add('show');

  setTimeout(() => {
    bubble.classList.remove('show');
  }, 900);
}

function showWinBubble(player) {
  const bubble = document.getElementById('winBubble');
  if (!bubble) return;

  bubble.textContent = `${player === BOT_PLAYER ? 'Bot' : `Player ${player}`} Win!`;
  bubble.style.transform = 'translate(-50%, -50%) scale(1)';

  setTimeout(() => {
    bubble.style.transform = 'translate(-50%, -50%) scale(0)';
  }, 1500);
}

function tryKeyboardMove(dr, dc) {
  if (state.phase !== 'move') return;
  if (isBotTurn()) return;
  if (state.currentPlayer !== 1) return;
  if (state.movesRemaining <= 0) return;

  const current = state.players[1];
  const nextRow = current.row + dr;
  const nextCol = current.col + dc;

  if (!inBounds(nextRow, nextCol)) return;
  onTileClick(nextRow, nextCol);
}

function openDrawer() {
  if (!sideDrawer || !drawerOverlay) return;
  sideDrawer.classList.add('open');
  drawerOverlay.classList.add('show');
}

function closeDrawerMenu() {
  if (!sideDrawer || !drawerOverlay) return;
  sideDrawer.classList.remove('open');
  drawerOverlay.classList.remove('show');
}

rollBtn.addEventListener('click', () => {
  if (state.phase !== 'roll' || isBotTurn()) return;
  animateRollButton(() => {
    rollDice();
  });
});

endTurnBtn.addEventListener('click', endTurnEarly);
newRoundBtn.addEventListener('click', startNextRound);

nextRoundPopupBtn.addEventListener('click', () => {
  hideWinnerPopup();
  if (state.phase === 'matchOver') {
    resetMatch();
  } else {
    startNextRound();
  }
});

resetMatchBtn.addEventListener('click', () => {
  hideWinnerPopup();
  resetMatch();
});

document.addEventListener('keydown', (e) => {
  if (state.phase !== 'move') return;
  if (isBotTurn()) return;

  const activeTag = document.activeElement?.tagName;
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

  switch (e.key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      e.preventDefault();
      tryKeyboardMove(-1, 0);
      break;
    case 'ArrowDown':
    case 's':
    case 'S':
      e.preventDefault();
      tryKeyboardMove(1, 0);
      break;
    case 'ArrowLeft':
    case 'a':
    case 'A':
      e.preventDefault();
      tryKeyboardMove(0, -1);
      break;
    case 'ArrowRight':
    case 'd':
    case 'D':
      e.preventDefault();
      tryKeyboardMove(0, 1);
      break;
  }
});

if (menuToggle) {
  menuToggle.addEventListener('click', openDrawer);
}

if (closeDrawer) {
  closeDrawer.addEventListener('click', closeDrawerMenu);
}

if (drawerOverlay) {
  drawerOverlay.addEventListener('click', closeDrawerMenu);
}

resetMatch();
