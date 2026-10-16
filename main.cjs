const { app, BrowserWindow, Menu, dialog } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

app.setName('Parting');
let server;
let window;
const root = __dirname;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const importMap = '{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}';
const mapHash = crypto.createHash('sha256').update(importMap).digest('base64');
const csp = `default-src 'self'; script-src 'self' 'sha256-${mapHash}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`;

async function boot() {
  server = http.createServer((req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
      const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      const allowed = relative === 'index.html' || relative.startsWith('src/') || relative.startsWith('assets/') || relative.startsWith('node_modules/three/');
      const file = path.resolve(root, relative);
      if (!allowed || !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      fs.stat(file, (err, stat) => {
        if (err || !stat.isFile()) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
        if (req.method === 'HEAD') { res.end(); return; }
        fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
      });
    } catch { res.writeHead(400).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  window = new BrowserWindow({ width: 1440, height: 960, minWidth: 1000, minHeight: 740,
    title: 'Parting', backgroundColor: '#101a22', titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 23 }, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  window.once('ready-to-show', () => { if (process.env.PARTING_AUTOMATION !== '1' || app.isPackaged) window.show(); });
  window.webContents.on('render-process-gone', (_event, details) => { dialog.showErrorBox('Parting stopped rendering', `Please reopen Parting. Renderer status: ${details.reason}`); });
  window.on('closed', () => { window = null; });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Parting', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'View', submenu: [{ role: 'togglefullscreen' }, ...(!app.isPackaged ? [{ role: 'toggleDevTools' }] : [])] },
    { role: 'windowMenu' }
  ]));
  await window.loadURL(origin);
}

app.whenReady().then(boot).catch(error => { dialog.showErrorBox('Parting could not open', error.message); app.quit(); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => server?.close());
