// Generates the Ulanzi Workshop (ugc.ulanzistudio.com) listing images.
// Keys and dial feedback are rendered with the plugin's own renderers, so the deck shows exactly
// what the plugin draws. Usage: node marketing/generate.mjs   (needs a Chromium / headless shell)
//
// Formats required by the workshop upload form (plugins):
//   cover  1:1  (shown at 288×288 in the Ulanzi Studio marketplace)
//   banner 3:2  (1–3 images; the first one is the main image of the detail page)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as mdi from '@mdi/js';
import { keySvg } from '../src/domain/render/key-svg.js';
import { dialSvg } from '../src/domain/render/dial-feedback.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'out');
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------------------------------------
// Key and dial content
// ---------------------------------------------------------------------------------------------
const AMBER = '#f59e0b';
const GREY = '#94a3b8';
const VIOLET = '#a78bfa';
const TEAL = '#5eead4';
const ORANGE = '#fb923c';

const icon = (name, color, valueColor) => ({ path: mdi[name], color, ...(valueColor ? { valueColor } : {}) });
const key = (model, glow) => ({ svg: keySvg(model), glow });

const KEYS = {
  living: key({ style: 'on', icon: icon('mdiCeilingLight', AMBER), value: 80, unit: '%', label: 'Living room' }, AMBER),
  kitchen: key({ style: 'off', icon: icon('mdiLightbulbOff', GREY), label: 'Kitchen' }),
  desk: key({ style: 'on', icon: icon('mdiDeskLamp', '#c084fc'), value: 65, unit: '%', label: 'Desk' }, '#c084fc'),
  shutter: key({ style: 'on', icon: icon('mdiWindowShutterOpen', AMBER), value: 100, unit: '%', label: 'Shutter' }, AMBER),
  coffee: key({ style: 'on', icon: icon('mdiCoffeeMaker', AMBER), label: 'Coffee' }, AMBER),
  movie: key({ style: 'trigger', icon: icon('mdiMovieOpen', VIOLET), label: 'Movie night' }, VIOLET),
  night: key({ style: 'trigger', icon: icon('mdiWeatherNight', VIOLET), label: 'Good night' }, VIOLET),
  temp: key({ style: 'sensor', icon: icon('mdiThermometer', TEAL), value: '21.5', unit: '°C', label: 'Living room' }),
  humidity: key({ style: 'sensor', icon: icon('mdiWaterPercent', TEAL), value: 48, unit: '%', label: 'Humidity' }),
  co2: key({ style: 'warn', icon: icon('mdiMoleculeCo2', ORANGE, ORANGE), value: 1240, unit: '', label: 'ppm' }, ORANGE),
  heating: key({ style: 'on', icon: icon('mdiThermostat', AMBER), value: 21, unit: '°C', label: 'Heating' }, AMBER),
  speaker: key({ style: 'on', icon: icon('mdiSpeaker', AMBER), label: 'Kitchen' }, AMBER),
  fan: key({ style: 'off', icon: icon('mdiFanOff', GREY), label: 'Fan' }),
  ledstrip: key({ style: 'on', icon: icon('mdiLedStrip', '#f472b6'), value: 40, unit: '%', label: 'TV light' }, '#f472b6'),
  vacuum: key({ style: 'on', icon: icon('mdiRobotVacuum', AMBER), label: 'Vacuum' }, AMBER),
  garage: key({ style: 'off', icon: icon('mdiGarage', GREY), label: 'Garage' }),
  power: key({ style: 'sensor', icon: icon('mdiLightningBolt', TEAL), value: '1.2', unit: ' kW', label: 'House' }),
  battery: key({ style: 'sensor', icon: icon('mdiBattery80', TEAL), value: 82, unit: '%', label: 'Car' }),
  floor: key({ style: 'on', icon: icon('mdiFloorLamp', '#38bdf8'), value: 55, unit: '%', label: 'Reading' }, '#38bdf8'),
  socket: key({ style: 'off', icon: icon('mdiPowerSocketEu', GREY), label: 'Heater' }),
  edit: key({ style: 'edit', badge: 'EDIT', status: '', label: 'Living room', value: 80, unit: '%' }, '#22d3ee'),
};

