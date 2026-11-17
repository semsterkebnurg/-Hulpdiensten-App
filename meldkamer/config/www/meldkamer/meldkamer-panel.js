/*
 * Meldkamer-dashboard voor Home Assistant
 * Een eigen pagina (panel) met brandmeldingen, kaart, weer, lampen,
 * rolluiken, energie, agenda en meer.
 */

const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
const FONTS = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap";
const NACHT_VAN = 23;
const NACHT_TOT = 7;

// ---------- Hulpfuncties ----------

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const pad = (n) => String(n).padStart(2, "0");

function tijdGeleden(iso) {
  const t = new Date(iso);
  if (isNaN(t)) return "";
  const s = Math.max(0, (Date.now() - t.getTime()) / 1000);
  if (s < 60) return "zojuist";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min geleden`;
  const u = Math.floor(m / 60);
  if (u < 24) return `${u} uur ${m % 60 ? (m % 60) + " min " : ""}geleden`;
  const d = Math.floor(u / 24);
  if (d === 1) return `gisteren ${pad(t.getHours())}:${pad(t.getMinutes())}`;
  return `${d} dagen geleden`;
}

function klokTijd(iso) {
  const t = new Date(iso);
  return isNaN(t) ? "" : `${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

const WEER = {
  0: ["Helder", "☀️", "🌙"], 1: ["Overwegend helder", "🌤️", "🌙"], 2: ["Half bewolkt", "⛅", "☁️"], 3: ["Bewolkt", "☁️", "☁️"],
  45: ["Mist", "🌫️"], 48: ["Rijpmist", "🌫️"], 51: ["Lichte motregen", "🌦️"], 53: ["Motregen", "🌦️"], 55: ["Zware motregen", "🌧️"],
  56: ["IJzel", "🧊"], 57: ["IJzel", "🧊"], 61: ["Lichte regen", "🌦️"], 63: ["Regen", "🌧️"], 65: ["Zware regen", "🌧️"],
  66: ["IJzel", "🧊"], 67: ["IJzel", "🧊"], 71: ["Lichte sneeuw", "🌨️"], 73: ["Sneeuw", "🌨️"], 75: ["Zware sneeuw", "❄️"],
  77: ["Sneeuwkorrels", "🌨️"], 80: ["Buien", "🌦️"], 81: ["Regenbuien", "🌧️"], 82: ["Zware buien", "⛈️"],
  85: ["Sneeuwbuien", "🌨️"], 86: ["Zware sneeuwbuien", "❄️"], 95: ["Onweer", "⛈️"], 96: ["Onweer met hagel", "⛈️"], 99: ["Zwaar onweer", "⛈️"],
};
const weerTekst = (c) => (WEER[c] || ["Onbekend"])[0];
const weerIcoon = (c, dag = 1) => {
  const w = WEER[c];
  if (!w) return "🌡️";
  return !dag && w[2] ? w[2] : w[1];
};
const windRichting = (g) => ["N", "NO", "O", "ZO", "Z", "ZW", "W", "NW"][Math.round(((g ?? 0) % 360) / 45) % 8];
const beaufort = (kmh) => {
  const i = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118].findIndex((g) => (kmh ?? 0) < g);
  return i < 0 ? 12 : i;
};

const AQI = [
  [20, "Goed", "#2ecc71"], [40, "Redelijk", "#a3d95b"], [60, "Matig", "#f1c40f"],
  [80, "Slecht", "#e67e22"], [100, "Zeer slecht", "#e74c3c"], [Infinity, "Extreem slecht", "#9b59b6"],
];

const KNMI_KLEUR = { geel: "#ffd60a", oranje: "#ff8c1a", rood: "#ff3b30" };

// ---------- Stijl ----------

const CSS = `
:host{
  --bg:#07090d; --bg2:#0d1117; --kaart:rgba(20,25,33,.82); --rand:rgba(255,255,255,.07);
  --tekst:#e8edf3; --zacht:#8b96a5; --zwak:#4f5966;
  --accent:#ff3b30; --accent2:#ff6b3d; --goed:#30d158; --geel:#ffd60a; --blauw:#0a84ff;
  --r:16px;
  display:block; height:100vh; min-height:100%; background:var(--bg); color:var(--tekst);
  font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;
}
:host([storm]){ --accent:#ffd60a; --accent2:#bf5af2; }
*{box-sizing:border-box}
button{font:inherit;color:inherit;cursor:pointer;border:0;background:none}
.wrap{
  height:100%; display:flex; flex-direction:column; overflow:hidden; position:relative;
  background:
    radial-gradient(1200px 600px at 10% -10%, color-mix(in srgb,var(--accent) 14%,transparent), transparent 60%),
    radial-gradient(900px 500px at 110% 110%, rgba(10,132,255,.10), transparent 60%),
    linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px) 0 0/100% 32px,
    var(--bg);
}
/* ---- kop ---- */
.kop{display:flex;align-items:center;gap:14px;padding:12px 18px;border-bottom:1px solid var(--rand);
  background:linear-gradient(180deg,rgba(0,0,0,.35),transparent)}
.logo{display:flex;align-items:center;gap:12px;min-width:0}
.logo .bol{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;font-size:22px;
  background:linear-gradient(135deg,var(--accent),var(--accent2));box-shadow:0 0 24px color-mix(in srgb,var(--accent) 45%,transparent)}
.logo h1{margin:0;font-size:18px;letter-spacing:.18em;font-weight:800}
.logo small{display:block;color:var(--zacht);font-size:12px;letter-spacing:.12em;text-transform:uppercase}
.chips{display:flex;gap:8px;flex-wrap:wrap;flex:1;justify-content:center}
.chip{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.05);
  border:1px solid var(--rand);font-size:13px;color:var(--zacht);white-space:nowrap}
.chip b{color:var(--tekst);font-weight:600}
.chip .stip{width:8px;height:8px;border-radius:50%;background:var(--goed);box-shadow:0 0 8px var(--goed)}
.chip.fout .stip{background:var(--accent);box-shadow:0 0 8px var(--accent)}
.chip.knop{cursor:pointer}
.chip.aan{background:color-mix(in srgb,var(--accent) 22%,transparent);border-color:var(--accent);color:var(--tekst)}
.klok{text-align:right;font-family:"JetBrains Mono",ui-monospace,monospace}
.klok .t{font-size:34px;font-weight:700;letter-spacing:.04em;line-height:1}
.klok .d{color:var(--zacht);font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-family:Inter,sans-serif;margin-top:4px}
.menu{width:38px;height:38px;border-radius:10px;background:rgba(255,255,255,.05);font-size:18px;display:none}
:host([kiosk]) .menu{display:block}
/* ---- tabbladen (pagina's) ---- */
.paginas{display:flex;gap:6px;flex:none}
.pag-knop{padding:10px 16px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid var(--rand);
  font-weight:700;font-size:14px;color:var(--zacht);white-space:nowrap;transition:.15s}
.pag-knop.aan{background:var(--accent);border-color:var(--accent);color:#fff;box-shadow:0 0 18px color-mix(in srgb,var(--accent) 40%,transparent)}
:host([storm]) .pag-knop.aan{color:#000}
:host([storm]) .pag-knop[data-pagina="weer"]:not(.aan){border-color:var(--geel);color:var(--geel);animation:flits 2.4s infinite}
.pagina:not(.aan){display:none!important}
.raster.twee{grid-template-columns:minmax(0,1fr) minmax(0,1.7fr)}
.camgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-content:start;overflow:auto;flex:1;min-height:0}
.camgrid .cam{aspect-ratio:16/10}
.camgrid .cam span{font-size:14px;left:10px;bottom:8px}
.camgrid .cam .live{position:absolute;right:8px;top:8px;font-size:11px;font-weight:800;background:var(--accent);color:#fff;padding:2px 7px;border-radius:6px;inset:8px 8px auto auto;z-index:2}
.camgrid .cam .live-houder{position:absolute;inset:0;overflow:hidden}
.camgrid .cam .live-houder > *{display:block;width:100%;height:100%;--ha-card-border-radius:0;--ha-card-border-width:0}
.camgrid .cam span{z-index:2;pointer-events:none}
.camgrid .cam .live-knop{position:absolute;left:8px;top:8px;z-index:3;font-size:11px;font-weight:700;padding:4px 8px;border-radius:8px;
  background:rgba(0,0,0,.65);color:#fff;border:1px solid rgba(255,255,255,.25)}
.camgrid .cam .live-knop.aan{background:var(--goed);color:#000;border-color:var(--goed)}
.knmi{padding:10px 12px;border-radius:12px;margin-bottom:8px;border:1px solid;background:rgba(0,0,0,.2)}
.knmi b{display:block;font-size:15px}
.knmi small{color:var(--zacht)}
.knmi-ok{display:flex;align-items:center;gap:10px;padding:14px;border-radius:12px;background:rgba(48,209,88,.08);border:1px solid rgba(48,209,88,.3)}
:host .p-huis .lamp{min-height:84px}
:host .p-huis .lamp .n{font-size:15px}
:host .p-huis .schakels{grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}
/* ---- storm ---- */
.storm{display:none;align-items:center;gap:12px;padding:8px 18px;font-weight:600;font-size:14px;
  background:repeating-linear-gradient(-45deg,rgba(255,214,10,.16) 0 14px,rgba(255,214,10,.06) 14px 28px);
  border-bottom:1px solid rgba(255,214,10,.35);color:#ffe680}
:host([storm]) .storm{display:flex}
.storm .bliksem{font-size:20px;animation:flits 2.4s infinite}
@keyframes flits{0%,86%,100%{opacity:1}88%{opacity:.2}90%{opacity:1}92%{opacity:.3}}
/* ---- raster ---- */
.raster{flex:1;min-height:0;display:grid;gap:14px;padding:14px 18px 18px;
  grid-template-columns:minmax(0,1.05fr) minmax(0,1.45fr) minmax(0,1fr)}
.kolom{display:flex;flex-direction:column;gap:14px;min-height:0;min-width:0;overflow:auto;scrollbar-width:none}
.kolom::-webkit-scrollbar{display:none}
.kaart{background:var(--kaart);border:1px solid var(--rand);border-radius:var(--r);padding:14px 16px;
  backdrop-filter:blur(10px);box-shadow:0 10px 30px rgba(0,0,0,.25);min-height:0;position:relative}
.kaart h2{margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--zacht);
  display:flex;align-items:center;gap:8px}
.kaart h2 .r{margin-left:auto;letter-spacing:.05em;text-transform:none;font-weight:500}
.kolom > .kaart,.kolom > .duo{flex:none}
.kolom > .groei{flex:1 1 auto;display:flex;flex-direction:column;min-height:230px}
.kolom > .groei.lang{min-height:340px}
.scroll{overflow:auto;min-height:0;flex:1;scrollbar-width:thin;scrollbar-color:#333 transparent}
.leeg{color:var(--zwak);font-size:14px;padding:6px 0}
/* ---- laatste melding ---- */
.melding-hero{border-color:color-mix(in srgb,var(--accent) 35%,transparent);
  background:linear-gradient(160deg,color-mix(in srgb,var(--accent) 16%,transparent),var(--kaart) 55%)}
.hero-top{display:flex;align-items:center;gap:10px}
.prio{font-family:"JetBrains Mono",monospace;font-weight:700;font-size:14px;padding:4px 10px;border-radius:8px;background:#3a4250;color:#fff}
.prio.p1{background:var(--accent);box-shadow:0 0 16px color-mix(in srgb,var(--accent) 60%,transparent)}
.prio.p2{background:#ff9f0a;color:#111}
.geleden{margin-left:auto;font-family:"JetBrains Mono",monospace;font-size:13px;color:var(--zacht)}
.hero-titel{font-size:24px;font-weight:800;line-height:1.2;margin:10px 0 4px;overflow-wrap:anywhere}
.hero-adres{color:var(--zacht);font-size:14px}
.eenheden{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
.eenheid{font-size:12px;padding:4px 8px;border-radius:6px;background:rgba(255,255,255,.06);border:1px solid var(--rand)}
.eenheid.eigen{border-color:var(--geel);color:var(--geel)}
.route{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.route a{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.05);
  border:1px solid var(--rand);text-decoration:none;color:var(--tekst)}
.route a.best{border-color:var(--goed);background:rgba(48,209,88,.10)}
.route a span{font-size:22px}
.route a b{font-size:20px;font-family:"JetBrains Mono",monospace}
.route a small{display:block;color:var(--zacht);font-size:11px}
.advies{margin-top:8px;padding:8px 12px;border-radius:10px;background:rgba(10,132,255,.12);border:1px solid rgba(10,132,255,.35);font-size:14px}
.teller{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
.teller div{background:rgba(0,0,0,.25);border-radius:10px;padding:8px 10px}
.teller b{display:block;font-size:22px;font-family:"JetBrains Mono",monospace}
.teller small{color:var(--zacht);font-size:11px;text-transform:uppercase;letter-spacing:.1em}
/* ---- lijst ---- */
.rij{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:start;padding:9px 0;border-bottom:1px solid var(--rand);cursor:pointer}
.rij:last-child{border-bottom:0}
.rij .prio{font-size:11px;padding:2px 6px}
.rij .t{font-size:14px;font-weight:600;overflow-wrap:anywhere}
.rij .s{font-size:12px;color:var(--zacht)}
.rij .k{font-family:"JetBrains Mono",monospace;font-size:12px;color:var(--zacht);text-align:right}
.rij.eigen .t{color:var(--geel)}
/* ---- kaart-tabs ---- */
.tabs{display:flex;gap:4px;margin:-4px 0 10px;overflow-x:auto;scrollbar-width:none;flex:none}
.tabs::-webkit-scrollbar{display:none}
.tab{white-space:nowrap;padding:6px 12px;border-radius:999px;font-size:13px;color:var(--zacht);background:rgba(255,255,255,.04)}
.tab.aan{background:var(--accent);color:#000;font-weight:700}
:host(:not([storm])) .tab.storm-tab{display:none}
.venster{flex:1;min-height:240px;border-radius:12px;overflow:hidden;position:relative;background:#0b0f14}
.venster > *{position:absolute;inset:0;width:100%;height:100%;border:0}
.venster .verberg{display:none}
#map{background:#0b0f14}
.radar{object-fit:contain;background:#0b0f14}
.cams{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;padding:8px;overflow:auto;align-content:start}
.cam{position:relative;border-radius:10px;overflow:hidden;background:#000;aspect-ratio:16/9;cursor:pointer}
.cam img{width:100%;height:100%;object-fit:cover}
.cam span{position:absolute;left:8px;bottom:6px;font-size:12px;font-weight:600;text-shadow:0 1px 4px #000}
.legenda{position:absolute;left:10px;bottom:10px;z-index:500;display:flex;gap:10px;font-size:11px;color:var(--zacht);
  background:rgba(0,0,0,.6);padding:5px 10px;border-radius:8px;width:auto;height:auto;inset:auto auto 10px 10px}
.vlieg-lijst{position:absolute;right:10px;top:10px;z-index:500;width:auto;height:auto;inset:10px 10px auto auto;max-width:210px;
  background:rgba(0,0,0,.6);border-radius:10px;padding:8px 10px;font-size:11px;font-family:"JetBrains Mono",monospace;color:var(--zacht)}
.vlieg-lijst b{color:var(--tekst)}
.leaflet-container{font-family:Inter,sans-serif}
.vlieg-icoon{color:#64d2ff;font-size:18px;text-shadow:0 0 6px rgba(100,210,255,.8);line-height:1}
.vlieg-icoon.heli{color:#ff9f0a;text-shadow:0 0 6px rgba(255,159,10,.8)}
.thuis-icoon{width:14px;height:14px;border-radius:50%;background:var(--blauw);border:2px solid #fff;box-shadow:0 0 0 6px rgba(10,132,255,.25)}
.brand-icoon{width:18px;height:18px;border-radius:50%;background:#ff3b30;border:2px solid #fff;
  box-shadow:0 0 0 0 rgba(255,59,48,.7);animation:puls 1.6s infinite}
.brand-icoon.oud{animation:none;width:10px;height:10px;opacity:.65;border-width:1px}
@keyframes puls{0%{box-shadow:0 0 0 0 rgba(255,59,48,.7)}70%{box-shadow:0 0 0 18px rgba(255,59,48,0)}100%{box-shadow:0 0 0 0 rgba(255,59,48,0)}}
/* ---- weer ---- */
.weer-nu{display:flex;align-items:center;gap:14px}
.weer-nu .ic{font-size:48px;line-height:1}
.weer-nu .temp{font-size:46px;font-weight:800;font-family:"JetBrains Mono",monospace;line-height:1}
.weer-nu .omschr{font-size:14px;color:var(--zacht)}
.weer-details{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:12px 0}
.weer-details div{background:rgba(0,0,0,.25);border-radius:10px;padding:6px 8px;font-size:11px;color:var(--zacht)}
.weer-details b{display:block;color:var(--tekst);font-size:15px}
.uren{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(46px,1fr);gap:4px;overflow:auto;scrollbar-width:none;margin-bottom:10px}
.uur{text-align:center;font-size:11px;color:var(--zacht);padding:6px 0;border-radius:8px;background:rgba(255,255,255,.03)}
.uur b{display:block;color:var(--tekst);font-size:14px}
.uur .i{font-size:18px;display:block;margin:2px 0}
.uur .kans{color:#64d2ff}
.regen-titel{font-size:13px;margin:4px 0 6px}
.regen svg{width:100%;height:54px;display:block}
.regen .as{display:flex;justify-content:space-between;font-size:10px;color:var(--zwak);font-family:"JetBrains Mono",monospace}
.dagen{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px}
.dag{text-align:center;background:rgba(0,0,0,.25);border-radius:10px;padding:6px;font-size:12px;color:var(--zacht)}
.dag .i{font-size:20px;display:block}
.dag b{color:var(--tekst)}
/* ---- bediening ---- */
.schakels{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:8px}
.lamp{display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:10px 12px;border-radius:12px;text-align:left;
  background:rgba(255,255,255,.04);border:1px solid var(--rand);min-height:66px;transition:.2s}
.lamp .n{font-size:13px;font-weight:600;line-height:1.2;overflow-wrap:anywhere}
.lamp .s{font-size:11px;color:var(--zacht)}
.lamp .bol{width:18px;height:18px;border-radius:50%;background:#333;transition:.2s}
.lamp.aan{background:rgba(255,214,10,.10);border-color:rgba(255,214,10,.35)}
.lamp.aan .bol{box-shadow:0 0 14px currentColor}
.luiken{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.luik{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid var(--rand)}
.luik .n{flex:1;font-size:13px;font-weight:600}
.luik .s{font-size:11px;color:var(--zacht)}
.luik button{width:34px;height:30px;border-radius:8px;background:rgba(255,255,255,.07)}
.luik button:hover,.lamp:hover{filter:brightness(1.25)}
.toggles{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}
.toggle{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.04);font-size:12px;text-align:left}
.toggle .sw{margin-left:auto;width:30px;height:18px;border-radius:9px;background:#3a3f47;position:relative;flex:none}
.toggle .sw::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:.2s}
.toggle.aan .sw{background:var(--goed)}
.toggle.aan .sw::after{left:14px}
.klein-knop{font-size:12px;padding:4px 10px;border-radius:8px;background:rgba(255,255,255,.07);color:var(--zacht)}
/* ---- energie ---- */
.energie-nu{display:flex;gap:10px}
.energie-nu > div{flex:1;background:rgba(0,0,0,.25);border-radius:12px;padding:10px}
.energie-nu b{font-size:24px;font-family:"JetBrains Mono",monospace;display:block}
.energie-nu small{font-size:11px;color:var(--zacht);text-transform:uppercase;letter-spacing:.08em}
.terug{color:var(--goed)}
.zon{color:var(--geel)}
.energie-dag{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px;font-size:11px;color:var(--zacht)}
.energie-dag b{display:block;font-size:14px;color:var(--tekst)}
.panelen{display:flex;gap:3px;align-items:flex-end;height:40px;margin-top:10px}
.panelen div{flex:1;background:linear-gradient(0deg,#ffd60a,#ff9f0a);border-radius:3px 3px 0 0;min-height:2px}
/* ---- agenda / afval ---- */
.afspraak{display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--rand);font-size:13px}
.afspraak:last-child{border:0}
.afspraak .w{font-family:"JetBrains Mono",monospace;color:var(--zacht);min-width:78px;font-size:12px}
.afval{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:rgba(48,209,88,.08);border:1px solid rgba(48,209,88,.3);margin-bottom:8px}
.afval.snel{background:rgba(255,214,10,.12);border-color:var(--geel)}
.afval .i{font-size:22px}
/* ---- lucht + checklist ---- */
.duo{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.aqi{display:flex;align-items:center;gap:12px}
.aqi .ring{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:18px;font-family:"JetBrains Mono",monospace;border:4px solid}
.aqi small{color:var(--zacht);font-size:11px;display:block}
.stoffen{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:8px;font-size:11px;color:var(--zacht)}
.stoffen b{color:var(--tekst)}
.check{display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px;width:100%;text-align:left}
.check .vak{width:18px;height:18px;border-radius:5px;border:2px solid var(--zwak);display:grid;place-items:center;font-size:12px;flex:none}
.check.aan .vak{background:var(--goed);border-color:var(--goed);color:#000}
.check.aan{color:var(--zacht);text-decoration:line-through}
.voortgang{height:5px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden;margin-bottom:6px}
.voortgang div{height:100%;background:var(--goed);transition:.3s}
/* ---- alarm ---- */
.alarm{position:absolute;inset:0;z-index:2000;display:none;flex-direction:column;align-items:center;justify-content:center;
  padding:24px;text-align:center;background:#7a0000;animation:alarmbg 1s steps(2) infinite}
.alarm.open{display:flex}
@keyframes alarmbg{0%{background:#b00000}50%{background:#3a0000}}
.alarm .groot{font-size:clamp(34px,6vw,72px);font-weight:900;letter-spacing:.08em}
.alarm .titel{font-size:clamp(22px,3.4vw,42px);font-weight:800;margin:16px 0 6px;max-width:1100px;overflow-wrap:anywhere}
.alarm .adres{font-size:clamp(16px,2vw,24px);opacity:.9}
.alarm .info{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;margin:22px 0}
.alarm .blok{background:rgba(0,0,0,.35);border-radius:16px;padding:14px 22px;min-width:150px}
.alarm .blok b{display:block;font-size:34px;font-family:"JetBrains Mono",monospace}
.alarm .blok.best{outline:3px solid #fff}
.alarm .knoppen{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
.alarm .knoppen a,.alarm .knoppen button{padding:16px 26px;border-radius:14px;font-size:20px;font-weight:800;text-decoration:none;color:#b00000;background:#fff}
.alarm .knoppen .stil{background:rgba(0,0,0,.4);color:#fff}
/* ---- nacht ---- */
.nacht{position:absolute;inset:0;z-index:1500;background:rgba(0,0,0,.93);display:none;flex-direction:column;align-items:center;justify-content:center;color:#5c6470;cursor:pointer}
.nacht.open{display:flex}
.nacht .t{font-family:"JetBrains Mono",monospace;font-size:clamp(70px,14vw,180px);font-weight:700;color:#3d434c}
.nacht .s{font-size:16px;margin-top:6px}
/* ---- laag scherm (laptop 1366x768) ---- */
@media (max-height:820px) and (min-width:761px){
  .kop{padding:8px 16px}
  .klok .t{font-size:28px}
  .raster{gap:10px;padding:10px 14px 12px}
  .kolom{gap:10px}
  .kaart{padding:11px 13px}
  .kaart h2{margin-bottom:7px}
  .hero-titel{font-size:21px;margin:7px 0 2px}
  .weer-nu .ic{font-size:38px}
  .weer-nu .temp{font-size:38px}
  .weer-details{margin:8px 0}
  .uren{margin-bottom:6px}
}
/* ---- telefoon / smal scherm ---- */
@media (max-width:1100px){
  .raster{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  .raster .kolom.k3{grid-column:1 / -1}
  .chips .chip.extra{display:none}
}
@media (max-width:760px){
  :host{height:auto;min-height:100vh}
  .wrap{height:auto;min-height:100vh;overflow:visible}
  .raster{grid-template-columns:minmax(0,1fr);padding:12px}
  .storm{flex-wrap:wrap;font-size:13px;padding:8px 12px}
  .storm span[style]{margin-left:0!important}
  .kolom{overflow:visible}
  .kop{flex-wrap:wrap;padding:12px}
  .chips{order:4;justify-content:flex-start;flex-basis:100%}
  .paginas{order:3;flex-basis:100%;overflow-x:auto}
  .pag-knop{flex:1;padding:10px 8px;font-size:13px}
  .camgrid{grid-template-columns:minmax(0,1fr)}
  .klok .t{font-size:26px}
  .venster{min-height:340px}
  .duo{grid-template-columns:1fr}
  .weer-details{grid-template-columns:repeat(2,1fr)}
  .hero-titel{font-size:21px}
}
`;

// ---------- Het paneel ----------

class MeldkamerPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._tab = "kaart";
    this._weerTab = "radar";
    this._pagina = "meldkamer";
    this._handtekening = {};
    this._agenda = [];
    this._energie = null;
    this._wakkerTot = 0;
    this._alarmId = null;
    this._sirene = null;
  }

  set hass(h) {
    const eerste = !this._hass;
    this._hass = h;
    if (eerste) this._bouw();
    Object.values(this._liveKaarten || {}).forEach((k) => (k.hass = h));
    if (!this._planned) {
      this._planned = true;
      setTimeout(() => {
        this._planned = false;
        this._teken();
      }, 400);
    }
  }
  get hass() {
    return this._hass;
  }
  set narrow(v) {
    this._narrow = v;
  }
  set panel(v) {
    this._panel = v;
  }

  connectedCallback() {
    if (new URLSearchParams(location.search).has("kiosk")) {
      const verberg = () =>
        this.dispatchEvent(new CustomEvent("hass-dock-sidebar", { detail: { dock: "always_hidden" }, bubbles: true, composed: true }));
      verberg();
      setTimeout(verberg, 1500);
    }
    this._tik = setInterval(() => this._seconde(), 1000);
    this._traag = setInterval(() => this._laadExtra(), 5 * 60 * 1000);
    this._cam = setInterval(() => this._ververstCams(), 10000);
  }
  disconnectedCallback() {
    clearInterval(this._tik);
    clearInterval(this._traag);
    clearInterval(this._cam);
    this._stopSirene();
  }

  // ---- opbouw ----

  _bouw() {
    const params = new URLSearchParams(location.search);
    this._kiosk = params.has("kiosk");
    if (this._kiosk) {
      this.setAttribute("kiosk", "");
    }
    if (!document.querySelector(`link[href="${FONTS}"]`)) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = FONTS;
      document.head.appendChild(l);
    }
    this.shadowRoot.innerHTML = `
      <style>${CSS}</style>
      <link rel="stylesheet" href="${LEAFLET_CSS}">
      <div class="wrap">
        <header class="kop">
          <button class="menu" data-actie="menu" title="Menu">☰</button>
          <div class="logo"><div class="bol">🚒</div><div><h1>MELDKAMER</h1><small id="plaats"></small></div></div>
          <nav class="paginas" id="paginas">
            <button class="pag-knop aan" data-actie="pagina" data-pagina="meldkamer">🚒 Meldkamer</button>
            <button class="pag-knop" data-actie="pagina" data-pagina="huis">🏠 Huis</button>
            <button class="pag-knop" data-actie="pagina" data-pagina="weer">⛈️ Weer & storm</button>
          </nav>
          <div class="chips" id="chips"></div>
          <div class="klok"><div class="t" id="klok">--:--:--</div><div class="d" id="datum"></div></div>
        </header>
        <div class="storm" id="storm"></div>
        <main class="raster twee pagina p-meldkamer" id="p-meldkamer">
          <section class="kolom k1">
            <div class="kaart melding-hero" id="hero"></div>
            <div class="kaart groei"><h2>📟 Recente meldingen <span class="r" id="lijst-info"></span></h2><div class="scroll" id="lijst"></div></div>
          </section>
          <section class="kolom k2">
            <div class="kaart groei lang">
              <div class="tabs" id="tabs"></div>
              <div class="venster" id="venster">
                <div id="map"></div>
                <div class="legenda" id="legenda">🔵 Thuis &nbsp; 🔴 Melding &nbsp; <span style="color:#64d2ff">✈</span> Vliegtuig &nbsp; <span style="color:#ff9f0a">✈</span> Heli</div>
                <div class="vlieg-lijst" id="vlieglijst"></div>
                <iframe class="verberg" id="iframe" loading="lazy" allow="fullscreen"></iframe>
              </div>
            </div>
          </section>
        </main>
        <main class="raster pagina p-huis" id="p-huis">
          <section class="kolom k1">
            <div class="kaart groei" id="bediening"></div>
          </section>
          <section class="kolom k2">
            <div class="kaart groei lang"><h2>📷 Camera's <span class="r" id="cam-info"></span></h2><div class="camgrid" id="camgrid"></div></div>
          </section>
          <section class="kolom k3">
            <div class="kaart" id="agenda"></div>
            <div class="kaart" id="energie"></div>
            <div class="kaart" id="check"></div>
          </section>
        </main>
        <main class="raster pagina p-weer" id="p-weer">
          <section class="kolom k1">
            <div class="kaart" id="weer"></div>
          </section>
          <section class="kolom k2">
            <div class="kaart groei lang">
              <div class="tabs" id="wtabs"></div>
              <div class="venster" id="wvenster">
                <img class="radar" id="radar" alt="Buienradar">
                <iframe class="verberg" id="wiframe" loading="lazy" allow="fullscreen"></iframe>
              </div>
            </div>
          </section>
          <section class="kolom k3">
            <div class="kaart" id="knmi"></div>
            <div class="kaart" id="lucht"></div>
          </section>
        </main>
        <div class="nacht" id="nacht"><div class="t" id="nachtklok"></div><div class="s" id="nachtinfo"></div><div class="s">Tik om het scherm te wekken</div></div>
        <div class="alarm" id="alarm"></div>
      </div>`;
    const root = this.shadowRoot;
    root.addEventListener("click", (e) => this._klik(e));
    root.addEventListener("contextmenu", (e) => {
      const el = e.target.closest("[data-meer]");
      if (el) {
        e.preventDefault();
        this._meerInfo(el.dataset.meer);
      }
    });
    // Geluid mag pas na een eerste tik (behalve in de kiosk-browser)
    const ontgrendel = () => this._audio();
    window.addEventListener("pointerdown", ontgrendel, { once: true });
    this._audio();
    this._laadLeaflet();
    this._laadExtra();
    this._toonPagina("meldkamer");
    this._toonTab();
    this._toonWeerTab();
    // Bijhouden wanneer het scherm voor het laatst is aangeraakt
    this._actief = Date.now();
    ["pointerdown", "keydown", "wheel"].forEach((ev) => root.addEventListener(ev, () => (this._actief = Date.now()), { passive: true }));
  }

  _audio() {
    try {
      if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this._ctx.state === "suspended") this._ctx.resume();
    } catch (e) {
      /* geen geluid mogelijk */
    }
  }

  _s(id) {
    return this._hass?.states?.[id];
  }
  _aan(id) {
    return this._s(id)?.state === "on";
  }

  _ent(domein) {
    return Object.values(this._hass.states)
      .filter((s) => s.entity_id.startsWith(domein + ".") && !s.attributes.hidden && s.state !== "unavailable")
      .sort((a, b) => this._naam(a).localeCompare(this._naam(b)));
  }
  _naam(s) {
    return s.attributes.friendly_name || s.entity_id;
  }

  // Alleen een onderdeel opnieuw tekenen als de gegevens veranderd zijn.
  _veranderd(sleutel, waarde) {
    const h = typeof waarde === "string" ? waarde : JSON.stringify(waarde);
    if (this._handtekening[sleutel] === h) return false;
    this._handtekening[sleutel] = h;
    return true;
  }
  _sig(...ids) {
    return ids.map((id) => this._s(id)?.last_updated || "-").join("|");
  }

  // ---- tekenen ----

  _teken() {
    if (!this._hass) return;
    const storm = this._aan("input_boolean.meldkamer_stormmodus");
    if (storm !== this.hasAttribute("storm")) {
      this.toggleAttribute("storm", storm);
      this._weerTab = storm ? "bliksem" : "radar";
      this._toonWeerTab();
    }
    const inst = this._s("sensor.meldkamer_instellingen")?.attributes || {};
    this.shadowRoot.getElementById("plaats").textContent = inst.plaats ? `Brandweer · ${inst.plaats}` : "Brandweer";
    this._tekenChips();
    this._tekenStorm();
    this._tekenHero();
    this._tekenLijst();
    this._tekenTabs();
    this._tekenKaart();
    this._tekenWeer();
    this._tekenBediening();
    this._tekenEnergie();
    this._tekenAgenda();
    this._tekenLucht();
    this._tekenKnmi();
    this._tekenCheck();
    this._tekenCamInfo();
    this._controleerAlarm();
  }

  _seconde() {
    const nu = new Date();
    const r = this.shadowRoot;
    if (!r.getElementById("klok")) return;
    const t = `${pad(nu.getHours())}:${pad(nu.getMinutes())}:${pad(nu.getSeconds())}`;
    r.getElementById("klok").textContent = t;
    r.getElementById("datum").textContent = nu.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
    r.getElementById("nachtklok").textContent = t.slice(0, 5);
    const ge = r.getElementById("geleden");
    if (ge) ge.textContent = tijdGeleden(ge.dataset.t);
    r.querySelectorAll("[data-sinds]").forEach((el) => (el.textContent = tijdGeleden(el.dataset.sinds)));
    this._tekenNacht(nu);
    if (this._pagina !== "meldkamer" && Date.now() - (this._actief || 0) > 5 * 60 * 1000) this._toonPagina("meldkamer");
  }

  _tekenChips() {
    const ids = ["sensor.meldkamer_knmi", "sensor.meldkamer_weer", "sensor.meldkamer_vliegtuigen", "sensor.meldkamer_laatste_melding",
      "input_boolean.meldkamer_stormmodus", "sensor.meldkamer_luchtkwaliteit"];
    if (!this._veranderd("chips", this._sig(...ids))) return;
    const knmi = this._s("sensor.meldkamer_knmi");
    const weer = this._s("sensor.meldkamer_weer");
    const vl = this._s("sensor.meldkamer_vliegtuigen");
    const mel = this._s("sensor.meldkamer_laatste_melding");
    const fout = mel?.attributes?.fout;
    const storm = this._aan("input_boolean.meldkamer_stormmodus");
    const code = knmi?.state;
    const nu = weer?.attributes?.nu || {};
    const chips = [];
    chips.push(`<div class="chip ${fout ? "fout" : ""}" title="${esc(fout || mel?.attributes?.bron || "")}"><span class="stip"></span>${fout ? "P2000 storing" : "P2000 live"}</div>`);
    if (weer && weer.state !== "unknown")
      chips.push(`<div class="chip">${weerIcoon(nu.weather_code, nu.is_day)} <b>${Math.round(weer.state)}°</b> ${windRichting(nu.wind_direction_10m)} ${beaufort(nu.wind_speed_10m)} Bft</div>`);
    if (code && code !== "geen" && code !== "unknown")
      chips.push(`<div class="chip" style="border-color:${KNMI_KLEUR[code]};color:${KNMI_KLEUR[code]}">⚠️ <b style="color:inherit">Code ${esc(code)}</b></div>`);
    else if (knmi) chips.push(`<div class="chip">✅ Geen weeralarm</div>`);
    if (vl && vl.state !== "unknown") chips.push(`<div class="chip extra">✈️ <b>${esc(vl.state)}</b></div>`);
    this.shadowRoot.getElementById("chips").innerHTML = chips.join("");
  }

  _tekenStorm() {
    if (!this._veranderd("storm", this._sig("sensor.meldkamer_knmi", "input_boolean.meldkamer_stormmodus", "sensor.meldkamer_weer"))) return;
    const knmi = this._s("sensor.meldkamer_knmi")?.attributes || {};
    const w = (knmi.waarschuwingen || [])[0];
    const nu = this._s("sensor.meldkamer_weer")?.attributes?.nu || {};
    const tekst = w
      ? `Code ${esc(w.kleur)}: ${esc(w.soort)}${w.tot ? " · tot " + klokTijd(w.tot) : ""}`
      : "Geen officiële waarschuwing";
    this.shadowRoot.getElementById("storm").innerHTML = `
      <span class="bliksem">⚡</span> STORMMODUS ACTIEF <span style="opacity:.6">|</span> ${tekst}
      <span style="margin-left:auto">💨 Windstoten ${Math.round(nu.wind_gusts_10m ?? 0)} km/u</span>
      <button class="klein-knop" data-actie="toggle" data-id="input_boolean.meldkamer_stormmodus">Uitzetten</button>`;
  }

  _meldingen() {
    return this._s("sensor.meldkamer_laatste_melding")?.attributes?.meldingen || [];
  }

  _routeHtml(r, groot = false) {
    if (!r) return "";
    const best = r.sneller;
    const blok = (soort, icoon, label, data, url) =>
      data
        ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="${best === soort ? "best" : ""}">
             <span>${icoon}</span><div><b>${data.minuten} min</b><small>${label} · ${data.km} km${best === soort ? " · snelst" : ""}</small></div></a>`
        : "";
    return `<div class="route">${blok("auto", "🚗", "Auto", r.auto, r.maps_auto)}${blok("fiets", "🚲", "Fiets", r.fiets, r.maps_fiets)}</div>
      ${r.advies ? `<div class="advies">🧭 <b>${esc(r.advies)}</b>${(r.routekeuze || []).length > 1 ? ` <span style="color:var(--zacht)">(${r.routekeuze.map((o) => `${esc(o.naam)}: ${o.minuten} min`).join(" · ")})</span>` : ""}</div>` : ""}`;
  }

  _tekenHero() {
    const ids = ["sensor.meldkamer_laatste_melding", "sensor.meldkamer_meldingen_vandaag", "sensor.meldkamer_meldingen_week"];
    if (!this._veranderd("hero", this._sig(...ids))) return;
    const m = this._meldingen()[0];
    const vandaag = this._s("sensor.meldkamer_meldingen_vandaag")?.state ?? "–";
    const week = this._s("sensor.meldkamer_meldingen_week")?.state ?? "–";
    const el = this.shadowRoot.getElementById("hero");
    if (!m) {
      el.innerHTML = `<h2>🚨 Laatste brandmelding <span class="r"><button class="klein-knop" data-actie="test">🧪 Test alarm</button></span></h2><div class="leeg">Nog geen meldingen ontvangen. Zodra er een melding binnenkomt zie je hem hier.</div>
        <div class="teller"><div><b>${esc(vandaag)}</b><small>Vandaag</small></div><div><b>${esc(week)}</b><small>Deze week</small></div><div><b>–</b><small>Laatste</small></div></div>`;
      return;
    }
    el.innerHTML = `
      <h2>🚨 Laatste brandmelding <span class="r">${m.test ? '<span style="color:var(--geel)">TEST · </span>' : ""}<button class="klein-knop" data-actie="test">🧪 Test alarm</button></span></h2>
      <div class="hero-top">
        <span class="prio ${m.prio ? "p" + m.prio : ""}">${m.prio ? "P" + m.prio : "MELDING"}</span>
        ${m.eigen ? '<span class="prio" style="background:var(--geel);color:#000">EIGEN VOERTUIG</span>' : ""}
        <span class="geleden" id="geleden" data-t="${esc(m.tijd)}">${tijdGeleden(m.tijd)}</span>
      </div>
      <div class="hero-titel">${esc(m.kort || m.titel)}</div>
      <div class="hero-adres">${m.adres ? "📍 " + esc(m.adres) : ""} ${m.route ? `· ${m.route.afstand_km} km van huis` : ""} · ${klokTijd(m.tijd)}</div>
      ${(m.eenheden || []).length ? `<div class="eenheden">${m.eenheden.slice(0, 8).map((e) => `<span class="eenheid">${esc(e)}</span>`).join("")}</div>` : ""}
      ${this._routeHtml(m.route)}
      <div class="teller">
        <div><b>${esc(vandaag)}</b><small>Vandaag</small></div>
        <div><b>${esc(week)}</b><small>Deze week</small></div>
        <div><b style="font-size:15px;line-height:1.9" data-sinds="${esc(m.tijd)}">${tijdGeleden(m.tijd)}</b><small>Laatste</small></div>
      </div>`;
  }

  _tekenLijst() {
    if (!this._veranderd("lijst", this._sig("sensor.meldkamer_laatste_melding"))) return;
    const lijst = this._meldingen();
    this.shadowRoot.getElementById("lijst-info").textContent = lijst.length ? `${lijst.length} meldingen` : "";
    this.shadowRoot.getElementById("lijst").innerHTML = lijst.length
      ? lijst
          .map(
            (m, i) => `
        <div class="rij ${m.eigen ? "eigen" : ""}" data-actie="focus" data-i="${i}">
          <span class="prio ${m.prio ? "p" + m.prio : ""}">${m.prio ? "P" + m.prio : "–"}</span>
          <div><div class="t">${esc(m.kort || m.titel)}</div><div class="s">${esc(m.adres || (m.eenheden || [])[0] || "")}</div></div>
          <div class="k">${klokTijd(m.tijd)}<br><span data-sinds="${esc(m.tijd)}">${tijdGeleden(m.tijd)}</span></div>
        </div>`
          )
          .join("")
      : `<div class="leeg">Nog geen meldingen.</div>`;
  }

  // ---- kaart en tabbladen ----

  _toonPagina(p) {
    this._pagina = p;
    const r = this.shadowRoot;
    ["meldkamer", "huis", "weer"].forEach((n) => r.getElementById("p-" + n)?.classList.toggle("aan", n === p));
    r.querySelectorAll(".pag-knop").forEach((b) => b.classList.toggle("aan", b.dataset.pagina === p));
    if (p === "meldkamer" && this._map) setTimeout(() => this._map.invalidateSize(), 50);
    if (p === "huis" && this._hass) this._tekenCams();
    if (p === "weer") {
      this._ververstRadar();
      this._toonWeerTab();
    }
  }

  _tekenTabs() {
    const inst = this._s("sensor.meldkamer_instellingen")?.attributes || {};
    const sig = `${this._tab}|${inst.webcam || ""}`;
    if (!this._veranderd("tabs", sig)) return;
    const tabs = [
      ["kaart", "🗺️ Kaart"],
      ["verkeer", "🚗 Verkeer"],
    ];
    if (inst.webcam) tabs.push(["webcam", "🎥 Webcam Nunspeet"]);
    this.shadowRoot.getElementById("tabs").innerHTML = tabs
      .map(([id, label]) => `<button class="tab ${this._tab === id ? "aan" : ""}" data-actie="tab" data-tab="${id}">${label}</button>`)
      .join("");
  }

  _toonTab() {
    const r = this.shadowRoot;
    const inst = this._s("sensor.meldkamer_instellingen")?.attributes || {};
    const lat = inst.lat ?? this._hass?.config?.latitude ?? 52.37;
    const lon = inst.lon ?? this._hass?.config?.longitude ?? 5.78;
    const kaart = this._tab === "kaart";
    ["map", "legenda", "vlieglijst"].forEach((id) => r.getElementById(id)?.classList.toggle("verberg", !kaart));
    const iframe = r.getElementById("iframe");
    let src = "";
    if (this._tab === "verkeer") src = `https://embed.waze.com/iframe?zoom=12&lat=${lat}&lon=${lon}&ct=livemap`;
    if (this._tab === "webcam") src = inst.webcam || "";
    iframe.classList.toggle("verberg", !src);
    if (src && iframe.getAttribute("src") !== src) iframe.setAttribute("src", src);
    if (!src && iframe.getAttribute("src")) iframe.removeAttribute("src");
    if (kaart && this._map) setTimeout(() => this._map.invalidateSize(), 50);
    this._handtekening.tabs = null;
    if (this._hass) this._tekenTabs();
  }

  _toonWeerTab() {
    const r = this.shadowRoot;
    const storm = this.hasAttribute("storm");
    if (!storm && this._weerTab === "bliksem") this._weerTab = "radar";
    const tabs = [["radar", "🌧️ Buienradar"]];
    if (storm) tabs.push(["bliksem", "⚡ Bliksem live"]);
    r.getElementById("wtabs").innerHTML = tabs
      .map(([id, label]) => `<button class="tab ${this._weerTab === id ? "aan" : ""}" data-actie="wtab" data-tab="${id}">${label}</button>`)
      .join("") + (storm ? "" : `<span class="tab" style="background:none;color:var(--zwak)">⚡ Bliksem verschijnt in stormmodus</span>`);
    const inst = this._s("sensor.meldkamer_instellingen")?.attributes || {};
    const lat = inst.lat ?? this._hass?.config?.latitude ?? 52.37;
    const lon = inst.lon ?? this._hass?.config?.longitude ?? 5.78;
    r.getElementById("radar").classList.toggle("verberg", this._weerTab !== "radar");
    const iframe = r.getElementById("wiframe");
    const src = this._weerTab === "bliksem" ? `https://map.blitzortung.org/#8/${lat}/${lon}` : "";
    iframe.classList.toggle("verberg", !src);
    if (src && iframe.getAttribute("src") !== src) iframe.setAttribute("src", src);
    if (!src && iframe.getAttribute("src")) iframe.removeAttribute("src");
    if (this._weerTab === "radar") this._ververstRadar();
  }

  _ververstRadar() {
    const img = this.shadowRoot.getElementById("radar");
    const src = `https://image.buienradar.nl/2.0/image/animation/RadarMapRainNL?height=512&width=500&renderBackground=True&renderBranding=False&renderText=True&t=${Math.floor(Date.now() / 300000)}`;
    if (img.getAttribute("src") !== src) img.src = src;
  }

  _tekenCamInfo() {
    const n = this._camLijst().length;
    const el = this.shadowRoot.getElementById("cam-info");
    if (el) el.textContent = n ? `${n} camera's · tik voor live beeld` : "";
    if (this._veranderd("camlijst", this._camLijst().map((c) => c.entity_id).join())) this._tekenCams();
  }

  // Camera's die altijd live in beeld staan (per apparaat onthouden)
  _liveLijst() {
    try {
      return JSON.parse(localStorage.getItem("meldkamer_live_cams") || "[]");
    } catch (e) {
      return [];
    }
  }
  _zetLive(id) {
    const lijst = this._liveLijst();
    const nieuw = lijst.includes(id) ? lijst.filter((x) => x !== id) : [...lijst, id];
    try {
      localStorage.setItem("meldkamer_live_cams", JSON.stringify(nieuw));
    } catch (e) {
      /* geen opslag */
    }
    this._camStructuur = null;
    this._tekenCams();
  }

  _camLijst() {
    const cams = this._ent("camera");
    const ids = new Set(cams.map((c) => c.entity_id));
    // Ring maakt soms een "live view" en een "last recording" per camera: toon alleen de live view.
    return cams.filter((c) => !(c.entity_id.endsWith("_last_recording") && ids.has(c.entity_id.replace(/_last_recording$/, "_live_view"))));
  }

  // De kaarten van Home Assistant zelf laden (die kunnen live video afspelen).
  async _kaartHulp() {
    if (!window.loadCardHelpers) {
      try {
        const r = document.createElement("partial-panel-resolver");
        const panels = [{ component_name: "lovelace", url_path: "meldkamer-tmp" }];
        let routes;
        if (r.getRoutes) routes = r.getRoutes(panels);
        else {
          r.hass = { panels };
          r._updateRoutes();
          routes = r.routerOptions;
        }
        await routes?.routes?.["meldkamer-tmp"]?.load?.();
      } catch (e) {
        /* oudere of nieuwere versie van Home Assistant */
      }
      for (let i = 0; i < 50 && !window.loadCardHelpers; i++) await new Promise((r) => setTimeout(r, 100));
    }
    return window.loadCardHelpers ? window.loadCardHelpers() : null;
  }

  async _liveKaart(id) {
    this._liveKaarten = this._liveKaarten || {};
    if (this._liveKaarten[id]) return this._liveKaarten[id];
    const helpers = await this._kaartHulp();
    if (!helpers) return null;
    const kaart = helpers.createCardElement({
      type: "picture-entity",
      entity: id,
      camera_view: "live",
      show_name: false,
      show_state: false,
      tap_action: { action: "more-info" },
    });
    kaart.hass = this._hass;
    this._liveKaarten[id] = kaart;
    return kaart;
  }

  _tekenCams() {
    const grid = this.shadowRoot.getElementById("camgrid");
    const cams = this._camLijst();
    const live = this._liveLijst();
    const structuur = cams.map((c) => c.entity_id + (live.includes(c.entity_id) ? ":live" : "")).join();
    if (!cams.length) {
      grid.innerHTML = `<div class="leeg" style="padding:12px">Nog geen camera's gekoppeld. Koppel je Ring-account via Instellingen → Apparaten & diensten → Ring.</div>`;
      this._camStructuur = structuur;
      return;
    }
    if (this._camStructuur !== structuur) {
      // Vakjes opnieuw opbouwen (alleen als er iets veranderd is)
      this._camStructuur = structuur;
      grid.innerHTML = cams
        .map((c) => {
          const isLive = live.includes(c.entity_id);
          return `<div class="cam" ${isLive ? "" : `data-actie="meer"`} data-id="${esc(c.entity_id)}">
            ${isLive ? `<div class="live-houder"></div><b class="live">● LIVE</b>` : `<img alt="">`}
            <button class="live-knop ${isLive ? "aan" : ""}" data-actie="live" data-id="${esc(c.entity_id)}">📡 ${isLive ? "Live aan" : "Altijd live"}</button>
            <span>📷 ${esc(this._naam(c).replace(/ live view$/i, ""))}</span></div>`;
        })
        .join("");
      grid.querySelectorAll(".cam").forEach(async (vak) => {
        const houder = vak.querySelector(".live-houder");
        if (!houder) return;
        const kaart = await this._liveKaart(vak.dataset.id);
        if (kaart) houder.appendChild(kaart);
      });
    }
    // Stilstaande plaatjes verversen
    grid.querySelectorAll(".cam img").forEach((img) => {
      const c = this._s(img.closest(".cam").dataset.id);
      if (c?.attributes?.entity_picture) img.src = `${c.attributes.entity_picture}&t=${Date.now()}`;
    });
  }
  _ververstCams() {
    if (this._pagina === "huis") this._tekenCams();
  }

  _tekenKnmi() {
    if (!this._veranderd("knmi", this._sig("sensor.meldkamer_knmi", "input_boolean.meldkamer_stormmodus"))) return;
    const k = this._s("sensor.meldkamer_knmi")?.attributes || {};
    const lijst = k.waarschuwingen || [];
    const storm = this._aan("input_boolean.meldkamer_stormmodus");
    const tijd = (iso) => {
      const d = new Date(iso);
      return isNaN(d) ? "" : d.toLocaleString("nl-NL", { weekday: "short", hour: "2-digit", minute: "2-digit" });
    };
    this.shadowRoot.getElementById("knmi").innerHTML = `
      <h2>⚠️ KNMI-waarschuwingen <span class="r"><button class="klein-knop" data-actie="toggle" data-id="input_boolean.meldkamer_stormmodus">⚡ Stormmodus ${storm ? "uitzetten" : "aanzetten"}</button></span></h2>
      ${lijst.length
        ? lijst
            .map((w) => `<div class="knmi" style="border-color:${KNMI_KLEUR[w.kleur] || "#555"}">
                <b style="color:${KNMI_KLEUR[w.kleur] || "inherit"}">Code ${esc(w.kleur)}: ${esc(w.soort)}</b>
                <small>${esc(w.gebied)}${w.vanaf ? " · vanaf " + tijd(w.vanaf) : ""}${w.tot ? " · tot " + tijd(w.tot) : ""}</small></div>`)
            .join("")
        : `<div class="knmi-ok"><span style="font-size:26px">✅</span><div><b>Geen waarschuwingen</b><div style="font-size:12px;color:var(--zacht)">Rustig weer in jouw provincie</div></div></div>`}`;
  }

  _laadLeaflet() {
    const klaar = () => this._maakKaart();
    if (window.L) return klaar();
    let s = document.querySelector(`script[src="${LEAFLET_JS}"]`);
    if (!s) {
      s = document.createElement("script");
      s.src = LEAFLET_JS;
      document.head.appendChild(s);
    }
    s.addEventListener("load", klaar);
    s.addEventListener("error", () => {
      this.shadowRoot.getElementById("map").innerHTML = `<div class="leeg" style="padding:16px">Kaart kon niet laden (geen internet?).</div>`;
    });
  }

  _maakKaart() {
    if (this._map || !window.L) return;
    const L = window.L;
    const inst = this._s("sensor.meldkamer_instellingen")?.attributes || {};
    const lat = inst.lat ?? this._hass.config.latitude;
    const lon = inst.lon ?? this._hass.config.longitude;
    const el = this.shadowRoot.getElementById("map");
    this._map = L.map(el, { zoomControl: false, attributionControl: true }).setView([lat, lon], 11);
    // Donkere kaart van Esri (gratis, geen sleutel nodig) met plaatsnamen erover
    const esri = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/";
    L.tileLayer(esri + "World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      maxNativeZoom: 16,
      attribution: "© Esri, OpenStreetMap",
    }).addTo(this._map);
    L.tileLayer(esri + "World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      maxNativeZoom: 16,
    }).addTo(this._map);
    L.control.zoom({ position: "bottomright" }).addTo(this._map);
    this._thuis = L.marker([lat, lon], { icon: L.divIcon({ className: "", html: '<div class="thuis-icoon"></div>', iconSize: [14, 14] }) }).addTo(this._map);
    L.circle([lat, lon], { radius: (inst.vliegtuig_straal_km || 30) * 1000, color: "#0a84ff", weight: 1, opacity: 0.25, fill: false, dashArray: "4 6" }).addTo(this._map);
    this._lagen = { meldingen: L.layerGroup().addTo(this._map), vlieg: L.layerGroup().addTo(this._map) };
    new ResizeObserver(() => this._map.invalidateSize()).observe(el);
    this._handtekening.kaart = null;
    this._tekenKaart();
  }

  _tekenKaart() {
    if (!this._map) return;
    const sig = this._sig("sensor.meldkamer_laatste_melding", "sensor.meldkamer_vliegtuigen");
    if (!this._veranderd("kaart", sig)) return;
    const L = window.L;
    const ml = this._lagen.meldingen;
    ml.clearLayers();
    const lijst = this._meldingen().filter((m) => m.lat);
    lijst.slice(0, 25).forEach((m, i) => {
      const nieuw = i === 0 && Date.now() - new Date(m.tijd) < 2 * 3600 * 1000;
      L.marker([m.lat, m.lon], {
        icon: L.divIcon({ className: "", html: `<div class="brand-icoon ${nieuw ? "" : "oud"}"></div>`, iconSize: nieuw ? [18, 18] : [10, 10] }),
        zIndexOffset: nieuw ? 1000 : 0,
      })
        .bindTooltip(`<b>${esc(m.kort || m.titel)}</b><br>${klokTijd(m.tijd)} · ${tijdGeleden(m.tijd)}`)
        .addTo(ml);
    });
    const vl = this._s("sensor.meldkamer_vliegtuigen")?.attributes?.lijst || [];
    const vg = this._lagen.vlieg;
    vg.clearLayers();
    vl.forEach((a) => {
      L.marker([a.lat, a.lon], {
        icon: L.divIcon({
          className: "",
          html: `<div class="vlieg-icoon ${a.helikopter ? "heli" : ""}" style="transform:rotate(${(a.koers || 0) - 45}deg)">✈</div>`,
          iconSize: [18, 18],
        }),
      })
        .bindTooltip(`<b>${esc(a.naam || "Onbekend")}</b> ${esc(a.type)}<br>${a.hoogte_m != null ? a.hoogte_m + " m · " : ""}${a.kmh != null ? a.kmh + " km/u · " : ""}${a.afstand_km} km`)
        .addTo(vg);
    });
    const top = vl.slice(0, 5);
    this.shadowRoot.getElementById("vlieglijst").innerHTML = top.length
      ? `✈ Dichtstbij<br>${top.map((a) => `<b>${esc(a.naam || "?")}</b> ${a.hoogte_m != null ? a.hoogte_m + "m" : ""} · ${a.afstand_km}km`).join("<br>")}`
      : "✈ Geen vliegtuigen";
  }

  _focusMelding(i) {
    const m = this._meldingen()[i];
    if (!m) return;
    if (m.lat && this._map) {
      this._toonPagina("meldkamer");
      this._tab = "kaart";
      this._toonTab();
      this._map.flyTo([m.lat, m.lon], 15, { duration: 1 });
    }
  }

  // ---- weer ----

  _tekenWeer() {
    if (!this._veranderd("weer", this._sig("sensor.meldkamer_weer", "sensor.meldkamer_buienradar"))) return;
    const w = this._s("sensor.meldkamer_weer")?.attributes;
    const el = this.shadowRoot.getElementById("weer");
    if (!w?.nu) {
      el.innerHTML = `<h2>🌤️ Weer</h2><div class="leeg">Weergegevens worden geladen…</div>`;
      return;
    }
    const nu = w.nu;
    const dag0 = (w.dagen || [])[0] || {};
    const uurNu = new Date().getHours();
    const uren = (w.uren || []).filter((u) => new Date(u.tijd).getTime() >= Date.now() - 3600 * 1000).slice(0, 12);
    const r = this._s("sensor.meldkamer_buienradar")?.attributes;
    let regen = "";
    if (r?.reeks?.length) {
      const max = Math.max(1, ...r.reeks.map((x) => x.mm));
      const bw = 100 / r.reeks.length;
      const balken = r.reeks
        .map((x, i) => {
          const h = Math.max(x.mm > 0 ? 3 : 0, (Math.sqrt(x.mm) / Math.sqrt(max)) * 50);
          return `<rect x="${i * bw + 0.3}" y="${54 - h}" width="${bw - 0.6}" height="${h}" rx="0.6" fill="${x.mm > 2 ? "#0a84ff" : "#64d2ff"}"/>`;
        })
        .join("");
      regen = `<div class="regen"><div class="regen-titel">☔ <b>${esc(r.samenvatting)}</b></div>
        <svg viewBox="0 0 100 54" preserveAspectRatio="none"><line x1="0" y1="53.5" x2="100" y2="53.5" stroke="#333" stroke-width=".5"/>${balken}</svg>
        <div class="as"><span>${esc(r.reeks[0].tijd)}</span><span>${esc(r.reeks[Math.floor(r.reeks.length / 2)].tijd)}</span><span>${esc(r.reeks[r.reeks.length - 1].tijd)}</span></div></div>`;
    }
    el.innerHTML = `
      <h2>🌤️ Weer <span class="r">🌅 ${klokTijd(dag0.zonop)} · 🌇 ${klokTijd(dag0.zononder)}</span></h2>
      <div class="weer-nu">
        <div class="ic">${weerIcoon(nu.weather_code, nu.is_day)}</div>
        <div><div class="temp">${Math.round(nu.temperature_2m)}°</div><div class="omschr">${weerTekst(nu.weather_code)} · voelt als ${Math.round(nu.apparent_temperature)}°</div></div>
        <div style="margin-left:auto;text-align:right;font-size:13px;color:var(--zacht)">↑ ${Math.round(dag0.max ?? 0)}° &nbsp;↓ ${Math.round(dag0.min ?? 0)}°<br>${dag0.regenkans ?? 0}% kans op regen</div>
      </div>
      <div class="weer-details">
        <div>Wind<b>${windRichting(nu.wind_direction_10m)} ${beaufort(nu.wind_speed_10m)} Bft</b></div>
        <div>Windstoten<b>${Math.round(nu.wind_gusts_10m)} km/u</b></div>
        <div>Vochtigheid<b>${Math.round(nu.relative_humidity_2m)}%</b></div>
        <div>Luchtdruk<b>${Math.round(nu.pressure_msl)} hPa</b></div>
      </div>
      <div class="uren">${uren
        .map((u) => {
          const d = new Date(u.tijd);
          const dag = d.getHours() >= 7 && d.getHours() < 18 ? 1 : 0;
          return `<div class="uur">${d.getHours() === uurNu ? "Nu" : pad(d.getHours())}<span class="i">${weerIcoon(u.code, dag)}</span><b>${Math.round(u.temp)}°</b><span class="kans">${u.regenkans ?? 0}%</span></div>`;
        })
        .join("")}</div>
      ${regen}
      <div class="dagen">${(w.dagen || [])
        .slice(1, 5)
        .map((d) => `<div class="dag">${new Date(d.datum).toLocaleDateString("nl-NL", { weekday: "short" })}<span class="i">${weerIcoon(d.code)}</span><b>${Math.round(d.max)}°</b> / ${Math.round(d.min)}°</div>`)
        .join("")}</div>`;
  }

  // ---- lampen, rolluiken, schakelaars ----

  _tekenBediening() {
    const lampen = this._ent("light");
    const luiken = this._ent("cover");
    const toggles = [
      ["input_boolean.meldkamer_brandalarm_pauze", "🚨 Brandalarm", true],
      ["input_boolean.meldkamer_rolluiken_pauze", "🪟 Rolluiken auto", true],
      ["input_boolean.meldkamer_nachtmodus_uit", "🌙 Nachtmodus", true],
      ["input_boolean.meldkamer_stormmodus", "⚡ Stormmodus", false],
    ];
    const sig = [...lampen, ...luiken].map((s) => s.entity_id + s.last_updated).join() + this._sig(...toggles.map((t) => t[0]));
    if (!this._veranderd("bediening", sig)) return;
    const aantalAan = lampen.filter((l) => l.state === "on").length;
    const lampHtml = lampen
      .map((l) => {
        const aan = l.state === "on";
        const rgb = l.attributes.rgb_color;
        const kleur = aan ? (rgb ? `rgb(${rgb.join(",")})` : "#ffd60a") : "#333";
        const pct = aan && l.attributes.brightness ? Math.round((l.attributes.brightness / 255) * 100) + "%" : aan ? "Aan" : "Uit";
        return `<button class="lamp ${aan ? "aan" : ""}" data-actie="toggle" data-id="${esc(l.entity_id)}" data-meer="${esc(l.entity_id)}" title="Rechtsklik of lang drukken voor meer">
          <span class="bol" style="background:${kleur};color:${kleur}"></span><span class="n">${esc(this._naam(l))}</span><span class="s">${pct}</span></button>`;
      })
      .join("");
    const luikHtml = luiken
      .map((c) => {
        const pos = c.attributes.current_position;
        const st = { open: "Open", closed: "Dicht", opening: "Gaat open…", closing: "Gaat dicht…" }[c.state] || c.state;
        return `<div class="luik"><div class="n">${esc(this._naam(c))}<div class="s">${st}${pos != null ? " · " + pos + "%" : ""}</div></div>
          <button data-actie="luik" data-dienst="open_cover" data-id="${esc(c.entity_id)}" title="Open">▲</button>
          <button data-actie="luik" data-dienst="stop_cover" data-id="${esc(c.entity_id)}" title="Stop">■</button>
          <button data-actie="luik" data-dienst="close_cover" data-id="${esc(c.entity_id)}" title="Dicht">▼</button></div>`;
      })
      .join("");
    const toggleHtml = toggles
      .map(([id, label, omgekeerd]) => {
        if (!this._s(id)) return "";
        const aan = omgekeerd ? !this._aan(id) : this._aan(id);
        return `<button class="toggle ${aan ? "aan" : ""}" data-actie="toggle" data-id="${id}">${label}<span class="sw"></span></button>`;
      })
      .join("");
    this.shadowRoot.getElementById("bediening").innerHTML = `
      <h2>💡 Lampen & rolluiken <span class="r">${lampen.length ? `<button class="klein-knop" data-actie="alles-uit">Alles uit (${aantalAan})</button>` : ""}</span></h2>
      <div class="scroll">
      ${lampen.length ? `<div class="schakels">${lampHtml}</div>` : `<div class="leeg">Nog geen lampen. Koppel je Hue Bridge via Instellingen → Apparaten.</div>`}
      ${luiken.length ? `<div class="luiken">${luiken.length > 1 ? `<div class="luik"><div class="n">Alle rolluiken</div>
          <button data-actie="luik" data-dienst="open_cover" data-id="${luiken.map((c) => c.entity_id).join(",")}">▲</button>
          <button data-actie="luik" data-dienst="stop_cover" data-id="${luiken.map((c) => c.entity_id).join(",")}">■</button>
          <button data-actie="luik" data-dienst="close_cover" data-id="${luiken.map((c) => c.entity_id).join(",")}">▼</button></div>` : ""}${luikHtml}</div>` : ""}
      </div>
      <div class="toggles">${toggleHtml}</div>`;
  }

  // ---- energie ----

  _vermogenSensoren() {
    const alle = Object.values(this._hass.states).filter(
      (s) => s.attributes.device_class === "power" && !isNaN(parseFloat(s.state))
    );
    const isZon = (s) => /zon|solar|pv|omvormer|inverter|paneel|panel|enphase|apsystems|hoymiles|solaredge/i.test(s.entity_id + " " + this._naam(s));
    const isFase = (s) => /_l[123]\b|phase|fase/i.test(s.entity_id);
    const naarW = (s) => parseFloat(s.state) * (s.attributes.unit_of_measurement === "kW" ? 1000 : 1);
    const net = alle.find((s) => !isZon(s) && !isFase(s) && /p1|dsmr|homewizard|net|grid|meter|power$/i.test(s.entity_id));
    const zon = alle.filter(isZon);
    // Het grootste zonnepaneel-getal is meestal het totaal; de rest zijn losse panelen.
    zon.sort((a, b) => naarW(b) - naarW(a));
    const zonTotaal = zon.find((s) => !/paneel|panel|micro|_\d+_/i.test(s.entity_id)) || null;
    const panelen = zon.filter((s) => s !== zonTotaal);
    return { net, zonTotaal, panelen, naarW };
  }

  _tekenEnergie() {
    const { net, zonTotaal, panelen, naarW } = this._vermogenSensoren();
    const sig = [net, zonTotaal, ...panelen].map((s) => s && s.state).join() + JSON.stringify(this._energie);
    if (!this._veranderd("energie", sig)) return;
    const el = this.shadowRoot.getElementById("energie");
    if (!net && !zonTotaal && !panelen.length && !this._energie) {
      el.innerHTML = `<h2>⚡ Energie</h2><div class="leeg">Nog geen slimme meter gekoppeld. Dat doen we samen zodra je weet welk kastje je hebt.</div>`;
      return;
    }
    const fmt = (w) => (Math.abs(w) >= 1000 ? (w / 1000).toFixed(2) + " kW" : Math.round(w) + " W");
    const netW = net ? naarW(net) : null;
    const zonW = zonTotaal ? naarW(zonTotaal) : panelen.reduce((t, s) => t + naarW(s), 0);
    const e = this._energie || {};
    const maxPaneel = Math.max(1, ...panelen.map(naarW));
    el.innerHTML = `
      <h2>⚡ Energie <span class="r">nu</span></h2>
      <div class="energie-nu">
        ${netW != null ? `<div><small>${netW < 0 ? "Teruglevering" : "Verbruik net"}</small><b class="${netW < 0 ? "terug" : ""}">${fmt(Math.abs(netW))}</b></div>` : ""}
        ${zonTotaal || panelen.length ? `<div><small>Zonnepanelen</small><b class="zon">${fmt(zonW)}</b></div>` : ""}
      </div>
      ${panelen.length ? `<div class="panelen" title="Opbrengst per paneel">${panelen.map((p) => `<div style="height:${(naarW(p) / maxPaneel) * 100}%" title="${esc(this._naam(p))}: ${fmt(naarW(p))}"></div>`).join("")}</div>` : ""}
      ${Object.keys(e).length ? `<div class="energie-dag">
        ${e.stroom != null ? `<div>Stroom vandaag<b>${e.stroom.toFixed(1)} kWh</b></div>` : ""}
        ${e.terug != null ? `<div>Terug vandaag<b class="terug">${e.terug.toFixed(1)} kWh</b></div>` : ""}
        ${e.zon != null ? `<div>Zon vandaag<b class="zon">${e.zon.toFixed(1)} kWh</b></div>` : ""}
        ${e.gas != null ? `<div>Gas vandaag<b>${e.gas.toFixed(2)} m³</b></div>` : ""}
      </div>` : ""}`;
  }

  async _laadEnergie() {
    // Gebruikt de instellingen van het Energie-dashboard van Home Assistant.
    try {
      const prefs = await this._hass.callWS({ type: "energy/get_prefs" });
      const ids = { stroom: [], terug: [], zon: [], gas: [] };
      for (const b of prefs.energy_sources || []) {
        if (b.type === "grid") {
          (b.flow_from || []).forEach((f) => ids.stroom.push(f.stat_energy_from));
          (b.flow_to || []).forEach((f) => ids.terug.push(f.stat_energy_to));
          if (b.stat_energy_from) ids.stroom.push(b.stat_energy_from);
          if (b.stat_energy_to) ids.terug.push(b.stat_energy_to);
        }
        if (b.type === "solar") ids.zon.push(b.stat_energy_from);
        if (b.type === "gas") ids.gas.push(b.stat_energy_from);
      }
      const uit = {};
      for (const [k, lijst] of Object.entries(ids)) {
        const geldig = lijst.filter(Boolean);
        if (!geldig.length) continue;
        let som = 0;
        for (const id of geldig) {
          const r = await this._hass.callWS({ type: "recorder/statistic_during_period", statistic_id: id, calendar: { period: "day" }, types: ["change"] });
          som += r?.change || 0;
        }
        uit[k] = som;
      }
      this._energie = Object.keys(uit).length ? uit : null;
    } catch (e) {
      this._energie = null;
    }
    this._handtekening.energie = null;
    this._tekenEnergie();
  }

  // ---- agenda & afval ----

  async _laadAgenda() {
    const agendas = this._ent("calendar");
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const eind = new Date(start.getTime() + 4 * 86400000);
    const items = [];
    for (const a of agendas) {
      try {
        const r = await this._hass.callApi("GET", `calendars/${a.entity_id}?start=${start.toISOString()}&end=${eind.toISOString()}`);
        r.forEach((ev) => items.push({ ...ev, agenda: this._naam(a) }));
      } catch (e) {
        /* agenda niet bereikbaar */
      }
    }
    const tijd = (x) => x.dateTime || x.date;
    items.sort((a, b) => new Date(tijd(a.start)) - new Date(tijd(b.start)));
    this._agenda = items.filter((ev) => new Date(tijd(ev.end)) > new Date()).slice(0, 6);
    this._handtekening.agenda = null;
    this._tekenAgenda();
  }

  _tekenAgenda() {
    const afval = this._s("sensor.meldkamer_afval")?.attributes;
    const sig = this._sig("sensor.meldkamer_afval") + JSON.stringify(this._agenda) + new Date().getDate();
    if (!this._veranderd("agenda", sig)) return;
    const v = afval?.volgende;
    const iconen = { gft: "🟢", groen: "🟢", rest: "⚫", papier: "🔵", plastic: "🟠", pmd: "🟠", glas: "🟣" };
    const afvalIcoon = (s) => Object.entries(iconen).find(([k]) => s.toLowerCase().includes(k))?.[1] || "🗑️";
    const wanneer = (d) => (d === 0 ? "Vandaag" : d === 1 ? "Morgen" : `Over ${d} dagen`);
    const dagNaam = (iso, heleDag) => {
      const d = new Date(iso);
      const vandaag = new Date();
      vandaag.setHours(0, 0, 0, 0);
      const verschil = Math.round((new Date(d).setHours(0, 0, 0, 0) - vandaag) / 86400000);
      const dag = verschil === 0 ? "Vandaag" : verschil === 1 ? "Morgen" : d.toLocaleDateString("nl-NL", { weekday: "short" });
      return heleDag ? dag : `${dag} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    this.shadowRoot.getElementById("agenda").innerHTML = `
      <h2>📅 Agenda & afval</h2>
      ${v ? `<div class="afval ${v.dagen <= 1 ? "snel" : ""}"><span class="i">${afvalIcoon(v.soort)}</span><div><b>${wanneer(v.dagen)}: ${esc(v.soort)}</b><div style="font-size:12px;color:var(--zacht)">${new Date(v.datum).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}${v.dagen <= 1 ? " · container aan de weg!" : ""}</div></div></div>` : ""}
      ${this._agenda.length
        ? this._agenda
            .map((ev) => {
              const heleDag = !ev.start.dateTime;
              return `<div class="afspraak"><span class="w">${dagNaam(ev.start.dateTime || ev.start.date + "T00:00", heleDag)}</span><span>${esc(ev.summary)}</span></div>`;
            })
            .join("")
        : `<div class="leeg">${this._ent("calendar").length ? "Geen afspraken de komende dagen." : "Google Agenda nog niet gekoppeld."}</div>`}`;
  }

  // ---- lucht & checklist ----

  _tekenLucht() {
    if (!this._veranderd("lucht", this._sig("sensor.meldkamer_luchtkwaliteit"))) return;
    const l = this._s("sensor.meldkamer_luchtkwaliteit");
    const el = this.shadowRoot.getElementById("lucht");
    if (!l || isNaN(parseFloat(l.state))) {
      el.innerHTML = `<h2>🌫️ Lucht</h2><div class="leeg">Laden…</div>`;
      return;
    }
    const w = parseFloat(l.state);
    const [, label, kleur] = AQI.find(([g]) => w < g);
    const a = l.attributes;
    el.innerHTML = `<h2>🌫️ Luchtkwaliteit</h2>
      <div class="aqi"><div class="ring" style="border-color:${kleur};color:${kleur}">${Math.round(w)}</div><div><b>${label}</b><small>Europese index</small></div></div>
      <div class="stoffen"><span>Fijnstof 2.5 <b>${Math.round(a.pm2_5 ?? 0)}</b></span><span>Fijnstof 10 <b>${Math.round(a.pm10 ?? 0)}</b></span>
      <span>NO₂ <b>${Math.round(a.nitrogen_dioxide ?? 0)}</b></span><span>Ozon <b>${Math.round(a.ozone ?? 0)}</b></span></div>`;
  }

  _tekenCheck() {
    const items = Object.values(this._hass.states).filter((s) => s.entity_id.startsWith("input_boolean.meldkamer_check_"));
    const sig = items.map((s) => s.state).join();
    if (!this._veranderd("check", sig)) return;
    const klaar = items.filter((s) => s.state === "on").length;
    this.shadowRoot.getElementById("check").innerHTML = `
      <h2>🎒 Klaar voor actie <span class="r">${klaar}/${items.length}</span></h2>
      <div class="voortgang"><div style="width:${items.length ? (klaar / items.length) * 100 : 0}%"></div></div>
      ${items.map((s) => `<button class="check ${s.state === "on" ? "aan" : ""}" data-actie="toggle" data-id="${s.entity_id}"><span class="vak">${s.state === "on" ? "✓" : ""}</span>${esc(this._naam(s))}</button>`).join("")}
      ${klaar ? `<button class="klein-knop" style="margin-top:6px" data-actie="dienst" data-dienst="script.meldkamer_checklist_reset">Alles leegmaken</button>` : ""}`;
  }

  // ---- nachtmodus ----

  _tekenNacht(nu) {
    const el = this.shadowRoot.getElementById("nacht");
    const u = nu.getHours();
    const isNacht = NACHT_VAN > NACHT_TOT ? u >= NACHT_VAN || u < NACHT_TOT : u >= NACHT_VAN && u < NACHT_TOT;
    const uit = this._aan("input_boolean.meldkamer_nachtmodus_uit");
    const alarm = this.shadowRoot.getElementById("alarm").classList.contains("open");
    const toon = isNacht && !uit && !alarm && Date.now() > this._wakkerTot;
    el.classList.toggle("open", toon);
    if (toon) {
      const m = this._meldingen()[0];
      const w = this._s("sensor.meldkamer_weer");
      this.shadowRoot.getElementById("nachtinfo").textContent =
        (w && w.state !== "unknown" ? `${Math.round(w.state)}° buiten` : "") + (m ? ` · laatste melding ${tijdGeleden(m.tijd)}` : "");
    }
  }

  // ---- alarm ----

  _controleerAlarm() {
    const m = this._meldingen()[0];
    if (!m || !m.relevant) return;
    let gezien = null;
    try {
      gezien = localStorage.getItem("meldkamer_alarm_gezien");
    } catch (e) {
      /* geen opslag */
    }
    if (this._alarmId === m.id || gezien === m.id) return;
    const vers = Date.now() - new Date(m.tijd).getTime() < 15 * 60 * 1000;
    if (gezien === null) {
      // Eerste keer openen: geen alarm voor wat er al lag.
      this._bevestig(m.id);
      return;
    }
    if (!vers || this._aan("input_boolean.meldkamer_brandalarm_pauze")) {
      this._bevestig(m.id);
      return;
    }
    this._toonAlarm(m);
  }

  _toonAlarm(m) {
    this._alarmId = m.id;
    this._toonPagina("meldkamer");
    this._tab = "kaart";
    this._toonTab();
    const r = m.route;
    const el = this.shadowRoot.getElementById("alarm");
    el.innerHTML = `
      <div class="groot">🚨 BRANDMELDING ${m.prio ? "· P" + m.prio : ""}</div>
      ${m.eigen ? '<div style="font-size:22px;font-weight:800;margin-top:8px;background:#ffd60a;color:#000;padding:4px 14px;border-radius:8px">EIGEN VOERTUIG GEALARMEERD</div>' : ""}
      <div class="titel">${esc(m.kort || m.titel)}</div>
      <div class="adres">${m.adres ? "📍 " + esc(m.adres) : ""}</div>
      ${r ? `<div class="info">
        ${r.auto ? `<div class="blok ${r.sneller === "auto" ? "best" : ""}">🚗 Auto<b>${r.auto.minuten} min</b>${r.auto.km} km</div>` : ""}
        ${r.fiets ? `<div class="blok ${r.sneller === "fiets" ? "best" : ""}">🚲 Fiets<b>${r.fiets.minuten} min</b>${r.fiets.km} km</div>` : ""}
        ${r.advies ? `<div class="blok">🧭 Route<b style="font-size:22px;margin-top:6px">${esc(r.advies)}</b></div>` : ""}
      </div>` : ""}
      ${(m.eenheden || []).length ? `<div style="margin-bottom:20px;opacity:.85;font-size:15px">${m.eenheden.slice(0, 6).map(esc).join(" · ")}</div>` : ""}
      <div class="knoppen">
        ${r?.maps_auto ? `<a href="${esc(r.maps_auto)}" target="_blank" rel="noopener">🚗 Navigeer</a>` : ""}
        ${r?.maps_fiets ? `<a href="${esc(r.maps_fiets)}" target="_blank" rel="noopener">🚲 Fiets</a>` : ""}
        <button class="stil" data-actie="stil">🔇 Geluid uit</button>
        <button data-actie="bevestig">✓ Gezien</button>
      </div>`;
    el.classList.add("open");
    this._startSirene();
    if (m.lat && this._map) this._map.setView([m.lat, m.lon], 14);
    // Na 3 minuten vanzelf weg
    clearTimeout(this._alarmTimer);
    this._alarmTimer = setTimeout(() => this._sluitAlarm(), 3 * 60 * 1000);
  }

  _bevestig(id) {
    try {
      localStorage.setItem("meldkamer_alarm_gezien", id);
    } catch (e) {
      /* geen opslag */
    }
    this._alarmId = id;
  }

  _sluitAlarm() {
    this._stopSirene();
    const el = this.shadowRoot.getElementById("alarm");
    el.classList.remove("open");
    if (this._alarmId) this._bevestig(this._alarmId);
    this._wakkerTot = Date.now() + 5 * 60 * 1000;
  }

  _startSirene() {
    this._audio();
    this._stopSirene();
    if (!this._ctx) return;
    const speel = () => {
      const ctx = this._ctx;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      // Twee-tonige "pieper": hoog-laag-hoog-laag
      [0, 0.45, 0.9, 1.35].forEach((d, i) => osc.frequency.setValueAtTime(i % 2 ? 680 : 1020, t + d));
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
      gain.gain.setValueAtTime(0.22, t + 1.75);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.85);
    };
    speel();
    let keer = 0;
    this._sirene = setInterval(() => {
      if (++keer > 20) return this._stopSirene();
      speel();
    }, 3000);
  }

  _stopSirene() {
    clearInterval(this._sirene);
    this._sirene = null;
  }

  // ---- klikken ----

  _meerInfo(entityId) {
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  _klik(e) {
    const nacht = e.target.closest("#nacht");
    if (nacht) {
      this._wakkerTot = Date.now() + 2 * 60 * 1000;
      nacht.classList.remove("open");
      return;
    }
    const el = e.target.closest("[data-actie]");
    if (!el) return;
    const { actie, id } = el.dataset;
    const h = this._hass;
    switch (actie) {
      case "toggle":
        h.callService("homeassistant", "toggle", { entity_id: id });
        break;
      case "luik":
        h.callService("cover", el.dataset.dienst, { entity_id: id.split(",") });
        break;
      case "alles-uit":
        h.callService("light", "turn_off", { entity_id: "all" });
        break;
      case "dienst": {
        const [domein, dienst] = el.dataset.dienst.split(".");
        h.callService(domein, dienst, {});
        break;
      }
      case "tab":
        this._tab = el.dataset.tab;
        this._toonTab();
        break;
      case "live":
        this._zetLive(id);
        break;
      case "wtab":
        this._weerTab = el.dataset.tab;
        this._toonWeerTab();
        break;
      case "pagina":
        this._toonPagina(el.dataset.pagina);
        break;
      case "focus":
        this._focusMelding(+el.dataset.i);
        break;
      case "meer":
        this._meerInfo(id);
        break;
      case "test":
        if (confirm("Test-alarm geven? De lampen en je telefoon doen dan mee.")) h.callService("meldkamer", "test_melding", {});
        break;
      case "stil":
        this._stopSirene();
        break;
      case "bevestig":
        this._sluitAlarm();
        break;
      case "menu":
        this.dispatchEvent(new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true }));
        break;
    }
  }

  _laadExtra() {
    if (!this._hass) return;
    this._laadAgenda();
    this._laadEnergie();
    if (this._tab === "radar") this._ververstRadar();
  }
}

customElements.define("meldkamer-panel", MeldkamerPanel);
