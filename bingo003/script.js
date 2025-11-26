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
  setDoc,
  runTransaction,
  increment,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// Your Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBUhcN9oviRFxFyYi27Hg9MxtaE0gJy4q4",
  authDomain: "loginregister01-51805.firebaseapp.com",
  projectId: "loginregister01-51805",
  storageBucket: "loginregister01-51805.firebasestorage.app",
  messagingSenderId: "605068863596",
  appId: "1:605068863596:web:c1048d32fdfaefa0041049",
};

// 1. Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app);

// ===============================================
// 💰 ECONOMY & USER FUNCTIONS
// ===============================================

async function ensureUserProfile(user) {
  const userRef = doc(db, "users", user.uid);
  try {
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        balance: 1000,
        createdAt: new Date(),
      });
      console.log("Created new user profile with 1000 coins.");
    }
  } catch (e) {
    console.error("Error creating user profile:", e);
  }
}

// ===============================================
// CORE BINGO GAME FUNCTIONS (UNCHANGED)
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
    alert("Please sign in.");
    return;
  }

  const lobbyRef = doc(db, "lobbies", lobbyId);
  const userRef = doc(db, "users", user.uid);

  try {
    await runTransaction(db, async (transaction) => {
      const lobbyDoc = await transaction.get(lobbyRef);
      if (!lobbyDoc.exists()) throw "Lobby not found!";

      const lobby = lobbyDoc.data();

      // Validation
      if (lobby.status === "finished") throw "Game is already finished!";
      const playerBoard = lobby.players?.[user.uid]?.board;
      if (!playerBoard) throw "You are not a player in this game.";

      // Check Logic
      if (!checkBingo(playerBoard, lobby.calledNumbers || [])) {
        throw "Bad Bingo! You don't have a winning line yet.";
      }

      // Calculate Pot
      const stake = lobby.stake || 0;
      const playerCount = Object.keys(lobby.players).length;
      const totalPot = stake * playerCount;

      // Get Winner's Current Balance
      const winnerDoc = await transaction.get(userRef);
      if (!winnerDoc.exists()) throw "User profile missing.";
      const currentBalance = winnerDoc.data().balance || 0;

      // Update Winner Balance
      transaction.update(userRef, {
        balance: currentBalance + totalPot,
      });

      // Update Lobby Status
      transaction.update(lobbyRef, {
        winnerUID: user.uid,
        status: "finished",
        winningPot: totalPot,
      });

      return totalPot;
    }).then((pot) => {
      alert(`🎉 BINGO! You won the pot of ${pot} coins!`);
    });
  } catch (error) {
    console.error("Claim Error:", error);
    alert(
      typeof error === "string" ? error : "Transaction failed: " + error.message
    );
  }
}

async function callNextNumber(lobbyId) {
  const user = auth.currentUser;
  if (!user) return;

  const lobbyRef = doc(db, "lobbies", lobbyId);
  try {
    const lobbySnap = await getDoc(lobbyRef);
    if (!lobbySnap.exists()) return;

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
  }
}