const dial = (title, valueText, progress, caption, style = 'on') => ({
  title,
  svg: dialSvg({ title, valueText, style, progress, ...(caption ? { caption } : {}) }),
});

const DIALS_DEFAULT = [
  dial('Living room', '80%', 0.8, 'Brightness'),
  dial('Kitchen', '35%', 0.35, 'Volume'),
  dial('Heating', '21.5°C', 0.55, 'Target'),
];
const DIALS_EDIT = [
  dial('Living room', '80%', 0.8, 'Brightness', 'edit'),
  dial('Kitchen', '35%', 0.35, 'Volume'),
  dial('Shutter', '60%', 0.6, 'Position'),
];

// D200X: 3 rows × 5; row 3 has 3 keys + the dial display (2 slots); 2 buttons + 3 dials below.
const LAYOUT_HERO = [
  'living', 'kitchen', 'desk', 'shutter', 'coffee',
  'movie', 'night', 'temp', 'humidity', 'co2',
  'heating', 'speaker', 'fan',
];
const LAYOUT_EDIT = [
  'kitchen', 'desk', 'shutter', 'coffee', 'speaker',
  'movie', 'night', 'temp', 'humidity', 'fan',
  'heating', 'ledstrip', 'edit',
];

// ---------------------------------------------------------------------------------------------
// HTML building blocks
// ---------------------------------------------------------------------------------------------
const FONT = `"SF Pro Display", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;

const BASE_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: var(--w); height: var(--h); overflow: hidden; }
body { font-family: ${FONT}; color: #f8fafc; background: #060a13; -webkit-font-smoothing: antialiased; position: relative; }
svg text { font-family: ${FONT}; }

.bg { position: absolute; inset: 0; overflow: hidden;
  background:
    radial-gradient(60% 70% at 12% 10%, rgba(14,165,233,.30), transparent 70%),
    radial-gradient(55% 65% at 92% 95%, rgba(245,158,11,.22), transparent 70%),
    radial-gradient(40% 40% at 70% 20%, rgba(139,92,246,.16), transparent 70%),
    linear-gradient(160deg, #0b1324 0%, #060a13 60%, #05070d 100%); }
.bg::before { content: ''; position: absolute; inset: -20%;
  background-image: linear-gradient(rgba(148,163,184,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.07) 1px, transparent 1px);
  background-size: 28px 28px; transform: perspective(600px) rotateX(55deg) translateY(30%);
  mask-image: radial-gradient(60% 50% at 50% 60%, #000, transparent 75%); }
.bg::after { content: ''; position: absolute; inset: 0;
  background: radial-gradient(120% 90% at 50% 50%, transparent 55%, rgba(0,0,0,.55) 100%); }

/* ---------- device ---------- */
.deck { position: absolute; width: 476px; padding: 34px 30px 26px; border-radius: 34px;
  background: linear-gradient(165deg, #3b414c 0%, #262a32 38%, #191c22 100%);
  box-shadow:
    inset 0 1.5px 0 rgba(255,255,255,.16), inset 0 -2px 0 rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.04),
    0 14px 0 -2px #0f1115, 0 16px 0 -2px rgba(255,255,255,.05),
    0 50px 90px rgba(0,0,0,.65), 0 18px 30px rgba(0,0,0,.45);
  transform-origin: center; }
.deck .sheen { position: absolute; inset: 0; border-radius: 34px; pointer-events: none;
  background: linear-gradient(120deg, rgba(255,255,255,.07) 0%, transparent 35%, transparent 70%, rgba(255,255,255,.03) 100%); }
.deck .brand { position: absolute; top: 12px; left: 0; right: 0; display: flex; justify-content: center; gap: 5px; }
.deck .brand i { width: 4px; height: 4px; border-radius: 50%; background: rgba(255,255,255,.14); }
.grid { display: grid; grid-template-columns: repeat(5, 72px); grid-auto-rows: 72px; gap: 14px; }
.key { position: relative; border-radius: 15px; padding: 3px; background: #0a0c10;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.07), 0 3px 0 #06070a, 0 7px 12px rgba(0,0,0,.55); }
.key svg { display: block; width: 100%; height: 100%; border-radius: 12px; }
.key::after { content: ''; position: absolute; inset: 3px; border-radius: 12px; pointer-events: none;
  background: linear-gradient(160deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,0) 38%); }
.key.glow { box-shadow: inset 0 1px 0 rgba(255,255,255,.07), 0 3px 0 #06070a, 0 0 26px -2px var(--g), 0 7px 12px rgba(0,0,0,.55); }
.screen { grid-column: span 2; border-radius: 15px; padding: 3px; background: #0a0c10;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.07), 0 3px 0 #06070a, 0 0 22px -6px rgba(56,189,248,.55), 0 7px 12px rgba(0,0,0,.55); }
.screen .inner { height: 100%; border-radius: 12px; background: #05070b; display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; padding: 4px 3px; position: relative; overflow: hidden; }
.screen .inner::after { content: ''; position: absolute; inset: 0; background: linear-gradient(160deg, rgba(255,255,255,.12), transparent 40%); }
.seg { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
.seg svg { width: 44px; height: 44px; display: block; }
.seg span { font-size: 7.5px; color: #cbd5e1; white-space: nowrap; max-width: 48px; overflow: hidden; text-overflow: ellipsis; }
.controls { display: grid; grid-template-columns: repeat(5, 72px); gap: 14px; margin-top: 20px; align-items: center; justify-items: center; }
.btn { width: 34px; height: 34px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #4a505b, #22252c 70%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 3px 0 #0b0c0f, 0 6px 10px rgba(0,0,0,.5); }
.knob { position: relative; width: 60px; height: 60px; border-radius: 50%;
  background: repeating-conic-gradient(from 0deg, #2b2f37 0deg 4deg, #1a1d22 4deg 8deg);
  box-shadow: 0 4px 0 #0a0b0e, 0 10px 18px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.2); }
.knob::before { content: ''; position: absolute; inset: 6px; border-radius: 50%;
  background: radial-gradient(circle at 38% 30%, #59606c 0%, #30343c 45%, #1b1e23 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.22), inset 0 -2px 4px rgba(0,0,0,.5); }
.knob::after { content: ''; position: absolute; left: 50%; top: 10px; width: 3px; height: 10px; margin-left: -1.5px; border-radius: 2px; background: #e2e8f0; opacity: .75; }

/* ---------- typography ---------- */
.eyebrow { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px 6px 8px; border-radius: 999px;
  background: rgba(56,189,248,.10); border: 1px solid rgba(56,189,248,.28); color: #bae6fd; font-size: 12.5px; font-weight: 600; letter-spacing: .02em; }
.eyebrow b { width: 7px; height: 7px; border-radius: 50%; background: #38bdf8; box-shadow: 0 0 10px #38bdf8; }
h1 { font-weight: 800; letter-spacing: -0.035em; line-height: .95;
  background: linear-gradient(180deg, #ffffff 30%, #a5d8ff 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
h2 { font-weight: 800; letter-spacing: -0.03em; line-height: 1.02; color: #fff; }
.accent { background: linear-gradient(90deg, #38bdf8, #fbbf24); -webkit-background-clip: text; background-clip: text; color: transparent; }
p.sub { color: #a8b3c7; line-height: 1.45; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { display: inline-flex; align-items: center; gap: 7px; padding: 7px 11px; border-radius: 10px; font-size: 12.5px; font-weight: 600; color: #e2e8f0;
  background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.03)); border: 1px solid rgba(255,255,255,.09); }
.chip svg { width: 15px; height: 15px; }
.logo { width: 46px; height: 46px; border-radius: 13px; box-shadow: 0 8px 24px rgba(56,189,248,.25); }
`;

