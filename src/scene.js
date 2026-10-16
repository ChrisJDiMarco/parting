import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG } from './physics.js';

const PALETTE = [0xefad64, 0x88cbdc];
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const vec = (x, y, z) => new THREE.Vector3(x, y, z);

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function surfaceTexture() {
  return canvasTexture(1024, (ctx, size) => {
    ctx.fillStyle = '#173c43'; ctx.fillRect(0, 0, size, size);
    let seed = 67;
    const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 90000; i++) {
      const alpha = random() * 0.06;
      ctx.fillStyle = i % 2 ? `rgba(191,213,207,${alpha})` : `rgba(0,14,23,${alpha})`;
      ctx.fillRect(random() * size, random() * size, random() * 2 + .3, .6);
    }
    const vignette = ctx.createRadialGradient(512, 512, 100, 512, 512, 515);
    vignette.addColorStop(0, '#47727800'); vignette.addColorStop(.8, '#0a1b2210'); vignette.addColorStop(1, '#091c2850');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, size, size);
  });
}

function flatCircle(radius, material, height = 0) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 192), material);
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = height; mesh.receiveShadow = true;
  return mesh;
}

function ring(radius, tube, material, height) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 256), material);
  mesh.rotation.x = Math.PI / 2; mesh.position.y = height; return mesh;
}

function arcBand(inner, outer, start, end, height, depth, material) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, start, end, false);
  shape.absarc(0, 0, inner, end, start, true); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .5, bevelThickness: .5, curveSegments: 96 });
  const mesh = new THREE.Mesh(geometry, material); mesh.rotation.x = -Math.PI / 2; mesh.position.y = height;
  mesh.castShadow = true; mesh.receiveShadow = false; return mesh;
}

