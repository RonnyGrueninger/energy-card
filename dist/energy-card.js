/**
 * Energy Card for Home Assistant
 * Animated energy flows over a 3D scene: PV, battery, house, grid and car.
 *
 * Code: MIT License (see LICENSE).
 * Background and battery images come from the Lumina Energy Card project,
 * see NOTICE-ASSETS.md.
 */

const VERSION = "0.1.0";
const TAG = "energy-card";
const ASSETS = new URL("./", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
const BASE_SPEED = 100; // px per second at playbackRate 1

// All positions are pixels on the 3072 x 2048 background image.
const LAYOUT = {
  view_box: [0, 0, 3072, 2048],
  flows: {
    pv: [[985, 1040], [1575, 1240]],
    battery: [[1226, 1413], [1559, 1344]],
    home: [[1690, 1186], [1651, 1026]],
    grid: [[2534, 1702], [1981, 1336]],
    car: [[1905, 1190], [2388, 1006], [2435, 1175]],
  },
  boxes: {
    pv: [461, 645],
    home: [1582, 300],
    battery: [660, 1551],
    grid: [2620, 1885],
    car: [2811, 768],
  },
  hotspots: {
    pv: [61, 783, 945, 445],
    inverter: [1544, 1167, 438, 230],
    home: [1106, 402, 952, 657],
    wallbox: [2289, 561, 253, 445],
  },
  battery: { x: 937, y: 1075, width: 307 },
  car: { x: 2330, y: 870, width: 720, height: 420 },
  inverter: { x: 1515, y: 830, width: 520, height: 590 }, // only used with inverter.image
  grid_node: [2534, 1702],
};

// Where the SOC segments sit on the battery image (fractions of its width/height).
// u = horizontal, t = top edge, b = bottom edge; 0 = left side, 1 = right side.
const SOC_FACE = {
  real: { u0: 0.705, u1: 0.89, t0: 0.245, t1: 0.2275, b0: 0.578, b1: 0.554 },
  tech: { u0: 0.705, u1: 0.89, t0: 0.245, t1: 0.2275, b0: 0.578, b1: 0.554 },
};
const BATTERY_RATIO = { real: 999 / 530, tech: 996 / 528 }; // height / width of the images
const BATTERY_FOOT = 0.6; // the battery body ends here, the reflection starts below

// Each animation is a dash pattern that repeats every `period` px.
// Layers share the same front edge, so they stack into one shape (e.g. a comet).
const ANIMATIONS = {
  comet: {
    period: 340,
    layers: [
      { len: 200, width: 24, opacity: 0.08 },
      { len: 180, width: 5, opacity: 0.2 },
      { len: 105, width: 6.5, opacity: 0.38 },
      { len: 48, width: 8, opacity: 0.72 },
      { len: 14, width: 10, opacity: 0.95, core: true },
    ],
  },
  dashes: {
    period: 96,
    layers: [
      { len: 60, width: 18, opacity: 0.1 },
      { len: 48, width: 7, opacity: 0.9 },
    ],
  },
  dots: {
    period: 70,
    layers: [
      { len: 0.1, width: 26, opacity: 0.14 },
      { len: 0.1, width: 13, opacity: 0.95 },
    ],
  },
};

const STRINGS = {
  de: {
    pv: "Solar", battery: "Batterie", home: "Haus", grid: "Netz", inverter: "Wechselrichter", car: "Auto",
    today: "Heute", import: "Bezug", export: "Einspeisung", charging: "Lädt", discharging: "Entlädt",
    idle: "Ruhe", status: "Status", details: "Details", not_found: "nicht gefunden", close: "Schließen",
    no_entries: "Keine Einträge konfiguriert", power: "Leistung", charge_power: "Ladeleistung",
  },
  en: {
    pv: "Solar", battery: "Battery", home: "Home", grid: "Grid", inverter: "Inverter", car: "Car",
    today: "Today", import: "Import", export: "Export", charging: "Charging", discharging: "Discharging",
    idle: "Idle", status: "Status", details: "Details", not_found: "not found", close: "Close",
    no_entries: "No entries configured", power: "Power", charge_power: "Charging power",
  },
};

const DEFAULTS = {
  style: "real",
  display: {
    unit: "auto", // auto | W | kW
    decimals: 2,
    kw_threshold: 1000,
    animation: "comet", // comet | dashes | dots | none
    speed: 0.5,
    threshold: 10, // W, below this a flow counts as idle
    max_power: 6000, // W, flows reach full speed here
    show_inactive: true,
    font: null,
  },
  colors: {
    pv: "#0080ff",
    home: "#0080ff",
    battery_charge: "#00ffff",
    battery_discharge: "#00f9f9",
    grid_import: "#ff3333",
    grid_export: "#00ff00",
    car: "#00ffff",
    text: "#00f9f9",
    soc_on: "#00ffff",
    soc_off: "#5aa7c3",
    soc_low: "#ff4040",
  },
  pv: {},
  battery: {},
  home: {},
  grid: {},
  car: {},
  inverter: {},
};

const SECTIONS = ["pv", "battery", "home", "grid", "car", "inverter"];
const ENTITY_KEYS = ["entity", "soc", "power", "daily", "daily_import", "daily_export", "status", "image_entity"];
const TOGGLE_DOMAINS = new Set(["switch", "light", "input_boolean", "fan", "automation", "siren", "humidifier"]);

// Simple power pylon, drawn around (0, 0).
const TOWER = "M-20 30 L-6 -30 L6 -30 L20 30 M-28 -17 L28 -17 M-19 -1 L19 -1 M-15 13 L15 13 M-17 -1 L13 26 M17 -1 L-13 26";

const CSS = `
  :host { display: block; }
  ha-card { display: block; overflow: hidden; background: #02050c; border-radius: var(--ha-card-border-radius, 12px); }
  .scene {
    position: relative; width: 100%; container-type: inline-size; overflow: hidden;
    user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
    font-family: var(--ec-font, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif);
    color: var(--ec-text, #00f9f9);
  }
  .svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .track, .layer { fill: none; stroke-linecap: round; stroke-linejoin: round; transition: opacity .6s ease; }
  .flow.off .layer { opacity: 0 !important; }
  .seg { transition: fill .6s, opacity .6s; }
  .gridnode .ring { fill: rgba(2, 10, 22, .72); stroke-width: 4; transition: stroke .6s; }
  .gridnode .tower { fill: none; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; transition: stroke .6s; }
  .hot { fill: transparent; stroke: transparent; stroke-width: 4; cursor: pointer; transition: fill .25s, stroke .25s; }
  .hot:hover { fill: rgba(0, 249, 249, .05); stroke: rgba(0, 249, 249, .35); }
  .boxes { position: absolute; inset: 0; pointer-events: none; }
  .box {
    position: absolute; transform: translate(-50%, -50%); pointer-events: auto; cursor: pointer;
    white-space: nowrap; text-align: center; line-height: 1.2; font-size: max(9px, 1cqw);
    padding: .45em .9em .5em; border-radius: .7em;
    background: rgba(2, 12, 28, .58); border: 1px solid rgba(0, 249, 249, .28);
    box-shadow: 0 0 1.2em rgba(0, 249, 249, .12), inset 0 0 1em rgba(0, 249, 249, .06);
    -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);
    transition: border-color .25s, box-shadow .25s;
  }
  .box:hover { border-color: rgba(0, 249, 249, .65); box-shadow: 0 0 1.6em rgba(0, 249, 249, .25); }
  .lbl { font-weight: 600; letter-spacing: .18em; text-transform: uppercase; opacity: .78; }
  .val { font-size: 2.1em; font-weight: 700; font-variant-numeric: tabular-nums; text-shadow: 0 0 .5em rgba(0, 249, 249, .45); transition: color .4s; }
  .sub { font-size: 1.05em; opacity: .9; font-variant-numeric: tabular-nums; }
  .sub:empty { display: none; }
  .imp { color: var(--ec-imp); }
  .exp { color: var(--ec-exp); }
  .backdrop {
    position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center;
    background: rgba(0, 3, 10, .5); animation: ec-fade .18s ease;
  }
  .backdrop[hidden] { display: none; }
  .popup {
    box-sizing: border-box; width: min(92%, 30em); max-height: 90%; overflow: auto;
    padding: 1em 1.2em 1.1em; border-radius: 1em; font-size: max(13px, 1.3cqw);
    background: rgba(3, 14, 32, .86); border: 1px solid rgba(0, 249, 249, .38);
    box-shadow: 0 0 2.4em rgba(0, 249, 249, .2);
    -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); animation: ec-pop .2s ease;
  }
  .popup header { display: flex; align-items: center; justify-content: space-between; gap: 1em; }
  .title { font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
  .close { border: 0; background: none; color: inherit; font-size: 1.6em; line-height: 1; cursor: pointer; padding: 0 .15em; opacity: .8; }
  .close:hover { opacity: 1; }
  .main { font-size: 1.7em; font-weight: 700; margin: .25em 0 .55em; text-shadow: 0 0 .5em rgba(0, 249, 249, .45); font-variant-numeric: tabular-nums; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 1.5em; padding: .5em .25em; border-top: 1px solid rgba(0, 249, 249, .14); }
  .row[data-entity] { cursor: pointer; }
  .row[data-entity]:hover { background: rgba(0, 249, 249, .06); }
  .row .n { opacity: .82; }
  .row .v { font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
  .empty { opacity: .6; padding: .5em 0; }
  .popup footer { display: flex; justify-content: flex-end; margin-top: .8em; }
  .details {
    font: inherit; font-size: .9em; color: inherit; cursor: pointer; padding: .4em 1em; border-radius: .6em;
    background: rgba(0, 249, 249, .1); border: 1px solid rgba(0, 249, 249, .4);
  }
  .details:hover { background: rgba(0, 249, 249, .2); }
  .tgl {
    position: relative; width: 2.6em; height: 1.4em; border-radius: 1em; padding: 0; cursor: pointer;
    border: 1px solid rgba(0, 249, 249, .5); background: rgba(0, 249, 249, .08);
  }
  .tgl::after {
    content: ""; position: absolute; top: .15em; left: .15em; width: 1.1em; height: 1.1em; border-radius: 50%;
    background: rgba(0, 249, 249, .6); transition: left .2s, background .2s;
  }
  .tgl.on { background: rgba(0, 249, 249, .3); }
  .tgl.on::after { left: 1.3em; background: #00f9f9; box-shadow: 0 0 .6em #00f9f9; }
  @keyframes ec-fade { from { opacity: 0; } }
  @keyframes ec-pop { from { opacity: 0; transform: scale(.96); } }
`;

// ---------- helpers ----------

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));