function initializeLobby() {
  const urlParams = new URLSearchParams(window.location.search);
  const lobbyId = urlParams.get("lobbyId");

  const messageEl = document.getElementById("message");
  const bingoBoard = document.getElementById("bingo-board");
  const callButton = document.getElementById("call-number-button");
  const claimButton = document.getElementById("claim-bingo-button");
  const calledNumberEl = document.getElementById("called-number");
  const calledNumbersListEl = document.getElementById("called-numbers-list");

  if (!messageEl || !bingoBoard) return;
  if (!lobbyId) {
    messageEl.textContent = "Error: Lobby ID missing.";
    return;
  }

  const lobbyRef = doc(db, "lobbies", lobbyId);
  messageEl.textContent = "Connecting...";

  onSnapshot(
    lobbyRef,
    (docSnapshot) => {
      const user = auth.currentUser;
      if (!user) {
        messageEl.textContent = "Waiting for login...";
        return;
      }
      updateHeader(user.uid);
      if (!docSnapshot.exists()) {
        messageEl.textContent = "Lobby not found.";
        return;
      }

      const lobby = docSnapshot.data();
      const calledNumbers = lobby.calledNumbers || [];
      const playerBoard = lobby.players?.[user.uid]?.board || [];
      const isHost = user.uid === lobby.hostUID;

      // 💰 Calculate Pot Info
      const stake = lobby.stake || 0;
      const playerCount = Object.keys(lobby.players || {}).length;
      const currentPot = stake * playerCount;

      // Handle Not Joined
      if (playerBoard.length === 0) {
        // Show Stake in Join Button
        messageEl.innerHTML = `
            <div>Pot: <strong>${currentPot}</strong> (Stake: ${stake})</div>
            <button onclick="window.joinGame('${lobbyId}')">
                Pay ${stake} Coins to Join
            </button>`;
        bingoBoard.innerHTML = "";
        callButton.style.display = "none";
        claimButton.style.display = "none";
        return;
      }

      callButton.style.display = isHost ? "block" : "none";
      claimButton.style.display = "block";

      // Render Last Called
      calledNumberEl.textContent =
        calledNumbers.length > 0
          ? calledNumbers[calledNumbers.length - 1]
          : "—";
      calledNumbersListEl.innerHTML = calledNumbers
        .map((n) => `<span class="called-list-item">${n}</span>`)
        .join("");

      // Status Message
      if (lobby.status === "finished" && lobby.winnerUID) {
        const winnerName =
          lobby.players?.[lobby.winnerUID]?.displayName || "Unknown";
        messageEl.innerHTML = `🏆 <strong>${winnerName}</strong> WON ${
          lobby.winningPot || currentPot
        } Coins!`;
      } else {
        messageEl.innerHTML = `
            <div>💰 Pot: <span style="color:#ffdd44">${currentPot}</span> (Entry: ${stake})</div>
            <div>Players: ${playerCount} | Called: ${calledNumbers.length}/25</div>
        `;
      }

      // Render Board
      bingoBoard.innerHTML = "";
      playerBoard.forEach((num) => {
        const cell = document.createElement("div");
        cell.className = "bingo-cell";
        cell.textContent = num;
        if (calledNumbers.includes(num)) cell.classList.add("called");
        bingoBoard.appendChild(cell);
      });
    },
    (error) => console.error("Lobby error:", error)
  );

  callButton.onclick = () => callNextNumber(lobbyId);
  claimButton.onclick = () => handleBingoClaim(lobbyId);
}

// ===============================================
// GAME LISTING & CREATION (UNCHANGED)
// ===============================================

window.listAvailableGames = function () {
  const listEl = document.getElementById("game-list");
  if (!listEl) return;
  listEl.innerHTML = "Loading...";

  const q = query(collection(db, "lobbies"), where("status", "==", "waiting"));

  onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      listEl.innerHTML = "No games waiting. Start one!";
      return;
    }
    let html = "<ul>";
    snapshot.docs.forEach((doc) => {
      const lobby = doc.data();
      const count = Object.keys(lobby.players || {}).length;
      const stake = lobby.stake || 0;
      const host = lobby.players?.[lobby.hostUID]?.displayName || "Host";

      html += `
            <li>
                <div style="flex-grow:1">
                    <strong>Stake: ${stake} 💰</strong><br>
                    <small>Host: ${host} | ID: ${doc.id}</small>
                </div>
                <button class="join-btn" onclick="window.joinGame('${doc.id}')">
                    Join (-${stake})
                </button>
            </li>`;
    });
    html += "</ul>";
    listEl.innerHTML = html;
  });
};

// 💰 CREATE GAME WITH STAKE DEDUCTION
window.createGame = async function () {
  const user = auth.currentUser;
  if (!user) {
    alert("Sign in first.");
    return;
  }

  const stakeInput = prompt("Enter entry fee (Stake) per player:", "50");
  const stake = parseInt(stakeInput);
  if (isNaN(stake) || stake < 0) {
    alert("Invalid stake.");
    return;
  }

  const numbers = Array.from({ length: 25 }, (_, i) => i + 1).sort(
    () => Math.random() - 0.5
  );

  try {
    await runTransaction(db, async (transaction) => {
      // 1. Check User Balance
      const userRef = doc(db, "users", user.uid);
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists()) throw "User profile missing.";

      const balance = userDoc.data().balance || 0;
      if (balance < stake)
        throw `Insufficient funds! You have ${balance} coins.`;

      // 2. Deduct Balance
      transaction.update(userRef, { balance: balance - stake });

      // 3. Create Lobby
      const newLobbyRef = doc(collection(db, "lobbies"));
      transaction.set(newLobbyRef, {
        status: "waiting",
        hostUID: user.uid,
        stake: stake, // Store stake
        players: {
          [user.uid]: { displayName: user.displayName, board: numbers },
        },
        calledNumbers: [],
        winnerUID: null,
        createdAt: new Date(),
      });

      return newLobbyRef.id;
    }).then((id) => {
      window.location.href = `lobby.html?lobbyId=${id}`;
    });
  } catch (error) {
    console.error(error);
    alert(typeof error === "string" ? error : "Creation failed.");
  }
};

