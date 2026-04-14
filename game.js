import { db, ref, update, get, onValue, remove } from "./firebase.js";

const SIZE = 8;
const TILE_SIZE = 72;
const WIN_ROUNDS = 2;
const blockedTiles = [];

const roomId = localStorage.getItem("roomId");
const playerRole = localStorage.getItem("playerRole");
const playerName = localStorage.getItem("playerName") || "";
const isMultiplayer = !!roomId && !!playerRole;

let roomState = null;
let tossShownLocally = false;

const TILESET = {
  ground: {
    floor1: "/assets/tile-floor1.png",
    floor2: "/assets/tile-floor2.png",
    grass1: "/assets/tile-grass1.png",
    grass2: "/assets/tile-grass2.png",
  },
  block: {
    stone: "/assets/d-tile1.png",
    sand: "/assets/d-tile2.png",
    bonfire: "/assets/d-tile3.png",
  },
  actor: {
    p1: "/assets/blue-removebg-preview.png",
    p2: "/assets/red-removebg-preview.png",
  },
};

const tileMap = {
  ground: [],
  block: [],
  prop: [],
};

const state = {
  players: {
    1: { row: 0, col: 0, score: 0, connected: true },
    2: { row: SIZE - 1, col: SIZE - 1, score: 0, connected: !isMultiplayer },
  },
  currentPlayer: 1,
  phase: isMultiplayer ? "waiting" : "roll",
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
  attackFlashTile: null,
};

const boardEl = document.getElementById("board");
const rollBtn = document.getElementById("rollBtn");
const endTurnBtn = document.getElementById("endTurnBtn");
const newRoundBtn = document.getElementById("newRoundBtn");
const resetMatchBtn = document.getElementById("resetMatchBtn");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");

const turnText = document.getElementById("turnText");
const phaseText = document.getElementById("phaseText");
const diceText = document.getElementById("diceText");
const roundText = document.getElementById("roundText");
const roomStatusText = document.getElementById("roomStatusText");
const p1Score = document.getElementById("p1Score");
const p2Score = document.getElementById("p2Score");
const p1Pos = document.getElementById("p1Pos");
const p2Pos = document.getElementById("p2Pos");
const p1NameEl = document.getElementById("p1Name");
const p2NameEl = document.getElementById("p2Name");
const p1DiceEl = document.getElementById("p1Dice");
const p2DiceEl = document.getElementById("p2Dice");
const logEl = document.getElementById("log");

const coinTossPopup = document.getElementById("coinTossPopup");
const coinTossText = document.getElementById("coinTossText");

const resultPopup = document.getElementById("resultPopup");
const resultPopupText = document.getElementById("resultPopupText");
const resultPopupSubtext = document.getElementById("resultPopupSubtext");
const resultNextBtn = document.getElementById("resultNextBtn");

const menuToggle = document.getElementById("menuToggle");
const menuToggleInline = document.getElementById("menuToggleInline");
const closeDrawer = document.getElementById("closeDrawer");
const sideDrawer = document.getElementById("sideDrawer");
const drawerOverlay = document.getElementById("drawerOverlay");

function addLog(message) {
  state.log.unshift(message);
  state.log = state.log.slice(0, 20);
  renderLog();
}

function renderLog() {
  if (!logEl) return;
  logEl.innerHTML = state.log
    .map((entry) => `<div class="log-entry">${entry}</div>`)
    .join("");
}

function showCoinTossPopup(text) {
  if (!coinTossPopup || !coinTossText) return;
  coinTossText.textContent = text;
  coinTossPopup.classList.add("show");
  setTimeout(() => {
    coinTossPopup.classList.remove("show");
  }, 2000);
}

function showResultPopup(message, isMatchOver = false) {
  if (!resultPopup || !resultPopupText) return;

  resultPopupText.textContent = message;

  if (resultPopupSubtext) {
    resultPopupSubtext.textContent = isMatchOver
      ? "Series decided."
      : "Waiting for the next round.";
  }

  if (resultNextBtn) {
    resultNextBtn.textContent = isMatchOver ? "New Match" : "Next Game";
  }

  resultPopup.classList.add("show");
}

function hideResultPopup() {
  if (!resultPopup) return;
  resultPopup.classList.remove("show");
}

