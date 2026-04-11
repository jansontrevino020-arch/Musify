if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}

const DB_NAME = "musify-db";
const DB_VERSION = 4;
let db;

// ⭐ Artist map loaded from artists.txt
let ARTIST_MAP = {};

function loadArtistMap(text) {
  ARTIST_MAP = {};
  const lines = text.split("\n");

  lines.forEach(line => {
    if (!line.includes(":")) return;
    const [album, artist] = line.split(":");
    const albumName = album.trim();
    const artistName = artist.trim();
    if (albumName && artistName) {
      ARTIST_MAP[albumName] = artistName;
    }
  });
}

function getArtist(albumName) {
  return ARTIST_MAP[albumName] || "Unknown Artist";
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = event => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("tracks")) {
        const store = db.createObjectStore("tracks", { keyPath: "id", autoIncrement: true });
        store.createIndex("album", "album", { unique: false });
      }

      if (!db.objectStoreNames.contains("covers")) {
        db.createObjectStore("covers", { keyPath: "album" });
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

function saveCover(album, blob) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("covers", "readwrite");
    const store = tx.objectStore("covers");
    const req = store.put({ album, blob });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function getCover(album) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("covers", "readonly");
    const store = tx.objectStore("covers");
    const req = store.get(album);
    req.onsuccess = () => resolve(req.result ? req.result.blob : null);
    req.onerror = () => reject(req.error);
  });
}

const albumGrid = document.getElementById("albumGrid");
const nowPlayingTitle = document.getElementById("nowPlayingTitle");
const nowPlayingArtist = document.getElementById("nowPlayingArtist");
const nowPlayingCover = document.getElementById("nowPlayingCover");
const playPauseBtn = document.getElementById("playPauseBtn");

const albumsTab = document.getElementById("albumsTab");
const albumViewTab = document.getElementById("albumViewTab");
const backToAlbumsBtn = document.getElementById("backToAlbumsBtn");
const albumViewTitle = document.getElementById("albumViewTitle");
const albumViewTrackList = document.getElementById("albumViewTrackList");

function showAlbumsTab() {
  albumsTab.style.display = "block";
  albumViewTab.style.display = "none";
}

function showAlbumViewTab() {
  albumsTab.style.display = "none";
  albumViewTab.style.display = "block";
}

backToAlbumsBtn.addEventListener("click", () => {
  showAlbumsTab();
  window.scrollTo({ top: 0, behavior: "instant" });
});

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

function renderLibrary(tracks) {
  const albums = {};

  tracks.forEach(t => {
    if (!albums[t.album]) albums[t.album] = [];
    albums[t.album].push(t);
  });

  Object.keys(albums).forEach(albumName => {
    albums[albumName].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true })
    );
  });

  albumGrid.innerHTML = "";

  Object.keys(albums).forEach(albumName => {
    const card = document.createElement("div");
    card.className = "album-card";

    const coverImg = document.createElement("img");
    coverImg.className = "album-cover";

    getCover(albumName).then(blob => {
      if (blob) {
        coverImg.src = URL.createObjectURL(blob);
      }
    });

    const title = document.createElement("div");
    title.className = "album-title";
    title.textContent = albumName;

    const artist = document.createElement("div");
    artist.className = "album-artist";
    artist.textContent = getArtist(albumName);

    card.addEventListener("click", () => {
      openAlbumView(albumName, albums[albumName]);
    });

    card.appendChild(coverImg);
    card.appendChild(title);
    card.appendChild(artist);

    albumGrid.appendChild(card);
  });
}

async function openAlbumView(albumName, tracks) {
  albumViewTitle.textContent = albumName;
  albumViewTrackList.innerHTML = "";

  tracks.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  tracks.forEach((track, index) => {
    const li = document.createElement("li");
    li.className = "track-item";
    li.textContent = track.name;

    li.addEventListener("click", () => {
      const sortedTracks = [...tracks].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true })
      );

      playQueue = sortedTracks;
      queueIndex = index;
      playFromQueue(queueIndex);
    });

    albumViewTrackList.appendChild(li);
  });

  showAlbumViewTab();
  window.scrollTo({ top: 0, behavior: "instant" });
}

async function playFromQueue(index) {
  if (index < 0 || index >= playQueue.length) return;

  queueIndex = index;
  const track = playQueue[index];

  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);

  const url = URL.createObjectURL(track.blob);
  currentObjectUrl = url;

  audio.src = url;

  const coverBlob = await getCover(track.album);
  if (coverBlob) {
    nowPlayingCover.src = URL.createObjectURL(coverBlob);
  } else {
    nowPlayingCover.src = "";
  }

  audio.play().then(() => {
    nowPlayingTitle.textContent = track.name;
    nowPlayingArtist.textContent = getArtist(track.album);
    playPauseBtn.disabled = false;
    playPauseBtn.textContent = "Pause";
  });
}

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

    // ⭐ artists.txt support
    if (lower.endsWith("artists.txt")) {
      const text = await entry.async("text");
      loadArtistMap(text);
      continue;
    }

    if (
      lower.endsWith("cover.jpg") ||
      lower.endsWith("cover.png") ||
      lower.endsWith("cover.webp")
    ) {
      const parts = entry.name.split("/");
      const albumName = parts.length > 1 ? parts[parts.length - 2] : "Unknown Album";

      const coverBlob = await entry.async("blob");
      await saveCover(albumName, coverBlob);
      continue;
    }

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

(async () => {
  await openDB();
  const tracks = await getAllTracks();
  renderLibrary(tracks);
})();
