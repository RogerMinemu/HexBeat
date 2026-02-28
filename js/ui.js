/**
 * ui.js — DOM-based UI controller
 */

export class UI {
    constructor() {
        try {
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

            // Auth UI
            this.btnLoginGoogle = document.getElementById('btn-login-google');
            this.btnLogout = document.getElementById('btn-logout');
            this.userProfile = document.getElementById('user-profile');
            this.userAvatar = document.getElementById('user-avatar');
            this.userName = document.getElementById('user-name');

            // Community UI
            this.btnOpenCommunityModal = document.getElementById('btn-open-community-modal');
            this.communityModal = document.getElementById('community-modal');
            this.btnCloseCommunityModal = document.getElementById('btn-close-community-modal');
            this.communityUploadForm = document.getElementById('community-upload-form');
            this.communityAudioInput = document.getElementById('community-audio-input');
            this.communitySongTitle = document.getElementById('community-song-title');
            this.communityUploaderName = document.getElementById('community-uploader-name');
            this.communityUploadError = document.getElementById('community-upload-error');
            this.communitySongList = document.getElementById('community-song-list');

            console.log("[UI] All DOM elements queried.");

            // Callbacks
            this.onFileSelected = null;
            this.onSongSelected = null; // called with (url, title)
            this.onYoutubeSelected = null; // called with (youtubeUrl)
            this.onRetry = null;
            this.onNewSong = null;
            this.onContinue = null;
            this.onLoginWithGoogle = null;
            this.onLogout = null;
            this.onCommunityUpload = null; // (file, title)

            this._setupEvents();
            this._loadSongLibrary();
        } catch (error) {
            console.error("[UI Constructor Error]", error);
            alert("UI Constructor Error: " + error.message);
        }
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

            // Separate into official and community
            const officialSongs = valid.filter(s => !s.community);
            const communitySongs = valid.filter(s => s.community);

            // Render official songs
            if (this.songList) {
                this.songList.innerHTML = '';
                for (const song of officialSongs) {
                    const item = this._createSongItemDOM(song);
                    this.songList.appendChild(item);
                }
            }

            // Render community songs
            if (this.communitySongList) {
                this.communitySongList.innerHTML = '';
                for (const song of communitySongs) {
                    const item = this._createSongItemDOM(song);
                    this.communitySongList.appendChild(item);
                }
            }

        } catch (e) {
            // No songs.json found or invalid — just hide the library
            console.error("Error loading song library:", e);
        }
    }

    _createSongItemDOM(song) {
        const item = document.createElement('div');
        item.className = 'song-item';
        const isCommunity = song.community ? '<span class="community-badge" style="font-size: 0.7em; background: rgba(0, 240, 255, 0.2); padding: 2px 6px; border-radius: 10px; margin-left: 8px; color: var(--cyan);">Comunidad</span>' : '';
        item.innerHTML = `
            <div class="song-icon">🎵</div>
            <div class="song-info">
                <div class="song-title">${song.title || song.file} ${isCommunity}</div>
                <div class="song-artist">${song.artist || 'Desconocido'}</div>
            </div>
        `;
        item.addEventListener('click', () => {
            const url = `songs/${song.file}`;
            this.onSongSelected?.(url, song.title || song.file);
        });
        return item;
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

        // Auth Events
        if (this.btnLoginGoogle) this.btnLoginGoogle.addEventListener('click', () => this.onLoginWithGoogle?.());
        if (this.btnLogout) this.btnLogout.addEventListener('click', () => this.onLogout?.());

        // Community Modal Events
        if (this.btnOpenCommunityModal) {
            this.btnOpenCommunityModal.addEventListener('click', () => {
                this.communityModal.classList.remove('hidden');
                this.communityModal.classList.add('active');
                this.communityUploadError.style.display = 'none';
            });
        }
        if (this.btnCloseCommunityModal) {
            this.btnCloseCommunityModal.addEventListener('click', () => {
                this.communityModal.classList.remove('active');
                this.communityModal.classList.add('hidden');
                this.communityUploadForm.reset();
            });
        }

        if (this.communityUploadForm) {
            this.communityUploadForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const file = this.communityAudioInput.files[0];
                const title = this.communitySongTitle.value.trim();
                const tos = document.getElementById('community-tos').checked;

                if (!file || !title || !tos) return;

                // Validate size (30MB)
                const MAX_SIZE = 30 * 1024 * 1024;
                if (file.size > MAX_SIZE) {
                    this.showCommunityError('El archivo excede los 30MB permitidos.');
                    return;
                }

                this.onCommunityUpload?.(file, title);
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

    updateAuthState(user) {
        if (user) {
            if (this.btnLoginGoogle) this.btnLoginGoogle.classList.add('hidden');
            if (this.userProfile) this.userProfile.classList.remove('hidden');
            if (this.userAvatar) this.userAvatar.src = user.photoURL || '';
            if (this.userName) this.userName.textContent = user.displayName || 'Usuario';
            if (this.communityUploaderName) this.communityUploaderName.textContent = user.displayName || 'Usuario';

            // Show upload button
            if (this.btnOpenCommunityModal) {
                this.btnOpenCommunityModal.classList.remove('btn-hidden');
            }
        } else {
            if (this.btnLoginGoogle) this.btnLoginGoogle.classList.remove('hidden');
            if (this.userProfile) this.userProfile.classList.add('hidden');

            // Hide upload button
            if (this.btnOpenCommunityModal) {
                this.btnOpenCommunityModal.classList.add('btn-hidden');
            }
        }
    }

    showCommunityError(msg) {
        if (this.communityUploadError) {
            this.communityUploadError.textContent = msg;
            this.communityUploadError.style.display = 'block';
        }
    }

    closeCommunityModal() {
        if (this.communityModal) {
            this.communityModal.classList.remove('active');
            this.communityModal.classList.add('hidden');
        }
        if (this.communityUploadForm) this.communityUploadForm.reset();
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

    showGameOver(time, bestTime, isNewBest, isVictory = false) {
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

        // Si es victoria, ocultar el botón de Continuar y cambiar el título
        const titleElement = this.gameoverScreen.querySelector('.gameover-title');
        if (isVictory) {
            this.btnContinue.style.display = 'none';
            if (titleElement) titleElement.textContent = 'SONG CLEARED';
        } else {
            this.btnContinue.style.display = 'block'; // Volver a mostrarlo si se muere con normalidad
            if (titleElement) titleElement.textContent = 'GAME OVER';
        }

        this.showScreen('gameover');
    }
}
