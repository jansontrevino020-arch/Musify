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

// ---------- CLEAN TRACK NAME ----------
function cleanTrackName(filename) {
  return filename
    .replace(/^.*[\\/]/, "")
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ---------- ALBUM NAME FROM PATH (TOP-LEVEL FOLDER) ----------
function getAlbumNameFromPath(path) {
  const parts = path.split("/").filter(p => p.length > 0);
  return parts.length >= 2 ? parts[1] : "Unknown Album";
}

// ---------- COVER + TRACK STORAGE ----------
function saveTrackToIndexedDB(trackObj) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([TRACK_STORE], "readwrite");
    tx.objectStore(TRACK_STORE).add(trackObj);
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

function saveCoverToIndexedDB(album, blob) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([COVER_STORE], "readwrite");
    tx.objectStore(COVER_STORE).put({ album, blob });
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

function getCoverFromIndexedDB(album) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([COVER_STORE], "readonly");
    const req = tx.objectStore(COVER_STORE).get(album);

    req.onsuccess = () => {
      resolve(req.result?.blob ? URL.createObjectURL(req.result.blob) : null);
    };
    req.onerror = reject;
  });
}

function getTracksByAlbum(album) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([TRACK_STORE], "readonly");
    const req = tx.objectStore(TRACK_STORE).index("album").getAll(album);
    req.onsuccess = () => resolve(req.result);
    req.onerror = reject;
  });
}

function getAllAlbums() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([TRACK_STORE], "readonly");
    const req = tx.objectStore(TRACK_STORE).getAll();
    req.onsuccess = () => {
      resolve([...new Set(req.result.map(t => t.album))]);
    };
    req.onerror = reject;
  });
}

// ---------- UI ELEMENTS ----------
const dropzone = document.getElementById("dropzone");
const importProgress = document.getElementById("importProgress");
const importBar = document.getElementById("importBar");
const importLabel = document.getElementById("importLabel");

const albumGrid = document.getElementById("albumGrid");
const albumView = document.getElementById("albumView");
const backButton = document.getElementById("backButton");
const albumViewCover = document.getElementById("albumViewCover");
const albumViewTitle = document.getElementById("albumViewTitle");
const albumViewTrackList = document.getElementById("albumViewTrackList");

const importSection = document.getElementById("importSection");
const albumsSection = document.getElementById("albumsSection");

const audioPlayer = document.getElementById("audioPlayer");
const nowPlayingTitle = document.getElementById("nowPlayingTitle");
const playPauseBtn = document.getElementById("playPauseBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");

let currentTracks = [];
let currentIndex = -1;

// ---------- VIEW SWITCHING ----------
function showAlbumView() {
  importSection.classList.add("hidden");
  albumsSection.classList.add("hidden");
  albumView.classList.remove("hidden");
}

function hideAlbumView() {
  albumView.classList.add("hidden");
  importSection.classList.remove("hidden");
  albumsSection.classList.remove("hidden");
}

// ---------- DRAG & DROP ----------
document.addEventListener("dragover", e => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

document.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

document.addEventListener("drop", e => {
  e.preventDefault();
  dropzone.classList.remove("dragover");

  const file = e.dataTransfer.files[0];
  if (file?.name.toLowerCase().endsWith(".zip")) {
    handleZipImport(file);
  }
});

// ---------- ZIP IMPORT ----------
async function handleZipImport(file) {
  const zip = await JSZip.loadAsync(file);
  const audioExt = [".mp3", ".wav", ".ogg", ".flac", ".m4a"];

  let total = 0;
  for (const path in zip.files) {
    const lower = path.toLowerCase();
    if (zip.files[path].dir) continue;
    if (path.startsWith("__MACOSX") || path.startsWith("._")) continue;
    if (audioExt.some(ext => lower.endsWith(ext))) total++;
  }

  let done = 0;
  importProgress.style.display = "block";
  importLabel.style.display = "block";

  for (const path in zip.files) {
    const entry = zip.files[path];
    const lower = path.toLowerCase();

    if (entry.dir) continue;
    if (path.startsWith("__MACOSX") || path.startsWith("._")) continue;

    const album = getAlbumNameFromPath(path);

    if (audioExt.some(ext => lower.endsWith(ext))) {
      const blob = await entry.async("blob");
      await saveTrackToIndexedDB({
        name: cleanTrackName(entry.name),
        album,
        blob
      });

      done++;
      const pct = Math.floor((done / total) * 100);
      importBar.style.width = pct + "%";
      importLabel.textContent = `Importing… ${pct}% (${done}/${total})`;
    }

    if (/\b(cover|folder|album)\.(jpg|png|webp)$/i.test(lower)) {
      const blob = await entry.async("blob");
      await saveCoverToIndexedDB(album, blob);
    }
  }

  importLabel.textContent = "Import complete!";
  setTimeout(() => {
    importProgress.style.display = "none";
    importLabel.style.display = "none";
  }, 1200);

  loadAlbums();
}

// ---------- CLICK IMPORT ----------
dropzone.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".zip";
  input.onchange = e => handleZipImport(e.target.files[0]);
  input.click();
});

// ---------- LOAD ALBUM GRID ----------
async function loadAlbums() {
  const albums = await getAllAlbums();
  albumGrid.innerHTML = "";

  for (const album of albums) {
    const cover = await getCoverFromIndexedDB(album);

    const card = document.createElement("div");
    card.className = "album-card";

    const img = document.createElement("img");
    img.className = "album-cover";
    img.src = cover || "default-cover.png";

    const title = document.createElement("div");
    title.className = "album-title";
    title.textContent = album;

    card.appendChild(img);
    card.appendChild(title);

    card.addEventListener("click", () => openAlbum(album));

    albumGrid.appendChild(card);
  }
}

// ---------- OPEN ALBUM ----------
async function openAlbum(album) {
  const cover = await getCoverFromIndexedDB(album);
  const tracks = await getTracksByAlbum(album);

  albumViewCover.src = cover || "default-cover.png";
  albumViewTitle.textContent = album;

  albumViewTrackList.innerHTML = "";

  tracks.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true })
  );

  tracks.forEach((track, i) => {
    const li = document.createElement("li");
    li.textContent = track.name;
    li.addEventListener("click", () => playTrack(i, tracks));
    albumViewTrackList.appendChild(li);
  });

  currentTracks = tracks;
  showAlbumView();
}

// ---------- BACK BUTTON ----------
backButton.addEventListener("click", hideAlbumView);

// ---------- PLAYER ----------
function playTrack(index, list = currentTracks) {
  currentTracks = list;
  currentIndex = index;

  const track = currentTracks[index];
  const url = URL.createObjectURL(track.blob);

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
