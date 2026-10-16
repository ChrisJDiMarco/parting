/** Deterministic, planar physics for Parting. Rendering never owns game state. */
export const CONFIG = Object.freeze({
  radius: 300,
  puckRadius: 10,
  goalHalfAngle: Math.PI / 15,
  friction: 120,
  restitution: 0.9,
  minSpeed: 85,
  maxSpeed: 360,
  maxTurns: 24,
  dt: 1 / 240,
});

const INITIAL_POSITIONS = [
  [-160, -50], [-85, -120], [35, -155], [150, -100],
  [160, 50], [85, 120], [-35, 155], [-150, 100],
];
const STOP_SPEED = 1;
const EPSILON = 1e-8;
const POSTS = [0, Math.PI].flatMap((angle) => [-1, 1].map((side) => ({
  x: CONFIG.radius * Math.cos(angle + side * CONFIG.goalHalfAngle),
  y: CONFIG.radius * Math.sin(angle + side * CONFIG.goalHalfAngle),
})));

export function createGame(starter = 0) {
  if (starter !== 0 && starter !== 1) throw new RangeError('Starter must be 0 or 1.');
  return {
    pucks: INITIAL_POSITIONS.map(([x, y], id) => ({ id, x, y, vx: 0, vy: 0 })),
    scores: [0, 0], currentPlayer: starter, starter, turns: 0,
    phase: 'aiming', events: [],
  };
}

/** A rejected action leaves the state untouched. */
export function shoot(game, idA, idB, speed) {
  if (game.phase !== 'aiming' || idA === idB || !Number.isFinite(speed)
      || speed < CONFIG.minSpeed || speed > CONFIG.maxSpeed
      || game.turns >= CONFIG.maxTurns || game.pucks.length < 2) return false;
  const a = game.pucks.find((puck) => puck.id === idA);
  const b = game.pucks.find((puck) => puck.id === idB);
  if (!a || !b || game.pucks.some((puck) => puck.vx !== 0 || puck.vy !== 0)) return false;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const distance = Math.hypot(dx, dy);
  if (distance < EPSILON) return false;
  a.vx = dx / distance * speed;
  a.vy = dy / distance * speed;
  b.vx = -a.vx;
  b.vy = -a.vy;
  game.turns += 1;
  game.phase = 'moving';
  game.events = [];
  return true;
}

/** The goal nearest this point, or null for a solid section of rim. */
function goalAt(x, y) {
  const angleFromHorizontal = Math.atan2(Math.abs(y), Math.abs(x));
  return angleFromHorizontal < CONFIG.goalHalfAngle ? (x < 0 ? 0 : 1) : null;
}

function advance(puck, dt) {
  const speed = Math.hypot(puck.vx, puck.vy);
  if (speed <= STOP_SPEED) {
    puck.vx = 0;
    puck.vy = 0;
    return;
  }
  // Integrate constant deceleration analytically, including a partial last step.
  const duration = Math.min(dt, speed / CONFIG.friction);
  const travel = speed * duration - CONFIG.friction * duration * duration / 2;
  const nx = puck.vx / speed;
  const ny = puck.vy / speed;
  puck.x += nx * travel;
  puck.y += ny * travel;
  const nextSpeed = Math.max(0, speed - CONFIG.friction * dt);
  puck.vx = nextSpeed <= STOP_SPEED ? 0 : nx * nextSpeed;
  puck.vy = nextSpeed <= STOP_SPEED ? 0 : ny * nextSpeed;
}

function reflect(puck, nx, ny, events) {
  // The normal points from the obstacle into legal space.
  const normalSpeed = puck.vx * nx + puck.vy * ny;
  if (normalSpeed >= -EPSILON) return;
  puck.vx -= (1 + CONFIG.restitution) * normalSpeed * nx;
  puck.vy -= (1 + CONFIG.restitution) * normalSpeed * ny;
  events.push({ type: 'wall', x: puck.x, y: puck.y, id: puck.id,
    intensity: Math.min(1, -normalSpeed / CONFIG.maxSpeed) });
}