function animateRollButton(callback) {
  if (!rollBtn) return;
  rollBtn.classList.remove("rolling");
  void rollBtn.offsetWidth;
  rollBtn.classList.add("rolling");

  setTimeout(() => {
    rollBtn.classList.remove("rolling");
    callback();
  }, 500);
}

function openDrawer() {
  sideDrawer?.classList.add("open");
  drawerOverlay?.classList.add("show");
}

function closeDrawerMenu() {
  sideDrawer?.classList.remove("open");
  drawerOverlay?.classList.remove("show");
}

function createEmptyLayer(fill = null) {
  return Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => fill)
  );
}

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function cellHash(row, col) {
  return (row * 37 + col * 91 + row * col * 17) % 1000;
}

function getOpponent(player) {
  return player === 1 ? 2 : 1;
}

function localRoleToNumber() {
  return playerRole === "p1" ? 1 : 2;
}

function isMyTurn() {
  if (!isMultiplayer) return state.currentPlayer === 1;
  return roomState?.turn === playerRole;
}

function bothPlayersReady() {
  if (!isMultiplayer) return true;
  return !!(roomState?.players?.p1?.connected && roomState?.players?.p2?.connected);
}

function getPlayerLabel(player) {
  if (player === 1) return p1NameEl?.textContent || "Player 1";
  return p2NameEl?.textContent || "Player 2";
}

function coordLabel(pos) {
  return `(${pos.row + 1},${pos.col + 1})`;
}

function inBounds(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

function isWallTile(row, col) {
  return blockedTiles.some((b) => b.row === row && b.col === col);
}

function groundKeyForCell(row, col) {
  const seed = cellHash(row, col) % 100;

  if (row < SIZE / 2) {
    if (seed < 60) return "grass1";
    if (seed < 95) return "grass2";
    return "floor2";
  }

  if (seed < 60) return "floor1";
  if (seed < 90) return "floor2";
  return "grass1";
}

function blockKeyForCell(row, col) {
  const seed = cellHash(row, col) % 3;
  if (seed === 0) return "stone";
  if (seed === 1) return "sand";
  return "bonfire";
}

function generateGroundLayer() {
  const ground = createEmptyLayer();

  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const left = col > 0 ? ground[row][col - 1] : null;
      const top = row > 0 ? ground[row - 1][col] : null;

      const preferred = [];
      const family = row < SIZE / 2 ? ["grass1", "grass2"] : ["floor1", "floor2"];

      if (left && family.includes(left) && Math.random() < 0.62) preferred.push(left);
      if (top && family.includes(top) && Math.random() < 0.55) preferred.push(top);

      if (preferred.length > 0 && Math.random() < 0.75) {
        ground[row][col] = rand(preferred);
      } else {
        ground[row][col] = groundKeyForCell(row, col);
      }
    }
  }

  return ground;
}

function generateBlockLayerFromBlockedTiles() {
  const block = createEmptyLayer();

  for (const tile of blockedTiles) {
    block[tile.row][tile.col] = blockKeyForCell(tile.row, tile.col);
  }

  return block;
}

function buildVisualMap() {
  tileMap.ground = generateGroundLayer();
  tileMap.block = generateBlockLayerFromBlockedTiles();
  tileMap.prop = createEmptyLayer();
}

function getReachableTiles(player) {
  const start = state.players[player];
  const opponent = state.players[getOpponent(player)];
  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];

  const reachable = [];

  for (const dir of dirs) {
    const nr = start.row + dir.dr;
    const nc = start.col + dir.dc;

    if (!inBounds(nr, nc)) continue;
    if (state.players[getOpponent(player)].connected && nr === opponent.row && nc === opponent.col) continue;
    if (isWallTile(nr, nc)) continue;

    reachable.push({ row: nr, col: nc });
  }

  return reachable;
}

function hasPathBetween(start, target) {
  const queue = [{ row: start.row, col: start.col }];
  const visited = new Set([`${start.row},${start.col}`]);
  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];

  while (queue.length) {
    const current = queue.shift();
    if (current.row === target.row && current.col === target.col) return true;

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

function hasEscapeForPatch(player, tempPlayers) {
  const me = tempPlayers[player];
  const opponent = tempPlayers[getOpponent(player)];
  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];

  for (const dir of dirs) {
    const nr = me.row + dir.dr;
    const nc = me.col + dir.dc;

    if (!inBounds(nr, nc)) continue;
    if (tempPlayers[getOpponent(player)].connected && nr === opponent.row && nc === opponent.col) continue;
    if (isWallTile(nr, nc)) continue;

    return true;
  }

  return false;
}

