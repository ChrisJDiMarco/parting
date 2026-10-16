import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, createGame, shoot, step, winner } from '../src/physics.js';

function close(a, b, tolerance = 1e-6) {
  assert.ok(Math.abs(a - b) <= tolerance, `Expected ${a} to be within ${tolerance} of ${b}`);
}
function puck(id, x, y, vx = 0, vy = 0) { return { id, x, y, vx, vy }; }
function position(pucks) {
  const game = createGame();
  game.pucks = pucks;
  return game;
}
function finish(game) {
  const events = [];
  for (let i = 0; i < 3000 && game.phase === 'moving'; i += 1) events.push(...step(game));
  assert.notEqual(game.phase, 'moving', 'Every shot must settle');
  return events;
}

test('setup and equal outward impulses conserve total momentum', () => {
  const game = createGame(1);
  assert.equal(game.pucks.length, 8);
  assert.equal(game.currentPlayer, 1);
  assert.deepEqual(game.pucks[0], puck(0, -160, -50));
  assert.equal(shoot(game, 0, 1, 200), true);
  const [a, b] = game.pucks;
  close(a.vx + b.vx, 0);
  close(a.vy + b.vy, 0);
  close(Math.hypot(a.vx, a.vy), 200);
  assert.ok(a.vx * (a.x - b.x) + a.vy * (a.y - b.y) > 0);
  assert.equal(game.turns, 1);
  assert.equal(game.phase, 'moving');
});

test('illegal shots never mutate state', () => {
  const game = createGame();
  const before = JSON.stringify(game);
  for (const args of [[0, 0, 100], [0, 100, 100], [0, 1, 0], [0, 1, 400], [0, 1, NaN]]) {
    assert.equal(shoot(game, ...args), false);
    assert.equal(JSON.stringify(game), before);
  }
  shoot(game, 0, 1, 100);
  const moving = JSON.stringify(game);
  assert.equal(shoot(game, 2, 3, 100), false);
  assert.equal(JSON.stringify(game), moving);
  assert.throws(() => createGame(2), RangeError);
});

test('friction stops a clear shot at its analytical distance, then switches player', () => {
  const game = position([puck(0, -30, 0), puck(1, 30, 0)]);
  shoot(game, 0, 1, 120);
  const events = finish(game);
  close(game.pucks[0].x, -90, 0.01);
  close(game.pucks[1].x, 90, 0.01);
  assert.equal(game.currentPlayer, 1);
  assert.equal(game.phase, 'aiming');
  assert.equal(events.filter((event) => event.type === 'settled').length, 1);
  assert.ok(game.pucks.every((p) => p.vx === 0 && p.vy === 0));
});

test('equal masses transfer velocity with restitution and preserve pair momentum', () => {
  const game = position([puck(0, 0, 0, 120), puck(1, 20.1, 0)]);
  game.phase = 'moving';
  const events = step(game);
  // Friction first subtracts 0.5 from the moving puck's speed.
  close(game.pucks[0].vx, 119.5 * 0.05);
  close(game.pucks[1].vx, 119.5 * 0.95);
  close(game.pucks[0].vx + game.pucks[1].vx, 119.5);
  assert.ok(events.some((e) => e.type === 'collision'));
});

test('curved wall reflects the normal velocity and retains tangential velocity', () => {
  const game = position([puck(0, 0, 289.9, 0, 120), puck(1, -100, 0)]);
  game.phase = 'moving';
  const events = step(game);
  close(game.pucks[0].vy, -119.5 * 0.9);
  close(game.pucks[0].y, 290);
  assert.ok(events.some((e) => e.type === 'wall'));
});

test('physical posts reject a shot aimed just inside a goal lip', () => {
  const angle = CONFIG.goalHalfAngle - 0.01;
  const nx = Math.cos(angle);
  const ny = Math.sin(angle);
  const game = position([puck(0, 280 * nx, 280 * ny, 160 * nx, 160 * ny), puck(1, 0, 0)]);
  game.phase = 'moving';
  const events = finish(game);
  assert.deepEqual(game.scores, [0, 0]);
  assert.ok(events.some((e) => e.type === 'wall'));
  assert.equal(game.pucks.length, 2);
});

