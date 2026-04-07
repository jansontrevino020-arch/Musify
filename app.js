// --- Service worker registration ---
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/Musify/sw.js");
}

// --- IndexedDB setup ---
const DB_NAME = "musify-db";
const DB_VERSION = 1;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("tracks")) {
        const store = db.createObjectStore("tracks", { keyPath: "id", autoIncrement: true });
        store.createIndex("album", "album", { unique: false });
      }
    };

    req.onsuccess = event => {
      db = event.target.result;
      resolve(db);
    };

    req.onerror = () => reject(req.error);
  });
}

function addTrack(track) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("tracks", "readwrite");
    const store = tx.objectStore("tracks");
    const req = store.add(track);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllTracks() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("tracks", "readonly");
    const store = tx.objectStore("tracks");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// --- UI elements ---
const importBtn = document.getElementById("importBtn");
const albumGrid = document.getElementById("albumGrid");
const nowPlayingTitle = document.getElementById("nowPlayingTitle");
const nowPlayingAlbum = document.getElementById("nowPlayingAlbum");
const playPauseBtn = document.getElementById("playPauseBtn");

// --- Audio engine ---
const audio = new Audio();
let currentTrack = null;
let currentObjectUrl = null;

playPauseBtn.addEventListener("click", () => {
  if (!currentTrack) return;
  if (audio.paused) {
    audio.play();
    playPauseBtn.textContent = "Pause";
  } else {
    audio.pause();
    playPauseBtn.textContent = "Play";
  }
});

audio.addEventListener("ended", () => {
  playPauseBtn.textContent = "Play";
});

// --- Render library ---
function renderLibrary(tracks) {
  const albums = {};

  tracks.forEach(t => {
    if (!albums[t.album]) albums[t.album] = [];
    albums[t.album].push(t);
  });

  albumGrid.innerHTML = "";

  Object.keys(albums).forEach(albumName => {
    const card = document.createElement("div");
    card.className = "album-card";

    const title = document.createElement("div");
    title.className = "album-title";
    title.textContent = albumName || "Unknown Album";

    const artist = document.createElement("div");
    artist.className = "album-artist";
    artist.textContent = "Local Files";

    const trackList = document.createElement("ul");
    trackList.className = "track-list";

    albums[albumName].forEach(track => {
      const li = document.createElement("li");
      li.className = "track-item";
      li.textContent = track.name;
      li.addEventListener("click", () => playTrack(track));
      trackList.appendChild(li);
    });

    card.appendChild(title);
    card.appendChild(artist);
    card.appendChild(trackList);
    albumGrid.appendChild(card);
  });
}

// --- Play a track ---
async function playTrack(track) {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }

  const blob = track.blob;
  const url = URL.createObjectURL(blob);
  currentObjectUrl = url;
  currentTrack = track;

  audio.src = url;
  await audio.play();

  nowPlayingTitle.textContent = track.name;
  nowPlayingAlbum.textContent = track.album || "Unknown Album";
  playPauseBtn.disabled = false;
  playPauseBtn.textContent = "Pause";
}

// --- ZIP import ---
importBtn.addEventListener("click", async () => {
  try {
    const fileHandles = await window.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: "ZIP File",
          accept: { "application/zip": [".zip"] }
        }
      ]
    });

    const zipHandle = fileHandles[0];
    const zipFile = await zipHandle.getFile();

    const zip = await JSZip.loadAsync(zipFile);

    const audioExtensions = [".mp3", ".wav", ".ogg", ".flac", ".m4a"];
    const newTracks = [];

    for (const path in zip.files) {
      const entry = zip.files[path];
      if (entry.dir) continue;

      const lower = entry.name.toLowerCase();
      const isAudio = audioExtensions.some(ext => lower.endsWith(ext));
      if (!isAudio) continue;

      const parts = entry.name.split("/");
      const albumName = parts.length > 1 ? parts[parts.length - 2] : "Unknown Album";
      const trackName = parts[parts.length - 1];

      const fileData = await entry.async("blob");

      const trackObj = {
        name: trackName,
        album: albumName,
        blob: fileData
      };

      const id = await addTrack(trackObj);
      trackObj.id = id;
      newTracks.push(trackObj);
    }

    const allTracks = await getAllTracks();
    renderLibrary(allTracks);
  } catch (err) {
    console.error("ZIP import failed:", err);
  }
});

// --- Init ---
(async () => {
  await openDB();
  const tracks = await getAllTracks();
  renderLibrary(tracks);
})();