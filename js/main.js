/**
 * main.js — Entry point
 */
import { Game } from './game.js';

window.onerror = function (msg, url, line, col, error) {
    alert("Global Error: " + msg + "\n" + url + ":" + line);
};

// Wait for DOM
window.addEventListener('DOMContentLoaded', () => {
    try {
        const canvas = document.getElementById('game-canvas');
        if (!canvas) {
            alert('Canvas element not found!');
            return;
        }

        // Create game instance
        const game = new Game(canvas);

        console.log('🎮 HexBeat initialized!');
    } catch (e) {
        alert("Startup Error: " + e.message + "\n" + e.stack);
        console.error(e);
    }
});
