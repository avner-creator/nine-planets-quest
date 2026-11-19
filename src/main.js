// Nine Planets Quest - entry point.
import { Game } from './game/game.js';

function showError(err) {
  console.error(err);
  const box = document.getElementById('boot-status');
  if (box) box.textContent = 'Oops, something went wrong while loading. Try reloading the page.';
}

try {
  const game = new Game();
  game.boot().catch(showError);
} catch (e) {
  showError(e);
}
