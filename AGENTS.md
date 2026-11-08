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
2. copies the site into `_site/`,
3. `node tools/stamp.mjs --root _site --site <pages url>`: fingerprints the copy and writes absolute link-preview URLs,
4. minifies every script, `css/styles.css` and `sw.js` with esbuild **per file** (no bundling, so the stamped import paths stay valid; `js/vendor/` is already minified),
5. publishes.

`tools/stamp.mjs` rewrites files, so only ever run it on a copy (`--root`); the committed sources stay unstamped and `index.html` has no `modulepreload` links. To try a production build locally: copy the files as the workflow does, stamp the copy, then `node tools/serve.mjs 8081 <copy>`.

## Caching and offline

GitHub Pages sends `Cache-Control: max-age=600` for every file. Two layers keep visitors on consistent, fresh files:

- **Fingerprints** (`tools/stamp.mjs`): `?v=<content hash>` on `css/styles.css`, the entry `js/main.js`, and every relative import inside the modules (static `from`, dynamic `import()`, and the worker's `new URL(…, import.meta.url)`). A module's hash covers its text *after* its own imports are rewritten, so it changes exactly when the module or anything it imports changes; this needs an acyclic import graph, which the script checks. Not an import map: browsers ignore import maps inside workers. Plus a `modulepreload` link per module, so the worker's modules are already downloaded when it starts.
- **Service worker** (`sw.js`):
  - Fingerprinted URLs are immutable: served from the cache without a network request. When a new fingerprint of a path arrives, older ones are deleted.
  - Everything else (the page itself, unstamped files in development) is network-first, revalidated with `cache: 'no-cache'`, and falls back to the cache offline. Navigations fall back to the cached home page.

The service worker only registers on `https:` or `localhost`.

## Structure

```
index.html              page, dialogs (welcome, gift, share, scan, install help), toolbar, ⋯ menu
manifest.webmanifest    install-as-an-app: name, icons, shortcuts (?action=send / ?action=scan)
icons/                  app icons: any (rounded, transparent corners), maskable, apple-touch (palette PNGs)
sw.js                   service worker (see above)
og-image.jpg            1200x630 link preview, a frame of the show without the year
tools/stamp.mjs         deploy fingerprinting + modulepreload + absolute og:image / og:url (run on a copy: --root)
tools/serve.mjs         no-cache dev server
.github/workflows/      GitHub Pages deploy
css/styles.css          all styling: dialogs, Material-style outlined fields, wheel, menu, scanner, responsive rules
js/
  main.js               boot, renderer and simulation choice, names/links/language state, input (tap / hold / wheel / keys),
                        recording, scanner, install, render loop, adaptive quality
  config.js             colours, budgets, limits, timings, physics constants, GREETINGS, fonts, localDigits
  utils.js              random, easing, colour, Fibonacci sphere
  engine/
    view.js             2.5D camera: projection, floor geometry, parallax, shake
    sim.js              the whole simulation behind one interface: world, director, diyas, bulbs, clouds; step(dt) -> Frame
    sim.worker.js       runs Sim in a Web Worker (the default)
    simClient.js        createSim(): worker if possible, else Sim on the page; same interface either way
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
    textRaster.js       text / emoji -> point clouds (ink-bounds layout), packPoints for transfer
    rasterAsync.js      raster() without stalling the animation: a helper worker when inside the simulation worker
    raster.worker.js    that helper worker
    director.js         show script on a simulation clock; fire(id) for the wheel
  audio/sound.js        synthesised Web Audio voices, reverb, echo, distance filtering, recording tap
  ui/
    ui.js               DOM controls and dialogs
    backdrop.js         backdrop layers, string lights, diyas, clouds
    wheel.js            the cracker wheel
    crackers.js         wheel catalogue and SVG icons
    qr.js               QR generator (byte mode, level M, versions 1-40)
    scanner.js          QR scanner (BarcodeDetector, else jsQR); only greeting links stop it
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
- Text stars (`textStars.js`) are thrown out like shell stars, then pulled to their slots by an underdamped spring (`OMEGA 8.5`, `ZETA 0.5`) that ramps in over ~0.5 s: readable after ~0.6 s, settled by ~0.9 s. On release they burn out unevenly, mostly as short fizzles (58%), with some embers, glitter and crackle: trailing embers shed sparks of their own, and too many made the burn-out the heaviest moment of the show.

### Text and emoji rasterising (`textRaster.js`)

Lines are laid out from **measured ink bounds** (each line is drawn on a padded canvas and scanned), never from `measureText` widths or fixed line heights. Hindi and Bengali need this: pre-base vowel signs (ি, ि), signs above and below the line, and synthesised bold all extend past the advance box. Emoji are drawn at 150 px on a padded canvas and cropped to their real pixels for the same reason. Emoji scenes burst all patches together so a picture never appears half-formed.

Emoji contrast: faces are read from their dark details. A pixel becomes a gap only if it is much darker than its surroundings (under 0.55 of the mean brightness within ~12% of the glyph size) **and** dark pixels cover under 40% of those surroundings (summed-area tables, O(1) per point). So eyes, mouths and outlines are cut out, while dark shading (a diya's foot, a heart's tip) and large dark regions beside light ones (🇮🇳's green stripe) stay. Everything else is brightened by one gain for the whole emoji, capped per pixel so hues never clip to white, with a floor so shaded parts still show. Emoji stars are a little smaller than text stars so their glow does not fill the gaps.

Rockets per scene (`Director.partition`): text gets one row per line (`rasterLines` tags each point with its `line`) and one rocket per character or per letter-width of ink (about 0.55 of the line's height), whichever is more, at most 10 per line and 22 per scene. The width count matters for Hindi and Bengali, where one character is a whole syllable (लक्ष्मी is 2 characters but 4 rockets), so shells break along the whole width of every line. Emoji get up to 3 height bands, each split into columns. Each break gets a little vertical jitter. With many rockets the sweep is shortened (≤ 1.6 s in all) and each break is a little smaller and dimmer.

Rasterising never runs inside a simulation step: `rasterAsync.raster()` sends it to `raster.worker.js` (a worker started by the simulation worker) and the director awaits the result, so a scene change on a slow phone starts slightly later instead of freezing the animation. Points come back as one packed `Float32Array`. On the page (the fallback simulation), or if the helper fails or does not answer within 3 s, it runs directly. Canvases used for rasterising only grow (resizing reallocates them), ink bounds are found by scanning in from the edges, and sampling jumps straight to the step that fits the point budget.

### Simulation thread

Everything that moves runs in a Web Worker (`sim.worker.js`), so a busy show never holds up input, the UI or sound on the page; the page only draws. `simClient.js` gives `main.js` the same interface whether the simulation is in the worker or on the page:

- **Frames** are the `Frame` batches, transferred without copying. The page hands each buffer back with a later step for reuse, so nothing is allocated per frame once warm.
- **Pacing.** A step covers the real time since the previous one (capped at 50 ms). Fast steps are paced by `requestAnimationFrame`. When a step takes more than ~0.6 of a display frame (a slow phone), the next one starts as soon as a frame arrives, so the worker never waits for a refresh. Nothing runs while frames are not being shown (a hidden tab).
- **Sound and accessibility.** The worker records its `sound.*` calls and sends them with the frame; the page plays them. Director hooks (`announce`, `done`) arrive as messages.
- **Camera.** The page keeps its own `View` (same `resize`), for taps, layout and `centralBox`; parallax and shake offsets arrive with each frame for the backdrop layers.
- **Text** is rasterised in the worker on an `OffscreenCanvas`. Before taking over, the worker draws a Latin + Hindi + Bengali sample and an emoji, and the page compares the point counts with its own (`probeRaster`). If they fall short, or module workers / `OffscreenCanvas` are missing, the simulation stays on the page (`LocalSim`). `?worker=0` forces that, for comparisons.
- **Testing on a slow CPU.** DevTools CPU throttling slows only the page's main thread, not workers, so it overstates the worker's advantage. To compare fairly, temporarily busy-wait in the worker's step handler for 19 times the step's own duration (≈ 20x).

Measured with 20x throttling, a name forming plus shells (614x717, WebGL): on the page, 56 new frames/s with ~15 ms of main-thread work per frame and the page itself at 56 fps; in the (equally slowed) worker, 64 new frames/s with ~0.1 ms of main-thread work and the page at 115 fps.

### Rendering

Both renderers consume the same `Frame` (glow capsules, smoke puffs, sprites, clouds, lights).

WebGL2 (`render/gl.js`), per frame:

1. Light map at 1/4 resolution: every light as a soft additive ellipse.
2. Scene into an HDR target (RGBA16F when the GPU allows): sky layer → far smoke and sparks → clouds → far city, near city, floor (lit by the light map) → sprites (cracker bodies, diyas, paper) → near smoke → near sparks and text.
3. Bloom: prefilter, dual-filter down/up chain over 5 mips.
4. Composite with a soft shoulder tone map and dither.

Sparks are capsules: an anti-aliased white-hot core plus a coloured halo, so small stars stay crisp. Backdrop layers are painted once per resize and **cropped to the band they cover** (`top` / `height`); the layer pass uses a scissor so only that band is shaded. Context loss and restore are handled.

Canvas 2D (`render/canvas.js`) is the fallback (`?renderer=2d` forces it): same draw order with cached glow sprites, no bloom, unlit clouds.

Adaptive quality (`main.js`): levels 0 to 2 lower particle density, pixel ratio and bloom when the average time between *new* frames stays above ~27 ms (so a slow worker counts too). It is checked before drawing, because a new level clears the canvas. Frames slower than 80 ms are ignored as one-off stalls. Touch devices start at level 1.

### Sound (`audio/sound.js`)

Everything is synthesised (no audio files). Voices → bus → dry + convolution reverb + slap-back echo → compressor → master. Noise voices always loop (each starts at a random offset in a 2 s buffer). `World.hear()` gives each bang a pan, a speed-of-sound delay and an air-absorption filter by distance. `captureStream()` / `releaseStream()` feed the video recorder.

## Conventions

### Names, links and storage

- URL parameters: `to` (or legacy `name`), `from`, `msg`, `lang` (`hi` / `bn`; English is the default), `renderer=2d`, `worker=0` (simulation on the page), `action=send|scan` (app shortcuts).
- Opened from a shared link (any of `to`, `name`, `from`, `msg`, `lang` present): the link's language is used as is, the welcome dialog shows no language switch, and the language is never saved as the visitor's own (`diwali.lang` only changes when they pick one on their own page). The share dialog defaults to the visitor's own language, not a link's.
- A link without `to` but with `from` or `msg` is an open greeting: the welcome dialog says who sent it, shows the wish, and asks the visitor's name; the show then plays that name, the wish and the sender's sign-off (in the link's language unless the visitor picks another).
- Names from a link are never stored. localStorage keys (`STORAGE_KEYS`): `diwali.name` (the visitor's own name), `diwali.lang`, `diwali.muted`, `diwali.cracker`.
- All input goes through `sanitize(input, max)`: strips control and invisible characters (including U+FFFC "OBJ" left by pasted Genmoji/attachments), keeps ZWJ/ZWNJ inside words for Indic scripts, and caps by **graphemes**.
- Limits (`LIMITS`): own name 40, share To/From 30 (silent), wish 50 (with counter), 4 words per scene, 10 emoji scenes. A wish plays like a name (`parseMessage`): each run of words wraps into at most 4 sky lines, and each emoji gets its own firework, in reading order (up to 10).

### QR scanner

The scanner only reacts to greeting links for this page (`asGreeting` in `main.js`, passed as `accept`). Any other code is skipped without a message and the camera keeps scanning; with several codes in view, the greeting wins. A chosen photo with only other codes leaves the dialog as it was; a photo with no code at all, or one that cannot be read, still says so.

### Recording and A/V sync

Measured by recording through the real Record path with markers: a fully white frame and a 1 kHz beep (fed straight into the recording tap) started in the same animation frame every 2 s, then comparing flash and beep onsets in the file with ffmpeg (`signalstats` YAVG per frame, audio threshold). Findings, Chrome:

- Chrome's MP4 writer lays audio end to end and ignores its timestamps, so any audio it loses moves everything after it earlier. With `MediaRecorder.start(1000)` it lost audio at chunk boundaries: the sound ran 0.39 to 0.6 s ahead of the picture. `recorder.js` therefore calls `start()` with no timeslice (one blob at stop).
- Silent stretches (muted, or quiet moments) can also turn into gaps, so `Sound.captureStream()` adds an inaudible constant (-80 dB) to the tap while recording.
- In the worker setup, a frame's sounds are played when that frame is drawn (`simClient.js`), not when it arrives.
- Result: +47 ms (sound after picture: the AAC encoder delay, which Chrome does not write into the file), constant over the whole recording; +14 to +48 ms with a heavily loaded page thread; within about ±50 ms with Canvas 2D. A starved audio thread (60 ms stalls) shifted MP4 audio once by the time lost (about 60 ms) and then stayed put; WebM is immune to that but plays poorly in WhatsApp, so MP4 stays preferred.
- The show's own distance delay (a far shell's bang arrives after its flash, up to ~1.4 s, at the speed of sound) is deliberate and is in the video too.
- `window.__diwali.sound` and `.recorder` are there for such tests.

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
- `?renderer=2d` still renders, and `?worker=0` (simulation on the page) still plays the show.
- After changing imports or the build: stamp a copy, serve it, and check the page reports `data-sim="worker"` with no console errors.