function collideBoundary(puck, events) {
  const distance = Math.hypot(puck.x, puck.y);
  const innerRadius = CONFIG.radius - CONFIG.puckRadius;
  if (distance > innerRadius && goalAt(puck.x, puck.y) === null) {
    const nx = puck.x / distance;
    const ny = puck.y / distance;
    puck.x = nx * innerRadius;
    puck.y = ny * innerRadius;
    reflect(puck, -nx, -ny, events);
  }
  // Endpoints are physical posts; this closes the gap between the curved wall
  // and a scoring opening, so a puck cannot clip a lip at a shallow angle.
  for (const post of POSTS) {
    const dx = puck.x - post.x;
    const dy = puck.y - post.y;
    const separation = Math.hypot(dx, dy);
    if (separation >= CONFIG.puckRadius) continue;
    const nx = separation > EPSILON ? dx / separation : -post.x / CONFIG.radius;
    const ny = separation > EPSILON ? dy / separation : -post.y / CONFIG.radius;
    puck.x = post.x + nx * CONFIG.puckRadius;
    puck.y = post.y + ny * CONFIG.puckRadius;
    reflect(puck, nx, ny, events);
  }
}

function collidePucks(a, b, events) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  const diameter = CONFIG.puckRadius * 2;
  if (distance >= diameter) return;
  // Stable IDs choose a deterministic normal in the degenerate overlap case.
  const nx = distance > EPSILON ? dx / distance : (a.id < b.id ? 1 : -1);
  const ny = distance > EPSILON ? dy / distance : 0;
  const correction = (diameter - distance + EPSILON) / 2;
  a.x -= nx * correction;
  a.y -= ny * correction;
  b.x += nx * correction;
  b.y += ny * correction;
  const closingSpeed = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (closingSpeed <= EPSILON) return;
  const impulse = (1 + CONFIG.restitution) * closingSpeed / 2;
  a.vx -= impulse * nx;
  a.vy -= impulse * ny;
  b.vx += impulse * nx;
  b.vy += impulse * ny;
  events.push({ type: 'collision', x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2, intensity: Math.min(1, closingSpeed / CONFIG.maxSpeed) });
}

function settle(game, events) {
  if (game.pucks.some((puck) => Math.hypot(puck.vx, puck.vy) > STOP_SPEED)) return;
  for (const puck of game.pucks) {
    puck.vx = 0;
    puck.vy = 0;
  }
  if (game.pucks.length < 2 || game.turns >= CONFIG.maxTurns) game.phase = 'over';
  else {
    game.phase = 'aiming';
    game.currentPlayer = 1 - game.currentPlayer;
  }
  events.push({ type: 'settled', x: 0, y: 0 });
}

/** Advance at most 1 second, subdividing into safe fixed-size physics steps. */
export function step(game, dt = CONFIG.dt) {
  const events = [];
  game.events = events;
  if (game.phase !== 'moving' || !Number.isFinite(dt) || dt <= 0) return events;
  let remaining = Math.min(dt, 1);
  while (remaining > EPSILON && game.phase === 'moving') {
    const slice = Math.min(remaining, CONFIG.dt);
    for (const puck of game.pucks) advance(puck, slice);
    // A few inexpensive solver passes keep compact piles and rim contacts stable.
    for (let pass = 0; pass < 4; pass += 1) {
      for (let i = 0; i < game.pucks.length; i += 1) {
        for (let j = i + 1; j < game.pucks.length; j += 1) {
          collidePucks(game.pucks[i], game.pucks[j], events);
        }
      }
      for (const puck of game.pucks) collideBoundary(puck, events);
    }
    game.pucks = game.pucks.filter((puck) => {
      const player = goalAt(puck.x, puck.y);
      if (player === null || Math.hypot(puck.x, puck.y) < CONFIG.radius) return true;
      game.scores[player] += 1;
      events.push({ type: 'score', x: puck.x, y: puck.y, player, id: puck.id });
      return false;
    });
    settle(game, events);
    remaining -= slice;
  }
  return events;
}

export function winner(game) {
  if (game.phase !== 'over' || game.scores[0] === game.scores[1]) return null;
  return game.scores[0] > game.scores[1] ? 0 : 1;
}