test('one shot can score for both players before ending', () => {
  const game = position([puck(2, -260, 0), puck(7, 260, 0)]);
  game.currentPlayer = 1;
  assert.equal(shoot(game, 2, 7, 180), true);
  const events = finish(game);
  assert.deepEqual(game.scores, [1, 1]);
  assert.equal(game.pucks.length, 0);
  assert.equal(game.phase, 'over');
  assert.equal(winner(game), null);
  assert.deepEqual(events.filter((e) => e.type === 'score').map((e) => e.player).sort(), [0, 1]);
  assert.equal(events.at(-1).type, 'settled');
});

test('a goal belongs to its opening, not the shooter; surviving ids are stable', () => {
  const game = position([puck(2, -260, 0), puck(7, -100, 0), puck(4, 0, 150)]);
  game.currentPlayer = 1;
  shoot(game, 2, 7, 180);
  finish(game);
  assert.deepEqual(game.scores, [1, 0]);
  assert.deepEqual(game.pucks.map((p) => p.id), [7, 4]);
  assert.equal(game.phase, 'aiming');
});

test('the 24th shot completes all physics before the match ends', () => {
  const game = position([puck(0, -30, 0), puck(1, 30, 0)]);
  game.turns = 23;
  game.scores = [3, 2];
  shoot(game, 0, 1, 120);
  assert.equal(game.phase, 'moving');
  assert.equal(winner(game), null);
  finish(game);
  assert.equal(game.phase, 'over');
  assert.equal(game.turns, 24);
  assert.equal(winner(game), 0);
  assert.equal(shoot(game, 0, 1, 120), false);
});

test('invalid frame deltas have no physical effect and large deltas subdivide', () => {
  const game = createGame();
  shoot(game, 0, 1, 100);
  const before = JSON.stringify(game.pucks);
  for (const dt of [0, -1, NaN, Infinity]) step(game, dt);
  assert.equal(JSON.stringify(game.pucks), before);
  const other = structuredClone(game);
  step(game, 0.25);
  for (let i = 0; i < 60; i += 1) step(other);
  for (let i = 0; i < game.pucks.length; i += 1) {
    close(game.pucks[i].x, other.pucks[i].x);
    close(game.pucks[i].y, other.pucks[i].y);
  }
});

test('repeatable randomized full games settle, conserve pucks, and remain finite', () => {
  let seed = 812341;
  function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; }
  for (let run = 0; run < 80; run += 1) {
    const game = createGame(run % 2);
    while (game.phase !== 'over') {
      const a = Math.floor(random() * game.pucks.length);
      const b = (a + 1 + Math.floor(random() * (game.pucks.length - 1))) % game.pucks.length;
      assert.equal(shoot(game, game.pucks[a].id, game.pucks[b].id,
        CONFIG.minSpeed + random() * (CONFIG.maxSpeed - CONFIG.minSpeed)), true);
      finish(game);
      assert.equal(game.pucks.length + game.scores[0] + game.scores[1], 8);
      assert.ok(game.turns <= 24);
      for (const puck of game.pucks) {
        assert.ok([puck.x, puck.y, puck.vx, puck.vy].every(Number.isFinite));
        assert.ok(Math.hypot(puck.x, puck.y) < CONFIG.radius + 1e-6);
      }
      for (let i = 0; i < game.pucks.length; i += 1) {
        for (let j = i + 1; j < game.pucks.length; j += 1) {
          assert.ok(Math.hypot(game.pucks[i].x - game.pucks[j].x,
            game.pucks[i].y - game.pucks[j].y) >= 19.98, 'Settled pucks should not overlap');
        }
      }
    }
  }
});