// 💰 JOIN GAME WITH STAKE DEDUCTION
window.joinGame = async function (lobbyId) {
  const user = auth.currentUser;
  if (!user) {
    alert("Sign in first.");
    return;
  }

  const lobbyRef = doc(db, "lobbies", lobbyId);
  const userRef = doc(db, "users", user.uid);

  const numbers = Array.from({ length: 25 }, (_, i) => i + 1).sort(
    () => Math.random() - 0.5
  );

  try {
    await runTransaction(db, async (transaction) => {
      const lobbyDoc = await transaction.get(lobbyRef);
      const userDoc = await transaction.get(userRef);

      if (!lobbyDoc.exists()) throw "Lobby not found.";
      const lobby = lobbyDoc.data();

      if (lobby.players && lobby.players[user.uid]) return; // Already joined

      const stake = lobby.stake || 0;
      const balance = userDoc.exists() ? userDoc.data().balance : 0;

      if (balance < stake) throw `Insufficient funds! Need ${stake} coins.`;

      // 1. Deduct Stake
      transaction.update(userRef, { balance: balance - stake });

      // 2. Add Player
      const updatedPlayers = lobby.players || {};
      updatedPlayers[user.uid] = {
        displayName: user.displayName,
        board: numbers,
      };
      transaction.update(lobbyRef, { players: updatedPlayers });
    });
    window.location.href = `lobby.html?lobbyId=${lobbyId}`;
  } catch (error) {
    console.error(error);
    alert(
      "Join failed: " + (typeof error === "string" ? error : error.message)
    );
  }
};

window.joinGameFromInput = function () {
  const val = document.getElementById("lobby-id-input").value.trim();
  if (val) window.joinGame(val);
};

// ===============================================
// PROFILE & AUTH
// ===============================================

function initializeProfilePage() {
  const user = auth.currentUser;
  const detailsEl = document.getElementById("profile-details");
  if (!detailsEl) return;

  if (user) {
    updateHeader(user.uid);
    onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const created = user.metadata.creationTime
          ? new Date(user.metadata.creationTime).toLocaleDateString()
          : "N/A";

        detailsEl.innerHTML = `
                <img id="profile-photo" src="${
                  data.photoURL || "https://via.placeholder.com/100"
                }" alt="Photo">
                <div class="profile-detail">
                    <strong>💰 Balance:</strong> 
                    <span style="color: #ffdd44; font-size: 1.4em; font-weight:bold;">${
                      data.balance
                    } Coins</span>
                </div>
                <div class="profile-detail"><strong>✍️ Name:</strong> ${
                  data.displayName
                }</div>
                <div class="profile-detail"><strong>🔔 Email:</strong> ${
                  data.email
                }</div>
                <div class="profile-detail"><strong>🔑 UID:</strong> ${
                  user.uid
                }</div>
              `;
      }
    });
  } else {
    detailsEl.innerHTML = `<button class="logout-btn" onclick="window.loginGoogle()">Sign in</button>`;
  }
}

/**
 * MODIFIED: Handles the new header structure (Balance, Sign Out, Profile Pic)
 * and the new welcome message in the body (#message div).
 */
function displayUserDetails(user) {
  // Target the elements for the new header structure
  const balanceEl = document.getElementById("header-balance-display");
  const signoutBtn = document.getElementById("header-signout-btn");
  const profileImgEl = document.getElementById("profile-icon-img");

  // Target the main message area for the welcome/create game prompt
  const messageEl = document.getElementById("message");

  if (!messageEl || !balanceEl || !signoutBtn || !profileImgEl) return;

  // Ensure the elements are visible when logged in
  signoutBtn.style.display = "inline-block";
  profileImgEl.style.display = "block";

  // Listen to the user's document for real-time balance and photo updates
  onSnapshot(doc(db, "users", user.uid), (docSnap) => {
    const balance = docSnap.exists() ? docSnap.data().balance : "...";
    const photoURL = docSnap.exists() ? docSnap.data().photoURL : user.photoURL;

    // 1. Update Header Bar (Navbar) elements
    balanceEl.textContent = `Balance: ${balance} 💰`;

    // Set Profile Picture, using a grey placeholder SVG as fallback if none
    profileImgEl.src =
      photoURL ||
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="%23666"><path clip-rule="evenodd" fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a.75.75 0 01.75-.75h.25a.75.75 0 01.75.75v.25a.75.75 0 01-.75.75H13a.75.75 0 01-.75-.75V7.5zm-3 0a.75.75 0 01.75-.75h.25a.75.75 0 01.75.75v.25a.75.75 0 01-.75.75H10a.75.75 0 01-.75-.75V7.5zm-3 0a.75.75 0 01.75-.75h.25a.75.75 0 01.75.75v.25a.75.75 0 01-.75.75H7a.75.75 0 01-.75-.75V7.5zM4 14.75a.75.75 0 01.75-.75h10.5a.75.75 0 01.75.75v.25a1.5 1.5 0 01-1.5 1.5h-8.5a1.5 1.5 0 01-1.5-1.5v-.25z"></path></svg>';

    // 2. Update Message Div (Body Content)
    messageEl.innerHTML = `
      <p style="margin-top:0; font-size: 1.1em; font-weight: 600;">
          Welcome ${user.displayName}! Create a new game here or join one below.
      </p>
      <button class="create-game-body-btn" onclick="window.createGame()">
          Create Game 💰
      </button>
    `;

    // Ensure games are listed
    if (document.getElementById("game-list")) window.listAvailableGames();
  });
}

