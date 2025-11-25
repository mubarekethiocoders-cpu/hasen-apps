import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  signInWithPopup,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
  browserLocalPersistence,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  onSnapshot,
  getDoc,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// Your Firebase Configuration (Keep this as is)
const firebaseConfig = {
  apiKey: "AIzaSyBUhcN9oviRFxFyYi27Hg9MxtaE0gJy4q4",
  authDomain: "loginregister01-51805.firebaseapp.com",
  projectId: "loginregister01-51805",
  storageBucket: "loginregister01-51805.firebasestorage.app",
  messagingSenderId: "605068863596",
  appId: "1:605068863596:web:c1048d32fdfaefa0041049",
};

// 1. Initialize Firebase App
const app = initializeApp(firebaseConfig);

// 2. Get Auth instance and Google Provider
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// 3. Initialize Firestore
const db = getFirestore(app);

// ===============================================
// CORE BINGO GAME FUNCTIONS (UNCHANGED LOGIC)
// ===============================================

function checkBingo(board, calledNumbers) {
  // Rows
  for (let i = 0; i < 25; i += 5) {
    if ([0, 1, 2, 3, 4].every((j) => calledNumbers.includes(board[i + j])))
      return true;
  }
  // Columns
  for (let i = 0; i < 5; i++) {
    if ([0, 5, 10, 15, 20].every((j) => calledNumbers.includes(board[i + j])))
      return true;
  }
  // Diagonals
  if ([0, 6, 12, 18, 24].every((index) => calledNumbers.includes(board[index])))
    return true;
  if ([4, 8, 12, 16, 20].every((index) => calledNumbers.includes(board[index])))
    return true;

  return false;
}

async function handleBingoClaim(lobbyId) {
  const user = auth.currentUser;
  if (!user) {
    alert("Please sign in to claim a Bingo.");
    return;
  }

  const lobbyRef = doc(db, "lobbies", lobbyId);
  try {
    const lobbyDoc = await getDoc(lobbyRef);
    if (!lobbyDoc.exists()) {
      alert("Lobby not found!");
      return;
    }

    const lobby = lobbyDoc.data();
    const calledNumbers = lobby.calledNumbers;
    const playerBoard = lobby.players?.[user.uid]?.board;

    if (!playerBoard) {
      alert("Error: Your board state is missing. Did you join the game?");
      return;
    }

    if (checkBingo(playerBoard, calledNumbers)) {
      await updateDoc(lobbyRef, {
        winnerUID: user.uid,
        status: "finished",
      });
      alert("Bingo claimed! You are the winner!");
    } else {
      alert("No Bingo found. Keep playing!");
    }
  } catch (error) {
    console.error("Error claiming bingo:", error);
    alert("Failed to claim bingo. Check console.");
  }
}

async function callNextNumber(lobbyId) {
  const user = auth.currentUser;
  if (!user) {
    alert("Please sign in.");
    return;
  }

  const lobbyRef = doc(db, "lobbies", lobbyId);
  try {
    const lobbySnap = await getDoc(lobbyRef);
    if (!lobbySnap.exists()) {
      alert("Lobby not found.");
      return;
    }
    const lobbyData = lobbySnap.data();
    if (user.uid !== lobbyData.hostUID) {
      alert("Only the host can call a number.");
      return;
    }

    const calledNumbers = lobbyData.calledNumbers || [];
    let availableNumbers = Array.from({ length: 25 }, (_, i) => i + 1).filter(
      (n) => !calledNumbers.includes(n)
    );

    if (availableNumbers.length === 0) {
      alert("All numbers have been called!");
      return;
    }

    const nextNumber =
      availableNumbers[Math.floor(Math.random() * availableNumbers.length)];

    await updateDoc(lobbyRef, {
      calledNumbers: [...calledNumbers, nextNumber],
    });
  } catch (error) {
    console.error("Error calling next number:", error);
    alert("Error calling number. Check console and security rules.");
  }
}

