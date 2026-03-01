/**
 * game.js — Core game loop, state management, and system coordination
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';
import { AudioManager } from './audio.js';
import { Player } from './player.js';
import { WallSystem } from './walls.js';
import { ParticleSystem } from './particles.js';
import { LevelGenerator } from './levelGenerator.js';
import { UI } from './ui.js';
import { firebaseManager } from './firebase.js';

const YOUTUBE_PROXY_URL = window.location.origin;

const GameState = {
    MENU: 'menu',
    ANALYZING: 'analyzing',
    PLAYING: 'playing',
    GAME_OVER: 'gameover'
};

export class Game {
    constructor(canvas) {
        // Core systems
        this.renderer = new Renderer3D(canvas);
        this.audio = new AudioManager();
        this.player = new Player(this.renderer.scene);
        this.walls = new WallSystem(this.renderer.scene);
        this.particles = new ParticleSystem(this.renderer.scene, 600);
        this.melodyParticles = new ParticleSystem(this.renderer.scene, 1200);
        this.levelGen = new LevelGenerator();
        this.ui = new UI();

        // State
        this.state = GameState.MENU;
        this.gameTime = 0;
        this.survivalTime = 0;
        this.lastTimestamp = 0;
        this.isRunning = false;
        this.isTransitioning = false;

        // High Score Tracking
        this.currentSongId = null;
        this.bestTime = 0;
        this.isNewBest = false;

        // World rotation (Open Hexagon signature effect)
        this.worldRotation = 0;
        this.worldRotationSpeed = 0.3;
        this.worldRotationTarget = 0.3;
        this.worldRotationGroup = new THREE.Group();
        this.renderer.scene.add(this.worldRotationGroup);

        // Reparent game objects to world rotation group
        this.renderer.scene.remove(this.player.mesh);
        this.renderer.scene.remove(this.player.trailGroup);
        this.renderer.scene.remove(this.walls.wallGroup);
        this.renderer.scene.remove(this.renderer.hexagon);
        this.renderer.scene.remove(this.renderer.hexagonOutline);

        this.worldRotationGroup.add(this.player.mesh);
        this.worldRotationGroup.add(this.player.trailGroup);
        this.worldRotationGroup.add(this.walls.wallGroup);
        this.worldRotationGroup.add(this.renderer.hexagon);
        this.worldRotationGroup.add(this.renderer.hexagonOutline);

        // Scene shake
        this.shakeIntensity = 0;
        this.shakeDecay = 5;

        // Beat tracking
        this.lastBeatIndex = -1;
        this.beatCooldown = 0;

        // Melody tracking
        this.lastMelodyIndex = -1;
        this.melodyCooldown = 0;

        // Direction change timer
        this.dirChangeTimer = 0;
        this.dirChangeInterval = 8; // seconds

        // Setup UI callbacks
        this.ui.onFileSelected = (file) => this._onFileSelected(file);
        this.ui.onSongSelected = (url, title) => this._onSongFromLibrary(url, title);
        this.ui.onYoutubeSelected = (url) => this._onSongFromYoutube(url);
        this.ui.onRetry = () => this._onRetry();
        this.ui.onNewSong = () => this._onNewSong();
        this.ui.onContinue = () => this._onContinue();

        // Auth & Community UI Callbacks
        firebaseManager.onUserChanged((user) => {
            this.ui.updateAuthState(user);
        });

        this.ui.onLoginWithGoogle = async () => {
            try {
                await firebaseManager.loginWithGoogle();
            } catch (error) {
                console.error("Login failed:", error);
            }
        };

        this.ui.onLogout = async () => {
            try {
                await firebaseManager.logout();
            } catch (error) {
                console.error("Logout failed:", error);
            }
        };

        this.ui.onCommunityUpload = (file, title) => this._uploadCommunitySong(file, title);

        // W key to continue
        window.addEventListener('keydown', (e) => {
            if ((e.key === 'w' || e.key === 'W') && this.state === GameState.GAME_OVER) {
                this._onContinue();
            }
        });

        // Initial state
        this.ui.showScreen('menu');

        // Start idle render loop
        this._startRenderLoop();
    }

    _startRenderLoop() {
        this.isRunning = true;
        this.lastTimestamp = performance.now();
        this._loop(this.lastTimestamp);
    }

    _loop(timestamp) {
        if (!this.isRunning) return;

        const dt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.05); // cap dt
        this.lastTimestamp = timestamp;

        this._update(dt);
        this._render();

        requestAnimationFrame((t) => this._loop(t));
    }

    _update(dt) {
        if (this.state === GameState.PLAYING) {
            this.gameTime += dt;
            this.survivalTime += dt;

            // Update audio data
            this.audio.updateFrequencyData();
            const audioData = {
                bass: this.audio.getBass(),
                mid: this.audio.getMid(),
                treble: this.audio.getTreble(),
                energy: this.audio.getOverallEnergy()
            };

            // World rotation
            this.dirChangeTimer += dt;
            if (this.dirChangeTimer > this.dirChangeInterval) {
                this.dirChangeTimer = 0;
                this.worldRotationTarget = -this.worldRotationTarget;
                this.dirChangeInterval = 5 + Math.random() * 10;
            }

            // Smooth rotation speed change
            this.worldRotationSpeed += (this.worldRotationTarget - this.worldRotationSpeed) * dt * 2;
            this.worldRotation += this.worldRotationSpeed * dt * (1 + audioData.bass * 0.5);
            this.worldRotationGroup.rotation.z = this.worldRotation;

            // Level generation — spawn walls
            const currentAudioTime = this.audio.currentTime;
            const events = this.levelGen.getEventsForTime(currentAudioTime);

            for (const event of events) {
                const color = this.renderer.getWallColor();
                this.walls.spawnPattern(event.gaps, {
                    speed: event.speed,
                    color,
                    thickness: event.thickness
                });
            }

            // Update systems
            this.player.update(dt);
            this.walls.update(dt, audioData);
            this.particles.update(dt);
            this.melodyParticles.update(dt);

            // Update wall colors — continuous RGB cycling
            this.walls.setColor(this.renderer.getWallColor());

            // Beat detection for particles
            this._handleBeats(currentAudioTime, audioData);

            // Melody detection for constellation particles
            this._handleMelody(currentAudioTime, audioData);

            // Shake decay
            if (this.shakeIntensity > 0) {
                this.shakeIntensity -= this.shakeDecay * dt;
                if (this.shakeIntensity < 0) this.shakeIntensity = 0;
            }

            // Camera shake
            if (this.shakeIntensity > 0) {
                this.renderer.camera.position.x = (Math.random() - 0.5) * this.shakeIntensity;
                this.renderer.camera.position.y = (Math.random() - 0.5) * this.shakeIntensity;
            } else {
                this.renderer.camera.position.x = 0;
                this.renderer.camera.position.y = 0;
            }

            // Collision
            if (this.walls.checkCollisions(this.player)) {
                this._onGameOver();
            }

            // Update HUD
            this.ui.updateHUD(this.survivalTime, this.audio.bpm, this.bestTime);

            // Update renderer visual effects
            this.renderer.update(dt, this.gameTime, audioData, this.audio.freqData, this.audio.timeData);

            // Check if song ended
            if (currentAudioTime >= this.audio.duration - 0.5) {
                this._onSongComplete();
            }

        } else if (this.state === GameState.MENU) {
            // Idle animation
            this.gameTime += dt;
            const idleAudio = { bass: 0, mid: 0, treble: 0, energy: 0 };
            this.renderer.update(dt, this.gameTime, idleAudio, null, null);
            this.particles.update(dt);
            this.melodyParticles.update(dt);
        } else if (this.state === GameState.GAME_OVER) {
            this.gameTime += dt;
            const idleAudio = { bass: 0, mid: 0, treble: 0, energy: 0 };
            this.renderer.update(dt, this.gameTime, idleAudio, null, null);
            this.particles.update(dt);
            this.melodyParticles.update(dt);
        }
    }

    _handleBeats(currentAudioTime, audioData) {
        this.beatCooldown -= 1 / 60;

        // Find current beat
        const beatTimes = this.audio.beatTimes;
        for (let i = this.lastBeatIndex + 1; i < beatTimes.length; i++) {
            if (Math.abs(currentAudioTime - beatTimes[i]) < 0.05) {
                if (this.beatCooldown <= 0) {
                    // Beat hit!
                    const intensity = audioData.bass;
                    this.particles.emitBeatPulse(intensity, this.renderer.getPrimaryColor());
                    this.shakeIntensity = Math.max(this.shakeIntensity, intensity * 0.3);
                    this.lastBeatIndex = i;
                    this.beatCooldown = 0.1;
                }
                break;
            }
            if (beatTimes[i] > currentAudioTime + 0.1) break;
        }
    }

    /**
     * Bass constellation — emit ethereal particles only during the most intense
     * moments (drops, climaxes). Uses overall energy + bass combined threshold.
     */
    _handleMelody(currentAudioTime, audioData) {
        this.melodyCooldown -= 1 / 60;
        if (this.melodyCooldown > 0) return;

        // Use bass directly — simpler and more reliable
        const bass = audioData.bass;

        if (bass > 0.7) {
            const intensity = (bass - 0.6) / 0.4; // normalize 0.6-1 → 0-1
            const color = this.renderer.getSecondaryColor();
            this.melodyParticles.emitMelodyBurst(intensity, color);
            this.melodyCooldown = 0.25;
        }
    }

    _onGameOver() {
        if (this.isTransitioning) return;
        this.isTransitioning = true;
        this.state = GameState.GAME_OVER;

        // Save audio position for continue
        this._deathAudioTime = this.audio.currentTime;

        this.audio.fadeOut(0.8);
        this.audio.playExplosion();

        // High score check
        if (this.survivalTime > this.bestTime) {
            this.bestTime = this.survivalTime;
            this.isNewBest = true;
            if (this.currentSongId) {
                localStorage.setItem(`hexbeat_best_${this.currentSongId}`, this.bestTime.toString());
            }
        }

        // Explosion at player position (accounting for global scene rotation)
        const playerWorldPos = new THREE.Vector3();
        this.player.mesh.getWorldPosition(playerWorldPos);
        this.particles.emitExplosion(playerWorldPos.x, playerWorldPos.y);

        // Big shake
        this.shakeIntensity = 2;

        // Hide player
        this.player.mesh.visible = false;

        // Show game over after brief delay
        setTimeout(() => {
            // isVictory = false
            this.isTransitioning = false;
            this.ui.showGameOver(this.survivalTime, this.bestTime, this.isNewBest, false);
        }, 800);
    }

    _onSongComplete() {
        if (this.isTransitioning) return;
        this.isTransitioning = true;
        // Player survived the whole song!
        this.state = GameState.GAME_OVER;
        this.audio.stop();

        // High score check
        if (this.survivalTime > this.bestTime) {
            this.bestTime = this.survivalTime;
            this.isNewBest = true;
            if (this.currentSongId) {
                localStorage.setItem(`hexbeat_best_${this.currentSongId}`, this.bestTime.toString());
            }
        }

        // Celebratory particles
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                this.particles.emitBeatPulse(1.0, this.renderer.getPrimaryColor());
            }, i * 200);
        }

        setTimeout(() => {
            // isVictory = true
            this.isTransitioning = false;
            this.ui.showGameOver(this.survivalTime, this.bestTime, this.isNewBest, true);
        }, 1200);
    }

    async _onFileSelected(file) {
        this.state = GameState.ANALYZING;
        this.ui.showScreen('loading');

        // Setup high score tracking for this song
        this.currentSongId = file.name;
        this.bestTime = parseFloat(localStorage.getItem(`hexbeat_best_${this.currentSongId}`)) || 0;
        this.isNewBest = false;

        try {
            await this.audio.loadFile(file, (msg, pct) => {
                this.ui.updateLoading(msg, pct);
            });

            // Generate level
            this.levelGen.generate(this.audio);

            // Start game after short delay
            setTimeout(() => this._startGame(), 500);
        } catch (error) {
            console.error('Error loading audio:', error);
            this.ui.updateLoading('Error al cargar el audio. Intenta con otro archivo.', 0);
            setTimeout(() => {
                this.ui.showScreen('menu');
                this.state = GameState.MENU;
            }, 2000);
        }
    }

    async _onSongFromLibrary(url, title) {
        this.state = GameState.ANALYZING;
        this.ui.showScreen('loading');
        this.ui.updateLoading(`Cargando ${title}...`, 5);

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const file = new File([blob], title, { type: blob.type });
            await this._onFileSelected(file);
        } catch (error) {
            console.error('Error loading song:', error);
            this.ui.updateLoading('Error al cargar la canción.', 0);
            setTimeout(() => {
                this.ui.showScreen('menu');
                this.state = GameState.MENU;
            }, 2000);
        }
    }

    async _onSongFromYoutube(youtubeUrl) {
        this.state = GameState.ANALYZING;
        this.ui.showScreen('loading');
        this.ui.updateLoading('Conectando con YouTube...', 5);

        try {
            // Llama a nuestro servidor proxy local o remoto
            const proxyUrl = `${YOUTUBE_PROXY_URL}/yt?url=${encodeURIComponent(youtubeUrl)}`;
            const response = await fetch(proxyUrl);

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Error en el servidor proxy');
            }

            // Muestra progreso descargando el stream
            this.ui.updateLoading('Descargando audio de YouTube...', 30);

            // Extract the original title from headers if possible
            let title = 'YouTube Audio';
            const titleHeader = response.headers.get('X-Video-Title');
            if (titleHeader) {
                title = decodeURIComponent(titleHeader);
            }

            const blob = await response.blob();

            // Fake a file to maintain compatibility with the rest of the system (high scores, analysis)
            const file = new File([blob], title + '.mp3', { type: blob.type });

            this.ui.updateLoading('Analizando frecuencias...', 60);
            await this._onFileSelected(file);

        } catch (error) {
            console.error('Error procesando YouTube URL:', error);
            this.ui.updateLoading('Error descargando audio de YouTube.', 0);
            setTimeout(() => {
                this.ui.showScreen('menu');
                this.state = GameState.MENU;
            }, 3000);
        }
    }

    _startGame() {
        this.state = GameState.PLAYING;
        this.gameTime = 0;
        this.survivalTime = 0;
        this.isNewBest = false;

        // Recalculate best time just in case it was updated in a previous run
        if (this.currentSongId) {
            this.bestTime = Math.max(
                this.bestTime,
                parseFloat(localStorage.getItem(`hexbeat_best_${this.currentSongId}`)) || 0
            );
        }

        this.lastBeatIndex = -1;
        this.beatCooldown = 0;
        this.lastMelodyIndex = -1;
        this.melodyCooldown = 0;
        this.worldRotation = 0;
        this.worldRotationSpeed = 0.3;
        this.worldRotationTarget = 0.3;
        this.dirChangeTimer = 0;
        this.shakeIntensity = 0;

        this.player.reset();
        this.player.mesh.visible = true;
        this.walls.clear();
        this.particles.clear();
        this.melodyParticles.clear();
        this.levelGen.reset();

        this.renderer.camera.position.x = 0;
        this.renderer.camera.position.y = 0;
        this.worldRotationGroup.rotation.z = 0;

        this.audio.restart();
        this.ui.showScreen('hud');
    }

    _onRetry() {
        this._startGame();
    }

    _onContinue() {
        if (this.state !== GameState.GAME_OVER || this.isTransitioning) return;

        this.state = GameState.PLAYING;

        // Reset the score counter to 0, but leave gameTime and song alone
        this.survivalTime = 0;
        this.isNewBest = false;

        // Clear all current walls so player doesn't instantly die again
        this.walls.clear();
        this.particles.clear();
        this.melodyParticles.clear();
        this.shakeIntensity = 0;

        // Show player again
        this.player.mesh.visible = true;
        this.player.reset();

        // Resume audio from where we died
        this.audio.pauseOffset = this._deathAudioTime || 0;
        this.audio.play();

        this.renderer.camera.position.x = 0;
        this.renderer.camera.position.y = 0;

        this.ui.showScreen('hud');
    }

    _onNewSong() {
        this.state = GameState.MENU;
        this.audio.stop();
        this.player.reset();
        this.player.mesh.visible = true;
        this.walls.clear();
        this.particles.clear();
        this.melodyParticles.clear();
        this.worldRotationGroup.rotation.z = 0;
        this.audioInput?.value && (this.audioInput.value = '');
        this.ui.showScreen('menu');
    }

    _render() {
        this.renderer.render();
    } // end of class

    // --- Community Upload ---
    async _uploadCommunitySong(file, title) {
        if (!firebaseManager.currentUser) {
            this.ui.showCommunityError("Debes iniciar sesión para subir una canción.");
            return;
        }

        const btnSubmit = document.getElementById('btn-submit-community');
        btnSubmit.disabled = true;
        btnSubmit.textContent = "Subiendo...";
        this.ui.communityUploadError.style.display = 'none';

        try {
            const token = await firebaseManager.getAuthToken();

            const formData = new FormData();
            formData.append('audioFile', file);
            formData.append('title', title);

            // Añadir el nombre del usuario logeado como artista
            const uploaderName = firebaseManager.currentUser.displayName || "Usuario Anónimo";
            formData.append('artist', uploaderName);

            const response = await fetch('/upload-community', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || "No se pudo subir la pista.");
            }

            // Success
            this.ui.closeCommunityModal();
            // Refresh community song list
            await this.ui._loadSongLibrary();
            alert("¡Canción publicada en la Comunidad con éxito!");

        } catch (error) {
            this.ui.showCommunityError(error.message);
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.textContent = "Subir";
        }
    }
}