function merge(base, extra) {
  const out = { ...base };
  if (!isObj(extra)) return out;
  for (const [k, v] of Object.entries(extra)) {
    out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

function svg(tag, attrs, parent) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}

const pathD = (pts) => "M" + pts.map((p) => `${p[0]} ${p[1]}`).join(" L");

function normItems(list) {
  return (Array.isArray(list) ? list : [])
    .map((it) => (typeof it === "string" ? { entity: it } : it))
    .filter((it) => isObj(it) && it.entity);
}

function stateNum(hass, id) {
  const s = id && hass.states[id];
  if (!s) return null;
  const v = parseFloat(s.state);
  return Number.isFinite(v) ? v : null;
}

const unitOf = (hass, id) => String(hass.states[id]?.attributes?.unit_of_measurement || "").trim().toLowerCase();

function readPower(hass, id) {
  const v = stateNum(hass, id);
  if (v == null) return null;
  const u = unitOf(hass, id);
  return u === "kw" ? v * 1000 : u === "mw" ? v * 1e6 : v;
}

function readEnergy(hass, id) {
  const v = stateNum(hass, id);
  if (v == null) return null;
  const u = unitOf(hass, id);
  return u === "wh" ? v / 1000 : u === "mwh" ? v * 1000 : v;
}

// ---------- card ----------

class EnergyCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._flows = {};
    this._nf = {};
  }

  static getStubConfig() {
    return {
      pv: { entity: "sensor.pv_power" },
      battery: { soc: "sensor.battery_soc", power: "sensor.battery_power" },
      home: { entity: "sensor.house_consumption" },
      grid: { entity: "sensor.grid_power" },
    };
  }

  setConfig(config) {
    if (!isObj(config)) throw new Error("Invalid configuration");
    const cfg = merge(clone(DEFAULTS), config);
    cfg.layout = merge(clone(LAYOUT), config.layout || {});
    const has = (sec, keys) => keys.some((k) => isObj(cfg[sec]) && cfg[sec][k]);
    cfg._on = {
      pv: has("pv", ["entity"]),
      battery: has("battery", ["soc", "power"]),
      home: has("home", ["entity"]),
      grid: has("grid", ["entity"]),
      car: has("car", ["power", "soc", "image_entity", "image"]),
    };
    if (!Object.values(cfg._on).some(Boolean)) {
      throw new Error("Bitte mindestens einen Bereich konfigurieren: pv, battery, home, grid oder car.");
    }
    // Without a house sensor the consumption is calculated from PV, grid and battery.
    cfg._homeCalc = !cfg._on.home && cfg._on.pv && cfg._on.grid;
    if (cfg._homeCalc) cfg._on.home = true;

    const watch = new Set();
    for (const sec of SECTIONS) {
      const s = cfg[sec];
      if (!isObj(s)) continue;
      for (const k of ENTITY_KEYS) if (typeof s[k] === "string") watch.add(s[k]);
      for (const it of normItems(s.popup)) watch.add(it.entity);
    }

    this._config = cfg;
    this._watch = [...watch];
    this._teardown();
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
    const lang = String(this._config?.language || hass.locale?.language || hass.language || navigator.language || "de");
    if (lang !== this._lang) {
      this._lang = lang;
      this._t = STRINGS[lang.toLowerCase().startsWith("de") ? "de" : "en"];
      this._nf = {};
      this._update(true);
    } else {
      this._update(false);
    }
  }

  connectedCallback() {
    this._update(true);
  }

  disconnectedCallback() {
    for (const f of Object.values(this._flows)) f.anims.forEach((a) => a.pause());
  }

  getCardSize() {
    return 7;
  }

  getGridOptions() {
    return { columns: "full", min_columns: 6 };
  }

  // ---------- building ----------

  _teardown() {
    for (const f of Object.values(this._flows)) f.anims.forEach((a) => a.cancel());
    this._flows = {};
    this._built = false;
  }

  _build() {
    const c = this._config;
    const [vx, vy, vw, vh] = c.layout.view_box;
    const style = c.style === "tech" ? "tech" : "real";
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    this._anim = reduceMotion || c.display.animation === "none" ? null : ANIMATIONS[c.display.animation] || ANIMATIONS.comet;
    this._uid = "ec" + Math.random().toString(36).slice(2, 8);
    const bg = c.background || `${ASSETS}bg-${style}.jpg`;

    this.shadowRoot.innerHTML = `
      <style>${CSS}</style>
      <ha-card>
        <div class="scene" style="aspect-ratio: ${vw} / ${vh}; --ec-text: ${esc(c.colors.text)}; --ec-imp: ${esc(c.colors.grid_import)}; --ec-exp: ${esc(c.colors.grid_export)};${c.display.font ? ` --ec-font: ${esc(c.display.font)};` : ""}">
          <svg class="svg" viewBox="${vx} ${vy} ${vw} ${vh}" preserveAspectRatio="xMidYMid slice">
            <defs></defs>
            <image href="${esc(bg)}" x="0" y="0" width="3072" height="2048" preserveAspectRatio="none"></image>
            <g class="flows"></g>
            <g class="objects"></g>
            <g class="hotspots"></g>
          </svg>
          <div class="boxes"></div>
          <div class="backdrop" hidden><div class="popup" role="dialog"></div></div>
        </div>
      </ha-card>`;

    const root = this.shadowRoot;
    const svgEl = root.querySelector("svg");
    this._defs = svgEl.querySelector("defs");
    this._defs.innerHTML = `
      <filter id="${this._uid}-holo" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values="0.05 0.1 0.05 0 0  0.25 0.5 0.25 0 0.04  0.3 0.6 0.3 0 0.08  0 0 0 0.9 0" result="t"></feColorMatrix>
        <feGaussianBlur in="t" stdDeviation="5" result="b"></feGaussianBlur>
        <feMerge><feMergeNode in="b"></feMergeNode><feMergeNode in="t"></feMergeNode></feMerge>
      </filter>`;
    this._buildFlows(svgEl.querySelector(".flows"));
    const objects = svgEl.querySelector(".objects");
    this._socSegs = [];
    this._batteryRect = null;
    this._car = null;
    this._gridRing = null;
    if (c.inverter.image) {
      const inv = this._buildOverlay(objects, "inverter", c.layout.inverter, c.inverter);
      this._setHref(inv, c.inverter.image);
    }
    if (c._on.battery) this._buildBattery(objects, style);
    if (c._on.car) this._buildCar(objects);
    if (c._on.grid) this._buildGridNode(objects);
    this._buildHotspots(svgEl.querySelector(".hotspots"));
    this._buildBoxes(root.querySelector(".boxes"));
    this._backdrop = root.querySelector(".backdrop");
    this._popup = root.querySelector(".popup");
    this._popupSection = null;
    this._bindPopup();
    this._seen = {};
    this._built = true;
    this._update(true);
  }

  _buildFlows(layer) {
    const c = this._config;
    const anim = this._anim;
    for (const [id, pts] of Object.entries(c.layout.flows)) {
      if (!c._on[id] || !Array.isArray(pts) || pts.length < 2) continue;
      const g = svg("g", { class: "flow off" }, layer);
      const dF = pathD(pts);
      const dR = pathD([...pts].reverse());
      const track = svg("path", { class: "track", d: dF, "stroke-width": 4 }, g);
      const layers = [];
      const anims = [];
      if (anim) {
        for (const ly of anim.layers) {
          const el = svg("path", {
            class: "layer",
            d: dF,
            "stroke-width": ly.width,
            "stroke-dasharray": `${ly.len} ${anim.period - ly.len}`,
          }, g);
          el.style.opacity = ly.opacity;
          if (ly.core) el.style.stroke = "#ffffff";
          layers.push({ el, core: !!ly.core });
          // offset = dash length, so all layers share the same front edge
          const a = el.animate(
            [{ strokeDashoffset: `${ly.len}px` }, { strokeDashoffset: `${ly.len - anim.period}px` }],
            { duration: (anim.period / BASE_SPEED) * 1000, iterations: Infinity },
          );
          a.pause();
          a.currentTime = 0;
          anims.push(a);
        }
      }
      this._flows[id] = { g, track, layers, anims, dF, dR, reverse: false, color: null };
    }
  }

  _buildBattery(layer, style) {
    const c = this._config;
    const B = c.layout.battery;
    const x = B.x;
    const y = B.y;
    const w = B.width;
    let h;
    let f = c.battery.soc_face || null;
    if (c.battery.image) {
      // Own picture: fitted into the battery body area, standing on the floor, with a reflection.
      h = B.height || w * BATTERY_RATIO.real * BATTERY_FOOT;
      this._batteryRect = [x, y, w, h];
      const own = this._buildOverlay(layer, "battery", { x, y, width: w, height: h }, c.battery);
      this._setHref(own, c.battery.image);
    } else {
      h = w * BATTERY_RATIO[style];
      this._batteryRect = [x, y, w, h * BATTERY_FOOT];
      svg("image", { href: `${ASSETS}battery-${style}.png`, x, y, width: w, height: h, preserveAspectRatio: "none" }, layer);
      f = f || SOC_FACE[style];
    }
    if (!f || !c.battery.soc || c.battery.soc_bar === false) return;

    const n = 6;
    const gap = 0.22; // share of one segment left empty
    const lerp = (a, b, t) => a + (b - a) * t;
    const P = (u, v) => `${(x + u * w).toFixed(1)},${(y + v * h).toFixed(1)}`;
    const g = svg("g", { class: "soc" }, layer);
    for (let i = 0; i < n; i++) {
      const ta = (i + gap / 2) / n;
      const tb = (i + 1 - gap / 2) / n;
      const pts = [
        P(f.u0, lerp(f.b0, f.t0, ta)),
        P(f.u1, lerp(f.b1, f.t1, ta)),
        P(f.u1, lerp(f.b1, f.t1, tb)),
        P(f.u0, lerp(f.b0, f.t0, tb)),
      ];
      this._socSegs.push(svg("polygon", { class: "seg", points: pts.join(" ") }, g));
    }
  }

  // A picture standing on the floor, with a fading reflection below it.
  // opts: flip, hologram, reflection (false = off)
  _buildOverlay(layer, key, box, opts = {}) {
    const { x, y, width: w, height: h } = box;
    const id = `${this._uid}-${key}`;
    const rh = h * 0.6;
    this._defs.insertAdjacentHTML("beforeend", `
      <linearGradient id="${id}-rg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".85"></stop>
        <stop offset="1" stop-color="#fff" stop-opacity="0"></stop>
      </linearGradient>
      <mask id="${id}-rm" maskUnits="userSpaceOnUse" x="${x}" y="${y + h}" width="${w}" height="${rh}">
        <rect x="${x}" y="${y + h}" width="${w}" height="${rh}" fill="url(#${id}-rg)"></rect>
      </mask>`);
    const g = svg("g", { class: key }, layer);
    if (opts.flip) g.setAttribute("transform", `translate(${2 * x + w} 0) scale(-1 1)`);
    if (opts.hologram) g.setAttribute("filter", `url(#${this._uid}-holo)`);
    const mirror = svg("g", { mask: `url(#${id}-rm)`, opacity: opts.reflection === false ? 0 : 0.35 }, g);
    const attrs = { x, y, width: w, height: h, preserveAspectRatio: "xMidYMax meet" };
    const refl = svg("image", { ...attrs, transform: `translate(0 ${2 * (y + h)}) scale(1 -1)` }, mirror);
    const img = svg("image", attrs, g);
    return { g, img, refl, href: null };
  }

  _setHref(overlay, url) {
    overlay.href = url;
    for (const el of [overlay.img, overlay.refl]) {
      if (url) el.setAttribute("href", url);
      else el.removeAttribute("href");
    }
  }

  _buildCar(layer) {
    const c = this._config;
    this._car = this._buildOverlay(layer, "car", c.layout.car, c.car);
    this._carImgState = null;
    this._setHref(this._car, c.car.image || null);
  }

  _buildGridNode(layer) {
    const [gx, gy] = this._config.layout.grid_node;
    const g = svg("g", { class: "gridnode", transform: `translate(${gx} ${gy})` }, layer);
    this._gridRing = svg("circle", { class: "ring", r: 56 }, g);
    this._gridIcon = svg("path", { class: "tower", d: TOWER }, g);
  }

  _buildHotspots(layer) {
    const c = this._config;
    const H = c.layout.hotspots;
    const rect = (sec, r) => {
      if (!Array.isArray(r) || r.length < 4) return;
      const el = svg("rect", { class: "hot", x: r[0], y: r[1], width: r[2], height: r[3], rx: 28 }, layer);
      el.addEventListener("click", () => this._openPopup(sec));
    };
    if (c._on.pv) rect("pv", H.pv);
    rect("inverter", H.inverter);
    if (c._on.home) rect("home", H.home);
    if (this._batteryRect) rect("battery", this._batteryRect);
    if (c._on.car) {
      const C = c.layout.car;
      rect("car", [C.x, C.y, C.width, C.height]);
      rect("car", H.wallbox);
    }
    if (c._on.grid) {
      const [gx, gy] = c.layout.grid_node;
      const el = svg("circle", { class: "hot", cx: gx, cy: gy, r: 80 }, layer);
      el.addEventListener("click", () => this._openPopup("grid"));
    }
  }

  _buildBoxes(container) {
    const c = this._config;
    const [vx, vy, vw, vh] = c.layout.view_box;
    this._boxes = {};
    for (const id of ["pv", "home", "battery", "grid", "car"]) {
      const pos = c.layout.boxes[id];
      if (!c._on[id] || !Array.isArray(pos)) continue;
      const el = document.createElement("div");
      el.className = `box box-${id}`;
      el.style.left = `${((pos[0] - vx) / vw) * 100}%`;
      el.style.top = `${((pos[1] - vy) / vh) * 100}%`;
      el.innerHTML = '<div class="lbl"></div><div class="val">–</div><div class="sub"></div><div class="sub"></div>';
      el.addEventListener("click", () => this._openPopup(id));
      container.appendChild(el);
      const [lbl, val, sub1, sub2] = el.children;
      this._boxes[id] = { el, lbl, val, sub1, sub2 };
    }
  }

  _bindPopup() {
    this._backdrop.addEventListener("click", (e) => {
      if (e.target === this._backdrop) this._closePopup();
    });
    this._popup.addEventListener("click", (e) => {
      const tgl = e.target.closest("[data-toggle]");
      if (tgl) {
        e.stopPropagation();
        this._hass?.callService("homeassistant", "toggle", { entity_id: tgl.dataset.toggle });
        return;
      }
      if (e.target.closest("[data-close]")) {
        this._closePopup();
        return;
      }
      const row = e.target.closest("[data-entity]");
      if (row) this._moreInfo(row.dataset.entity);
    });
  }

  // ---------- updating ----------

  _update(force) {
    if (!this._hass || !this._built || !this._t) return;
    let changed = force;
    for (const id of this._watch) {
      const s = this._hass.states[id];
      if (s !== this._seen[id]) {
        this._seen[id] = s;
        changed = true;
      }
    }
    if (!changed) return;
    const v = this._values();
    this._v = v;
    this._updateFlows(v);
    this._updateBoxes(v);
    this._updateSoc(v);
    this._updateGridNode(v);
    this._updateCarImage();
    if (this._popupSection) this._renderPopup();
  }

  _values() {
    const c = this._config;
    const h = this._hass;
    const v = {};
    v.pv = readPower(h, c.pv.entity);
    if (v.pv != null) v.pv = Math.max(0, v.pv);
    v.bat = readPower(h, c.battery.power); // + = charging
    if (v.bat != null && c.battery.invert) v.bat = -v.bat;
    v.grid = readPower(h, c.grid.entity); // + = import
    if (v.grid != null && c.grid.invert) v.grid = -v.grid;
    v.car = readPower(h, c.car.power); // + = charging
    if (v.car != null && c.car.invert) v.car = -v.car;
    if (c.home.entity) v.home = readPower(h, c.home.entity);
    else if (c._homeCalc) v.home = Math.max(0, (v.pv || 0) + (v.grid || 0) - (v.bat || 0));
    else v.home = null;
    v.soc = stateNum(h, c.battery.soc);
    v.carSoc = stateNum(h, c.car.soc);
    v.pvToday = readEnergy(h, c.pv.daily);
    v.importToday = readEnergy(h, c.grid.daily_import);
    v.exportToday = readEnergy(h, c.grid.daily_export);
    return v;
  }

  _updateFlows(v) {
    const col = this._config.colors;
    this._setFlow("pv", v.pv, false, col.pv);
    this._setFlow("home", v.home, false, col.home);
    // battery path runs battery -> inverter, grid path grid -> inverter
    this._setFlow("battery", v.bat, v.bat > 0, v.bat > 0 ? col.battery_charge : col.battery_discharge);
    this._setFlow("grid", v.grid, v.grid < 0, v.grid < 0 ? col.grid_export : col.grid_import);
    this._setFlow("car", v.car, v.car < 0, col.car);
  }

  _setFlow(id, power, reverse, color) {
    const f = this._flows[id];
    if (!f) return;
    const d = this._config.display;
    const active = power != null && Math.abs(power) >= d.threshold;
    if (f.reverse !== reverse) {
      f.reverse = reverse;
      const path = reverse ? f.dR : f.dF;
      f.track.setAttribute("d", path);
      f.layers.forEach((l) => l.el.setAttribute("d", path));
    }
    if (f.color !== color) {
      f.color = color;
      f.track.style.stroke = color;
      f.layers.forEach((l) => {
        if (!l.core) l.el.style.stroke = color;
      });
    }
    f.g.classList.toggle("off", !active);
    f.track.style.opacity = active ? (this._anim ? 0.22 : 0.85) : d.show_inactive ? 0.07 : 0;
    if (!f.anims.length) return;
    if (active && this.isConnected) {
      const rate = this._speed(power) / BASE_SPEED;
      f.anims.forEach((a) => {
        if (Math.abs(a.playbackRate - rate) > 0.01) a.updatePlaybackRate(rate);
        if (a.playState !== "running") a.play();
      });
    } else {
      f.anims.forEach((a) => {
        if (a.playState === "running") a.pause();
      });
    }
  }

  _speed(power) {
    const d = this._config.display;
    const share = Math.min(1, Math.abs(power) / Math.max(1, d.max_power));
    return 400 * d.speed * (0.45 + 1.55 * share);
  }

  _updateBoxes(v) {
    const c = this._config;
    const t = this._t;
    const B = this._boxes;
    const thr = c.display.threshold;
    if (B.pv) {
      B.pv.lbl.textContent = c.pv.name || t.pv;
      B.pv.val.textContent = this._fmtPower(v.pv);
      B.pv.sub1.textContent = v.pvToday != null ? `${t.today} ${this._fmtEnergy(v.pvToday)}` : "";
    }
    if (B.home) {
      B.home.lbl.textContent = c.home.name || t.home;
      B.home.val.textContent = this._fmtPower(v.home);
    }
    if (B.battery) {
      B.battery.lbl.textContent = c.battery.name || t.battery;
      B.battery.val.textContent = v.soc != null ? `${Math.round(v.soc)} %` : this._fmtPower(v.bat != null ? Math.abs(v.bat) : null);
      B.battery.sub1.textContent = this._batteryText(v.bat);
    }
    if (B.grid) {
      B.grid.lbl.textContent = c.grid.name || t.grid;
      B.grid.val.textContent = this._fmtPower(v.grid != null ? Math.abs(v.grid) : null);
      const idle = v.grid == null || Math.abs(v.grid) < thr;
      B.grid.val.style.color = idle ? "" : v.grid > 0 ? c.colors.grid_import : c.colors.grid_export;
      B.grid.sub1.textContent = v.grid == null ? "" : idle ? t.idle : v.grid > 0 ? t.import : t.export;
      if (v.importToday != null || v.exportToday != null) {
        const imp = v.importToday != null ? `<span class="imp">↓ ${esc(this._fmtEnergy(v.importToday))}</span>` : "";
        const exp = v.exportToday != null ? `<span class="exp">↑ ${esc(this._fmtEnergy(v.exportToday))}</span>` : "";
        B.grid.sub2.innerHTML = `${esc(t.today)} ${imp} ${exp}`;
      } else {
        B.grid.sub2.textContent = "";
      }
    }
    if (B.car) {
      B.car.lbl.textContent = c.car.name || t.car;
      B.car.val.textContent = v.carSoc != null ? `${Math.round(v.carSoc)} %` : this._fmtPower(v.car != null ? Math.abs(v.car) : null);
      const charging = v.car != null && Math.abs(v.car) >= thr;
      B.car.sub1.textContent = charging
        ? `${t.charging} ${this._fmtPower(Math.abs(v.car))}`
        : c.car.status ? this._fmtState(c.car.status) : "";
    }
  }

  _updateSoc(v) {
    const segs = this._socSegs;
    if (!segs.length) return;
    const col = this._config.colors;
    const n = segs.length;
    let lit = 0;
    if (v.soc != null && v.soc > 0) lit = Math.max(1, Math.min(n, Math.round((v.soc / 100) * n)));
    const color = v.soc != null && v.soc <= 20 ? col.soc_low : col.soc_on;
    segs.forEach((seg, i) => {
      const on = i < lit;
      seg.style.fill = on ? color : col.soc_off;
      seg.style.opacity = on ? 0.95 : 0.22;
      seg.style.filter = on ? `drop-shadow(0 0 10px ${color})` : "none";
    });
  }

  _updateGridNode(v) {
    if (!this._gridRing) return;
    const c = this._config;
    const idle = v.grid == null || Math.abs(v.grid) < c.display.threshold;
    const color = idle ? c.colors.text : v.grid > 0 ? c.colors.grid_import : c.colors.grid_export;
    this._gridRing.style.stroke = color;
    this._gridRing.style.strokeOpacity = idle ? 0.45 : 0.9;
    this._gridIcon.style.stroke = color;
  }

  _updateCarImage() {
    const c = this._config.car;
    if (!this._car || !c.image_entity) return;
    const s = this._hass.states[c.image_entity];
    const url = s?.attributes?.entity_picture;
    if (!url) return;
    // The URL carries a token that changes often; only reload when the picture itself changed.
    if (!this._car.href || s.state !== this._carImgState) {
      this._carImgState = s.state;
      this._setHref(this._car, url);
    }
  }

  // ---------- popup ----------

  _openPopup(sec) {
    this._popupSection = sec;
    this._backdrop.hidden = false;
    this._renderPopup();
  }

  _closePopup() {
    this._popupSection = null;
    this._backdrop.hidden = true;
    this._popup.innerHTML = "";
  }

  _renderPopup() {
    const sec = this._popupSection;
    const c = this._config;
    const t = this._t;
    const v = this._v || {};
    const conf = isObj(c[sec]) ? c[sec] : {};
    const thr = c.display.threshold;
    const title = conf.name || t[sec] || sec;
    let main = "";
    let mainId = null;
    const rows = [];

    if (sec === "pv") {
      main = this._fmtPower(v.pv);
      mainId = conf.entity;
      if (conf.daily) rows.push({ entity: conf.daily, name: t.today });
    } else if (sec === "battery") {
      main = [v.soc != null ? `${Math.round(v.soc)} %` : null, this._batteryText(v.bat)].filter(Boolean).join(" · ");
      mainId = conf.soc || conf.power;
      if (conf.power && conf.soc) rows.push({ entity: conf.power, name: t.power });
    } else if (sec === "home") {
      main = this._fmtPower(v.home);
      mainId = conf.entity;
    } else if (sec === "grid") {
      main = v.grid == null ? "–" : `${this._gridText(v.grid)} · ${this._fmtPower(Math.abs(v.grid))}`;
      mainId = conf.entity;
      if (conf.daily_import) rows.push({ entity: conf.daily_import, name: `${t.import} ${t.today.toLowerCase()}` });
      if (conf.daily_export) rows.push({ entity: conf.daily_export, name: `${t.export} ${t.today.toLowerCase()}` });
    } else if (sec === "car") {
      const charging = v.car != null && Math.abs(v.car) >= thr;
      main = [v.carSoc != null ? `${Math.round(v.carSoc)} %` : null, charging ? `${t.charging} ${this._fmtPower(Math.abs(v.car))}` : null]
        .filter(Boolean).join(" · ");
      mainId = conf.soc || conf.power;
      if (conf.power) rows.push({ entity: conf.power, name: t.charge_power });
      if (conf.status) rows.push({ entity: conf.status, name: t.status });
    } else if (sec === "inverter") {
      mainId = conf.entity || null;
      if (c._on.pv) rows.push({ name: t.pv, value: this._fmtPower(v.pv), entity: c.pv.entity });
      if (c._on.battery) rows.push({ name: t.battery, value: this._batteryText(v.bat) || "–", entity: c.battery.power });
      if (c._on.grid) rows.push({ name: t.grid, value: v.grid == null ? "–" : `${this._gridText(v.grid)} ${this._fmtPower(Math.abs(v.grid))}`, entity: c.grid.entity });
      if (c._on.home) rows.push({ name: t.home, value: this._fmtPower(v.home), entity: c.home.entity });
    }
    rows.push(...normItems(conf.popup));

    const rowHtml = rows.map((r) => {
      const id = r.entity;
      const s = id ? this._hass.states[id] : null;
      const name = r.name || s?.attributes?.friendly_name || id || "";
      const domain = id ? id.split(".")[0] : "";
      let value;
      if (r.value != null) value = esc(r.value);
      else if (s && TOGGLE_DOMAINS.has(domain)) value = `<button class="tgl${s.state === "on" ? " on" : ""}" data-toggle="${esc(id)}" aria-label="${esc(name)}"></button>`;
      else value = esc(this._fmtState(id));
      return `<div class="row"${id ? ` data-entity="${esc(id)}"` : ""}><span class="n">${esc(name)}</span><span class="v">${value}</span></div>`;
    }).join("");

    this._popup.innerHTML = `
      <header><span class="title">${esc(title)}</span><button class="close" data-close aria-label="${esc(t.close)}">×</button></header>
      ${main ? `<div class="main">${esc(main)}</div>` : ""}
      <div class="rows">${rowHtml || `<div class="empty">${esc(t.no_entries)}</div>`}</div>
      ${mainId ? `<footer><button class="details" data-entity="${esc(mainId)}">${esc(t.details)}</button></footer>` : ""}`;
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  // ---------- formatting ----------

  _num(x, decimals) {
    const key = String(decimals);
    if (!this._nf[key]) {
      try {
        this._nf[key] = new Intl.NumberFormat(this._lang, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      } catch (e) {
        this._nf[key] = new Intl.NumberFormat("de", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      }
    }
    return this._nf[key].format(x);
  }

  _fmtPower(w) {
    if (w == null) return "–";
    const d = this._config.display;
    if (d.unit === "kW" || (d.unit !== "W" && Math.abs(w) >= d.kw_threshold)) return `${this._num(w / 1000, d.decimals)} kW`;
    return `${this._num(w, 0)} W`;
  }

  _fmtEnergy(kwh) {
    if (kwh == null) return "–";
    return `${this._num(kwh, Math.abs(kwh) < 10 ? 2 : 1)} kWh`;
  }

  _fmtState(id) {
    const s = id && this._hass.states[id];
    if (!s) return this._t.not_found;
    if (typeof this._hass.formatEntityState === "function") {
      try {
        return this._hass.formatEntityState(s);
      } catch (e) {
        // fall through to the plain value
      }
    }
    const unit = s.attributes?.unit_of_measurement;
    return unit ? `${s.state} ${unit}` : s.state;
  }

  _batteryText(bat) {
    if (bat == null) return "";
    const t = this._t;
    if (Math.abs(bat) < this._config.display.threshold) return t.idle;
    return `${bat > 0 ? t.charging : t.discharging} ${this._fmtPower(Math.abs(bat))}`;
  }

  _gridText(grid) {
    const t = this._t;
    if (Math.abs(grid) < this._config.display.threshold) return t.idle;
    return grid > 0 ? t.import : t.export;
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, EnergyCard);

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === TAG)) {
  window.customCards.push({
    type: TAG,
    name: "Energy Card",
    description: "Animierte Energieflüsse: PV, Batterie, Haus, Netz und Auto",
    preview: false,
    documentationURL: "https://github.com/RonnyGrueninger/energy-card",
  });
}

console.info(`%c ENERGY-CARD %c ${VERSION} `, "color:#02050c;background:#00f9f9;font-weight:700", "color:#00f9f9;background:#02050c");
