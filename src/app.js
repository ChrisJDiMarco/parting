import { createGame, shoot, step, CONFIG, winner } from './physics.js';
import { RinkScene } from './scene.js';
import { GameSound } from './sound.js';

const $ = (selector) => document.querySelector(selector);
const names = ['Amber', 'Blue'];
const letters = (id) => String.fromCharCode(65 + id);
let game = createGame(0);
let selected = [];
let rink;
let force = 50;
let shotArmed = false;
let toastTimer;
let endTimer;
let frame;
let lastTime = performance.now();
let accumulator = 0;
let previousPhase = game.phase;
const sound = new GameSound();
const speed = () => CONFIG.minSpeed + force / 100 * (CONFIG.maxSpeed - CONFIG.minSpeed);
const hasDialog = () => Boolean(document.querySelector('dialog[open]'));

function toast(message, duration = 2400) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), duration);
}

function updateUI() {
  const moving = game.phase === 'moving'; const over = game.phase === 'over'; const ready = selected.length === 2 && !moving && !over;
  document.documentElement.style.setProperty('--accent', game.currentPlayer === 0 ? 'var(--amber)' : 'var(--blue)');
  for (let i = 0; i < 2; i++) {
    $(`#score-${i}`).textContent = game.scores[i]; $(`#player-${i}`).classList.toggle('active', i === game.currentPlayer && !over);
    $(`#collected-${i}`).replaceChildren(...Array.from({ length: game.scores[i] }, () => document.createElement('i')));
  }
  $('#turn-number').textContent = `${over ? 'FINISHED' : 'TURN ' + String(Math.min(24, moving ? game.turns : game.turns + 1)).padStart(2, '0')} / 24`;
  $('#turn-player').textContent = over ? (winner(game) === null ? 'An even table' : `${names[winner(game)]} wins`) : `${names[game.currentPlayer]} ${moving ? 'in motion' : 'to play'}`;
  $('#remaining').textContent = `${game.pucks.length} SHARED PUCK${game.pucks.length === 1 ? '' : 'S'}`;
  $('#step-label').textContent = over ? 'MATCH COMPLETE' : moving ? '03 / WATCH THE CONSEQUENCES' : ready ? '02 / SET THE FORCE' : '01 / CHOOSE A PAIR';
  $('#instruction').textContent = over ? 'What would you change?' : moving ? 'One move. Two consequences.' : ready ? 'They go their separate ways.' : selected.length ? `${letters(selected[0])} needs a partner.` : 'Every puck needs a partner.';
  $('#instruction-detail').textContent = over ? 'Start a rematch to try the same table with the other player first.' : moving ? 'Both goals are live. Wait for the table to settle.' : ready ? 'Drag the slider and release. Both pucks receive equal force.' : 'Click any two pucks. Their positions aim your shot.';
  $('#pair-label').textContent = selected.length ? selected.map(letters).join('  ↔  ') + (selected.length === 1 ? '  ↔  ?' : '  SELECTED') : moving ? 'PAIR IN MOTION' : 'NO PAIR SELECTED';
  $('#power').disabled = !ready; $('#release').disabled = !ready; $('#clear').disabled = selected.length === 0 || moving;
  $('#power-hint').textContent = ready ? 'Rings show travel without collisions' : moving ? 'Next turn begins when every puck stops' : 'Select two pucks to set the force';
  $('#power-value').textContent = `${Math.round(force)}% FORCE`;
  $('#power').style.background = `linear-gradient(to right,var(--accent) ${force}%,#344851 ${force}%)`;
  const access = $('#accessible-pucks'); access.replaceChildren();
  for (const puck of game.pucks) {
    const button = document.createElement('button'); button.textContent = `Puck ${letters(puck.id)}`; button.setAttribute('aria-pressed', String(selected.includes(puck.id)));
    button.disabled = game.phase !== 'aiming'; button.addEventListener('click', () => select(puck.id)); access.append(button);
  }
}

function select(id) {
  if (game.phase !== 'aiming' || hasDialog() || !game.pucks.some(puck => puck.id === id)) return;
  sound.unlock();
  if (selected.includes(id)) selected = selected.filter(item => item !== id);
  else if (selected.length < 2) selected.push(id);
  else selected = [selected[0], id];
  sound.select(); updateUI();
}

function clear() { selected = []; shotArmed = false; updateUI(); }

function release() {
  if (hasDialog() || selected.length !== 2) return;
  if (!shoot(game, selected[0], selected[1], speed())) return;
  sound.unlock(); sound.release(force / 100); selected = []; shotArmed = false; accumulator = 0;
  $('#toast').classList.remove('visible'); updateUI();
}

function showResult() {
  if (game.phase !== 'over') return;
  const result = winner(game);
  $('#result-title').textContent = result === null ? 'An even table.' : `${names[result]} wins.`;
  $('#result-score').replaceChildren(document.createTextNode(String(game.scores[0])), Object.assign(document.createElement('span'), { textContent: '—' }), document.createTextNode(String(game.scores[1])));
  $('#result-detail').textContent = `${game.turns} turns. ${game.pucks.length} ${game.pucks.length === 1 ? 'puck' : 'pucks'} left behind. What would you leave on the table next time?`;
  if (!hasDialog()) $('#end-dialog').showModal();
}

