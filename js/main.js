/**
 * main.js — Entry point
 */
import { Game } from './game.js';

// Wait for DOM
window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas');

    if (!canvas) {
        console.error('Canvas element not found!');
        return;
    }

    // Create game instance
    const game = new Game(canvas);

    console.log('🎮 HexBeat initialized!');
    console.log('Upload an MP3 or OGG file to start playing.');
});