function generateRandomBlockedTiles(count = 18) {
  const start1 = { row: 0, col: 0 };
  const start2 = { row: SIZE - 1, col: SIZE - 1 };
  const forbidden = new Set([`0,0`, `${SIZE - 1},${SIZE - 1}`]);

  let success = false;

  for (let attempts = 0; attempts < 500; attempts++) {
    blockedTiles.length = 0;

    while (blockedTiles.length < count) {
      let row;
      let col;

      const shouldCluster = blockedTiles.length > 0 && Math.random() < 0.22;

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
      if (blockedTiles.some((t) => t.row === row && t.col === col)) continue;

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
      if (blockedTiles.some((t) => t.row === row && t.col === col)) continue;

      blockedTiles.push({ row, col });
    }
  }

  return blockedTiles.map((t) => ({ row: t.row, col: t.col }));
}

function renderTileEngine() {
  if (!boardEl) return;

  boardEl.innerHTML = "";
  boardEl.style.width = `${SIZE * TILE_SIZE}px`;
  boardEl.style.height = `${SIZE * TILE_SIZE}px`;

  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.style.left = `${col * TILE_SIZE}px`;
      cell.style.top = `${row * TILE_SIZE}px`;
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);

      const groundKey = tileMap.ground[row]?.[col];
      if (groundKey) {
        const ground = document.createElement("div");
        ground.className = "layer ground";
        ground.style.backgroundImage = `url("${TILESET.ground[groundKey]}")`;
        cell.appendChild(ground);
      }

      const blockKey = tileMap.block[row]?.[col];
      if (blockKey) {
        const block = document.createElement("div");
        block.className = "layer block";
        block.style.backgroundImage = `url("${TILESET.block[blockKey]}")`;
        cell.appendChild(block);
      }

      if (
        state.attackFlashTile &&
        state.attackFlashTile.row === row &&
        state.attackFlashTile.col === col
      ) {
        const fxAttack = document.createElement("div");
        fxAttack.className = "layer fx attack";
        cell.appendChild(fxAttack);
      }

      const valid = state.validMoves.some((m) => m.row === row && m.col === col);
      if (valid) {
        const fx = document.createElement("div");
        fx.className = "layer fx valid";
        cell.appendChild(fx);
      }

      const selected =
        state.selectedTile &&
        state.selectedTile.row === row &&
        state.selectedTile.col === col;

      if (selected) {
        const fxSelected = document.createElement("div");
        fxSelected.className = "layer fx selected";
        cell.appendChild(fxSelected);
      }

      if (
        state.players[1].connected &&
        state.players[1].row === row &&
        state.players[1].col === col
      ) {
        const actor = document.createElement("div");
        actor.className = `layer actor p1 ${state.lastMove?.player === 1 && state.lastMove?.row === row && state.lastMove?.col === col ? "move" : ""}`.trim();
        actor.style.backgroundImage = `url("${TILESET.actor.p1}")`;
        cell.appendChild(actor);
      }

      if (
        state.players[2].connected &&
        state.players[2].row === row &&
        state.players[2].col === col
      ) {
        const actor = document.createElement("div");
        actor.className = `layer actor p2 ${state.lastMove?.player === 2 && state.lastMove?.row === row && state.lastMove?.col === col ? "move" : ""}`.trim();
        actor.style.backgroundImage = `url("${TILESET.actor.p2}")`;
        cell.appendChild(actor);
      }

      cell.addEventListener("click", () => onTileClick(row, col));
      boardEl.appendChild(cell);
    }
  }
}

