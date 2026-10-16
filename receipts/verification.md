# Parting verification receipt

Verified 2026-09-06T03:19:40.028Z.

Installed app: /Users/chrisdimarco/Applications/Parting.app
Source: /Users/chrisdimarco/Projects/parting
Packaged copy: /Users/chrisdimarco/Projects/parting/dist/Parting-darwin-arm64/Parting.app
Architecture: Apple silicon arm64. App size: 313 MB on disk.

## Verification

- Syntax checks passed.
- 11 deterministic physics tests passed, including 80 seeded full-game invariant checks.
- Latest isolated Electron mouse test: passed; 24 turns; score 2–4; 0 renderer exceptions. Two consecutive mouse-driven full games passed after the framing fix.
- Tested help, pick/cancel, slider drag/release, turn alternation, scores, game over, rematch reset and starter swap.
- Tested 1000×740 layout, all remaining pucks clear of footer, top view, orbit and zoom.
- Code review and JavaScript physics review approved after camera corrections.
- Packaged and installed app signature passed codesign --verify --deep --strict.
- Installed native app inspected using CoreGraphics window captures; real CUA pointer selection, drag-to-release, settlement to Blue, orbit, top view, zoom and 3D reset exercised.
- Final installed corrected top view capture: installed-top-final.png. Final native window capture: installed-final.png.

## Scope and limits

Offline local two-player game. 3D rendering with planar tabletop physics. No AI or network opponent. Match state starts fresh when the app closes. Original procedural assets and synthesized audio, with bundled Three.js and Electron. Ad-hoc signing is for local use, not a notarized public distribution. Balance and long-term replay value are unproven. Three.js reports a harmless deprecated PCFSoftShadowMap fallback warning; no renderer errors.

## Tested source hashes

- main.cjs: 4d096825f31d5d24792de5b0c0b97fe86a076937d4cfd7e9f6d4e8f5e4b1055b
- src/app.js: 1bddf99e6875eb5d5f9e51c34298aa1b546c95ee2b71ad0306da7ac6b02215f3
- src/scene.js: 3d9e08127c106ac69b299ba1c2feadfc089e6dd06fc743aeee2d66e7d1a4d538
- src/physics.js: d3694086bc85c7161c6287233a92869cab798ec5cb836269ed505f2f091495af
- src/sound.js: a87d6093837373c1326835e917d171affdfdd498652c2115a9018220df241d5d