const PLUGIN_ICON = `<svg class="logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144"><rect width="144" height="144" rx="24" fill="#1e293b"/><path d="M36 74 72 42l36 32" fill="none" stroke="#38bdf8" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="M46 68v36h52V68" fill="none" stroke="#38bdf8" stroke-width="8" stroke-linejoin="round"/><circle cx="72" cy="88" r="10" fill="#f8fafc"/></svg>`;

const mdiSvg = (name, color) => `<svg viewBox="0 0 24 24"><path d="${mdi[name]}" fill="${color}"/></svg>`;

const keyHtml = (k, extra = '') =>
  `<div class="key${k.glow ? ' glow' : ''}${extra}" ${k.glow ? `style="--g:${k.glow}"` : ''}>${k.svg}</div>`;

function deckHtml({ layout, dials, style = '' }) {
  const keys = layout.map((name) => keyHtml(KEYS[name]));
  const screen = `<div class="screen"><div class="inner">${dials
    .map((d) => `<div class="seg">${d.svg}<span>${d.title}</span></div>`)
    .join('')}</div></div>`;
  return `<div class="deck" style="${style}"><div class="brand"><i></i><i></i><i></i></div>
    <div class="grid">${keys.join('')}${screen}</div>
    <div class="controls"><div class="btn"></div><div class="btn"></div><div class="knob"></div><div class="knob"></div><div class="knob"></div></div>
    <div class="sheen"></div></div>`;
}

