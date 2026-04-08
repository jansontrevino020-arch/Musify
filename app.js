// Persistent storage
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then(granted => {
    console.log(granted ? "Persistent storage granted" : "Persistent storage denied");
  });
}

// Service worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}

// IndexedDB
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

// UI
const albumGrid = document.getElementById("albumGrid");
const nowPlayingTitle = document.getElementById("nowPlayingTitle");
const nowPlayingAlbum = document.getElementById("nowPlayingAlbum");
const playPauseBtn = document.getElementById("playPauseBtn");

const albumsTab = document.getElementById("albumsTab");
const albumViewTab = document.getElementById("albumViewTab");
const backToAlbumsBtn = document.getElementById("backToAlbumsBtn");
const albumViewTitle = document.getElementById("albumViewTitle");
const albumViewTrackList = document.getElementById("albumViewTrackList");

// Tabs
function showAlbumsTab() {
  albumsTab.style.display = "block";
  albumViewTab.style.display = "none";
}

function showAlbumViewTab() {
  albumsTab.style.display = "none";
  albumViewTab.style.display = "block";
}

backToAlbumsBtn.addEventListener("click", showAlbumsTab);

// Audio + queue
const audio = new Audio();
let currentObjectUrl = null;
let playQueue = [];
let queueIndex = -1;

playPauseBtn.addEventListener("click", () => {
  if (audio.paused) {
    audio.play();
    playPauseBtn.textContent = "Pause";
  } else {
    audio.pause();
    playPauseBtn.textContent = "Play";
  }
});

audio.addEventListener("ended", () => {
  const nextIndex = queueIndex + 1;
  if (nextIndex < playQueue.length) {
    playFromQueue(nextIndex);
  } else {
    playPauseBtn.textContent = "Play";
  }
});

// Library
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
    title.textContent = albumName;

    const artist = document.createElement("div");
    artist.className = "album-artist";
    artist.textContent = "Local Files";

    const openBtn = document.createElement("button");
    openBtn.className = "album-open-btn";
    openBtn.textContent = "Open Album";

    openBtn.addEventListener("click", () => {
      openAlbumView(albumName, albums[albumName]);
    });

    card.appendChild(title);
    card.appendChild(artist);
    card.appendChild(openBtn);

    albumGrid.appendChild(card);
  });
}

// Album view
function openAlbumView(albumName, tracks) {
  albumViewTitle.textContent = albumName;
  albumViewTrackList.innerHTML = "";

  tracks.forEach((track, index) => {
    const li = document.createElement("li");
    li.className = "track-item";
    li.textContent = track.name;

    li.addEventListener("click", () => {
      playQueue = [...tracks];
      queueIndex = index;
      playFromQueue(queueIndex);
    });

    albumViewTrackList.appendChild(li);
  });

  showAlbumViewTab();
}

// Queue playback
async function playFromQueue(index) {
  if (index < 0 || index >= playQueue.length) return;

  queueIndex = index;
  const track = playQueue[index];

  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);

  const url = URL.createObjectURL(track.blob);
  currentObjectUrl = url;

  audio.src = url;

  audio.play().then(() => {
    nowPlayingTitle.textContent = track.name;
    nowPlayingAlbum.textContent = track.album;
    playPauseBtn.disabled = false;
    playPauseBtn.textContent = "Pause";
  });
}

// Drag & drop
const dropZone = document.getElementById("dropZone");

window.addEventListener("dragenter", e => {
  e.preventDefault();
  dropZone.style.display = "flex";
});

window.addEventListener("dragover", e => {
  e.preventDefault();
});

window.addEventListener("dragleave", e => {
  if (e.target === document.body) {
    dropZone.style.display = "none";
  }
});

window.addEventListener("drop", async e => {
  e.preventDefault();
  dropZone.style.display = "none";

  const file = e.dataTransfer.files[0];
  if (!file || !file.name.toLowerCase().endsWith(".zip")) {
    alert("Please drop a ZIP file.");
    return;
  }

  const zip = await JSZip.loadAsync(file);
  const audioExtensions = [".mp3", ".wav", ".ogg", ".flac", ".m4a"];

  for (const path in zip.files) {
    const entry = zip.files[path];
    if (entry.dir) continue;

    const lower = entry.name.toLowerCase();
    if (!audioExtensions.some(ext => lower.endsWith(ext))) continue;

    const parts = entry.name.split("/");
    const albumName = parts.length > 1 ? parts[parts.length - 2] : "Unknown Album";
    const trackName = parts[parts.length - 1];

    const fileData = await entry.async("blob");

    const trackObj = {
      name: trackName,
      album: albumName,
      blob: fileData
    };

    await addTrack(trackObj);
  }

  const allTracks = await getAllTracks();
  renderLibrary(allTracks);
});

// Init
(async () => {
  await openDB();
  const tracks = await getAllTracks();
  renderLibrary(tracks);
})();
