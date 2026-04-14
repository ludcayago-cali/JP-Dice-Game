import { db, ref, set, update, get, onValue, push, remove } from "./firebase.js";

const lobbyScreen = document.getElementById("lobbyScreen");
const waitingScreen = document.getElementById("waitingScreen");
const gameScreen = document.getElementById("gameScreen");

const playerNameInput = document.getElementById("playerNameInput");
const roomCodeInput = document.getElementById("roomCodeInput");
const lobbyMessage = document.getElementById("lobbyMessage");
const roomCodeDisplay = document.getElementById("roomCodeDisplay");

const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const cancelRoomBtn = document.getElementById("cancelRoomBtn");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");

const p1NameEl = document.getElementById("p1Name");
const p2NameEl = document.getElementById("p2Name");
const roomStatusText = document.getElementById("roomStatusText");

let playerName = "";
let roomId = null;
let playerRole = null;
let roomUnsubscribeActive = false;

function showScreen(screen) {
  lobbyScreen.classList.add("hidden");
  waitingScreen.classList.add("hidden");
  gameScreen.classList.add("hidden");
  screen.classList.remove("hidden");
}

function showMessage(msg) {
  lobbyMessage.textContent = msg || "";
}

function getName() {
  const name = playerNameInput.value.trim();
  if (!name) {
    showMessage("Enter your name.");
    return null;
  }
  if (name.length < 2) {
    showMessage("Name is too short.");
    return null;
  }
  return name;
}

async function createRoom() {
  const roomRef = push(ref(db, "rooms"));
  roomId = roomRef.key;
  playerRole = "p1";

  await set(roomRef, {
    status: "waiting",
    turn: "p1",
    phase: "roll",
    round: 1,
    dice: null,
    movesRemaining: 0,
    blockedTiles: [],
    players: {
      p1: { name: playerName, row: 0, col: 0, connected: true },
      p2: { name: "", row: 7, col: 7, connected: false }
    },
    winner: null,
    createdAt: Date.now()
  });

  roomCodeDisplay.textContent = roomId;
  showScreen(waitingScreen);
  listenRoom(roomId);
}

async function joinRoom(code) {
  const snap = await get(ref(db, `rooms/${code}`));
  if (!snap.exists()) {
    showMessage("Room not found.");
    return;
  }

  const room = snap.val();
  if (room.players?.p2?.connected) {
    showMessage("Room is full.");
    return;
  }

  roomId = code;
  playerRole = "p2";

  await update(ref(db, `rooms/${roomId}`), {
    status: "playing",
    "players/p2": {
      name: playerName,
      row: 7,
      col: 7,
      connected: true
    }
  });

  listenRoom(roomId);
}

function listenRoom(id) {
  if (roomUnsubscribeActive) return;
  roomUnsubscribeActive = true;

  onValue(ref(db, `rooms/${id}`), (snap) => {
    const room = snap.val();

    if (!room) {
      showScreen(lobbyScreen);
      showMessage("Room closed.");
      roomId = null;
      playerRole = null;
      roomUnsubscribeActive = false;
      return;
    }

    roomStatusText.textContent = `Room: ${id}`;
    p1NameEl.textContent = room.players?.p1?.name || "Player 1";
    p2NameEl.textContent = room.players?.p2?.name || "Player 2";

    if (room.status === "waiting") {
      roomCodeDisplay.textContent = id;
      showScreen(waitingScreen);
      return;
    }

    if (room.status === "playing") {
      showScreen(gameScreen);
    }
  });
}

async function cancelOrLeaveRoom() {
  if (!roomId) return;
  await remove(ref(db, `rooms/${roomId}`));
  roomId = null;
  playerRole = null;
  roomUnsubscribeActive = false;
  showScreen(lobbyScreen);
  showMessage("");
}

createRoomBtn?.addEventListener("click", async () => {
  const name = getName();
  if (!name) return;
  playerName = name;
  showMessage("");
  await createRoom();
});

joinRoomBtn?.addEventListener("click", async () => {
  const name = getName();
  if (!name) return;

  const code = roomCodeInput.value.trim();
  if (!code) {
    showMessage("Enter room code.");
    return;
  }

  playerName = name;
  showMessage("");
  await joinRoom(code);
});

cancelRoomBtn?.addEventListener("click", cancelOrLeaveRoom);
leaveRoomBtn?.addEventListener("click", cancelOrLeaveRoom);