# AGENTS.md

Technical notes for anyone (human or AI agent) working on this project. The user-facing description lives in [README.md](README.md); keep that file free of technical detail.

## Principles

- **No build step, no dependencies.** Plain HTML, CSS and ES modules, served as-is. The only third-party code is the vendored QR decoder `js/vendor/jsQR.min.js` (jsQR 1.4.0, Apache-2.0, loaded on demand). Do not add packages or a bundler; deploy-time tooling (fingerprinting, minifying) runs only in the GitHub Actions workflow.
- **Every screen.** Everything must work and look right from 320 px phones (portrait and landscape) to desktops and TVs, with touch, mouse and keyboard. Check phone portrait, phone landscape (e.g. 740×360) and desktop after UI changes.
- **Three languages.** English, Hindi and Bengali (see *Languages* below). Any new text drawn in the sky must render correctly in all three.
- **Accessibility.** Dialogs are `role="dialog"`, controls have labels, scene text is announced through the `#live` region, `prefers-reduced-motion` dims flashes and turns off parallax and camera shake.

## Run, test, deploy

```bash
npm start   # node tools/serve.mjs 8080: a no-cache static server (ES modules need http, not file://)
npm test    # node tests/nameParser.test.mjs
```

Deploy: push to `main`. GitHub repository **Settings > Pages > Source** must be **GitHub Actions**. `.github/workflows/pages.yml` then:

1. runs the tests,
2. `node tools/stamp.mjs --site <pages url>`: fingerprints files and writes absolute link-preview URLs,
3. copies the site into `_site/`,
4. minifies every script, `css/styles.css` and `sw.js` with esbuild **per file** (no bundling, so module paths and the stamped import map stay valid; `js/vendor/` is already minified),
5. publishes.

The committed `index.html` keeps an **empty** import map and no `modulepreload` links; only the workflow fills them in. `tools/stamp.mjs` is idempotent if run locally, but do not commit stamped output.

## Caching and offline

GitHub Pages sends `Cache-Control: max-age=600` for every file. Two layers keep visitors on consistent, fresh files:

- **Fingerprints** (`tools/stamp.mjs`): `?v=<content hash>` on `css/styles.css`, the entry `js/main.js`, and every other module through the import map; plus a `modulepreload` link per start-up module (placed *after* the import map, which browsers require). A file's URL changes exactly when its source changes.
- **Service worker** (`sw.js`):
  - Fingerprinted URLs are immutable: served from the cache without a network request. When a new fingerprint of a path arrives, older ones are deleted.
  - Everything else (the page itself, unstamped files in development) is network-first, revalidated with `cache: 'no-cache'`, and falls back to the cache offline. Navigations fall back to the cached home page.

The service worker only registers on `https:` or `localhost`.

## Structure