export class RinkScene {
  constructor(canvas) {
    this.canvas = canvas; this.pucks = new Map(); this.effects = []; this.labels = new Map();
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = .92;
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.FogExp2(0x101a22, .00045);
    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 4500);
    this.camera.position.set(0, 750, 850);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, -10, 45); this.controls.enableDamping = !this.reducedMotion; this.controls.dampingFactor = .09;
    this.controls.minDistance = 670; this.controls.maxDistance = 1550;
    this.controls.minPolarAngle = .02; this.controls.maxPolarAngle = Math.PI * .41;
    this.controls.enablePan = false; this.controls.rotateSpeed = .55; this.controls.zoomSpeed = .7;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.addEventListener('start', () => { this.cameraGoal = null; this.onCameraChange?.(); });
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    this.cameraGoal = null; this.pointerStart = null; this.hover = null;
    this.setupLight(); this.setupTable(); this.setupAim(); this.setupPointer();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .12, .3, 2.7);
    this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(canvas.parentElement);
    this.resize();
  }

  setupLight() {
    const generator = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment(); this.environment = generator.fromScene(room, .04);
    this.scene.environment = this.environment.texture; this.scene.environmentIntensity = .5; room.dispose(); generator.dispose();
    this.scene.add(new THREE.HemisphereLight(0xc7e5ed, 0x0a1118, .8));
    const key = new THREE.DirectionalLight(0xfff2dc, 2.2); key.position.set(-280, 600, -180); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -430, right: 430, top: 430, bottom: -430, near: 1, far: 1400 });
    key.shadow.bias = -.0002; key.shadow.normalBias = .35; key.shadow.radius = 4; this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x9cd5ed, .85); fill.position.set(360, 260, 260); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0x8ac4cf, 1); rim.position.set(0, 120, -450); this.scene.add(rim);
    this.goalLights = PALETTE.map((color, index) => {
      const light = new THREE.PointLight(color, 23000, 390, 2); light.position.set(index ? 285 : -285, 28, 0); this.scene.add(light); return light;
    });
  }

  setupTable() {
    const steel = new THREE.MeshStandardMaterial({ color: 0x788b92, metalness: .88, roughness: .27 });
    const edge = new THREE.MeshStandardMaterial({ color: 0x1c303b, metalness: .7, roughness: .35 });
    const black = new THREE.MeshStandardMaterial({ color: 0x101b22, metalness: .5, roughness: .38 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x08131c, roughness: .92, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -62; floor.receiveShadow = true; this.scene.add(floor);
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(327, 313, 37, 192), edge);
    platform.position.y = -20; platform.castShadow = true; platform.receiveShadow = true; this.scene.add(platform);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(272, 281, 20, 128), black);
    foot.position.y = -46; foot.castShadow = true; this.scene.add(foot);
    this.scene.add(ring(319, 1.5, steel, -24));
    this.scene.add(ring(313, .8, new THREE.MeshBasicMaterial({ color: 0x38616e }), -35));
    const surface = new THREE.MeshPhysicalMaterial({ map: surfaceTexture(), color: 0x91aaa9, metalness: .22, roughness: .45, clearcoat: .25, clearcoatRoughness: .48 });
    this.scene.add(flatCircle(300, surface, 0));
    const railStarts = [[CONFIG.goalHalfAngle, Math.PI - CONFIG.goalHalfAngle], [Math.PI + CONFIG.goalHalfAngle, TAU - CONFIG.goalHalfAngle]];
    for (const [start, end] of railStarts) {
      this.scene.add(arcBand(300.7, 323, start, end, -2, 11, steel));
      this.scene.add(arcBand(316, 322, start, end, 9.8, 1, edge));
      this.scene.add(arcBand(300, 300.6, start, end, -.8, 3, black));
    }
    const etch = new THREE.MeshBasicMaterial({ color: 0x94afb1, transparent: true, opacity: .18 });
    this.scene.add(ring(281, .22, etch, .15));
    for (let i = 0; i < 120; i++) {
      const angle = i / 120 * TAU;
      if (Math.atan2(Math.abs(Math.sin(angle)), Math.abs(Math.cos(angle))) < CONFIG.goalHalfAngle + .045) continue;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(i % 5 === 0 ? 4 : 2, .13, .45), new THREE.MeshBasicMaterial({ color: 0x253e47 }));
      tick.position.set(Math.cos(angle) * 309, 9.7, Math.sin(angle) * 309); tick.rotation.y = -angle; this.scene.add(tick);
    }
    for (let i = 0; i < 12; i++) {
      const angle = (i + .5) / 12 * TAU;
      if (Math.abs(Math.sin(angle)) < .3) continue;
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, .3, 12), black);
      screw.position.set(Math.cos(angle) * 320, 10.6, Math.sin(angle) * 320); this.scene.add(screw);
    }
    PALETTE.forEach((color, index) => {
      const direction = index ? 1 : -1;
      const tray = new THREE.Mesh(new THREE.BoxGeometry(64, 7, 123), black);
      tray.position.set(direction * 319, -5, 0); tray.receiveShadow = true; this.scene.add(tray);
      const insert = new THREE.Mesh(new THREE.BoxGeometry(42, .5, 114), new THREE.MeshStandardMaterial({ color: 0x08131b, metalness: .15, roughness: .6 }));
      insert.position.set(direction * 320, -.9, 0); this.scene.add(insert);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2, .7, 107), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2, roughness: .3 }));
      stripe.position.set(direction * 338, 0, 0); this.scene.add(stripe);
      for (const z of [-61, 61]) {
        const end = new THREE.Mesh(new THREE.BoxGeometry(42, 4, 2.2), steel); end.position.set(direction * 318, 1, z); this.scene.add(end);
      }
      const haloTexture = canvasTexture(128, (ctx) => {
        const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
        const hex = '#' + color.toString(16); gradient.addColorStop(0, hex + '80'); gradient.addColorStop(1, hex + '00');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
      });
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshBasicMaterial({ map: haloTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .25 }));
      halo.rotation.x = -Math.PI / 2; halo.position.set(direction * 290, .25, 0); this.scene.add(halo);
    });
    const lettering = canvasTexture(1024, (ctx) => {
      ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(156,192,193,.32)';
      ctx.font = '500 78px "Avenir Next", sans-serif'; ctx.letterSpacing = '20px'; ctx.fillText('PARTING', 512, 470);
      ctx.font = '400 19px "Avenir Next", sans-serif'; ctx.letterSpacing = '8px'; ctx.fillStyle = 'rgba(156,192,193,.23)'; ctx.fillText('EQUAL & OPPOSITE', 512, 537);
      ctx.strokeStyle = 'rgba(156,192,193,.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(415, 594); ctx.lineTo(609, 594); ctx.stroke();
      ctx.beginPath(); ctx.arc(403, 594, 6, 0, TAU); ctx.arc(621, 594, 6, 0, TAU); ctx.stroke();
    });
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), new THREE.MeshBasicMaterial({ map: lettering, transparent: true, depthWrite: false, opacity: .5 }));
    logo.rotation.x = -Math.PI / 2; logo.position.y = .22; this.scene.add(logo);
  }

  makePuck(id) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.LatheGeometry([
      new THREE.Vector2(0, .5), new THREE.Vector2(8.5, .5), new THREE.Vector2(9.7, 1), new THREE.Vector2(10, 2),
      new THREE.Vector2(10, 4.7), new THREE.Vector2(9.5, 5.5), new THREE.Vector2(8.6, 6), new THREE.Vector2(0, 6),
    ], 48), new THREE.MeshPhysicalMaterial({ color: 0xe5e6dc, roughness: .21, metalness: .28, clearcoat: 1, clearcoatRoughness: .2 }));
    body.castShadow = true; body.receiveShadow = false; body.userData.puckId = id; group.add(body);
    const stripe = ring(9.85, .24, new THREE.MeshStandardMaterial({ color: 0x4e6871, metalness: .9, roughness: .23 }), 2.1); group.add(stripe);
    const cap = flatCircle(8.7, new THREE.MeshPhysicalMaterial({ color: 0xf5f2e5, roughness: .24, metalness: .07, clearcoat: .65 }), 6.04); cap.receiveShadow = false; group.add(cap);
    group.add(ring(7.3, .1, new THREE.MeshStandardMaterial({ color: 0xb4b9ad, metalness: .55, roughness: .32 }), 6.04));
    const selection = ring(13.3, .55, new THREE.MeshBasicMaterial({ color: PALETTE[0], transparent: true, opacity: .95 }), .55);
    selection.visible = false; group.add(selection);
    const label = document.createElement('span'); label.className = 'puck-label'; label.textContent = String.fromCharCode(65 + id);
    document.querySelector('#puck-labels').append(label); this.labels.set(id, label);
    group.position.y = .08; this.scene.add(group);
    this.pucks.set(id, { group, body, cap, selection, label, departing: false });
  }

  setupAim() {
    this.aim = new THREE.Group(); this.scene.add(this.aim);
    this.link = new THREE.Line(new THREE.BufferGeometry().setFromPoints([vec(0, 0, 0), vec(0, 0, 0)]), new THREE.LineDashedMaterial({ color: 0xeae1ca, dashSize: 4, gapSize: 4, transparent: true, opacity: .7 }));
    this.aim.add(this.link);
    this.arrows = [0, 1].map(() => { const arrow = new THREE.ArrowHelper(vec(1, 0, 0), vec(0, 0, 0), 80, PALETTE[0], 9, 5); this.aim.add(arrow); return arrow; });
    this.stops = [0, 1].map(() => { const mesh = ring(10, .32, new THREE.MeshBasicMaterial({ color: PALETTE[0], transparent: true, opacity: .45 }), .4); this.aim.add(mesh); return mesh; });
    this.aim.visible = false;
  }

  hit(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    // Slightly enlarge the picking silhouette without changing physical puck size.
    const plane = new THREE.Plane(UP, -4); const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, point)) return null;
    let nearest = null; let distance = 17;
    for (const [id, item] of this.pucks) {
      if (item.departing) continue;
      const candidate = Math.hypot(point.x - item.group.position.x, point.z - item.group.position.z);
      if (candidate < distance) { nearest = id; distance = candidate; }
    }
    return nearest;
  }

  setupPointer() {
    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const id = this.hit(event); this.pointerStart = { x: event.clientX, y: event.clientY, id };
      if (id !== null) this.controls.enabled = false;
    }, true);
    this.canvas.addEventListener('pointermove', (event) => {
      this.hover = this.hit(event); this.canvas.style.cursor = this.hover !== null ? 'pointer' : this.pointerStart ? 'grabbing' : 'grab';
    });
    window.addEventListener('pointerup', (event) => {
      if (this.pointerStart && event.button === 0) {
        const start = this.pointerStart;
        if (start.id !== null && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 7) this.onPick?.(start.id);
      }
      this.pointerStart = null; this.controls.enabled = true;
    });
    this.canvas.addEventListener('pointerleave', () => { this.hover = null; });
    window.addEventListener('blur', () => { this.pointerStart = null; this.controls.enabled = true; });
    this.canvas.addEventListener('contextmenu', (event) => { event.preventDefault(); this.onCancel?.(); });
  }

  view(name) {
    this.controls.target.set(0, -10, 45);
    // Leave the whole rink between the scoreboard and footer at the minimum
    // window height; the top preset must also satisfy OrbitControls limits.
    this.cameraGoal = name === 'top' ? vec(0, 1500, 78) : vec(0, 750, 850);
    if (this.reducedMotion) { this.camera.position.copy(this.cameraGoal); this.cameraGoal = null; }
    this.controls.update();
  }

  resize() {
    const width = this.canvas.clientWidth; const height = this.canvas.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false); this.composer?.setSize(width, height);
  }

  project(id) {
    const item = this.pucks.get(id); if (!item) return null;
    const point = vec(item.group.position.x, 6.2, item.group.position.z).project(this.camera);
    return { x: (point.x + 1) / 2 * this.canvas.clientWidth, y: (1 - point.y) / 2 * this.canvas.clientHeight, visible: point.z < 1 };
  }

  event(event) {
    if (event.type === 'score') {
      const item = this.pucks.get(event.id);
      if (item) { item.departing = true; item.departedAt = performance.now(); item.group.position.set(event.x, 0, event.y); }
    }
    if (!['score', 'wall', 'collision'].includes(event.type)) return;
    const color = event.type === 'score' ? PALETTE[event.player] : 0xc5dce0;
    const mesh = ring(event.type === 'score' ? 14 : 6, .5, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .7, depthWrite: false }), .7);
    mesh.position.x = event.x; mesh.position.z = event.y; this.scene.add(mesh);
    this.effects.push({ mesh, born: performance.now(), duration: event.type === 'score' ? 950 : 400 });
    if (event.type === 'score') this.goalLights[event.player].intensity = 100000;
  }

  update(game, selected, speed, dt) {
    const now = performance.now();
    if (this.cameraGoal) {
      this.camera.position.lerp(this.cameraGoal, 1 - Math.exp(-dt * 10));
      if (this.camera.position.distanceTo(this.cameraGoal) < .2) { this.camera.position.copy(this.cameraGoal); this.cameraGoal = null; }
    }
    this.controls.update();
    const ids = new Set(game.pucks.map(puck => puck.id));
    for (const puck of game.pucks) {
      if (!this.pucks.has(puck.id)) this.makePuck(puck.id);
      const item = this.pucks.get(puck.id);
      item.departing = false; item.group.visible = true; item.group.position.set(puck.x, .08, puck.y);
      item.group.rotation.set(0, 0, 0); item.group.scale.setScalar(1);
      item.selection.visible = selected.includes(puck.id) || this.hover === puck.id;
      item.selection.material.color.setHex(PALETTE[game.currentPlayer]); item.selection.material.opacity = selected.includes(puck.id) ? 1 : .4;
      item.cap.material.color.setHex(selected.includes(puck.id) ? 0xffe6b8 : 0xf5f2e5);
      const point = this.project(puck.id); item.label.style.display = point?.visible ? '' : 'none';
      item.label.style.left = `${point.x}px`; item.label.style.top = `${point.y}px`; item.label.classList.toggle('selected', selected.includes(puck.id));
    }
    for (const [id, item] of this.pucks) {
      if (ids.has(id)) continue;
      item.label.style.display = 'none'; item.selection.visible = false;
      if (item.departing && now - item.departedAt < 500 && !this.reducedMotion) {
        const t = (now - item.departedAt) / 500;
        item.group.position.x += Math.sign(item.group.position.x) * dt * 35;
        item.group.position.y = -t * t * 24; item.group.rotation.z = t * .8; item.group.scale.setScalar(1 - t * .7);
      } else item.group.visible = false;
    }
    this.aim.visible = selected.length === 2 && game.phase === 'aiming';
    if (this.aim.visible) {
      const pair = selected.map(id => game.pucks.find(puck => puck.id === id));
      if (pair.every(Boolean)) {
        const [a, b] = pair; const positions = this.link.geometry.attributes.position;
        positions.setXYZ(0, a.x, 3, a.y); positions.setXYZ(1, b.x, 3, b.y); positions.needsUpdate = true;
        this.link.geometry.computeBoundingSphere(); this.link.computeLineDistances();
        pair.forEach((puck, i) => {
          const other = pair[1 - i]; const direction = vec(puck.x - other.x, 0, puck.y - other.y).normalize();
          const length = speed * speed / (2 * CONFIG.friction);
          const arrow = this.arrows[i]; arrow.position.set(puck.x + direction.x * 15, 2, puck.y + direction.z * 15);
          arrow.setDirection(direction); arrow.setLength(Math.max(15, Math.min(length - 15, 100)), 8, 4.5); arrow.setColor(PALETTE[game.currentPlayer]);
          const stop = this.stops[i]; stop.position.set(puck.x + direction.x * length, .4, puck.y + direction.z * length);
          stop.material.color.setHex(PALETTE[game.currentPlayer]); stop.visible = Math.hypot(stop.position.x, stop.position.z) < 280;
        });
      }
    }
    for (const effect of this.effects) {
      const t = (now - effect.born) / effect.duration; effect.mesh.scale.setScalar(1 + t * 3); effect.mesh.material.opacity = Math.max(0, (1 - t) * .6);
      if (t >= 1) { this.scene.remove(effect.mesh); effect.mesh.geometry.dispose(); effect.mesh.material.dispose(); }
    }
    this.effects = this.effects.filter(effect => now - effect.born < effect.duration);
    for (const light of this.goalLights) light.intensity += (23000 - light.intensity) * Math.min(1, dt * 5);
    this.composer.render();
  }
}
