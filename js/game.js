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
        this.levelGen = new LevelGenerator();
        this.ui = new UI();

        // State
        this.state = GameState.MENU;
        this.gameTime = 0;
        this.survivalTime = 0;
        this.lastTimestamp = 0;
        this.isRunning = false;

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

        // Direction change timer
        this.dirChangeTimer = 0;
        this.dirChangeInterval = 8; // seconds

        // Setup UI callbacks
        this.ui.onFileSelected = (file) => this._onFileSelected(file);
        this.ui.onSongSelected = (url, title) => this._onSongFromLibrary(url, title);
        this.ui.onRetry = () => this._onRetry();
        this.ui.onNewSong = () => this._onNewSong();
        this.ui.onContinue = () => this._onContinue();

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

            // Update wall colors — continuous RGB cycling
            this.walls.setColor(this.renderer.getWallColor());

            // Beat detection for particles
            this._handleBeats(currentAudioTime, audioData);

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
        } else if (this.state === GameState.GAME_OVER) {
            this.gameTime += dt;
            const idleAudio = { bass: 0, mid: 0, treble: 0, energy: 0 };
            this.renderer.update(dt, this.gameTime, idleAudio, null, null);
            this.particles.update(dt);
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

    _onGameOver() {
        this.state = GameState.GAME_OVER;

        // Save audio position for continue
        this._deathAudioTime = this.audio.currentTime;

        this.audio.stop();

        // High score check
        if (this.survivalTime > this.bestTime) {
            this.bestTime = this.survivalTime;
            this.isNewBest = true;
            if (this.currentSongId) {
                localStorage.setItem(`hexbeat_best_${this.currentSongId}`, this.bestTime.toString());
            }
        }

        // Explosion at player position
        const px = this.player.mesh.position.x;
        const py = this.player.mesh.position.y;
        this.particles.emitExplosion(px, py);

        // Big shake
        this.shakeIntensity = 2;

        // Hide player
        this.player.mesh.visible = false;

        // Show game over after brief delay
        setTimeout(() => {
            this.ui.showGameOver(this.survivalTime, this.bestTime, this.isNewBest);
        }, 800);
    }

    _onSongComplete() {
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
            this.ui.showGameOver(this.survivalTime, this.bestTime, this.isNewBest);
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
        this.worldRotation = 0;
        this.worldRotationSpeed = 0.3;
        this.worldRotationTarget = 0.3;
        this.dirChangeTimer = 0;
        this.shakeIntensity = 0;

        this.player.reset();
        this.player.mesh.visible = true;
        this.walls.clear();
        this.particles.clear();
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
        if (this.state !== GameState.GAME_OVER) return;

        this.state = GameState.PLAYING;

        // Clear all current walls so player doesn't instantly die again
        this.walls.clear();
        this.particles.clear();
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
        this.worldRotationGroup.rotation.z = 0;
        this.audioInput?.value && (this.audioInput.value = '');
        this.ui.showScreen('menu');
    }

    _render() {
        this.renderer.render();
    }
}