```
index.html              page, dialogs (welcome, gift, share, scan, install help), toolbar, ⋯ menu, import map
manifest.webmanifest    install-as-an-app: name, icons, shortcuts (?action=send / ?action=scan)
icons/                  app icons: any (rounded, transparent corners), maskable, apple-touch (palette PNGs)
sw.js                   service worker (see above)
og-image.jpg            1200x630 link preview, a frame of the show without the year
tools/stamp.mjs         deploy fingerprinting + modulepreload + absolute og:image / og:url
tools/serve.mjs         no-cache dev server
.github/workflows/      GitHub Pages deploy
css/styles.css          all styling: dialogs, Material-style outlined fields, wheel, menu, scanner, responsive rules
js/
  main.js               boot, renderer choice, names/links/language state, input (tap / hold / wheel / keys),
                        recording, scanner, install, render loop, adaptive quality
  config.js             colours, budgets, limits, timings, physics constants, GREETINGS, fonts, localDigits
  utils.js              random, easing, colour, Fibonacci sphere
  engine/
    view.js             2.5D camera: projection, floor geometry, parallax, shake
    world.js            owns all live objects, wind, sound placement, flashes/lights, frame collection
    particles.js        typed-array spark pool
    textStars.js        physics-guided stars that spell text and emoji
    smoke.js            smoke puffs and paper debris pools
    batch.js            per-frame instance buffers (Frame) shared by both renderers
    atlas.js            painted textures: body atlas, smoke puffs, clouds
    sprites.js          cached glow sprites (Canvas 2D renderer only)
    render/gl.js        WebGL2 renderer
    render/canvas.js    Canvas 2D fallback renderer
  crackers/
    shells.js           aerial burst patterns
    rocket.js           rocket flight (straight / wobble / zigzag)
    ground.js           anar, chakra, phuljhadi, ladi, bijli, sutli, roman candle
    lantern.js          sky lantern
  show/
    nameParser.js       sanitize, grapheme-aware tokenizing, scenes, message line wrapping
    textRaster.js       text / emoji -> point clouds (ink-bounds layout)
    director.js         show script on a simulation clock; fire(id) for the wheel
  audio/sound.js        synthesised Web Audio voices, reverb, echo, distance filtering, recording tap
  ui/
    ui.js               DOM controls and dialogs
    backdrop.js         backdrop layers, string lights, diyas, clouds
    wheel.js            the cracker wheel
    crackers.js         wheel catalogue and SVG icons
    qr.js               QR generator (byte mode, level M, versions 1-40)
    scanner.js          QR scanner (BarcodeDetector, else jsQR)
    install.js          beforeinstallprompt / iOS instructions
    recorder.js         MediaRecorder video capture
  vendor/jsQR.min.js    vendored decoder (do not edit)
tests/nameParser.test.mjs
```

## How it works

### World and camera (2.5D)

World units are CSS pixels on the focal plane `z = 0`; larger `z` is further away. `View.project` divides by `fov / (fov + z)` towards a vanishing point at eye level (`cy = 0.42 H`). Shells burst between `z ≈ -0.25 fov` and `2.2 fov`; anything beyond `zCity` is drawn behind the skyline (the "far" pass). The terrace floor is the plane `y = floorY`; `view.floorZ(d)` maps a floor depth `d` (0 front, 1 back by the parapet) to `z`. Text always forms at `z = 0`, so it is never distorted. Parallax shifts each backdrop layer by `offset × (1 − p)`.

### Physics

- Sparks (`particles.js`, one `Float32Array`, stride 20) use **quadratic drag against the wind** plus gravity, and bounce on the floor. Flags add trails, glitter tails, crossette splits, crackle pops, strobing, white-hot starts, ember ends, smoke shedding, multi-break sub-bursts and sparkler forks.
- Shells (`shells.js`) choose per-star drag `k = c / v0`, so every star decelerates on the same schedule: shapes (peony, heart, ring) keep their form while blooming.
- Two gravities: `PHYS.gravity` for shells (far away, slow on screen) and `PHYS.nearGravity` for crackers on the terrace (right in front of the camera).
- Anar height is a share of the open sky above the pot (0.45 to 0.85, random per pot), and the launch speed is solved with drag: `H = ln(1 + k v0² / g) / 2k`.
- Text stars (`textStars.js`) are thrown out like shell stars, then pulled to their slots by an underdamped spring (`OMEGA 8.5`, `ZETA 0.5`) that ramps in over ~0.5 s: readable after ~0.6 s, settled by ~0.9 s. On release they burn out unevenly (fizzle, ember, glitter, crackle).

### Text and emoji rasterising (`textRaster.js`)

Lines are laid out from **measured ink bounds** (each line is drawn on a padded canvas and scanned), never from `measureText` widths or fixed line heights. Hindi and Bengali need this: pre-base vowel signs (ি, ि), signs above and below the line, and synthesised bold all extend past the advance box. Emoji are drawn at 150 px on a padded canvas and cropped to their real pixels for the same reason. Emoji scenes burst all slices together so a picture never appears half-formed.

### Rendering

Both renderers consume the same `Frame` (glow capsules, smoke puffs, sprites, clouds, lights).

WebGL2 (`render/gl.js`), per frame:

1. Light map at 1/4 resolution: every light as a soft additive ellipse.
2. Scene into an HDR target (RGBA16F when the GPU allows): sky layer → far smoke and sparks → clouds → far city, near city, floor (lit by the light map) → sprites (cracker bodies, diyas, paper) → near smoke → near sparks and text.
3. Bloom: prefilter, dual-filter down/up chain over 5 mips.
4. Composite with a soft shoulder tone map and dither.

Sparks are capsules: an anti-aliased white-hot core plus a coloured halo, so small stars stay crisp. Backdrop layers are painted once per resize and **cropped to the band they cover** (`top` / `height`); the layer pass uses a scissor so only that band is shaded. Context loss and restore are handled.

Canvas 2D (`render/canvas.js`) is the fallback (`?renderer=2d` forces it): same draw order with cached glow sprites, no bloom, unlit clouds.

Adaptive quality (`main.js`): levels 0 to 2 lower particle density, pixel ratio and bloom when the average frame time stays above ~27 ms. Frames slower than 80 ms are ignored as one-off stalls. Touch devices start at level 1.

### Sound (`audio/sound.js`)

Everything is synthesised (no audio files). Voices → bus → dry + convolution reverb + slap-back echo → compressor → master. Noise voices always loop (each starts at a random offset in a 2 s buffer). `World.hear()` gives each bang a pan, a speed-of-sound delay and an air-absorption filter by distance. `captureStream()` / `releaseStream()` feed the video recorder.

## Conventions

### Names, links and storage

- URL parameters: `to` (or legacy `name`), `from`, `msg`, `lang` (`hi` / `bn`; English is the default), `renderer=2d`, `action=send|scan` (app shortcuts).
- Names from a link are never stored. localStorage keys (`STORAGE_KEYS`): `diwali.name` (the visitor's own name), `diwali.lang`, `diwali.muted`, `diwali.cracker`.
- All input goes through `sanitize(input, max)`: strips control and invisible characters (including U+FFFC "OBJ" left by pasted Genmoji/attachments), keeps ZWJ/ZWNJ inside words for Indic scripts, and caps by **graphemes**.
- Limits (`LIMITS`): own name 40, share To/From 30 (silent), wish 50 (with counter), 4 words per scene, 10 emoji scenes. Wishes always wrap into at most 4 sky lines.

### Full screen

The ⛶ button (and `F`) is hidden while the display is already fullscreen (`display-mode: fullscreen`: the installed app on Android, or the browser's own full screen such as F11), unless the page entered fullscreen itself, in which case it stays as "Exit full screen". It is also hidden where page fullscreen is unsupported (iPhone). Desktop installed apps open in a window, so the button stays there.

### Languages

`GREETINGS` in `config.js` holds per-language sky text (`wide` / `tall` forms), the sign-off (`from`), card title, the festival `word` used in "Send a … greeting", and `digits` for the year (`localDigits`). Adding a language means: a `GREETINGS` entry, fonts in `font.text`, a button in both `.lang` toggles in `index.html`, and a test.

### Adding a cracker

Add an entry (id, label, hint, SVG icon) to `GROUND` or `SKY` in `ui/crackers.js`, then handle the id in `Director.fire()`. A sky shell only needs a pattern in `BURSTS` (`shells.js`): `fire()` falls through to `shell(..., id, ...)`. Ground crackers extend `Ground` (fuse, `glowAt`, `body`) and implement `update(dt) → alive` and `draw(frame)`.

### Performance

- Never allocate per particle per frame. Pools are typed arrays; batches grow but never shrink; reuse projection result objects.
- Pool budgets per renderer are in `BUDGET`. Text detail scales with `world.density`.
- Keep textures small: backdrop layers are cropped; icons are palette PNGs (~63 KB total).

## Testing checklist

- `npm test` passes.
- In a real browser (http, not file):
  - the show plays in all three languages, with emoji and a two-line name;
  - the wheel works with tap/hold, mouse and `Q`;
  - share produces a link and a QR code that scans;
  - a `?to=` link shows the gift card;
  - no console errors.
- Check 320/360 px portrait, 740×360 landscape and desktop; dialogs fit or scroll, with no horizontal scroll.
- `?renderer=2d` still renders.