function renderUI() {
  if (!turnText) return;

  const waitingMsg = isMultiplayer && !bothPlayersReady();

  turnText.textContent =
    state.phase === "matchOver"
      ? `${getPlayerLabel(state.winner)} wins the match`
      : waitingMsg
        ? "Waiting for Player 2..."
        : state.phase === "roundOver"
          ? `${getPlayerLabel(state.winner)} wins Round ${state.round}`
          : `${getPlayerLabel(state.currentPlayer)} turn`;

  let phaseMsg = "";
  if (waitingMsg) {
    phaseMsg = "Waiting for Player 2 to join.";
  } else if (state.phase === "waiting") {
    phaseMsg = "Waiting room active.";
  } else if (state.phase === "toss") {
    phaseMsg = "Coin toss in progress...";
  } else if (state.phase === "roll") {
    phaseMsg = isMyTurn() ? "Click Roll Dice to begin." : "Waiting for the other player.";
  } else if (state.phase === "move") {
    phaseMsg = isMyTurn() ? "Click a highlighted tile to move." : "Opponent is moving.";
  } else if (state.phase === "roundOver") {
    phaseMsg = "Round complete. Start the next round.";
  } else {
    phaseMsg = "Match complete.";
  }

  phaseText.textContent = phaseMsg;
  diceText.textContent =
    state.dice == null ? "Dice: -" : `Dice: ${state.dice} | Moves left: ${state.movesRemaining}`;
  roundText.textContent = `Round ${state.round} of 3`;

  if (roomStatusText) {
    roomStatusText.textContent = roomId ? `Room: ${roomId}` : "Room: -";
  }

  if (p1Pos) p1Pos.textContent = coordLabel(state.players[1]);
  if (p2Pos) p2Pos.textContent = state.players[2].connected ? coordLabel(state.players[2]) : "(-,-)";
  if (p1Score) p1Score.textContent = String(state.players[1].score || 0);
  if (p2Score) p2Score.textContent = String(state.players[2].score || 0);

  const currentDiceValue = state.dice == null ? "-" : String(state.dice);
  if (p1DiceEl) p1DiceEl.textContent = state.currentPlayer === 1 ? currentDiceValue : "-";
  if (p2DiceEl) p2DiceEl.textContent = state.currentPlayer === 2 ? currentDiceValue : "-";

  const canRoll = !waitingMsg && state.phase === "roll" && isMyTurn();
  const canEnd = !waitingMsg && state.phase === "move" && isMyTurn() && state.movesRemaining <= 0;

  if (rollBtn) rollBtn.disabled = !canRoll;
  if (endTurnBtn) endTurnBtn.disabled = !canEnd;
  if (newRoundBtn) {
    newRoundBtn.disabled = state.phase !== "roundOver" || (isMultiplayer && !isMyTurn());
  }
}

function syncRoomIntoLocal(room) {
  roomState = room;

  state.phase = room.phase || "waiting";
  state.round = room.round || 1;
  state.dice = room.dice ?? null;
  state.movesRemaining = room.movesRemaining ?? 0;
  state.currentPlayer = room.turn === "p2" ? 2 : 1;
  state.winner = room.winner === "p2" ? 2 : room.winner === "p1" ? 1 : null;

  state.players[1].row = room.players?.p1?.row ?? 0;
  state.players[1].col = room.players?.p1?.col ?? 0;
  state.players[1].connected = !!room.players?.p1?.connected;
  state.players[1].score = room.scores?.p1 ?? 0;

  state.players[2].row = room.players?.p2?.row ?? SIZE - 1;
  state.players[2].col = room.players?.p2?.col ?? SIZE - 1;
  state.players[2].connected = !!room.players?.p2?.connected;
  state.players[2].score = room.scores?.p2 ?? 0;

  blockedTiles.length = 0;
  (room.blockedTiles || []).forEach((t) => blockedTiles.push({ row: t.row, col: t.col }));

  if (p1NameEl) p1NameEl.textContent = room.players?.p1?.name || playerName || "Player 1";
  if (p2NameEl) p2NameEl.textContent = room.players?.p2?.name || "Player 2";
  if (roomStatusText) roomStatusText.textContent = roomId ? `Room: ${roomId}` : "Room: -";

  if (room.phase === "move" && isMyTurn()) {
    state.validMoves = getReachableTiles(localRoleToNumber());
  } else {
    state.validMoves = [];
  }

  buildVisualMap();
  renderTileEngine();
  renderUI();

  if (room.phase === "roundOver" && room.winner) {
    const iWon = room.winner === playerRole;
    const myScore = playerRole === "p1" ? (room.scores?.p1 ?? 0) : (room.scores?.p2 ?? 0);
    const oppScore = playerRole === "p1" ? (room.scores?.p2 ?? 0) : (room.scores?.p1 ?? 0);
    const isMatchOver = myScore >= WIN_ROUNDS || oppScore >= WIN_ROUNDS;

    showResultPopup(iWon ? "YOU WIN" : "YOU LOST", isMatchOver);
  } else {
    hideResultPopup();
  }

  if (room.phase === "toss" && room.players?.p1?.connected && room.players?.p2?.connected) {
    maybeRunToss(room);
  }

  if (room.toss?.shown && room.toss?.result && !tossShownLocally) {
    tossShownLocally = true;
    const starterName =
      room.toss.result === "p1"
        ? room.players?.p1?.name || "Player 1"
        : room.players?.p2?.name || "Player 2";
    showCoinTossPopup(`${starterName} goes first!`);
  }
}

