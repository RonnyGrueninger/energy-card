/**
 * Energy Card for Home Assistant
 * Animated energy flows over a 3D scene: PV, battery, house, grid and car.
 *
 * Code: MIT License (see LICENSE).
 * Background and battery images come from the Lumina Energy Card project,
 * see NOTICE-ASSETS.md.
 */

const VERSION = "0.4.3";
const TAG = "energy-card";
const ASSETS = new URL("./", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
const BASE_SPEED = 100; // px per second at playbackRate 1

// All positions are pixels on the 3072 x 2048 background image.
// The flows run along the two floor directions of the scene and turn at right angles.
const LAYOUT = {
  view_box: [0, 0, 3072, 2048],
  flows: {
    pv: [[960, 1045], [1549, 1270]],
    battery: [[1200, 1405], [1342, 1470], [1617, 1370]],
    home: [[1843, 1197], [2173, 1070], [1824, 950]],
    grid: [[2534, 1702], [1785, 1414]],
    car: [[1853, 1374], [2126, 1477], [2420, 1345]], // ends on the floor in front of the car, the charging cable starts here
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
  battery_image: { x: 960, y: 862, width: 280, height: 560 }, // only used with battery.image; tall stacks grow upwards
  car: { x: 2290, y: 850, width: 760, height: 470 }, // visible part of the picture, wheels on the bottom edge
  inverter: { x: 1650, y: 1100, width: 230, height: 300 }, // only used with inverter.image
  grid_node: [2534, 1702],
};

// With an own inverter picture the card uses a background without the glass box,
// and the flows end at the edges of the picture instead.
const INVERTER_IMAGE_FLOWS = {
  pv: [[960, 1045], [1700, 1325]],
  battery: [[1200, 1415], [1335, 1477], [1705, 1342]],
  home: [[1840, 1160], [2178, 1049], [1824, 950]],
  grid: [[2534, 1702], [1795, 1385]],
  car: [[1871, 1365], [2146, 1468], [2420, 1345]], // starts right next to the inverter, it is drawn above it
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
    labels: false, // captions like "SOLAR" above the values
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
  // charge_port: where the cable plugs in, as share of width and height of the car as shown in the
  // card (after flip). The default fits the flipped MySkoda picture of a Superb iV (socket on the
  // right in the front grille).
  car: { charge_port: [0.22, 0.52] },
  inverter: {},
};

const SECTIONS = ["pv", "battery", "home", "grid", "car", "inverter"];
const ENTITY_KEYS = ["entity", "soc", "power", "daily", "daily_import", "daily_export", "status", "image_entity", "plug"];
const PLUGGED_STATES = new Set(["on", "true", "connected", "plugged", "plugged_in"]);
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
  .cable { opacity: 0; transition: opacity .6s ease; pointer-events: none; }
  .cable.on { opacity: 1; }
  .cable .rope { fill: none; stroke: #0a121c; stroke-width: 11; stroke-linecap: round; opacity: .8; }
  .cable .core { fill: none; stroke: currentColor; stroke-width: 4; stroke-linecap: round; opacity: .35; transition: opacity .6s; }
  .cable .plug circle { fill: currentColor; opacity: .45; transition: opacity .6s; }
  .cable.live .core { opacity: .95; filter: drop-shadow(0 0 7px currentColor); }
  .cable.live .plug circle { opacity: 1; filter: drop-shadow(0 0 8px currentColor); animation: ec-pulse 2.4s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) { .cable.live .plug circle { animation: none; } }
  .boxes { position: absolute; inset: 0; pointer-events: none; }
  .nolbl .lbl { display: none; }
  .box {
    position: absolute; pointer-events: auto; cursor: pointer;
    transform: translate(calc(-50% + var(--dx, 0px)), calc(-50% + var(--dy, 0px)));
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
  @keyframes ec-pulse { 50% { opacity: .55; } }
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
    const ownInverter = isObj(config.inverter) && !!config.inverter.image;
    const baseLayout = clone(LAYOUT);
    if (ownInverter) Object.assign(baseLayout.flows, clone(INVERTER_IMAGE_FLOWS));
    cfg.layout = merge(baseLayout, config.layout || {});
    if (ownInverter && !config.layout?.hotspots?.inverter) {
      const I = cfg.layout.inverter;
      cfg.layout.hotspots.inverter = [I.x, I.y, I.width, I.height];
    }
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
    this._ro?.disconnect();
    this._ro = null;
    if (this._clampRaf) cancelAnimationFrame(this._clampRaf);
    this._clampRaf = 0;
    this._built = false;
  }

  _build() {
    const c = this._config;
    const [vx, vy, vw, vh] = c.layout.view_box;
    const style = c.style === "tech" ? "tech" : "real";
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    this._anim = reduceMotion || c.display.animation === "none" ? null : ANIMATIONS[c.display.animation] || ANIMATIONS.comet;
    this._uid = "ec" + Math.random().toString(36).slice(2, 8);
    const bg = c.background || `${ASSETS}bg-${style}${c.inverter.image ? "-noinv" : ""}.jpg`;

    this.shadowRoot.innerHTML = `
      <style>${CSS}</style>
      <ha-card>
        <div class="scene" style="aspect-ratio: ${vw} / ${vh}; --ec-text: ${esc(c.colors.text)}; --ec-imp: ${esc(c.colors.grid_import)}; --ec-exp: ${esc(c.colors.grid_export)};${c.display.font ? ` --ec-font: ${esc(c.display.font)};` : ""}">
          <svg class="svg" viewBox="${vx} ${vy} ${vw} ${vh}" preserveAspectRatio="xMidYMid slice">
            <defs></defs>
            <image href="${esc(bg)}" x="0" y="0" width="3072" height="2048" preserveAspectRatio="none"></image>
            <g class="flows"></g>
            <g class="objects"></g>
            <g class="top"></g>
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
    this._buildFlows(svgEl.querySelector(".flows"), svgEl.querySelector(".top"));
    const objects = svgEl.querySelector(".objects");
    this._socSegs = [];
    this._socFace = null;
    this._batteryRect = null;
    this._hot = {};
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
    // Keep the value boxes inside the card when the card or a box changes size.
    this._scene = root.querySelector(".scene");
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(() => this._scheduleClamp());
      this._ro.observe(this._scene);
      for (const b of Object.values(this._boxes)) this._ro.observe(b.el);
    }
    this._backdrop = root.querySelector(".backdrop");
    this._popup = root.querySelector(".popup");
    this._popupSection = null;
    this._bindPopup();
    this._seen = {};
    this._built = true;
    this._update(true);
  }

  _buildFlows(layer, top) {
    const c = this._config;
    const anim = this._anim;
    this._cable = null;
    for (const [id, pts] of Object.entries(c.layout.flows)) {
      if (!c._on[id] || !Array.isArray(pts) || pts.length < 2) continue;
      // The car flow goes on into the charging cable, which hangs in front of the car.
      // So this flow is drawn above the car, between the cable and the plug.
      const cable = id === "car" && c.car.cable !== false;
      if (cable) {
        const under = svg("g", { class: "cable" }, top);
        this._cable = {
          under,
          rope: svg("path", { class: "rope" }, under),
          core: svg("path", { class: "core" }, under),
          color: null,
        };
      }
      const g = svg("g", { class: "flow off" }, cable ? top : layer);
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
      this._flows[id] = { g, track, layers, anims, dF, dR, pts: clone(pts), reverse: false, color: null };
      if (cable) {
        const over = svg("g", { class: "cable" }, top);
        const plug = svg("g", { class: "plug" }, over);
        svg("circle", { r: 7 }, plug); // glowing socket where the cable goes in
        Object.assign(this._cable, { over, plug });
      }
    }
  }

  _buildBattery(layer, style) {
    const c = this._config;
    let rect; // the picture area the SOC face fractions refer to
    let own = null;
    let f = c.battery.soc_face || null;
    if (c.battery.image) {
      // Own picture: standing on the floor in its own box, with a reflection.
      // Once the picture is measured, hotspot and SOC bar move onto its visible part.
      const B = c.layout.battery_image;
      rect = [B.x, B.y, B.width, B.height];
      this._batteryRect = rect;
      own = this._buildOverlay(layer, "battery", B, c.battery);
    } else {
      const B = c.layout.battery;
      const h = B.width * BATTERY_RATIO[style];
      rect = [B.x, B.y, B.width, h];
      this._batteryRect = [B.x, B.y, B.width, h * BATTERY_FOOT];
      svg("image", { href: `${ASSETS}battery-${style}.png`, x: B.x, y: B.y, width: B.width, height: h, preserveAspectRatio: "none" }, layer);
      f = f || SOC_FACE[style];
    }
    if (f && c.battery.soc && c.battery.soc_bar !== false) {
      const g = svg("g", { class: "soc" }, layer);
      for (let i = 0; i < 6; i++) this._socSegs.push(svg("polygon", { class: "seg" }, g));
      this._socFace = f;
      this._placeSoc(rect);
    }
    if (own) {
      const uid = this._uid;
      own.onFit = () => {
        if (uid !== this._uid) return;
        const r = this._sceneRect(own);
        this._batteryRect = r;
        const el = this._hot?.battery;
        if (el) ["x", "y", "width", "height"].forEach((k, i) => el.setAttribute(k, r[i].toFixed(1)));
        this._placeSoc(r);
      };
      this._setHref(own, c.battery.image);
    }
  }

  // Lays the SOC segments onto the battery face. rect = [x, y, width, height] of the picture.
  _placeSoc([x, y, w, h]) {
    const f = this._socFace;
    const segs = this._socSegs;
    if (!f || !segs.length) return;
    const n = segs.length;
    const gap = 0.22; // share of one segment left empty
    const lerp = (a, b, t) => a + (b - a) * t;
    const P = (u, v) => `${(x + u * w).toFixed(1)},${(y + v * h).toFixed(1)}`;
    segs.forEach((seg, i) => {
      const ta = (i + gap / 2) / n;
      const tb = (i + 1 - gap / 2) / n;
      seg.setAttribute("points", [
        P(f.u0, lerp(f.b0, f.t0, ta)),
        P(f.u1, lerp(f.b1, f.t1, ta)),
        P(f.u1, lerp(f.b1, f.t1, tb)),
        P(f.u0, lerp(f.b0, f.t0, tb)),
      ].join(" "));
    });
  }

  // A picture standing on the floor, with a fading reflection below it.
  // opts: flip, hologram, reflection (false = off)
  _buildOverlay(layer, key, box, opts = {}) {
    const { x, y, width: w, height: h } = box;
    const id = `${this._uid}-${key}`;
    const g = svg("g", { class: key }, layer);
    if (opts.flip) g.setAttribute("transform", `translate(${2 * x + w} 0) scale(-1 1)`);
    if (opts.hologram) g.setAttribute("filter", `url(#${this._uid}-holo)`);
    // The reflection is mirrored at the line where the picture touches the floor. Seen from above,
    // a car touches it along two lines (bumper and tires), so there is a left and a right half.
    const mirror = svg("g", { opacity: opts.reflection === false ? 0 : 0.35 }, g);
    const attrs = { x, y, width: w, height: h, preserveAspectRatio: "xMidYMax meet" };
    const parts = [0, 1].map((n) => {
      this._defs.insertAdjacentHTML("beforeend", `
        <clipPath id="${id}-c${n}"><rect></rect></clipPath>
        <linearGradient id="${id}-g${n}" gradientUnits="userSpaceOnUse" x1="0" x2="0">
          <stop offset="0" stop-color="#fff" stop-opacity="0"></stop>
          <stop offset="1" stop-color="#fff" stop-opacity=".85"></stop>
        </linearGradient>
        <mask id="${id}-m${n}" maskUnits="userSpaceOnUse"><rect fill="url(#${id}-g${n})"></rect></mask>`);
      const clip = svg("g", { "clip-path": `url(#${id}-c${n})` }, mirror);
      const flipped = svg("g", { mask: `url(#${id}-m${n})` }, clip);
      return {
        g: flipped,
        image: svg("image", attrs, flipped),
        clipRect: this._defs.querySelector(`#${id}-c${n} rect`),
        grad: this._defs.querySelector(`#${id}-g${n}`),
        mask: this._defs.querySelector(`#${id}-m${n}`),
      };
    });
    const img = svg("image", attrs, g);
    const overlay = {
      g, img, refl: parts.map((p) => p.image), parts, href: null, box: { x, y, width: w, height: h },
      flip: !!opts.flip, trim: opts.trim !== false, fitToken: 0,
      content: null, // visible part of the picture once measured, before flipping
      onFit: null,
    };
    this._placeReflection(overlay, null);
    return overlay;
  }

  // Mirrors the picture at its floor line(s). floor: { lines: [[slope, x, y], [slope, x, y]], split }
  // for the left and right half, or null for a flat floor at the bottom of the picture.
  _placeReflection(o, floor) {
    const b = o.content || o.box;
    const bottom = b.y + b.height;
    const lines = floor ? floor.lines : [[0, b.x, bottom], [0, b.x, bottom]];
    const split = floor ? floor.split : b.x + b.width / 2;
    const fade = Math.max(20, b.height * 0.6);
    const X0 = o.box.x - 200;
    const X1 = o.box.x + o.box.width + 200;
    const Y0 = o.box.y - 800;
    const Y1 = o.box.y + o.box.height + 800;
    const area = (el, x0, x1) => {
      el.setAttribute("x", x0.toFixed(1));
      el.setAttribute("y", Y0.toFixed(1));
      el.setAttribute("width", (x1 - x0).toFixed(1));
      el.setAttribute("height", (Y1 - Y0).toFixed(1));
    };
    o.parts.forEach((p, n) => {
      const [k, lx, ly] = lines[n];
      const c = ly - k * lx; // floor line: y = c + k * x
      // mirror at that line, and fade out with the distance above it
      p.g.setAttribute("transform", `matrix(1 ${(2 * k).toFixed(4)} 0 -1 0 ${(2 * c).toFixed(1)})`);
      p.grad.setAttribute("gradientTransform", `matrix(1 ${k.toFixed(4)} 0 1 0 0)`);
      p.grad.setAttribute("y1", (c - fade).toFixed(1));
      p.grad.setAttribute("y2", c.toFixed(1));
      area(p.mask, X0, X1);
      area(p.mask.firstElementChild, X0, X1);
      area(p.clipRect, n === 0 ? X0 : split, n === 0 ? split : X1);
    });
  }

  // Where a picture touches the floor: the lower convex hull of its bottom outline (points sorted
  // by x, y downwards). Left and right of the lowest point the longest hull edge is the floor line.
  _floorLines(pts) {
    if (pts.length < 3) return null;
    const hull = [];
    for (const p of pts) {
      while (hull.length >= 2) {
        const a = hull[hull.length - 2];
        const b = hull[hull.length - 1];
        if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0) hull.pop();
        else break;
      }
      hull.push(p);
    }
    let low = 0;
    hull.forEach((p, i) => {
      if (p[1] > hull[low][1]) low = i;
    });
    const longest = (from, to) => {
      let best = null;
      for (let i = from; i < to; i++) {
        const dx = hull[i + 1][0] - hull[i][0];
        if (dx > 0 && (!best || dx > best.dx)) best = { dx, k: (hull[i + 1][1] - hull[i][1]) / dx, p: hull[i] };
      }
      return best && Math.abs(best.k) <= 0.7 ? [best.k, best.p[0], best.p[1]] : [0, hull[low][0], hull[low][1]];
    };
    const left = longest(0, low);
    const right = longest(low, hull.length - 1);
    // the halves meet where both lines cross, normally below the front wheel
    let split = hull[low][0];
    if (Math.abs(left[0] - right[0]) > 0.01) {
      const x = (right[2] - left[2] + left[0] * left[1] - right[0] * right[1]) / (left[0] - right[0]);
      if (x > pts[0][0] && x < pts[pts.length - 1][0]) split = x;
    }
    return { lines: [left, right], split };
  }

  _setHref(overlay, url) {
    overlay.href = url;
    for (const el of [overlay.img, ...overlay.refl]) {
      if (url) el.setAttribute("href", url);
      else el.removeAttribute("href");
    }
    if (url) this._fitContent(overlay, url);
  }

  // Visible part of an overlay picture in scene coordinates: [x, y, width, height].
  _sceneRect(o) {
    const b = o.content || o.box;
    const x = o.flip ? 2 * o.box.x + o.box.width - b.x - b.width : b.x;
    return [x, b.y, b.width, b.height];
  }

  // Many pictures (e.g. MySkoda renders) have a wide transparent border.
  // Measure the visible part and scale it so exactly that part fills the box,
  // standing on the box bottom. Without trim, or for cross-origin pictures, the plain fit stays.
  async _fitContent(overlay, url) {
    const token = ++overlay.fitToken;
    const pic = new Image();
    try {
      pic.src = url;
      await pic.decode();
    } catch (e) {
      return;
    }
    if (token !== overlay.fitToken) return;
    const nw = pic.naturalWidth;
    const nh = pic.naturalHeight;
    if (!nw || !nh) return;
    const { x, y, width: W, height: H } = overlay.box;
    let k = Math.min(W / nw, H / nh);
    let content = { x: x + (W - nw * k) / 2, y: y + H - nh * k, width: nw * k, height: nh * k };
    const vis = this._visibleBox(pic, nw, nh);
    let floor = null;
    if (vis && overlay.trim) {
      const [bx, by, bw, bh] = vis.box;
      k = Math.min(W / bw, H / bh);
      content = { x: x + (W - bw * k) / 2, y: y + H - bh * k, width: bw * k, height: bh * k };
      const attrs = {
        x: (content.x - bx * k).toFixed(1),
        y: (content.y - by * k).toFixed(1),
        width: (nw * k).toFixed(1),
        height: (nh * k).toFixed(1),
        preserveAspectRatio: "none",
      };
      for (const el of [overlay.img, ...overlay.refl]) {
        for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
      }
      floor = this._floorLines(vis.bottom.map(([px, py]) => [content.x + (px - bx) * k, content.y + (py - by) * k]));
    } else if (vis) {
      // plain fit: picture pixels map straight onto the fitted picture
      floor = this._floorLines(vis.bottom.map(([px, py]) => [content.x + px * k, content.y + py * k]));
    }
    overlay.content = content;
    this._placeReflection(overlay, floor);
    overlay.onFit?.();
  }

  // Visible part of the picture, or null if its pixels can't be read (cross-origin):
  // box = [x, y, width, height] of the non-transparent pixels,
  // bottom = lowest non-transparent point of each column, [x, y] in picture pixels.
  _visibleBox(pic, nw, nh) {
    try {
      const s = Math.min(1, 480 / Math.max(nw, nh));
      const cw = Math.max(1, Math.round(nw * s));
      const ch = Math.max(1, Math.round(nh * s));
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(pic, 0, 0, cw, ch);
      const data = ctx.getImageData(0, 0, cw, ch).data; // throws for cross-origin pictures
      let x0 = cw;
      let y0 = ch;
      let x1 = -1;
      let y1 = -1;
      const low = new Array(cw).fill(-1);
      for (let py = 0; py < ch; py++) {
        for (let px = 0; px < cw; px++) {
          if (data[(py * cw + px) * 4 + 3] > 24) {
            if (px < x0) x0 = px;
            if (px > x1) x1 = px;
            if (py < y0) y0 = py;
            if (py > y1) y1 = py;
            low[px] = py;
          }
        }
      }
      if (x1 < 0) return null;
      const bottom = [];
      for (let px = x0; px <= x1; px++) if (low[px] >= 0) bottom.push([(px + 0.5) / s, (low[px] + 1) / s]);
      return { box: [x0 / s, y0 / s, (x1 - x0 + 1) / s, (y1 - y0 + 1) / s], bottom };
    } catch (e) {
      return null;
    }
  }

  _buildCar(layer) {
    const c = this._config;
    this._car = this._buildOverlay(layer, "car", c.layout.car, c.car);
    this._carImgState = null;
    const uid = this._uid;
    this._car.onFit = () => {
      if (uid === this._uid) this._layoutCable();
    };
    this._layoutCable();
    this._setHref(this._car, c.car.image || null);
  }

  // Where the cable plugs into the car, in scene coordinates.
  _carPort() {
    const port = this._config.car.charge_port;
    const [u, v] = Array.isArray(port) && port.length >= 2 ? port.map(Number) : DEFAULTS.car.charge_port;
    const [x, y, w, h] = this._sceneRect(this._car);
    return [x + u * w, y + v * h];
  }

  // The cable starts where the car flow ends on the floor, keeps its direction for a moment
  // and then rises into the socket. The flow's light runs on along the cable.
  _layoutCable() {
    const f = this._flows.car;
    const cab = this._cable;
    if (!f || !cab || !this._car) return;
    const P = this._carPort();
    const pts = f.pts;
    const G = pts[pts.length - 1];
    const H = pts[pts.length - 2];
    const len = Math.hypot(G[0] - H[0], G[1] - H[1]) || 1;
    const c1 = [G[0] + ((G[0] - H[0]) / len) * 34, G[1] + ((G[1] - H[1]) / len) * 34];
    const c2 = [P[0], P[1] + Math.max(30, (G[1] - P[1]) * 0.6)];
    const curve = [];
    for (let i = 1; i <= 16; i++) {
      const t = i / 16;
      const u = 1 - t;
      const at = (k) => +(u * u * u * G[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t * t * t * P[k]).toFixed(1);
      curve.push([at(0), at(1)]);
    }
    const full = [...pts, ...curve];
    f.dF = pathD(full);
    f.dR = pathD([...full].reverse());
    const d = f.reverse ? f.dR : f.dF;
    f.layers.forEach((l) => l.el.setAttribute("d", d));
    const n = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    const cd = `M${n(G)} C${n(c1)} ${n(c2)} ${n(P)}`;
    cab.rope.setAttribute("d", cd);
    cab.core.setAttribute("d", cd);
    cab.plug.setAttribute("transform", `translate(${n(P)})`);
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
      if (!Array.isArray(r) || r.length < 4) return null;
      const el = svg("rect", { class: "hot", x: r[0], y: r[1], width: r[2], height: r[3], rx: 28 }, layer);
      el.addEventListener("click", () => this._openPopup(sec));
      return el;
    };
    if (c._on.pv) rect("pv", H.pv);
    rect("inverter", H.inverter);
    if (c._on.home) rect("home", H.home);
    if (this._batteryRect) this._hot.battery = rect("battery", this._batteryRect);
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
    container.classList.toggle("nolbl", !c.display.labels);
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
    this._updateCable(v);
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
    const plug = c.car.plug && h.states[c.car.plug];
    v.carPlug = plug ? PLUGGED_STATES.has(String(plug.state).toLowerCase()) : null;
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
      // the track is a plain line and keeps its path (for the car it ends where the cable starts)
      const path = reverse ? f.dR : f.dF;
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

  // The cable shows while the car charges, or while it is plugged in (car.plug).
  // It glows while charging.
  _updateCable(v) {
    const cab = this._cable;
    if (!cab) return;
    const c = this._config;
    const charging = v.car != null && Math.abs(v.car) >= c.display.threshold;
    const show = charging || v.carPlug === true;
    for (const g of [cab.under, cab.over]) {
      g.classList.toggle("on", show);
      g.classList.toggle("live", charging);
      if (cab.color !== c.colors.car) g.style.color = c.colors.car;
    }
    cab.color = c.colors.car;
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

  _scheduleClamp() {
    if (this._clampRaf) return;
    this._clampRaf = requestAnimationFrame(() => {
      this._clampRaf = 0;
      this._clampBoxes();
    });
  }

  // Pushes value boxes back inside the card. On phones the minimum font size makes
  // the boxes relatively big, so the ones near the edge would stick out.
  _clampBoxes() {
    const scene = this._scene;
    if (!scene || !this._boxes) return;
    const s = scene.getBoundingClientRect();
    if (!s.width || !s.height) return;
    const k = scene.offsetWidth / s.width || 1; // screen px -> CSS px, in case the card is scaled
    const pad = Math.max(4, s.width * 0.01);
    for (const b of Object.values(this._boxes)) {
      const r = b.el.getBoundingClientRect();
      const ox = (b.dx || 0) / k;
      const oy = (b.dy || 0) / k;
      const left = r.left - ox;
      const right = r.right - ox;
      const top = r.top - oy;
      const bottom = r.bottom - oy;
      let dx = 0;
      let dy = 0;
      if (left < s.left + pad) dx = s.left + pad - left;
      else if (right > s.right - pad) dx = s.right - pad - right;
      if (top < s.top + pad) dy = s.top + pad - top;
      else if (bottom > s.bottom - pad) dy = s.bottom - pad - bottom;
      dx *= k;
      dy *= k;
      if (Math.abs(dx - (b.dx || 0)) > 0.5 || Math.abs(dy - (b.dy || 0)) > 0.5) {
        b.dx = dx;
        b.dy = dy;
        b.el.style.setProperty("--dx", `${dx.toFixed(1)}px`);
        b.el.style.setProperty("--dy", `${dy.toFixed(1)}px`);
      }
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
