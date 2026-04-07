audio.addEventListener("ended", () => {
  const nextIndex = currentTrackIndex + 1;

  if (nextIndex < currentAlbumTracks.length) {
    currentTrackIndex = nextIndex;
    const track = currentAlbumTracks[nextIndex];

    // Create URL for next track
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    const url = URL.createObjectURL(track.blob);
    currentObjectUrl = url;

    audio.src = url;

    // THE FIX: browsers allow this continuation
    audio.play().then(() => {
      nowPlayingTitle.textContent = track.name;
      nowPlayingAlbum.textContent = track.album;
      playPauseBtn.textContent = "Pause";
    }).catch(err => {
      console.log("Autoplay blocked:", err);
      playPauseBtn.textContent = "Play";
    });

  } else {
    playPauseBtn.textContent = "Play";
  }
});