function displayLoggedOut() {
  // Target new header elements to hide/clear them
  const balanceEl = document.getElementById("header-balance-display");
  const signoutBtn = document.getElementById("header-signout-btn");
  const profileImgEl = document.getElementById("profile-icon-img");

  if (balanceEl) balanceEl.textContent = "";
  if (signoutBtn) signoutBtn.style.display = "none";
  if (profileImgEl) profileImgEl.style.display = "none";

  // Show Sign-in prompt in the main body message area
  const msg = document.getElementById("message");
  if (msg) {
    msg.innerHTML = `
        <p style="margin-top:0; font-size: 1.1em; font-weight: 600;">Welcome to Bingo Hub! Sign in to join the action.</p>
        <button onclick="window.loginGoogle()">Sign in with Google</button>
    `;
  }

  // Clear the game list
  const listEl = document.getElementById("game-list");
  if (listEl) listEl.innerHTML = "Sign in to view active games.";
}

// Global Auth Listener (Keep this section)
onAuthStateChanged(auth, async (user) => {
  if (user) await ensureUserProfile(user); // Make sure 'users' doc exists

  const urlParams = new URLSearchParams(window.location.search);
  if (window.location.pathname.endsWith("profile.html")) {
    initializeProfilePage();
  } else if (window.location.pathname.endsWith("deposit.html")) {
    initializeDeposit();
  } else if (urlParams.get("lobbyId")) {
    initializeLobby();
  } else if (user) {
    displayUserDetails(user); // Calls the updated function
  } else {
    displayLoggedOut();
  }
});

// Login/Logout (unchanged)
window.loginGoogle = async () => {
  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithPopup(auth, googleProvider);
  } catch (e) {
    console.error(e);
  }
};

window.logout = async () => {
  await signOut(auth);
  window.location.href = "index.html";
};

window.initializeDeposit = function () {
  const user = auth.currentUser;
  if (!user) return;
  const balanceEl = document.getElementById("header-balance-display");
  const balanceDisplay = document.getElementById("balance-display");
  onSnapshot(doc(db, "users", user.uid), (snap) => {
    const data = snap.data();
    if (data) {
      if (balanceEl) balanceEl.textContent = `Balance: ${data.balance} 💰`;
      if (balanceDisplay)
        balanceDisplay.textContent = `Current Balance: ${data.balance} Coins`;
    }
  });
};
window.addDeposit = async () => {
  const amountEl = document.getElementById("amount-input");
  const amount = parseFloat(amountEl ? amountEl.value : 100);
  const user = auth.currentUser;
  if (!user || amount <= 0) {
    alert("Please log in and enter a valid amount.");
    return;
  }
  try {
    await updateDoc(doc(db, "users", user.uid), { balance: increment(amount) });
    alert(`Deposited ${amount} coins! Balance updated.`);
    if (amountEl) amountEl.value = "";
  } catch (e) {
    alert("Deposit failed: " + e.message);
  }
};
window.updateHeader = function (userUid) {
  const balanceEl = document.getElementById("header-balance-display");
  const signoutBtn = document.getElementById("header-signout-btn");
  const profileImgEl = document.getElementById("profile-icon-img");
  if (signoutBtn) signoutBtn.style.display = "inline-block";
  if (profileImgEl) profileImgEl.style.display = "block";
  if (balanceEl) {
    onSnapshot(doc(db, "users", userUid), (snap) => {
      const data = snap.data();
      if (data) {
        balanceEl.textContent = `Balance: ${data.balance} 💰`;
        if (profileImgEl) profileImgEl.src = data.photoURL || profileImgEl.src;
      }
    });
  }
};
