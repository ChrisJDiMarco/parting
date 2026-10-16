# Parting

A local two-player strategy game for macOS. Eight shared pucks, two opposite goals, one physical rule: choose any pair and push both apart with equal force.

## Play

Open **Parting.app**. Amber scores through the left opening; Blue scores through the right opening. Click two pucks, drag the force slider, and release it to launch. Both goals always count, regardless of who took the shot. Pass the mouse when the pucks settle.

Scored pucks disappear. The game ends after 24 shots or when fewer than two pucks remain. Higher score wins; equal scores draw. Rematch restores the same starting position and swaps who starts. The first launch starts Amber.

Mouse controls: click pucks to select; click a selected puck again or right-click to clear; drag the force slider and release to shoot; drag empty table to orbit; scroll to zoom. Buttons also provide top view, 3D reset, release, sound toggle, rules, and rematch. Keyboard: 1–8 select A–H, Escape clears, Space releases, T sets top view. Arrow keys adjust the focused slider without firing, then use Release pair.

The stop rings indicate straight-line travel with no collision, not a forecast of the full shot. The 3D camera changes only the view. Physics remains on the table surface and does not depend on frame rate.

## Development

Requires Node.js and npm. Dependencies are pinned in package-lock.json.

```sh
npm ci
npm start
npm run check
npm test
node scripts/smoke.mjs
npm run package
```

Electron serves bundled assets on a random loopback port, with sandboxed rendering, context isolation, disabled Node integration and a restrictive content security policy. Gameplay uses no remote services. All table geometry, materials, lettering, sound, and icon artwork are generated locally. Three.js and Electron notices are included in their bundled packages.

The build is an Apple silicon local prototype, ad-hoc signed for this Mac. It has local pass-and-play, not an AI or online opponent. Match state starts fresh when the app closes. The original rules have automated implementation tests; competitive balance and long-term replay value remain unproven.

Renderer references: [Three.js](https://threejs.org/docs/), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security).
