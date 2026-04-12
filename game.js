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
      log: []
    };

    const boardEl = document.getElementById('board');
    const rollBtn = document.getElementById('rollBtn');
    const endTurnBtn = document.getElementById('endTurnBtn');
    const newRoundBtn = document.getElementById('newRoundBtn');
    const resetMatchBtn = document.getElementById('resetMatchBtn');

    const turnText = document.getElementById('turnText');
    const phaseText = document.getElementById('phaseText');
    const diceText = document.getElementById('diceText');
    const dicePopBubble = document.getElementById('dicePopBubble');
    const roundText = document.getElementById('roundText');
    const p1Score = document.getElementById('p1Score');
    const p2Score = document.getElementById('p2Score');
    const p1Pos = document.getElementById('p1Pos');
    const p2Pos = document.getElementById('p2Pos');
    const logEl = document.getElementById('log');

    const winnerPopup = document.getElementById('winnerPopup');
    const winnerPopupText = document.getElementById('winnerPopupText');
    const nextRoundPopupBtn = document.getElementById('nextRoundPopupBtn');

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
      return state.currentPlayer === BOT_PLAYER && state.phase !== 'roundOver' && state.phase !== 'matchOver';
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

    function getReachableTiles(player, maxSteps = 1) {
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
        if (blockedTiles.some(b => b.row === nr && b.col === nc)) continue;
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
        if (blockedTiles.some(b => b.row === nr && b.col === nc)) continue;
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
          if (blockedTiles.some(tile => tile.row === nr && tile.col === nc)) continue;
          visited.add(key);
          queue.push({ row: nr, col: nc });
        }
      }

      return false;
    }

    function generateRandomBlockedTiles(count = 4) {
      const start1 = { row: 0, col: 0 };
      const start2 = { row: SIZE - 1, col: SIZE - 1 };
      const forbidden = new Set([
        `0,0`,
        `${SIZE - 1},${SIZE - 1}`
      ]);

      let attempts = 0;
      do {
        attempts += 1;
        blockedTiles.length = 0;

        while (blockedTiles.length < count) {
          const row = Math.floor(Math.random() * SIZE);
          const col = Math.floor(Math.random() * SIZE);
          const key = `${row},${col}`;
          if (forbidden.has(key)) continue;
          if (blockedTiles.some(tile => tile.row === row && tile.col === col)) continue;
          blockedTiles.push({ row, col });
        }

        if (hasPathBetween(start1, start2)) {
          return;
        }
      } while (attempts < 200);

      blockedTiles.length = 0;
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
        if (blockedTiles.some(b => b.row === nr && b.col === nc)) continue;
        count += 1;
      }
      return count;
    }

    function evaluateBotMove(move) {
      const botPos = { row: move.row, col: move.col };
      const playerPos = { row: state.players[1].row, col: state.players[1].col };
      const distance = manhattan(botPos, playerPos);
      const playerEscapes = countEscapesFromPositions(playerPos, botPos);
      const botEscapes = countEscapesFromPositions(botPos, playerPos);

      let score = 0;
      if (distance === 1) score += 1000;
      if (playerEscapes === 0) score += 900;
      score += (8 - distance) * 14;
      score += (4 - playerEscapes) * 30;
      score += botEscapes * 10;

      const centerBias = (3.5 - Math.abs(botPos.row - 3.5)) + (3.5 - Math.abs(botPos.col - 3.5));
      score += centerBias * 3;

      function getAdjacentTiles(pos) {
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  return dirs.map(d => ({ x: pos.x + d.x, y: pos.y + d.y }));
}

function isInsideBoard(pos, size) {
  return pos.x >= 1 && pos.x <= size && pos.y >= 1 && pos.y <= size;
}

function samePos(a, b) {
  return a.x === b.x && a.y === b.y;
}

function isBlocked(pos, walls) {
  return walls.some(w => samePos(w, pos));
}

function isOrthAdjacent(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

function getLegalMovesFrom(pos, otherPlayer, walls, boardSize) {
  return getAdjacentTiles(pos).filter(tile =>
    isInsideBoard(tile, boardSize) &&
    !isBlocked(tile, walls) &&
    !samePos(tile, otherPlayer)
  );
}

function scoreBotMove(candidate, humanPos, walls, boardSize) {
  let score = 0;

  const botMovesAfter = getLegalMovesFrom(candidate, humanPos, walls, boardSize);
  const humanMovesAfter = getLegalMovesFrom(humanPos, candidate, walls, boardSize);

  // Immediate win
  if (isOrthAdjacent(candidate, humanPos)) score += 1000;

  // Trap pressure
  score += (4 - humanMovesAfter.length) * 120;

  // Bot safety
  score += botMovesAfter.length * 30;

  // Avoid ending with no exits unless winning
  if (botMovesAfter.length === 0 && !isOrthAdjacent(candidate, humanPos)) score -= 500;

  // Prefer center
  const center = (boardSize + 1) / 2;
  const distToCenter = Math.abs(candidate.x - center) + Math.abs(candidate.y - center);
  score += (10 - distToCenter);

  // Prefer being near, but not recklessly
  const distToHuman = Math.abs(candidate.x - humanPos.x) + Math.abs(candidate.y - humanPos.y);
  score += (8 - distToHuman) * 8;

  return score;
}

function chooseSmartBotMove(botPos, humanPos, walls, boardSize) {
  const legal = getLegalMovesFrom(botPos, humanPos, walls, boardSize);
  if (!legal.length) return null;

  let best = legal[0];
  let bestScore = -Infinity;

  for (const move of legal) {
    const score = scoreBotMove(move, humanPos, walls, boardSize);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }

  return best;
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

        if (state.phase === 'move') {
          endTurnEarly(true);
        }
      }, BOT_THINK_DELAY);
    }


    function animateRollButton(callback) {
      rollBtn.classList.remove('rolling');
      void rollBtn.offsetWidth;
      rollBtn.classList.add('rolling');

      setTimeout(() => {
        rollBtn.classList.remove('rolling');
        callback();
      }, 650);
    }

    function renderBoard() {
      boardEl.innerHTML = '';
      for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
          const tile = document.createElement('button');
          tile.className = 'tile';

          const isWall = blockedTiles.some(b => b.row === row && b.col === col);
          if (isWall) {
            tile.classList.add('wall');
          }
          tile.dataset.row = row;
          tile.dataset.col = col;
          tile.innerHTML = ``;

          const valid = state.validMoves.some(m => m.row === row && m.col === col);
          const selected = state.selectedTile && state.selectedTile.row === row && state.selectedTile.col === col;

          if (valid) tile.classList.add('valid');
          if (selected) tile.classList.add('selected');

          if (state.players[1].row === row && state.players[1].col === col) {
            const piece = document.createElement('div');
            piece.className = 'piece p1';
            piece.textContent = '1';
            tile.appendChild(piece);
          }

          if (state.players[2].row === row && state.players[2].col === col) {
            const piece = document.createElement('div');
            piece.className = 'piece p2';
            piece.textContent = '2';
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

      const diceValueHtml = state.dice == null
        ? '-'
        : `<span class="dice-value-pop">${state.dice}</span>`;
      diceText.innerHTML = `Dice: ${diceValueHtml}${state.phase === 'move' ? ` <span style="color: var(--muted);">| Moves left: ${state.movesRemaining}</span>` : ''}`;
      roundText.textContent = `Round ${Math.min(state.round, 3)} of 3`;
      p1Score.textContent = state.players[1].score;
      p2Score.textContent = state.players[2].score;
      p1Pos.textContent = coordLabel(state.players[1]);
      p2Pos.textContent = coordLabel(state.players[2]);

      rollBtn.disabled = state.phase !== 'roll' || isBotTurn();
      endTurnBtn.disabled = state.phase !== 'move' || isBotTurn();
      newRoundBtn.disabled = true;
    }

    function onTileClick(row, col, byBot = false) {
      if (state.phase !== 'move') return;
      if (isBotTurn() && !byBot) return;
      if (blockedTiles.some(b => b.row === row && b.col === col)) return;
      const isValid = state.validMoves.some(m => m.row === row && m.col === col);
      if (!isValid) return;

      state.players[state.currentPlayer].row = row;
      state.players[state.currentPlayer].col = col;
      state.selectedTile = { row, col };
      state.movesRemaining -= 1;
      addLog(`${getPlayerLabel(state.currentPlayer)} stepped to ${coordLabel({ row, col })}. ${state.movesRemaining} move(s) left.`);

      const opponent = getOpponent(state.currentPlayer);
      if (!hasAdjacentEscape(opponent)) {
        endRound(state.currentPlayer);
        return;
      }

      if (state.movesRemaining <= 0) {
        if (isDirectlyFacing(state.currentPlayer)) {
          addLog(`${getPlayerLabel(state.currentPlayer)} ended the turn directly facing ${getPlayerLabel(opponent)} and wins the round.`);
          endRound(state.currentPlayer);
          return;
        }
        nextTurn();
        return;
      }

      state.validMoves = getReachableTiles(state.currentPlayer, 1);
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
      state.validMoves = getReachableTiles(state.currentPlayer, 1);
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
      renderBoard();
      renderUI();

      if (isBotTurn()) {
        botTakeTurn();
      }
    }

    function endTurnEarly(byBot = false) {
      if (state.phase !== 'move') return;
      if (isBotTurn() && !byBot) return;
      if (isDirectlyFacing(state.currentPlayer)) {
        addLog(`${getPlayerLabel(state.currentPlayer)} ended the turn directly facing ${getPlayerLabel(getOpponent(state.currentPlayer))} and wins the round.`);
        endRound(state.currentPlayer);
        return;
      }
      addLog(`${getPlayerLabel(state.currentPlayer)} ended the turn with ${state.movesRemaining} unused move(s).`);
      nextTurn();
    }

    function endRound(winner) {
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
        nextRoundPopupBtn.textContent = 'New\nMatch';
      } else {
        document.querySelector('#winnerPopup .popup-title').textContent = 'Round Winner';
        document.querySelector('#winnerPopup .popup-subtext').textContent = 'Start the next round when you are ready.';
        nextRoundPopupBtn.textContent = 'Next\nGame';
      }

      renderBoard();
      renderUI();
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
      generateRandomBlockedTiles(12);
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
      generateRandomBlockedTiles(12);
      document.querySelector('#winnerPopup .popup-title').textContent = 'Round Winner';
      document.querySelector('#winnerPopup .popup-subtext').textContent = 'Start the next round when you are ready.';
      nextRoundPopupBtn.textContent = 'Next\nGame';
      state.log = [];
      addLog('New match started. Player 1 goes first.');
      renderBoard();
      renderUI();

      if (isBotTurn()) {
        botTakeTurn();
      }
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

    resetMatch();

function showDicePop(value) {
      const bubble = document.getElementById('dicePopBubble');
      bubble.textContent = value;
      bubble.classList.remove('show');
      void bubble.offsetWidth;
      bubble.classList.add('show');

      const inlinePop = document.querySelector('.dice-value-pop');
      if (inlinePop) {
        inlinePop.classList.remove('show');
        void inlinePop.offsetWidth;
        inlinePop.classList.add('show');
      }
    }

    function showWinBubble(player) {
      const bubble = document.getElementById('winBubble');
      bubble.textContent = `${player === BOT_PLAYER ? 'Bot' : `Player ${player}`} Win!`;
      bubble.style.transform = 'translate(-50%, -50%) scale(1)';

      setTimeout(() => {
        bubble.style.transform = 'translate(-50%, -50%) scale(0)';
      }, 1500);
    }
