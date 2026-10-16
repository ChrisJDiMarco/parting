import { _electron as electron } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const app = await electron.launch({ args: [root], env: { ...process.env, PARTING_AUTOMATION: '1' } });
try {
  const page = await app.firstWindow();
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    const circle = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };
    const background = ctx.createLinearGradient(100, 50, 900, 970); background.addColorStop(0, '#294b5b'); background.addColorStop(1, '#091821');
    ctx.fillStyle = background; ctx.beginPath(); ctx.roundRect(36, 36, 952, 952, 213); ctx.fill();
    ctx.save(); ctx.shadowColor = '#000a'; ctx.shadowBlur = 45; ctx.shadowOffsetY = 36;
    circle(512, 512, 360); ctx.fillStyle = '#081820'; ctx.fill(); ctx.restore();
    const metal = ctx.createLinearGradient(220, 170, 800, 870); metal.addColorStop(0, '#bfccce'); metal.addColorStop(.25, '#526e7a'); metal.addColorStop(.7, '#243b47'); metal.addColorStop(1, '#8da9b2');
    circle(512, 512, 350); ctx.strokeStyle = metal; ctx.lineWidth = 22; ctx.stroke();
    const surface = ctx.createRadialGradient(430, 370, 50, 512, 512, 335); surface.addColorStop(0, '#375c63'); surface.addColorStop(1, '#17343d');
    circle(512, 512, 337); ctx.fillStyle = surface; ctx.fill();
    circle(512, 512, 315); ctx.lineWidth = 1; ctx.strokeStyle = '#88a9ac33'; ctx.stroke();
    for (const [x, color] of [[163, '#f1b777'], [861, '#9cdae5']]) {
      ctx.fillStyle = '#142b35'; ctx.fillRect(x - 22, 444, 44, 136);
      ctx.save(); ctx.shadowBlur = 35; ctx.shadowColor = color; ctx.strokeStyle = color; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(x, 454); ctx.lineTo(x, 570); ctx.stroke(); ctx.restore();
    }
    ctx.strokeStyle = '#afc4c0'; ctx.lineWidth = 3; ctx.setLineDash([7, 12]); ctx.beginPath(); ctx.moveTo(361, 622); ctx.lineTo(663, 402); ctx.stroke(); ctx.setLineDash([]);
    const arrow = (x, y, dx, dy, color) => { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(dy, dx)); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(70, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(77, 0); ctx.lineTo(58, -9); ctx.lineTo(58, 9); ctx.closePath(); ctx.fill(); ctx.restore(); };
    arrow(320, 652, -1, .73, '#efad64'); arrow(704, 372, 1, -.73, '#9cdae5');
    for (const [x, y] of [[361, 622], [663, 402]]) {
      ctx.save(); ctx.shadowBlur = 23; ctx.shadowColor = '#0008'; ctx.shadowOffsetY = 13; circle(x, y + 7, 49); ctx.fillStyle = '#8d9d9d'; ctx.fill(); ctx.restore();
      const ivory = ctx.createLinearGradient(x - 30, y - 40, x + 30, y + 40); ivory.addColorStop(0, '#fffdf3'); ivory.addColorStop(1, '#c9d1c9'); circle(x, y, 49); ctx.fillStyle = ivory; ctx.fill();
      circle(x, y, 38); ctx.strokeStyle = '#a2b1a8'; ctx.lineWidth = 1.3; ctx.stroke(); circle(x, y, 6); ctx.fillStyle = '#6e888b'; ctx.fill();
    }
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await writeFile(new URL('../assets/icon-1024.png', import.meta.url), Buffer.from(image, 'base64'));
} finally { await app.close(); }