async function maybeRunToss(room) {
  if (playerRole !== "p1") return;
  if (room.toss?.result) return;

  const starter = Math.random() < 0.5 ? "p1" : "p2";
  const tiles = generateRandomBlockedTiles(18);

  await update(ref(db, `rooms/${roomId}`), {
    status: "playing",
    phase: "roll",
    turn: starter,
    dice: null,
    movesRemaining: 0,
    blockedTiles: tiles,
    "toss/result": starter,
    "toss/shown": true,
    "scores/p1": room.scores?.p1 ?? 0,
    "scores/p2": room.scores?.p2 ?? 0,
  });
}

async function writeRoomPatch(patch) {
  if (!isMultiplayer || !roomId) return;
  await update(ref(db, `rooms/${roomId}`), patch);
}

async function onTileClick(row, col) {
  if (state.phase !== "move") return;
  if (!isMyTurn()) return;
  if (isWallTile(row, col)) return;

  const me = localRoleToNumber();
  const opponent = getOpponent(me);

  const isValid = getReachableTiles(me).some((m) => m.row === row && m.col === col);
  if (!isValid) return;

  const newMovesRemaining = state.movesRemaining - 1;
  const other = { row: state.players[opponent].row, col: state.players[opponent].col };

  let patch = {
    dice: state.dice,
    movesRemaining: newMovesRemaining,
    [`players/${playerRole}/row`]: row,
    [`players/${playerRole}/col`]: col,
  };

  const tempPlayers = {
    1: { ...state.players[1] },
    2: { ...state.players[2] },
  };

  tempPlayers[me].row = row;
  tempPlayers[me].col = col;
  state.lastMove = { player: me, row, col };

  if (state.players[opponent].connected && !hasEscapeForPatch(opponent, tempPlayers)) {
    const scoreKey = me === 1 ? "scores/p1" : "scores/p2";
    patch = {
      ...patch,
      phase: "roundOver",
      winner: me === 1 ? "p1" : "p2",
      [scoreKey]: (roomState?.scores?.[me === 1 ? "p1" : "p2"] ?? 0) + 1,
    };
  } else if (newMovesRemaining <= 0) {
    if (
      state.players[opponent].connected &&
      Math.abs(row - other.row) + Math.abs(col - other.col) === 1
    ) {
      const scoreKey = me === 1 ? "scores/p1" : "scores/p2";
      patch = {
        ...patch,
        phase: "roundOver",
        winner: me === 1 ? "p1" : "p2",
        [scoreKey]: (roomState?.scores?.[me === 1 ? "p1" : "p2"] ?? 0) + 1,
      };
    } else {
      patch = {
        ...patch,
        turn: playerRole === "p1" ? "p2" : "p1",
        phase: "roll",
        dice: null,
        movesRemaining: 0,
      };
    }
  }

  await writeRoomPatch(patch);
}

async function rollDiceAction() {
  if (!isMyTurn()) return;

  const roll = Math.floor(Math.random() * 6) + 1;

  await writeRoomPatch({
    dice: roll,
    movesRemaining: roll,
    phase: "move",
  });
}

async function endTurnEarly() {
  if (!isMyTurn()) return;
  if (state.movesRemaining > 0) return;

  await writeRoomPatch({
    turn: playerRole === "p1" ? "p2" : "p1",
    phase: "roll",
    dice: null,
    movesRemaining: 0,
  });
}