function newMatch() {
  clearTimeout(endTimer); clearTimeout(toastTimer);
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  game = createGame(1 - game.starter); selected = []; force = 50; shotArmed = false; accumulator = 0;
  previousPhase = 'aiming'; $('#power').value = '50'; rink.view('studio'); setViewButtons('studio'); updateUI();
  toast(`${names[game.currentPlayer]} starts this time.`, 2400);
}

function setViewButtons(view) {
  for (const name of ['studio', 'top']) {
    $(`#view-${name}`).classList.toggle('selected', name === view); $(`#view-${name}`).setAttribute('aria-pressed', String(name === view));
  }
}

function onEvents(events) {
  for (const event of events) {
    rink.event(event); sound.event(event);
    if (event.type === 'score') {
      toast(`${names[event.player]} +1`, 2000);
      const player = $(`#player-${event.player}`); player.classList.remove('scored'); void player.offsetWidth; player.classList.add('scored');
      updateUI();
    }
    if (event.type === 'settled') {
      updateUI();
      if (game.phase === 'over') endTimer = setTimeout(showResult, 800);
      else toast(`${names[game.currentPlayer]} to play. Pass the mouse.`, 2200);
    }
  }
}

function tick(now) {
  const dt = Math.min((now - lastTime) / 1000, .075); lastTime = now;
  // Physics advances only in fixed increments, independent of display refresh rate.
  if (game.phase === 'moving') {
    accumulator += dt;
    while (accumulator >= CONFIG.dt && game.phase === 'moving') { onEvents(step(game, CONFIG.dt)); accumulator -= CONFIG.dt; }
  } else accumulator = 0;
  if (previousPhase !== game.phase) { previousPhase = game.phase; updateUI(); }
  rink.update(game, selected, speed(), dt);
  frame = requestAnimationFrame(tick);
}

function fail(error) {
  cancelAnimationFrame(frame); $('#fatal').hidden = false;
  $('#fatal-message').textContent = error?.message || String(error);
  console.error(error);
}

$('#reload').addEventListener('click', () => location.reload());
window.addEventListener('error', (event) => fail(event.error || event.message));
window.addEventListener('unhandledrejection', (event) => fail(event.reason));

try {
  rink = new RinkScene($('#scene')); rink.onPick = select; rink.onCancel = clear;
  rink.onCameraChange = () => setViewButtons('');
  $('#scene').addEventListener('webglcontextlost', (event) => { event.preventDefault(); fail(new Error('Graphics context interrupted. Reopen the rink to start a new match.')); });
  $('#power').addEventListener('input', (event) => { force = Number(event.target.value); updateUI(); });
  $('#power').addEventListener('pointerdown', (event) => { if (event.button === 0 && !$('#power').disabled) { shotArmed = true; sound.unlock(); } });
  window.addEventListener('pointerup', (event) => { if (shotArmed && event.button === 0) release(); });
  window.addEventListener('pointercancel', () => { shotArmed = false; });
  window.addEventListener('blur', () => { shotArmed = false; });
  $('#release').addEventListener('click', release); $('#clear').addEventListener('click', clear);
  $('#sound').addEventListener('click', () => { sound.enabled = !sound.enabled; if (sound.enabled) sound.unlock(); $('#sound').textContent = sound.enabled ? 'Sound on' : 'Sound off'; $('#sound').setAttribute('aria-pressed', String(sound.enabled)); });
  $('#help').addEventListener('click', () => { shotArmed = false; $('#help-dialog').showModal(); });
  $('#close-help').addEventListener('click', () => $('#help-dialog').close());
  $('#play').addEventListener('click', () => { sound.unlock(); $('#help-dialog').close(); });
  $('#new-match').addEventListener('click', () => { shotArmed = false; if (game.turns === 0 || game.phase === 'over') newMatch(); else $('#new-dialog').showModal(); });
  $('#cancel-new').addEventListener('click', () => $('#new-dialog').close()); $('#confirm-new').addEventListener('click', newMatch);
  $('#rematch').addEventListener('click', newMatch); $('#inspect').addEventListener('click', () => $('#end-dialog').close());
  $('#view-studio').addEventListener('click', () => { rink.view('studio'); setViewButtons('studio'); });
  $('#view-top').addEventListener('click', () => { rink.view('top'); setViewButtons('top'); });
  $('#view-reset').addEventListener('click', () => { rink.view('studio'); setViewButtons('studio'); });
  window.addEventListener('keydown', (event) => {
    if (hasDialog()) return;
    if (/^[1-8]$/.test(event.key)) select(Number(event.key) - 1);
    else if (event.key === 'Escape') clear();
    else if (event.code === 'Space' && !['BUTTON', 'INPUT'].includes(document.activeElement.tagName)) { event.preventDefault(); release(); }
    else if (event.key.toLowerCase() === 't') { rink.view('top'); setViewButtons('top'); }
    else if (event.key === '?') $('#help-dialog').showModal();
  });
  // Read-only diagnostics allow verification of real pointer actions without
  // introducing an alternate way to mutate a match.
  window.parting = Object.freeze({
    snapshot: () => structuredClone({ ...game, selected, force }),
    projectPuck: (id) => { const point = rink.project(id); const rect = $('#scene').getBoundingClientRect(); return point ? { x: point.x + rect.left, y: point.y + rect.top } : null; },
    diagnostics: () => ({ webgl: rink.renderer.capabilities.isWebGL2, renderer: rink.renderer.info.render, camera: rink.camera.position.toArray(), version: '1.0.0' }),
  });
  updateUI(); frame = requestAnimationFrame(tick);
} catch (error) { fail(error); }