function initializeLobby() {
  const urlParams = new URLSearchParams(window.location.search);
  const lobbyId = urlParams.get("lobbyId");

  const messageEl = document.getElementById("message");
  const bingoBoard = document.getElementById("bingo-board");
  const callButton = document.getElementById("call-number-button");
  const claimButton = document.getElementById("claim-bingo-button");
  const calledNumberEl = document.getElementById("called-number"); // 🎯 NEW: Last called number element
  const calledNumbersListEl = document.getElementById("called-numbers-list"); // 🎯 NEW: List container

  if (
    !messageEl ||
    !bingoBoard ||
    !callButton ||
    !claimButton ||
    !calledNumberEl ||
    !calledNumbersListEl
  ) {
    console.warn(
      "Lobby initialization failed: Missing required UI elements. Are you on lobby.html?"
    );
    return;
  }

  if (!lobbyId) {
    messageEl.textContent = "Error: Lobby ID is missing from URL.";
    return;
  }

  const lobbyRef = doc(db, "lobbies", lobbyId);
  messageEl.textContent = "Connecting to lobby...";

  onSnapshot(
    lobbyRef,
    (docSnapshot) => {
      const user = auth.currentUser;

      if (!user) {
        messageEl.textContent =
          "Lobby is loading, waiting for user authentication...";
        return;
      }

      if (!docSnapshot.exists()) {
        messageEl.textContent = `Lobby "${lobbyId}" not found or deleted.`;
        callButton.style.display = "none";
        claimButton.style.display = "none";
        return;
      }

      const lobby = docSnapshot.data();
      const calledNumbers = lobby.calledNumbers || [];
      const playerBoard = lobby.players?.[user.uid]?.board || [];
      const isHost = user && user.uid === lobby.hostUID;

      // CHECK IF PLAYER HAS JOINED
      if (playerBoard.length === 0) {
        messageEl.innerHTML = `Lobby Found! You are not yet a player. <button onclick="window.joinGame('${lobbyId}')">Join Game</button>`;
        bingoBoard.innerHTML = "";
        callButton.style.display = "none";
        claimButton.style.display = "none";
        return;
      }

      // Update Visibility and Status
      callButton.style.display = isHost ? "block" : "none";
      claimButton.style.display = user ? "block" : "none";

      // 🎯 RENDER CALLED NUMBERS AND STATUS
      const lastCalled =
        calledNumbers.length > 0
          ? calledNumbers[calledNumbers.length - 1]
          : "—";

      calledNumberEl.textContent = lastCalled;

      // Render the list of all called numbers
      calledNumbersListEl.innerHTML = calledNumbers
        .map((n) => `<span class="called-list-item">${n}</span>`)
        .join("");

      if (lobby.status === "finished" && lobby.winnerUID) {
        messageEl.innerHTML = `🏆 **GAME OVER!** Winner: ${
          lobby.players?.[lobby.winnerUID]?.displayName || "Unknown User"
        }`;
      } else if (lobby.status === "waiting") {
        messageEl.innerHTML = `Waiting for players... (${
          Object.keys(lobby.players || {}).length
        })`;
      } else {
        messageEl.innerHTML = `Game in progress. Called: ${calledNumbers.length}/25.`;
      }

      // Render Board
      bingoBoard.innerHTML = "";
      playerBoard.forEach((num) => {
        const cell = document.createElement("div");
        cell.className = "bingo-cell";
        cell.textContent = num;
        if (calledNumbers.includes(num)) {
          cell.classList.add("called");
        }
        bingoBoard.appendChild(cell);
      });
    },
    (error) => {
      console.error("Firestore snapshot error:", error);
      messageEl.textContent = `Error loading lobby: ${error.message}. Check console & Firebase rules.`;
      callButton.style.display = "none";
      claimButton.style.display = "none";
    }
  );

  // Attach Event Listeners
  callButton.onclick = () => callNextNumber(lobbyId);
  claimButton.onclick = () => handleBingoClaim(lobbyId);
}