const page = (w, h, css, body) => `<!doctype html><html><head><meta charset="utf-8"><style>
:root { --w: ${w}px; --h: ${h}px; } ${BASE_CSS} ${css}</style></head><body><div class="bg"></div>${body}</body></html>`;

// ---------------------------------------------------------------------------------------------
// Images (CSS size; rendered at 2× device scale)
// ---------------------------------------------------------------------------------------------
const images = [];

// Cover 1:1 – must read well at 288×288.
images.push({
  name: 'cover-1x1',
  w: 600,
  h: 600,
  html: page(600, 600, `
    .title { position: absolute; top: 46px; left: 0; right: 0; text-align: center; z-index: 2; }
    .title h1 { font-size: 92px; }
    .title .tag { margin-top: 12px; font-size: 24px; font-weight: 600; color: #bae6fd; letter-spacing: -.01em; }
    .halo { position: absolute; left: 50%; top: 66%; width: 520px; height: 300px; margin-left: -260px; margin-top: -150px; border-radius: 50%;
      background: radial-gradient(closest-side, rgba(245,158,11,.35), rgba(56,189,248,.12) 60%, transparent); filter: blur(10px); }
  `, `
    <div class="title"><h1>HA Deck</h1><div class="tag">Home Assistant · Keys &amp; Dials</div></div>
    <div class="halo"></div>
    ${deckHtml({ layout: LAYOUT_HERO, dials: DIALS_DEFAULT, style: 'left: 62px; top: 218px; transform: perspective(1400px) rotateX(24deg) scale(1.0);' })}
  `),
});

// Banner 1 (main image) 3:2 – hero.
images.push({
  name: 'banner-1-main-3x2',
  w: 750,
  h: 500,
  html: page(750, 500, `
    .copy { position: absolute; left: 46px; top: 58px; width: 300px; z-index: 2; }
    .brandrow { display: flex; align-items: center; gap: 12px; margin-bottom: 26px; }
    .copy h1 { font-size: 66px; margin-bottom: 16px; }
    .copy p.sub { font-size: 17px; margin-bottom: 26px; }
    .copy p.sub strong { color: #f1f5f9; font-weight: 600; }
    .chips { max-width: 290px; }
    .foot { position: absolute; left: 46px; bottom: 34px; font-size: 12px; color: #64748b; letter-spacing: .04em; z-index: 2; }
  `, `
    <div class="copy">
      <div class="brandrow">${PLUGIN_ICON}<span class="eyebrow"><b></b>Plugin for Ulanzi Studio</span></div>
      <h1>HA Deck</h1>
      <p class="sub">Control <strong>Home Assistant</strong> from the keys and rotary dials of your Ulanzi Deck.</p>
      <div class="chips">
        <span class="chip">${mdiSvg('mdiLightbulbOn', '#fbbf24')}Live states</span>
        <span class="chip">${mdiSvg('mdiRotateRight', '#38bdf8')}Rotary dials</span>
        <span class="chip">${mdiSvg('mdiShape', '#a78bfa')}HA icons</span>
        <span class="chip">${mdiSvg('mdiThermometer', '#5eead4')}Sensors</span>
      </div>
    </div>
    <div class="foot">D200X · MACOS &amp; WINDOWS · EN / DE</div>
    ${deckHtml({ layout: LAYOUT_HERO, dials: DIALS_DEFAULT, style: 'left: 296px; top: 52px; transform: perspective(1500px) rotateY(-20deg) rotateX(14deg) rotateZ(2deg) scale(.8);' })}
  `),
});

