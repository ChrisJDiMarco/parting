import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CONFIG, shoot, step } from '../src/physics.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const receiptDirectory = new URL('../receipts/', import.meta.url);
await mkdir(receiptDirectory, { recursive: true });
const receipt = { startedAt: new Date().toISOString(), status: 'running', checks: [], shots: [], errors: [], console: [] };
let application;
let page;
const check = (description) => { receipt.checks.push(description); console.log(`PASS ${description}`); };

class Table {
  constructor(window) { this.page = window; }
  snapshot() { return this.page.evaluate(() => window.parting.snapshot()); }
  async select(ids) {
    for (const id of ids) {
      const point = await this.page.evaluate((puckId) => window.parting.projectPuck(puckId), id);
      assert.ok(point, `Puck ${id} must project onto table`);
      await this.page.mouse.click(point.x, point.y);
    }
    assert.deepEqual((await this.snapshot()).selected, ids, 'Real canvas clicks select requested pair');
  }
  async force(value) {
    const slider = this.page.locator('#power');
    const box = await slider.boundingBox();
    assert.ok(box);
    const current = (await this.snapshot()).force;
    const x = (power) => box.x + 7.5 + (box.width - 15) * power / 100;
    await this.page.mouse.move(x(current), box.y + box.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(x(value), box.y + box.height / 2, { steps: 10 });
    assert.equal((await this.snapshot()).force, value, 'Pointer drag sets intended force');
    await this.page.mouse.up();
  }
  async settled() {
    await this.page.waitForFunction(() => window.parting.snapshot().phase !== 'moving', null, { timeout: 30000 });
    return this.snapshot();
  }
  async assertPucksAboveControls() {
    const layout = await this.page.evaluate(() => ({
      footerTop: document.querySelector('.controls').getBoundingClientRect().top,
      points: window.parting.snapshot().pucks.map((puck) => ({ id: puck.id, ...window.parting.projectPuck(puck.id) })),
    }));
    for (const puck of layout.points) assert.ok(puck.y + 10 < layout.footerTop, `Puck ${puck.id} remains above footer`);
  }
}

// Explore copies outside the renderer. All match mutations below still use real UI input.
function chooseShot(game) {
  let best;
  for (let a = 0; a < game.pucks.length; a++) for (let b = a + 1; b < game.pucks.length; b++) {
    for (const force of [100, 75, 50, 25]) {
      const copy = structuredClone(game);
      const pair = [copy.pucks[a].id, copy.pucks[b].id];
      assert.ok(shoot(copy, ...pair, CONFIG.minSpeed + force / 100 * (CONFIG.maxSpeed - CONFIG.minSpeed)));
      for (let steps = 0; copy.phase === 'moving' && steps < 20; steps++) step(copy, 1);
      assert.notEqual(copy.phase, 'moving');
      const own = copy.scores[game.currentPlayer] - game.scores[game.currentPlayer];
      const rival = copy.scores[1 - game.currentPlayer] - game.scores[1 - game.currentPlayer];
      // Small displacement preference creates new positions when no immediate score exists.
      const movement = copy.pucks.reduce((sum, puck) => {
        const before = game.pucks.find((item) => item.id === puck.id);
        return sum + Math.hypot(puck.x - before.x, puck.y - before.y);
      }, 0);
      const value = own * 10 - rival * 8 + movement / 10000;
      if (!best || value > best.value) best = { pair, force, value, predictedScores: copy.scores };
    }
  }
  return best;
}

try {
  application = await electron.launch({ args: [root], cwd: root, env: { ...process.env, PARTING_AUTOMATION: '1' } });
  page = await application.firstWindow();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => receipt.errors.push(error.message));
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) receipt.console.push({ type: message.type(), text: message.text() });
  });
  await page.waitForFunction(() => Boolean(window.parting));
  const table = new Table(page);
  assert.equal(await page.locator('#fatal').isVisible(), false);
  receipt.diagnostics = await page.evaluate(() => window.parting.diagnostics());
  assert.equal(receipt.diagnostics.webgl, true);
  assert.equal((await table.snapshot()).pucks.length, 8);
  check('Separate native Electron instance renders WebGL2 rink and eight pucks');
  await page.screenshot({ path: new URL('ui-studio.png', receiptDirectory).pathname });

  await page.locator('#help').click();
  assert.equal(await page.locator('#help-dialog').isVisible(), true);
  await page.locator('#play').click();
  assert.equal(await page.locator('#help-dialog').isVisible(), false);
  check('Rules modal opens and Let’s play returns to table');

  await page.locator('#view-top').click();
  assert.equal(await page.locator('#view-top').getAttribute('aria-pressed'), 'true');
  await page.waitForFunction(() => {
    const camera = window.parting.diagnostics().camera;
    return Math.abs(camera[0]) < 1 && camera[1] > 1450;
  });
  const topCamera = await page.evaluate(() => window.parting.diagnostics().camera);
  await page.mouse.move(100, 350);
  await page.mouse.down();
  await page.mouse.move(180, 400, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction((before) => {
    const after = window.parting.diagnostics().camera;
    return Math.hypot(...after.map((value, i) => value - before[i])) > 20;
  }, topCamera);
  assert.equal(await page.locator('#view-top').getAttribute('aria-pressed'), 'false');
  const orbitCamera = await page.evaluate(() => window.parting.diagnostics().camera);
  await page.mouse.wheel(0, 180);
  await page.waitForFunction((before) => {
    const after = window.parting.diagnostics().camera;
    return Math.abs(Math.hypot(...after) - Math.hypot(...before)) > 10;
  }, orbitCamera);
  check('Top camera remains freely orbitable and mouse wheel zooms');
  await page.locator('#view-studio').click();
  assert.equal(await page.locator('#view-studio').getAttribute('aria-pressed'), 'true');
  await page.waitForFunction(() => {
    const camera = window.parting.diagnostics().camera;
    return Math.hypot(camera[0], camera[1] - 750, camera[2] - 850) < 1;
  });
  check('Top and 3D camera presets respond');

  await table.select([0, 1]);
  assert.equal(await page.locator('#release').isEnabled(), true);
  await page.locator('#clear').click();
  assert.deepEqual((await table.snapshot()).selected, []);
  assert.equal((await table.snapshot()).turns, 0);
  check('Canvas picking and Clear pair cancel without spending turn');

  await table.select([0, 1]);
  const beforeShot = await table.snapshot();
  await table.force(75);
  assert.equal(await page.locator('#release').isDisabled(), true);
  await page.mouse.up();
  const settled = await table.settled();
  assert.equal(settled.turns, 1);
  assert.equal(settled.currentPlayer, 1 - beforeShot.currentPlayer);
  assert.deepEqual(settled.selected, []);
  check('Mouse slider drag and release fires exactly once, settles and passes turn');

  await page.locator('#new-match').click();
  assert.equal(await page.locator('#new-dialog').isVisible(), true);
  await page.locator('#cancel-new').click();
  assert.equal((await table.snapshot()).turns, 1);
  check('Cancel new-match confirmation preserves active game');

  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 740));
  await page.waitForFunction(() => window.innerWidth === 1000);
  for (const selector of ['#help', '#new-match', '#view-top', '#power', '#release', '#clear']) {
    const bounds = await page.locator(selector).boundingBox();
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height, `${selector} fits minimum size`);
  }
  await page.screenshot({ path: new URL('ui-minimum-size.png', receiptDirectory).pathname });
  await table.assertPucksAboveControls();
  check('All primary controls fit native minimum size 1000×740');

  await page.locator('#view-top').click();
  await page.waitForFunction(() => {
    const camera = window.parting.diagnostics().camera;
    return Math.hypot(camera[0], camera[1] - 1500, camera[2] - 78) < 1;
  });
  await page.screenshot({ path: new URL('ui-minimum-top.png', receiptDirectory).pathname });
  await table.assertPucksAboveControls();
  while ((await table.snapshot()).phase !== 'over') {
    const before = await table.snapshot();
    await table.assertPucksAboveControls();
    const candidate = chooseShot(before);
    await table.select(candidate.pair);
    await table.force(candidate.force);
    const after = await table.settled();
    assert.equal(after.turns, before.turns + 1);
    if (after.phase !== 'over') assert.equal(after.currentPlayer, 1 - before.currentPlayer);
    receipt.shots.push({ turn: after.turns, player: before.currentPlayer, pair: candidate.pair, force: candidate.force, scores: after.scores, pucks: after.pucks.length });
    console.log(`TURN ${after.turns} score ${after.scores.join('–')} pucks ${after.pucks.length}`);
  }
  const result = await table.snapshot();
  assert.ok(result.scores[0] + result.scores[1] > 0, 'Full game must exercise scoring');
  assert.equal(result.scores[0] + result.scores[1] + result.pucks.length, 8);
  assert.ok(result.turns === 24 || result.pucks.length < 2);
  await page.locator('#end-dialog').waitFor({ state: 'visible' });
  await page.screenshot({ path: new URL('ui-game-over.png', receiptDirectory).pathname });
  receipt.finalGame = result;
  check('Complete game via real mouse input scores, removes pucks and opens result dialog');
  await page.locator('#rematch').click();
  const rematch = await table.snapshot();
  assert.equal(rematch.starter, 1 - result.starter);
  assert.equal(rematch.currentPlayer, rematch.starter);
  assert.equal(rematch.turns, 0);
  assert.equal(rematch.pucks.length, 8);
  assert.deepEqual(rematch.scores, [0, 0]);
  assert.equal(await page.locator('#end-dialog').isVisible(), false);
  check('Rematch clears scores, restores eight pucks and swaps starter');
  assert.deepEqual(receipt.errors, []);
  assert.deepEqual(receipt.console.filter((entry) => entry.type === 'error'), []);
  check('No renderer exceptions or console errors');
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.failure = error.stack;
  if (page && !page.isClosed()) await page.screenshot({ path: new URL('ui-failure.png', receiptDirectory).pathname }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  receipt.completedAt = new Date().toISOString();
  await writeFile(new URL('ui-test.json', receiptDirectory), JSON.stringify(receipt, null, 2) + '\n');
  if (application) await application.close();
}