// ===============================================
// GAME LISTING FUNCTIONS (UNCHANGED)
// ===============================================

window.listAvailableGames = function () {
  const listEl = document.getElementById("game-list");
  if (!listEl) return;

  listEl.innerHTML = "Loading available games...";

  const q = query(collection(db, "lobbies"), where("status", "==", "waiting"));

  onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        listEl.innerHTML =
          "No games currently waiting for players. Start a new one!";
        return;
      }

      let html = "<ul>";
      snapshot.docs.forEach((doc) => {
        const lobbyId = doc.id;
        const lobby = doc.data();
        const playerCount = Object.keys(lobby.players || {}).length;
        const host =
          lobby.players?.[lobby.hostUID]?.displayName || "Unknown Host";

        html += `
                <li>
                    Lobby ID: <strong>${lobbyId}</strong> (Host: ${host}) 
                    <button class="join-btn" onclick="window.joinGame('${lobbyId}')">Join (${playerCount} player${
          playerCount !== 1 ? "s" : ""
        })</button>
                </li>
            `;
      });
      html += "</ul>";
      listEl.innerHTML = html;
    },
    (error) => {
      console.error("Error listing games:", error);
      listEl.innerHTML = `Error loading list: ${error.message}`;
    }
  );
};

// ... existing functions (e.g., checkBingo, handleBingoClaim, etc.)

// ===============================================
// 🎯 NEW: PROFILE PAGE FUNCTIONS
// ===============================================

function initializeProfilePage() {
  const user = auth.currentUser;
  const detailsEl = document.getElementById("profile-details");

  if (!detailsEl) {
    console.warn(
      "Profile initialization failed: Missing required UI element #profile-details."
    );
    return;
  }

  if (user) {
    const photoURL =
      user.photoURL ||
      "https://via.placeholder.com/100/1a1a2e/e0e0e0?text=NO+IMAGE";
    const email = user.email || "N/A";
    const creationTime = user.metadata.creationTime
      ? new Date(user.metadata.creationTime).toLocaleDateString()
      : "N/A";

    detailsEl.innerHTML = `
            <img id="profile-photo" src="${photoURL}" alt="${user.displayName}'s Profile Photo">
            <div class="profile-detail">
                <strong>Display Name:</strong> ${user.displayName}
            </div>
            <div class="profile-detail">
                <strong>Email:</strong> ${email}
            </div>
            <div class="profile-detail">
                <strong>User ID (UID):</strong> ${user.uid}
            </div>
            <div class="profile-detail">
                <strong>Account Created:</strong> ${creationTime}
            </div>
            <div class="profile-detail">
                <strong>Auth Provider:</strong> Google
            </div>
        `;
  } else {
    detailsEl.innerHTML = `
            <p style="text-align: center;">You must be signed in to view your profile.</p>
            <button class="logout-btn" onclick="window.loginGoogle()">Sign in with Google</button>
        `;
  }
}

// ... rest of the existing code ...

// ===============================================
// AUTH/GENERAL GAME FUNCTIONS (UNCHANGED LOGIC)
// ===============================================

window.createGame = async function () {
  const user = auth.currentUser;
  if (!user) {
    alert("Please sign in to create a game.");
    return;
  }

  const numbers = Array.from({ length: 25 }, (_, i) => i + 1);
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }

  try {
    const lobbyRef = await addDoc(collection(db, "lobbies"), {
      status: "waiting",
      hostUID: user.uid,
      players: {
        [user.uid]: { displayName: user.displayName, board: numbers },
      },
      calledNumbers: [],
      winnerUID: null,
    });

    const lobbyId = lobbyRef.id;
    alert(`Game created! Share this code: ${lobbyId}`);
    window.location.href = `lobby.html?lobbyId=${lobbyId}`;
  } catch (error) {
    console.error("Error creating lobby:", error);
    alert(
      "Failed to create game. Check console for Firebase security rule errors."
    );
  }
};