// Banner 2 3:2 – dials and Dynamic Dial (zoomed-in deck).
images.push({
  name: 'banner-2-dials-3x2',
  w: 750,
  h: 500,
  html: page(750, 500, `
    .copy { position: absolute; left: 46px; top: 54px; width: 290px; z-index: 2; }
    .copy h2 { font-size: 40px; margin-bottom: 14px; }
    .copy p.sub { font-size: 15px; margin-bottom: 22px; }
    .steps { display: flex; flex-direction: column; gap: 12px; }
    .step { display: flex; gap: 12px; align-items: flex-start; font-size: 13.5px; color: #cbd5e1; line-height: 1.4; }
    .step i { flex: none; width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; font-style: normal; font-weight: 800; font-size: 13px;
      color: #0b1220; background: linear-gradient(180deg, #67e8f9, #22d3ee); box-shadow: 0 0 16px rgba(34,211,238,.4); }
    .step b { color: #fff; font-weight: 650; }
    .stage { position: absolute; left: 320px; top: 0; width: 430px; height: 500px; overflow: hidden;
      mask-image: linear-gradient(90deg, transparent 0, #000 60px); }
    .arc { position: absolute; z-index: 3; pointer-events: none; }
    .label { position: absolute; z-index: 3; font-size: 12px; font-weight: 700; color: #e0f2fe; padding: 5px 9px; border-radius: 8px;
      background: rgba(8,47,73,.75); border: 1px solid rgba(56,189,248,.45); backdrop-filter: blur(6px); white-space: nowrap; }
  `, `
    <div class="copy">
      <h2>Dials that <span class="accent">react instantly</span></h2>
      <p class="sub">Brightness, colour temperature, volume, temperature, cover position and fan speed – every detent shows at once.</p>
      <div class="steps">
        <div class="step"><i>1</i><span><b>Hold any toggle key</b> – it switches to EDIT.</span></div>
        <div class="step"><i>2</i><span><b>Turn the Dynamic Dial</b> – one dial for all your lights, speakers and shutters.</span></div>
        <div class="step"><i>3</i><span><b>Press</b> to finish, toggle or switch the value.</span></div>
      </div>
    </div>
    <div class="stage">
      ${deckHtml({ layout: LAYOUT_EDIT, dials: DIALS_EDIT, style: 'left: -300px; top: -150px; transform: perspective(1600px) rotateX(10deg) rotateY(-8deg) scale(1.62); transform-origin: 0 0;' })}
      <svg class="arc" style="left:50px; top:345px" width="140" height="140" viewBox="0 0 140 140"><defs><marker id="ah" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0 8 4 0 8z" fill="#38bdf8"/></marker></defs>
        <path d="M27.6 112.4 A60 60 0 1 1 112.4 112.4" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 7" marker-end="url(#ah)"/></svg>
      <span class="label" style="left: 196px; top: 462px;">Turn = fine · press &amp; turn = coarse</span>
    </div>
  `),
});

// README header 2:1 (docs/readme-banner.png, also usable as GitHub social preview).
images.push({
  name: 'readme-banner',
  out: join(here, '..', 'docs', 'readme-banner.png'),
  w: 800,
  h: 400,
  html: page(800, 400, `
    .copy { position: absolute; left: 48px; top: 64px; width: 360px; z-index: 2; }
    .brandrow { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
    .copy h1 { font-size: 64px; margin-bottom: 14px; }
    .copy p.sub { font-size: 17px; margin-bottom: 22px; }
    .copy p.sub strong { color: #f1f5f9; font-weight: 600; }
  `, `
    <div class="copy">
      <div class="brandrow">${PLUGIN_ICON}<span class="eyebrow"><b></b>Plugin for Ulanzi Studio</span></div>
      <h1>HA Deck</h1>
      <p class="sub">Control <strong>Home Assistant</strong> from the keys and rotary dials of your Ulanzi Deck.</p>
      <div class="chips">
        <span class="chip">${mdiSvg('mdiLightbulbOn', '#fbbf24')}Live states</span>
        <span class="chip">${mdiSvg('mdiRotateRight', '#38bdf8')}Rotary dials</span>
        <span class="chip">${mdiSvg('mdiShape', '#a78bfa')}HA icons</span>
      </div>
    </div>
    ${deckHtml({ layout: LAYOUT_HERO, dials: DIALS_DEFAULT, style: 'left: 352px; top: -6px; transform: perspective(1500px) rotateY(-20deg) rotateX(14deg) rotateZ(2deg) scale(.76);' })}
  `),
});

