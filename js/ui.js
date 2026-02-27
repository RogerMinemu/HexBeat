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

        // Game over elements
        this.gameoverTime = document.getElementById('gameover-time');

        // Upload zone
        this.uploadZone = document.getElementById('upload-zone');
        this.audioInput = document.getElementById('audio-input');

        // Buttons
        this.btnRetry = document.getElementById('btn-retry');
        this.btnNewSong = document.getElementById('btn-new-song');
        this.btnContinue = document.getElementById('btn-continue');

        // Callbacks
        this.onFileSelected = null;
        this.onRetry = null;
        this.onNewSong = null;
        this.onContinue = null;

        this._setupEvents();
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
            if (file && (file.type.includes('audio') || file.name.match(/\.(mp3|ogg)$/i))) {
                this.onFileSelected?.(file);
            }
        });

        // Buttons
        this.btnRetry.addEventListener('click', () => this.onRetry?.());
        this.btnNewSong.addEventListener('click', () => this.onNewSong?.());
        this.btnContinue.addEventListener('click', () => this.onContinue?.());
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

    updateHUD(time, bpm) {
        this.hudTime.textContent = time.toFixed(2);
        this.hudBpm.textContent = `${bpm} BPM`;
    }

    showGameOver(time) {
        this.gameoverTime.textContent = `${time.toFixed(2)}s`;
        this.showScreen('gameover');
    }
}
