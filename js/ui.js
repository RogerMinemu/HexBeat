/**
 * ui.js — DOM-based UI controller
 */

export class UI {
    constructor() {
        // Screens
        this.menuScreen = document.getElementById('menu-screen');
        this.loadingScreen = document.getElementById('loading-screen');
        this.hud = document.getElementById('hud');
        this.gameoverScreen = document.getElementById('gameover-screen');

        // Loading elements
        this.loadingBar = document.getElementById('loading-bar');
        this.loadingInfo = document.getElementById('loading-info');

        // HUD elements
        this.hudTime = document.getElementById('hud-time');
        this.hudBpm = document.getElementById('hud-bpm');
        this.hudBestTime = document.getElementById('hud-best-time');

        // Game over elements
        this.gameoverTime = document.getElementById('gameover-time');
        this.gameoverBestContainer = document.getElementById('gameover-best-container');
        this.gameoverBest = document.getElementById('gameover-best');
        this.gameoverNewRecord = document.getElementById('gameover-new-record');

        // Upload zone
        this.uploadZone = document.getElementById('upload-zone');
        this.audioInput = document.getElementById('audio-input');

        // YouTube zone
        this.youtubeInput = document.getElementById('youtube-input');
        this.btnYoutube = document.getElementById('btn-youtube');

        // Buttons
        this.btnRetry = document.getElementById('btn-retry');
        this.btnNewSong = document.getElementById('btn-new-song');
        this.btnContinue = document.getElementById('btn-continue');
        this.btnFullscreen = document.getElementById('btn-fullscreen');

        // Song library
        this.songLibrary = document.getElementById('song-library');
        this.songList = document.getElementById('song-list');

        // Callbacks
        this.onFileSelected = null;
        this.onSongSelected = null; // called with (url, title)
        this.onYoutubeSelected = null; // called with (youtubeUrl)
        this.onRetry = null;
        this.onNewSong = null;
        this.onContinue = null;

        this._setupEvents();
        this._loadSongLibrary();
    }

    async _loadSongLibrary() {
        try {
            const res = await fetch('songs/songs.json');
            if (!res.ok) return;
            const songs = await res.json();

            // Filter out placeholder entries
            const valid = songs.filter(s => s.file && s.file !== 'ejemplo.mp3');
            if (valid.length === 0) return;

            // Show library section
            this.songLibrary.style.display = '';

            // Render song items
            this.songList.innerHTML = '';
            for (const song of valid) {
                const item = document.createElement('div');
                item.className = 'song-item';
                item.innerHTML = `
                    <div class="song-icon">🎵</div>
                    <div class="song-info">
                        <div class="song-title">${song.title || song.file}</div>
                        <div class="song-artist">${song.artist || 'Desconocido'}</div>
                    </div>
                `;
                item.addEventListener('click', () => {
                    const url = `songs/${song.file}`;
                    this.onSongSelected?.(url, song.title || song.file);
                });
                this.songList.appendChild(item);
            }
        } catch (e) {
            // No songs.json found or invalid — just hide the library
        }
    }

    _setupEvents() {
        // Upload zone click
        this.uploadZone.addEventListener('click', () => {
            this.audioInput.click();
        });

        // File input change
        this.audioInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.onFileSelected?.(file);
        });

        // Drag and drop
        this.uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadZone.classList.add('drag-over');
        });

        this.uploadZone.addEventListener('dragleave', () => {
            this.uploadZone.classList.remove('drag-over');
        });

        this.uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && (file.type.includes('audio') || file.name.match(/\.(mp3|ogg|wav|flac)$/i))) {
                this.onFileSelected?.(file);
            }
        });

        // YouTube handler
        this.btnYoutube.addEventListener('click', () => {
            const url = this.youtubeInput.value.trim();
            if (url) {
                this.onYoutubeSelected?.(url);
            }
        });

        // Enter key for YouTube input
        this.youtubeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const url = this.youtubeInput.value.trim();
                if (url) {
                    this.onYoutubeSelected?.(url);
                }
            }
        });

        // Buttons
        this.btnRetry.addEventListener('click', () => this.onRetry?.());
        this.btnNewSong.addEventListener('click', () => this.onNewSong?.());
        this.btnContinue.addEventListener('click', () => this.onContinue?.());

        // Fullscreen logic
        if (this.btnFullscreen) {
            this.btnFullscreen.addEventListener('click', () => {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(e => {
                        console.warn(`Error attempting to enable fullscreen: ${e.message}`);
                    });
                } else {
                    if (document.exitFullscreen) {
                        document.exitFullscreen();
                    }
                }
            });
        }
    }

    showScreen(name) {
        this.menuScreen.classList.remove('active');
        this.loadingScreen.classList.remove('active');
        this.hud.classList.remove('active');
        this.gameoverScreen.classList.remove('active');

        switch (name) {
            case 'menu': this.menuScreen.classList.add('active'); break;
            case 'loading': this.loadingScreen.classList.add('active'); break;
            case 'hud': this.hud.classList.add('active'); break;
            case 'gameover': this.gameoverScreen.classList.add('active'); break;
        }
    }

    updateLoading(message, percent) {
        this.loadingBar.style.width = `${percent}%`;
        this.loadingInfo.textContent = message;
    }

    updateHUD(time, bpm, bestTime) {
        this.hudTime.textContent = time.toFixed(2);
        this.hudBpm.textContent = `${bpm} BPM`;
        if (bestTime !== undefined) {
            this.hudBestTime.textContent = bestTime.toFixed(2);
        }
    }

    showGameOver(time, bestTime, isNewBest) {
        this.gameoverTime.textContent = `${time.toFixed(2)}s`;

        if (bestTime !== undefined) {
            this.gameoverBest.textContent = `${bestTime.toFixed(2)}s`;
            if (isNewBest) {
                this.gameoverNewRecord.style.display = 'block';
                this.gameoverBestContainer.classList.add('new-record'); // Optional CSS class for extra animation
            } else {
                this.gameoverNewRecord.style.display = 'none';
                this.gameoverBestContainer.classList.remove('new-record');
            }
        }

        this.showScreen('gameover');
    }
}
