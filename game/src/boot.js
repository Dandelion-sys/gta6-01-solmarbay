// Solmar Bay boot: build the game and start its loop.
import { Game } from './game.js';

const game = new Game();
window.__solmarGame = game;
game.start();