window.joinGame = async function (lobbyId) {
  const user = auth.currentUser;
  if (!user) {
    alert("Please sign in to join a game.");
    return;
  }

  const lobbyRef = doc(db, "lobbies", lobbyId);

  const numbers = Array.from({ length: 25 }, (_, i) => i + 1);
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }

  try {
    await updateDoc(lobbyRef, {
      [`players.${user.uid}`]: {
        displayName: user.displayName,
        board: numbers,
      },
    });

    window.location.href = `lobby.html?lobbyId=${lobbyId}`;
  } catch (error) {
    console.error("Error joining lobby:", error);
    alert(
      "Failed to join game. Check console for Firebase security rule errors."
    );
  }
};

window.joinGameFromInput = function () {
  const lobbyId = document.getElementById("lobby-id-input").value.trim();

  if (lobbyId) {
    window.joinGame(lobbyId);
  } else {
    alert("Please enter a valid Lobby ID.");
  }
};

function displayUserDetails(user) {
  const messageEl = document.getElementById("message");
  if (messageEl) {
    // 🎯 MODIFIED: Wrap the user's name in an anchor tag to a new profile.html
    messageEl.innerHTML =
      `<p class="welcome-message">Logged in as 
        <a href="profile.html" class="profile-link">
          <strong>${user.displayName}</strong>
        </a>
      </p>` +
      '<button class="create-btn" onclick="window.createGame()">Create New Game</button>';
  }
  // ... rest of the function (no change needed here)
  const loginBtn = document.querySelector('button[onclick="loginGoogle()"]');
  if (loginBtn) {
    loginBtn.style.display = "none";
  }

  if (document.getElementById("game-list")) {
    window.listAvailableGames();
  }
}

function displayLoggedOut() {
  const messageEl = document.getElementById("message");
  if (messageEl) {
    messageEl.innerHTML = "Please sign in with Google to play.";
  }
  const loginBtn = document.querySelector('button[onclick="loginGoogle()"]');
  if (loginBtn) {
    loginBtn.style.display = "block";
  }
}

async function handleRedirectSignIn() {
  try {
    const result = await getRedirectResult(auth);
    if (result) {
      const user = result.user;
      console.log("User signed in via redirect:", user.displayName);

      displayUserDetails(user);

      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("lobbyId")) {
        initializeLobby();
      }
    }
  } catch (error) {
    console.error("Redirect sign in error:", error);
    document.getElementById("message").innerHTML =
      "Sign in error: " +
      error.message +
      ". Check Firebase Authorized Domains.";
  }
}

handleRedirectSignIn();

// ... existing code ...

// REMOVE: let authChecked = false;

onAuthStateChanged(auth, (user) => {
  // REMOVE: if (!authChecked) {
  // REMOVE: authChecked = true;

  const urlParams = new URLSearchParams(window.location.search);
  const lobbyId = urlParams.get("lobbyId");
  const isProfilePage = window.location.pathname.endsWith("profile.html");

  if (isProfilePage) {
    // Always update the profile page state
    initializeProfilePage();
  } else if (lobbyId) {
    // Always update the lobby state
    initializeLobby();
  } else if (user) {
    // User is definitely logged in -> Show User UI
    displayUserDetails(user);
  } else {
    // User is definitely logged out -> Show Login Button
    displayLoggedOut();
  }
  // REMOVE: }
});

window.loginGoogle = async function () {
  try {
    await setPersistence(auth, browserLocalPersistence);
    //   await setPersistence(auth, browserSessionPersistence);
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error("Sign in failed:", error);
    document.getElementById("message").innerHTML =
      "Sign in failed: " + error.message;
  }
};

// 🎯 NEW: Sign Out function
window.logout = async function () {
  try {
    await signOut(auth);
    // Redirect to main page after sign out
    window.location.href = "index.html";
  } catch (error) {
    console.error("Logout failed:", error);
    alert("Logout failed: " + error.message);
  }
};