async function startNextRound() {
  if (!roomState) return;
  if (!isMyTurn()) return;

  hideResultPopup();

  const starter = roomState.round % 2 === 1 ? "p2" : "p1";
  const tiles = generateRandomBlockedTiles(18);

  await writeRoomPatch({
    round: (roomState.round || 1) + 1,
    phase: "roll",
    turn: starter,
    dice: null,
    movesRemaining: 0,
    winner: null,
    blockedTiles: tiles,
    "players/p1/row": 0,
    "players/p1/col": 0,
    "players/p2/row": 7,
    "players/p2/col": 7,
  });
}

async function resetSeries() {
  if (!roomState) return;
  if (!isMyTurn()) return;

  hideResultPopup();
  tossShownLocally = false;

  await writeRoomPatch({
    round: 1,
    phase: "toss",
    turn: null,
    dice: null,
    movesRemaining: 0,
    winner: null,
    blockedTiles: [],
    "scores/p1": 0,
    "scores/p2": 0,
    "players/p1/row": 0,
    "players/p1/col": 0,
    "players/p2/row": 7,
    "players/p2/col": 7,
    "toss/result": null,
    "toss/shown": false,
  });
}

async function leaveRoom() {
  if (!isMultiplayer || !roomId) return;

  hideResultPopup();

  localStorage.removeItem("roomId");
  localStorage.removeItem("playerRole");
  localStorage.removeItem("playerName");

  if (playerRole === "p1") {
    await remove(ref(db, `rooms/${roomId}`));
  } else {
    await update(ref(db, `rooms/${roomId}`), {
      status: "waiting",
      phase: "waiting",
      turn: null,
      "players/p2": {
        name: "",
        row: 7,
        col: 7,
        connected: false,
      },
      "toss/result": null,
      "toss/shown": false,
    });
  }

  window.location.href = "/multiplayer.html";
}

async function initMultiplayer() {
  const snap = await get(ref(db, `rooms/${roomId}`));
  if (!snap.exists()) {
    localStorage.removeItem("roomId");
    localStorage.removeItem("playerRole");
    localStorage.removeItem("playerName");
    return;
  }

  onValue(ref(db, `rooms/${roomId}`), (snapshot) => {
    const room = snapshot.val();
    if (!room) return;
    syncRoomIntoLocal(room);
  });
}

function initSoloFallback() {
  blockedTiles.length = 0;
  generateRandomBlockedTiles(18);
  buildVisualMap();
  renderTileEngine();
  renderUI();
}

rollBtn?.addEventListener("click", () => {
  if (!rollBtn.disabled) {
    animateRollButton(rollDiceAction);
  }
});

endTurnBtn?.addEventListener("click", endTurnEarly);
newRoundBtn?.addEventListener("click", startNextRound);
resetMatchBtn?.addEventListener("click", () => window.location.reload());
leaveRoomBtn?.addEventListener("click", leaveRoom);

resultNextBtn?.addEventListener("click", async () => {
  if (!roomState) return;
  if (!isMyTurn()) return;

  const p1SeriesScore = roomState.scores?.p1 ?? 0;
  const p2SeriesScore = roomState.scores?.p2 ?? 0;
  const isMatchOver = p1SeriesScore >= WIN_ROUNDS || p2SeriesScore >= WIN_ROUNDS;

  if (isMatchOver) {
    await resetSeries();
  } else {
    await startNextRound();
  }
});

document.addEventListener("keydown", (e) => {
  if (!isMyTurn()) return;
  if (state.phase !== "move") return;

  const keyMap = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
    w: [-1, 0],
    s: [1, 0],
    a: [0, -1],
    d: [0, 1],
    W: [-1, 0],
    S: [1, 0],
    A: [0, -1],
    D: [0, 1],
  };

  if (!(e.key in keyMap)) return;
  e.preventDefault();

  const [dr, dc] = keyMap[e.key];
  const me = localRoleToNumber();
  const nextRow = state.players[me].row + dr;
  const nextCol = state.players[me].col + dc;
  onTileClick(nextRow, nextCol);
});

menuToggle?.addEventListener("click", openDrawer);
menuToggleInline?.addEventListener("click", openDrawer);
closeDrawer?.addEventListener("click", closeDrawerMenu);
drawerOverlay?.addEventListener("click", closeDrawerMenu);

if (isMultiplayer) {
  initMultiplayer();
} else {
  initSoloFallback();
}
