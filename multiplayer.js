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

let playerName = "";
let roomId = null;
let playerRole = null;
let roomListenerAttached = false;

function showScreen(screen) {
  lobbyScreen?.classList.add("hidden");
  waitingScreen?.classList.add("hidden");
  gameScreen?.classList.add("hidden");
  screen?.classList.remove("hidden");
}

function showMessage(msg) {
  if (lobbyMessage) lobbyMessage.textContent = msg || "";
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
    turn: null,
    phase: "waiting",
    round: 1,
    dice: null,
    movesRemaining: 0,
    blockedTiles: [],
    winner: null,
    toss: {
      shown: false,
      result: null
    },
    players: {
      p1: {
        name: playerName,
        row: 0,
        col: 0,
        connected: true
      },
      p2: {
        name: "",
        row: 7,
        col: 7,
        connected: false
      }
    },
    createdAt: Date.now()
  });

  localStorage.setItem("roomId", roomId);
  localStorage.setItem("playerRole", playerRole);
  localStorage.setItem("playerName", playerName);

  window.location.href = "/";
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
    phase: "toss",
    "players/p2": {
      name: playerName,
      row: 7,
      col: 7,
      connected: true
    }
  });

  localStorage.setItem("roomId", roomId);
  localStorage.setItem("playerRole", playerRole);
  localStorage.setItem("playerName", playerName);

  window.location.href = "/";
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

cancelRoomBtn?.addEventListener("click", async () => {
  if (!roomId) return;
  await remove(ref(db, `rooms/${roomId}`));
  localStorage.removeItem("roomId");
  localStorage.removeItem("playerRole");
  localStorage.removeItem("playerName");
  showScreen(lobbyScreen);
  showMessage("");
});