// Banner 3 3:2 – icons and all actions.
const iconWall = ['living', 'desk', 'ledstrip', 'shutter', 'kitchen', 'temp', 'movie', 'heating', 'co2', 'power', 'night', 'battery'];
images.push({
  name: 'banner-3-icons-3x2',
  w: 750,
  h: 500,
  html: page(750, 500, `
    .copy { position: absolute; left: 46px; top: 54px; width: 300px; z-index: 2; }
    .copy h2 { font-size: 40px; margin-bottom: 14px; }
    .copy p.sub { font-size: 15px; margin-bottom: 22px; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .act { display: flex; align-items: center; gap: 9px; padding: 9px 10px; border-radius: 11px; font-size: 12.5px; font-weight: 650; color: #e2e8f0;
      background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.025)); border: 1px solid rgba(255,255,255,.08); }
    .act svg { width: 18px; height: 18px; flex: none; }
    .wall { position: absolute; left: 400px; top: 30px; display: grid; grid-template-columns: repeat(3, 96px); gap: 16px;
      transform: perspective(1400px) rotateY(-16deg) rotateX(8deg) rotateZ(-3deg); transform-origin: 0 50%; }
    .wall .key { width: 96px; height: 96px; border-radius: 19px; padding: 4px; }
    .wall .key svg { border-radius: 15px; }
    .wall .key::after { inset: 4px; border-radius: 15px; }
  `, `
    <div class="copy">
      <h2>Your <span class="accent">Home Assistant</span> icons, live</h2>
      <p class="sub">Keys show the icon Home Assistant shows – in the real light colour, with values and limits.</p>
      <div class="actions">
        <span class="act">${mdiSvg('mdiToggleSwitch', '#fbbf24')}Toggle</span>
        <span class="act">${mdiSvg('mdiKnob', '#38bdf8')}Dial</span>
        <span class="act">${mdiSvg('mdiRotate3dVariant', '#22d3ee')}Dynamic Dial</span>
        <span class="act">${mdiSvg('mdiPlayCircle', '#a78bfa')}Trigger</span>
        <span class="act">${mdiSvg('mdiGauge', '#5eead4')}Sensor</span>
        <span class="act">${mdiSvg('mdiCodeBraces', '#f472b6')}Service Call</span>
      </div>
    </div>
    <div class="wall">${iconWall.map((n) => keyHtml(KEYS[n])).join('')}</div>
  `),
});

// ---------------------------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------------------------
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const pw = join(homedir(), 'Library/Caches/ms-playwright');
  if (existsSync(pw)) {
    for (const dir of readdirSync(pw).filter((d) => d.startsWith('chromium_headless_shell')).sort().reverse()) {
      for (const sub of readdirSync(join(pw, dir))) {
        const bin = join(pw, dir, sub, 'chrome-headless-shell');
        if (existsSync(bin)) return bin;
      }
    }
  }
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (existsSync(mac)) return mac;
  throw new Error('No Chromium found – set CHROME_PATH');
}

const chrome = findChrome();
const only = process.argv[2];
for (const img of images) {
  if (only && !img.name.includes(only)) continue;
  const htmlPath = join(tmpdir(), `hadeck-${img.name}.html`);
  writeFileSync(htmlPath, img.html);
  const png = img.out ?? join(outDir, `${img.name}.png`);
  mkdirSync(dirname(png), { recursive: true });
  execFileSync(chrome, [
    '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
    `--window-size=${img.w},${img.h}`, `--screenshot=${png}`, '--virtual-time-budget=1500', `file://${htmlPath}`,
  ], { stdio: 'ignore' });
  console.log(`${png}  (${img.w * 2}×${img.h * 2})`);
}
