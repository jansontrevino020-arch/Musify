// ---------- IndexedDB SETUP ----------
let db;
const DB_NAME = "musifyDB";
const DB_VERSION = 1;
const TRACK_STORE = "tracks";
const COVER_STORE = "covers";

const openRequest = indexedDB.open(DB_NAME, DB_VERSION);

openRequest.onupgradeneeded = (e) => {
  const db = e.target.result;
  if (!db.objectStoreNames.contains(TRACK_STORE)) {
    const store = db.createObjectStore(TRACK_STORE, { keyPath: "id", autoIncrement: true });
    store.createIndex("album", "album", { unique: false });
  }
  if (!db.objectStoreNames.contains(COVER_STORE)) {
    db.createObjectStore(COVER_STORE, { keyPath: "album" });
  }
};

openRequest.onsuccess = (e) => {
  db = e.target.result;
  loadAlbums();
};

openRequest.onerror = () => {
  console.error("Failed to open IndexedDB");
};

function saveTrackToIndexedDB(trackObj) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([TRACK_STORE], "readwrite");
    const store = tx.objectStore(TRACK_STORE);
    store.add(trackObj);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

function saveCoverToIndexedDB(album, blob) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([COVER_STORE], "readwrite");
    const store = tx.objectStore(COVER_STORE);
    store.put({ album, blob });
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

function getTracksByAlbum(album) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([TRACK_STORE], "readonly");
    const store = tx.objectStore(TRACK_STORE);
    const index = store.index("album");
    const req = index.getAll(album);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function getAllAlbums() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([TRACK_STORE], "readonly");
    const store = tx.objectStore(TRACK_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const albums = [...new Set(req.result.map(t => t.album))];
      resolve(albums);
    };
    req.onerror = (e) => reject(e);
  });
}

// ---------- CLEAN TRACK NAME ----------
function cleanTrackName(filename) {
  return filename
    .replace(/^.*[\\/]/, "")
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/`\((feat|ft|explicit|clean|remastered)[^)]*\)`/gi, "")
    .replace(/\[(feat|ft|explicit|clean|remastered)[^\]]*\]/gi, "")
    .replace(/\bfeat\.?.*/i, "")
    .replace(/\bft\.?.*/i, "")
    .replace(/`\([^)]*\)`/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ---------- UI ELEMENTS ----------
const dropzone = document.getElementById("dropzone");
const importProgress = document.getElementById("importProgress");
const importBar = document.getElementById("importBar");
const importLabel = document.getElementById("importLabel");
const albumList = document.getElementById("albumList");
const trackList = document.getElementById("trackList");
const tracksTitle = document.getElementById("tracksTitle");
const audioPlayer = document.getElementById("audioPlayer");
const nowPlayingTitle = document.getElementById("nowPlayingTitle");
const playPauseBtn = document.getElementById("playPauseBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");

let currentAlbum = null;
let currentTracks = [];
let currentIndex = -1;

// ---------- FULL-PAGE DRAG & DROP (OLD SYSTEM) ----------
document.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

document.addEventListener("dragleave", (e) => {
  dropzone.classList.remove("dragover");
});

document.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");

  const file = e.dataTransfer.files[0];
  if (file && file.name.toLowerCase().endsWith(".zip")) {
    handleZipImport(file);
  }
});

// ---------- ZIP IMPORT WITH PROGRESS ----------
async function handleZipImport(file) {
  const zip = await JSZip.loadAsync(file);
  const audioExtensions = [".mp3", ".wav", ".ogg", ".flac", ".m4a"];

  // Count audio files
  let totalTracks = 0;
  for (const path in zip.files) {
    const lower = path.toLowerCase();
    if (audioExtensions.some(ext => lower.endsWith(ext))) {
      totalTracks++;
    }
  }
  if (totalTracks === 0) return;

  let processedTracks = 0;

  // Show progress UI
  importProgress.style.display = "block";
  importLabel.style.display = "block";
  importBar.style.width = "0%";
  importLabel.textContent = `Importing… 0% (0/${totalTracks} tracks)`;

  for (const path in zip.files) {
    const entry = zip.files[path];
    const lower = path.toLowerCase();

    // Audio files
    if (audioExtensions.some(ext => lower.endsWith(ext))) {
      const fileData = await entry.async("blob");

      const trackObj = {
        name: cleanTrackName(entry.name),
        album: "MusicVault",
        blob: fileData
      };

      await saveTrackToIndexedDB(trackObj);

      processedTracks++;
      const percent = Math.floor((processedTracks / totalTracks) * 100);
      importBar.style.width = percent + "%";
      importLabel.textContent =
        `Importing… ${percent}% (${processedTracks}/${totalTracks} tracks)`;
    }

    // Cover image
    if (/\b(cover|folder|album)\.(jpg|png|webp)$/i.test(lower)) {
      const coverBlob = await entry.async("blob");
      await saveCoverToIndexedDB("MusicVault", coverBlob);
    }
  }

  importLabel.textContent = "Import complete!";
  setTimeout(() => {
    importProgress.style.display = "none";
    importLabel.style.display = "none";
  }, 1500);

  loadAlbums();
}

// ---------- DROPZONE CLICK ----------
dropzone.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".zip";
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (file) await handleZipImport(file);
  };
  input.click();
});

// ---------- LOAD & RENDER ----------
async function loadAlbums() {
  if (!db) return;
  const albums = await getAllAlbums();
  albumList.innerHTML = "";
  albums.forEach(album => {
    const li = document.createElement("li");
    li.textContent = album;
    li.addEventListener("click", () => selectAlbum(album));
    albumList.appendChild(li);
  });
}

async function selectAlbum(album) {
  currentAlbum = album;
  tracksTitle.textContent = `Tracks — ${album}`;
  currentTracks = await getTracksByAlbum(album);
  currentTracks.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true })
  );
  renderTracks();
}

function renderTracks() {
  trackList.innerHTML = "";
  currentTracks.forEach((track, index) => {
    const li = document.createElement("li");
    li.textContent = track.name;
    li.addEventListener("click", () => playTrack(index));
    trackList.appendChild(li);
  });
}

// ---------- PLAYER ----------
function playTrack(index) {
  if (index < 0 || index >= currentTracks.length) return;
  currentIndex = index;
  const track = currentTracks[index];

  const blob = track.blob;
  const url = URL.createObjectURL(blob);
  audioPlayer.src = url;
  audioPlayer.play();
  nowPlayingTitle.textContent = track.name;
  playPauseBtn.textContent = "⏸";
}

playPauseBtn.addEventListener("click", () => {
  if (!audioPlayer.src) return;
  if (audioPlayer.paused) {
    audioPlayer.play();
    playPauseBtn.textContent = "⏸";
  } else {
    audioPlayer.pause();
    playPauseBtn.textContent = "▶";
  }
});

prevBtn.addEventListener("click", () => {
  if (currentIndex > 0) playTrack(currentIndex - 1);
});

nextBtn.addEventListener("click", () => {
  if (currentIndex < currentTracks.length - 1) playTrack(currentIndex + 1);
});

audioPlayer.addEventListener("ended", () => {
  if (currentIndex < currentTracks.length - 1) {
    playTrack(currentIndex + 1);
  } else {
    playPauseBtn.textContent = "▶";
  }
});
