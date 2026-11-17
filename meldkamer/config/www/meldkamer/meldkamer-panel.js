/*
 * Huis Sterkenburg — dashboard voor Home Assistant
 * Tabbladen: Meldkamer (brandweer post Nunspeet, politie, Nederland, vliegtuigen),
 * Dashboard (huis, lampen, camera's, energie, agenda, nieuws) en Weer & storm.
 */

const FONTS = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&family=Instrument+Serif:ital@0;1&display=swap";
const NACHT_VAN = 23;
const NACHT_TOT = 7;
const ALARM_DUUR = 2 * 60 * 1000;

// ---------- Hulpfuncties ----------

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const rond = (x, d = 0) => (x == null || isNaN(x) ? "–" : Number(x).toFixed(d));

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
const klokTijd = (iso) => {
  const t = new Date(iso);
  return isNaN(t) ? "" : `${pad(t.getHours())}:${pad(t.getMinutes())}`;
};
const datumKort = (iso) => {
  const t = new Date(iso);
  return isNaN(t) ? "" : t.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
};

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
  [20, "Goed", "#30d158", "Schone lucht. Prima om te sporten, te wandelen en de ramen open te zetten."],
  [40, "Redelijk", "#a3d95b", "Prima voor bijna iedereen. Alleen heel gevoelige mensen merken misschien iets."],
  [60, "Matig", "#ffd60a", "Mensen met astma of hart- en longklachten doen zware inspanning buiten beter rustig aan."],
  [80, "Slecht", "#ff9f0a", "Beperk zware inspanning buiten en lucht het huis liever later op de dag."],
  [100, "Zeer slecht", "#ff453a", "Blijf zoveel mogelijk binnen en houd de ramen dicht."],
  [Infinity, "Extreem slecht", "#bf5af2", "Blijf binnen, ramen dicht. Volg de adviezen van de overheid."],
];
// WHO-advieswaarden (µg/m³) en een korte uitleg per stof
const STOFFEN = [
  ["pm2_5", "Fijnstof 2,5", 15, "kleine stofdeeltjes van verkeer, houtkachels en industrie die diep in je longen komen"],
  ["pm10", "Fijnstof 10", 45, "grovere stofdeeltjes, bijvoorbeeld van wegverkeer, bouw en landbouw"],
  ["nitrogen_dioxide", "NO₂", 25, "stikstofdioxide, vooral uit uitlaatgassen van auto's en vrachtwagens"],
  ["ozone", "Ozon", 100, "ontstaat bij zon en warmte en kan je ogen en luchtwegen irriteren"],
];

const KNMI_KLEUR = { geel: "#ffd60a", oranje: "#ff9f0a", rood: "#ff453a" };
const CAT_KLEUR = {
  Brand: "#ff453a", Gas: "#ff9f0a", OMS: "#bf5af2", Hulpverlening: "#0a84ff", "Water & dier": "#64d2ff",
  Proefalarm: "#636366", Overig: "#8e8e93", Politie: "#0a84ff",
};

const VLIEGTUIG_TYPE = {
  A20N: "Airbus A320neo", A21N: "Airbus A321neo", A319: "Airbus A319", A320: "Airbus A320", A321: "Airbus A321",
  A332: "Airbus A330", A333: "Airbus A330", A339: "Airbus A330neo", A359: "Airbus A350", A35K: "Airbus A350-1000", A388: "Airbus A380",
  B38M: "Boeing 737 MAX 8", B39M: "Boeing 737 MAX 9", B737: "Boeing 737-700", B738: "Boeing 737-800", B739: "Boeing 737-900",
  B744: "Boeing 747", B748: "Boeing 747-8", B752: "Boeing 757", B763: "Boeing 767", B772: "Boeing 777", B77W: "Boeing 777-300ER",
  B788: "Boeing 787-8", B789: "Boeing 787-9", B78X: "Boeing 787-10", E190: "Embraer 190", E195: "Embraer 195", E290: "Embraer E2",
  E295: "Embraer E2", E75L: "Embraer 175", CRJ9: "Bombardier CRJ900", AT76: "ATR 72", AT75: "ATR 72", DH8D: "Dash 8",
  F70: "Fokker 70", F100: "Fokker 100", C172: "Cessna 172", C152: "Cessna 152", PA28: "Piper PA-28", SR22: "Cirrus SR22",
  PC12: "Pilatus PC-12", C25A: "Cessna Citation", C56X: "Citation Excel", GLF6: "Gulfstream G650", CL35: "Challenger 350",
  EC35: "Airbus H135", H135: "Airbus H135", EC45: "Airbus H145", H145: "Airbus H145", A139: "AgustaWestland AW139",
  AW139: "AgustaWestland AW139", NH90: "NH90", CH47: "Chinook", H47: "Chinook", AH64: "Apache", R44: "Robinson R44",
  F35: "F-35", F16: "F-16", C130: "C-130 Hercules", A400: "Airbus A400M", K35R: "KC-135", MRTT: "Airbus A330 MRTT",
};
const MAATSCHAPPIJ = {
  KLM: "KLM", TRA: "Transavia", EZY: "easyJet", EJU: "easyJet", RYR: "Ryanair", DLH: "Lufthansa", BAW: "British Airways",
  AFR: "Air France", TFL: "TUI", CND: "Corendon", UAE: "Emirates", QTR: "Qatar Airways", THY: "Turkish Airlines",
  SAS: "SAS", EWG: "Eurowings", WZZ: "Wizz Air", KLC: "KLM Cityhopper", MPH: "Martinair", ETD: "Etihad", DAL: "Delta",
  UAL: "United", AAL: "American", CFG: "Condor", SWR: "Swiss", AUA: "Austrian", BEL: "Brussels Airlines", FIN: "Finnair",
  LOT: "LOT", IBE: "Iberia", VLG: "Vueling", NAX: "Norwegian", ICE: "Icelandair", AEE: "Aegean", CLX: "Cargolux",
  FDX: "FedEx", UPS: "UPS", GTI: "Atlas Air", NAF: "Koninklijke Luchtmacht", RCH: "US Air Force", GAF: "Duitse luchtmacht",
  LIFELN: "Traumaheli (ANWB)", ZXP: "Politie",
};

function maatschappij(roep) {
  const r = (roep || "").toUpperCase();
  if (r.startsWith("LIFELN")) return MAATSCHAPPIJ.LIFELN;
  return MAATSCHAPPIJ[r.slice(0, 3)] || "";
}

// Maanstand berekenen (ten opzichte van een bekende nieuwe maan)
function maan(d = new Date()) {
  const syn = 29.530588853;
  const ref = Date.UTC(2000, 0, 6, 18, 14);
  const leeftijd = ((((d.getTime() - ref) / 86400000) % syn) + syn) % syn;
  const verlicht = Math.round(((1 - Math.cos((2 * Math.PI * leeftijd) / syn)) / 2) * 100);
  const fasen = [
    [1.84566, "Nieuwe maan", "🌑"], [5.53699, "Wassende sikkel", "🌒"], [9.22831, "Eerste kwartier", "🌓"],
    [12.91963, "Wassende maan", "🌔"], [16.61096, "Volle maan", "🌕"], [20.30228, "Afnemende maan", "🌖"],
    [23.99361, "Laatste kwartier", "🌗"], [27.68493, "Afnemende sikkel", "🌘"], [99, "Nieuwe maan", "🌑"],
  ];
  const [, naam, icoon] = fasen.find(([g]) => leeftijd < g);
  const totVol = (14.765 - leeftijd + syn) % syn;
  return { naam, icoon, verlicht, volle: new Date(d.getTime() + totVol * 86400000) };
}

// ---------- Stijl ----------

const CSS = `
:host{
  --bg:#070d1a; --kaart:rgba(28,40,68,.55); --rand:rgba(160,190,255,.10);
  --tekst:#f1f5fc; --zacht:#93a3c0; --zwak:#56658a;
  --accent:#ff7a18; --accent2:#ffb347; --goed:#34d399; --geel:#ffd60a; --blauw:#0a84ff; --cyaan:#7cc4ff;
  --r:22px; --serif:"Instrument Serif",Georgia,serif;
  --vlak:rgba(255,255,255,.05); --vlak2:rgba(0,0,0,.25);
  --kaartbg:linear-gradient(160deg,rgba(60,80,130,.32),rgba(25,35,62,.45));
  --kaartschaduw:0 14px 34px rgba(0,0,0,.30), inset 0 1px 0 rgba(255,255,255,.06);
  --lijfbg:linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.025));
  --achtergrond:radial-gradient(900px 600px at 85% -10%, color-mix(in srgb,var(--accent) 22%,transparent), transparent 60%),
    radial-gradient(1000px 700px at -10% 110%, rgba(40,90,200,.28), transparent 60%),
    linear-gradient(160deg,#0b1426 0%,#111e3a 55%,#0a1222 100%);
  --stormtekst:#ffe680; --lege-balk:#262b33;
  display:block; height:100vh; min-height:100%; background:var(--bg); color:var(--tekst);
  font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; -webkit-font-smoothing:antialiased;
}
:host([thema="licht"]){
  --bg:#f4ede6; --tekst:#2a2420; --zacht:#7d7066; --zwak:#ab9e94; --rand:rgba(120,85,55,.13);
  --accent:#ef5b39; --accent2:#ff8a62; --goed:#16a34a; --cyaan:#0e7fc2;
  --vlak:rgba(120,85,55,.06); --vlak2:rgba(255,255,255,.6);
  --kaartbg:linear-gradient(160deg,rgba(255,255,255,.78),rgba(255,247,240,.52));
  --kaartschaduw:0 14px 34px rgba(120,80,40,.12), inset 0 1px 0 rgba(255,255,255,.9);
  --lijfbg:linear-gradient(160deg,rgba(255,255,255,.55),rgba(255,255,255,.28));
  --achtergrond:radial-gradient(900px 600px at 90% -10%, rgba(255,160,120,.55), transparent 60%),
    radial-gradient(900px 700px at -10% 110%, rgba(255,214,190,.7), transparent 60%),
    linear-gradient(160deg,#efe4da 0%,#e9d7c9 55%,#f3e9e1 100%);
  --stormtekst:#7a4a00; --lege-balk:#e6dbd2;
}
:host([storm]){ --accent:#d97706; --accent2:#f5a524; }
:host([modus="brand"]){ --accent:#ff3b30; --accent2:#ff7a5c; }
:host([modus="politie"]){ --accent:#1e6bff; --accent2:#5ea2ff; }
*{box-sizing:border-box}
button{font:inherit;color:inherit;cursor:pointer;border:0;background:none}
a{color:inherit}
.wrap{height:100%;display:flex;flex-direction:column;overflow:hidden;position:relative;animation:intro .9s cubic-bezier(.2,.8,.2,1) both;
  background:
    var(--achtergrond);
  transition:filter .8s;}
:host([thema="donker"]:not([modus]):not([fel])) .wrap{filter:brightness(.78) saturate(.95)}
:host([avond]:not([modus]):not([fel])) .wrap{filter:brightness(.9) sepia(.06)}
@keyframes intro{from{opacity:0;transform:scale(1.015);filter:blur(6px)}to{opacity:1;transform:none;filter:none}}
@keyframes binnen{from{opacity:0;transform:translateY(16px) scale(.985)}to{opacity:1;transform:none}}
.animeer .kaart{animation:binnen .6s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i,0) * 55ms)}
/* ---- lijf met zijbalk ---- */
.lijf{flex:1;min-height:0;display:flex;gap:0;margin:0 14px 14px;border-radius:30px;
  background:var(--lijfbg);border:1px solid var(--rand);
  box-shadow:0 30px 80px rgba(0,0,0,.45), inset 0 1px 0 var(--vlak);backdrop-filter:blur(20px);overflow:hidden}
.inhoud{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0}
.rail{flex:none;display:flex;flex-direction:column;align-items:center;gap:10px;padding:18px 0 18px 14px}
.rail .stok{display:flex;flex-direction:column;gap:8px;padding:8px;border-radius:999px;background:var(--vlak2);border:1px solid var(--rand)}
.rail button{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-size:18px;color:var(--zacht);transition:.2s;position:relative}
.rail button:hover{background:var(--vlak)}
.rail button.aan{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;box-shadow:0 6px 22px color-mix(in srgb,var(--accent) 55%,transparent)}
.rail button .tip{position:absolute;left:52px;white-space:nowrap;font-size:12px;font-weight:600;background:var(--bg);border:1px solid var(--rand);padding:4px 9px;border-radius:8px;opacity:0;pointer-events:none;transition:.15s;z-index:10}
.rail button:hover .tip{opacity:1}
.rail .avatar{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-weight:800;color:#fff;
  background:linear-gradient(135deg,var(--accent),var(--accent2));box-shadow:0 0 0 4px var(--vlak)}
/* ---- kop ---- */
.kop{display:flex;align-items:center;gap:14px;padding:10px 20px}
.menu{width:38px;height:38px;border-radius:11px;background:var(--vlak);font-size:18px;flex:none}
.logo{display:flex;align-items:center;gap:12px;min-width:0}
.logo .bol{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;font-size:20px;flex:none;
  background:linear-gradient(135deg,var(--accent),var(--accent2));box-shadow:0 0 22px color-mix(in srgb,var(--accent) 40%,transparent)}
.logo h1{margin:0;font-size:24px;letter-spacing:.01em;font-weight:400;white-space:nowrap;font-family:var(--serif)}
.logo h1 i{color:var(--accent2)}
.logo small{display:block;color:var(--zacht);font-size:11px;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap}
.paginas{display:none;gap:6px;flex:none;padding:4px;border-radius:14px;background:var(--vlak);border:1px solid var(--rand)}
.pag-knop{padding:8px 14px;border-radius:10px;font-weight:700;font-size:13.5px;color:var(--zacht);white-space:nowrap;transition:.15s}
.pag-knop.aan{background:var(--accent);color:#fff;box-shadow:0 4px 18px color-mix(in srgb,var(--accent) 35%,transparent)}
:host([storm]) .pag-knop.aan{color:#000}
:host([storm]) .pag-knop[data-pagina="weer"]:not(.aan){color:var(--geel);animation:flits 2.4s infinite}
.chips{display:flex;gap:8px;flex-wrap:wrap;flex:1;justify-content:flex-end}
.chip{display:flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;background:var(--vlak);
  border:1px solid var(--rand);font-size:12.5px;color:var(--zacht);white-space:nowrap}
.chip b{color:var(--tekst);font-weight:600}
.chip .stip{width:7px;height:7px;border-radius:50%;background:var(--goed);box-shadow:0 0 8px var(--goed)}
.chip.fout .stip{background:var(--accent);box-shadow:0 0 8px var(--accent)}
.klok{text-align:right;font-family:"JetBrains Mono",ui-monospace,monospace;flex:none}
.klok .t{font-size:30px;font-weight:700;letter-spacing:.04em;line-height:1}
.klok .d{color:var(--zacht);font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-family:Inter,sans-serif;margin-top:4px}
/* ---- storm ---- */
.storm{display:none;align-items:center;gap:12px;padding:7px 18px;font-weight:600;font-size:13.5px;
  background:repeating-linear-gradient(-45deg,rgba(255,214,10,.15) 0 14px,rgba(255,214,10,.05) 14px 28px);
  border-bottom:1px solid rgba(255,214,10,.35);color:var(--stormtekst)}
:host([storm]) .storm{display:flex}
.storm .bliksem{font-size:18px;animation:flits 2.4s infinite}
@keyframes flits{0%,86%,100%{opacity:1}88%{opacity:.2}90%{opacity:1}92%{opacity:.3}}
/* ---- raster ---- */
.raster{flex:1;min-height:0;display:grid;gap:14px;padding:18px 18px 18px 16px;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr) minmax(0,1fr)}
.pagina:not(.aan){display:none!important}
.p-dashboard{grid-template-rows:auto minmax(0,1fr)}
.p-dashboard .groet{grid-column:1/-1}
.kolom{display:flex;flex-direction:column;gap:12px;min-height:0;min-width:0;overflow:auto;scrollbar-width:none}
.kolom::-webkit-scrollbar{display:none}
.kaart{background:var(--kaartbg);border:1px solid var(--rand);border-radius:var(--r);padding:14px 16px;flex:none;
  backdrop-filter:blur(14px);box-shadow:var(--kaartschaduw);min-height:0;position:relative;transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s}
@media (hover:hover){.p-dashboard .kaart:hover,.p-woonkamer .kaart:hover{transform:translateY(-4px)}}
.kaart.groei{flex:1 1 auto;display:flex;flex-direction:column;min-height:200px}
.kaart h2{margin:0 0 11px;font-size:10.5px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--zacht);display:flex;align-items:center;gap:8px}
.kaart h2::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 10px var(--accent);flex:none}
.hero h2::before,.groet h2::before{background:#fff;box-shadow:none}
.kaart h2 .r{margin-left:auto;letter-spacing:.04em;text-transform:none;font-weight:500;display:flex;gap:6px;align-items:center}
.scroll{overflow:auto;min-height:0;flex:1;scrollbar-width:thin;scrollbar-color:#2c323b transparent}
.leeg{color:var(--zwak);font-size:13.5px;padding:4px 0}
.klein-knop{font-size:11.5px;padding:5px 10px;border-radius:8px;background:var(--vlak);color:var(--zacht);font-weight:600}
.klein-knop:hover{color:var(--tekst)}
.klein-knop.politie{color:#9ecbff}
/* ---- laatste melding ---- */
.hero,.groet{background:linear-gradient(135deg,var(--accent),var(--accent2))!important;border-color:rgba(255,255,255,.25)!important;color:#fff;
  box-shadow:0 18px 50px color-mix(in srgb,var(--accent) 45%,transparent), inset 0 1px 0 rgba(255,255,255,.35)!important}
.hero h2,.hero .geleden,.hero .hero-adres,.hero .teller small{color:rgba(255,255,255,.85)!important}
.hero .teller div,.hero .route a,.hero .eenheid,.hero .advies{background:rgba(0,0,0,.18)!important;border-color:rgba(255,255,255,.2)!important}
.hero .route a.best{background:rgba(255,255,255,.22)!important;border-color:#fff!important}
.hero .klein-knop{background:rgba(255,255,255,.22);color:#fff}
.hero .badge.cat{background:rgba(0,0,0,.2);color:#fff!important}
.hero small,.hero .route a small,.hero .advies span,.groet .blokje span{color:rgba(255,255,255,.85)!important}
.hero-adres{margin-top:6px}
.hero-titel{font-family:var(--serif);font-weight:400!important;font-size:27px!important;line-height:1.15!important;font-style:italic;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:5px}
.hero-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.badge{font-family:"JetBrains Mono",monospace;font-weight:700;font-size:12.5px;padding:3px 9px;border-radius:7px;background:#3a4250;color:#fff}
.badge.p1{background:#ff3b30;box-shadow:0 0 14px rgba(255,59,48,.55)}
.badge.p2{background:#ff9f0a;color:#111}
.badge.cat{font-family:Inter,sans-serif;font-weight:600;background:var(--vlak)}
.geleden{margin-left:auto;font-family:"JetBrains Mono",monospace;font-size:12.5px;color:var(--zacht)}
.hero-titel{font-size:23px;font-weight:800;line-height:1.2;margin:9px 0 4px;overflow-wrap:anywhere}
.hero-adres{color:var(--zacht);font-size:13.5px}
.eenheden{display:flex;flex-wrap:wrap;gap:5px;margin:9px 0}
.eenheid{font-size:11.5px;padding:3px 8px;border-radius:6px;background:var(--vlak);border:1px solid var(--rand)}
.route{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
.route a{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:12px;background:var(--vlak);border:1px solid var(--rand);text-decoration:none}
.route a.best{border-color:var(--goed);background:rgba(48,209,88,.10)}
.route a span{font-size:21px}
.route a b{font-size:19px;font-family:"JetBrains Mono",monospace}
.route a small{display:block;color:var(--zacht);font-size:11px}
.advies{margin-top:8px;padding:8px 12px;border-radius:10px;background:rgba(10,132,255,.12);border:1px solid rgba(10,132,255,.35);font-size:13.5px}
.teller{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:11px}
.teller div{background:var(--vlak2);border-radius:11px;padding:8px 10px}
.teller b{display:block;font-size:21px;font-family:"JetBrains Mono",monospace}
.teller small{color:var(--zacht);font-size:10px;text-transform:uppercase;letter-spacing:.1em}
/* ---- grafiek ---- */
.grafiek svg{width:100%;height:92px;display:block}
.grafiek .as{display:flex;justify-content:space-between;font-size:10px;color:var(--zwak);font-family:"JetBrains Mono",monospace;margin-top:3px}
.cats{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 8px}
.cats span{font-size:11.5px;padding:3px 9px;border-radius:999px;background:var(--vlak);display:flex;gap:6px;align-items:center}
.cats i{width:8px;height:8px;border-radius:50%;display:inline-block}
/* ---- lijsten ---- */
.rij{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:start;padding:8px 0;border-bottom:1px solid var(--rand)}
.rij:last-child{border-bottom:0}
.rij .badge{font-size:10.5px;padding:2px 6px}
.rij .t{font-size:13.5px;font-weight:600;overflow-wrap:anywhere;line-height:1.3}
.rij .s{font-size:11.5px;color:var(--zacht);margin-top:2px}
.rij .k{font-family:"JetBrains Mono",monospace;font-size:11.5px;color:var(--zacht);text-align:right;white-space:nowrap}
.rij.proef{opacity:.45}
.rij.nieuw .t{color:var(--geel)}
.vlucht{display:grid;grid-template-columns:30px 1fr auto;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--rand)}
.vlucht:last-child{border-bottom:0}
.vlucht .ic{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:rgba(100,210,255,.1);color:var(--cyaan);font-size:15px}
.vlucht.heli .ic{background:rgba(255,159,10,.14);color:#ff9f0a}
.vlucht .t{font-size:13.5px;font-weight:700}
.vlucht .t small{font-weight:500;color:var(--zacht);margin-left:6px}
.vlucht .s{font-size:11.5px;color:var(--zacht)}
.vlucht .k{text-align:right;font-family:"JetBrains Mono",monospace;font-size:11.5px;color:var(--zacht)}
.vlucht .k b{display:block;color:var(--tekst);font-size:13px}
/* ---- groet ---- */
.groet{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:16px 20px}
.groet h3{margin:0;font-size:32px;font-weight:400;font-family:var(--serif)}
.groet h3 i{font-style:italic}
.groet p{margin:3px 0 0;color:rgba(255,255,255,.85);font-size:13.5px}
.groet .blokje{background:rgba(0,0,0,.18);border-color:rgba(255,255,255,.22);color:rgba(255,255,255,.85)}
.groet .blokjes{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}
.blokje{background:var(--vlak2);border:1px solid var(--rand);border-radius:12px;padding:7px 12px;font-size:11.5px;color:var(--zacht);min-width:92px}
.blokje b{display:block;color:var(--tekst);font-size:16px;margin-top:1px}
/* ---- lampen ---- */
.uitgelicht{display:flex;align-items:center;gap:14px;padding:13px 14px;border-radius:15px;background:var(--vlak);border:1px solid var(--rand);margin-bottom:10px}
.uitgelicht .bol{width:44px;height:44px;border-radius:50%;flex:none;background:#2a2f37;display:grid;place-items:center;font-size:20px}
.uitgelicht.aan{background:rgba(255,214,10,.1);border-color:rgba(255,214,10,.4)}
.uitgelicht .n{font-size:16px;font-weight:700}
.uitgelicht .s{font-size:12px;color:var(--zacht)}
.uitgelicht input{margin-left:auto;width:42%;accent-color:var(--geel)}
.alle{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
.alle button{padding:10px;border-radius:12px;font-weight:700;font-size:13px;background:var(--vlak);border:1px solid var(--rand)}
.alle .aan-knop{background:rgba(255,214,10,.16);border-color:rgba(255,214,10,.45);color:var(--tekst)}
.schakels{display:grid;grid-template-columns:repeat(auto-fill,minmax(122px,1fr));gap:8px}
.lamp{display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:10px 12px;border-radius:13px;text-align:left;
  background:var(--vlak);border:1px solid var(--rand);min-height:72px;transition:.2s}
.lamp .n{font-size:13px;font-weight:600;line-height:1.2;overflow-wrap:anywhere}
.lamp .s{font-size:11px;color:var(--zacht)}
.lamp .bol{width:16px;height:16px;border-radius:50%;background:#333;transition:.2s}
.lamp.aan{background:rgba(255,214,10,.09);border-color:rgba(255,214,10,.32)}
.lamp.aan .bol{box-shadow:0 0 12px currentColor}
.luiken{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.luik{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:12px;background:var(--vlak);border:1px solid var(--rand)}
.luik .n{flex:1;font-size:13px;font-weight:600}
.luik .s{font-size:11px;color:var(--zacht);font-weight:500}
.luik button{width:34px;height:30px;border-radius:8px;background:var(--vlak)}
.toggles{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}
.toggle{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:var(--vlak);font-size:12px;text-align:left}
.toggle .sw{margin-left:auto;width:30px;height:18px;border-radius:9px;background:#3a3f47;position:relative;flex:none}
.toggle .sw::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:.2s}
.toggle.aan .sw{background:var(--goed)}
.toggle.aan .sw::after{left:14px}
.lamp:hover,.luik button:hover,.alle button:hover{filter:brightness(1.2)}
/* ---- camera's ---- */
.camgrid{display:flex;flex-direction:column;gap:10px;overflow:auto;flex:1;min-height:0;scrollbar-width:thin;scrollbar-color:#2c323b transparent}
.camgrid > .cam{flex:none}
.camgrid .klein{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.cam{position:relative;border-radius:14px;overflow:hidden;background:#000;aspect-ratio:16/9;cursor:pointer;border:1px solid var(--rand);flex:none;width:100%}
.cam img{width:100%;height:100%;object-fit:cover}
.cam span{position:absolute;left:10px;bottom:8px;font-size:13px;font-weight:700;text-shadow:0 1px 4px #000;z-index:2;pointer-events:none}
.cam .live{position:absolute;right:8px;top:8px;font-size:10.5px;font-weight:800;background:#ff3b30;color:#fff;padding:2px 7px;border-radius:6px;z-index:2}
.cam .live-houder{position:absolute;inset:0;overflow:hidden}
.cam .live-houder > *{display:block;width:100%;height:100%;--ha-card-border-radius:0;--ha-card-border-width:0;--ha-card-background:#000;--card-background-color:#000}
.cam .live-knop{position:absolute;left:8px;top:8px;z-index:3;font-size:10.5px;font-weight:700;padding:4px 8px;border-radius:8px;background:rgba(0,0,0,.6);color:#fff;border:1px solid rgba(255,255,255,.22)}
.cam .live-knop.aan{background:var(--goed);color:#000;border-color:var(--goed)}
.klein .cam{aspect-ratio:16/10}
.klein .cam span{font-size:11px}
/* ---- energie ---- */
.energie-nu{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.energie-nu > div{background:var(--vlak2);border-radius:12px;padding:9px 11px}
.energie-nu b{font-size:21px;font-family:"JetBrains Mono",monospace;display:block}
.energie-nu small{font-size:10px;color:var(--zacht);text-transform:uppercase;letter-spacing:.08em}
.terug{color:var(--goed)} .zon{color:var(--geel)}
.energie-dag{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px;font-size:10.5px;color:var(--zacht)}
.energie-dag b{display:block;font-size:13.5px;color:var(--tekst)}
.zelf{margin-top:9px;font-size:12px;color:var(--zacht)}
.zelf .balk{height:7px;border-radius:4px;background:var(--vlak);overflow:hidden;margin-top:4px}
.zelf .balk div{height:100%;background:linear-gradient(90deg,#ffd60a,#30d158)}
.uurgrafiek svg{width:100%;height:58px;display:block;margin-top:8px}
.legenda{display:flex;gap:12px;font-size:10.5px;color:var(--zacht);margin-top:3px}
.legenda i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px}
.panelen{display:flex;gap:3px;align-items:flex-end;height:30px;margin-top:8px}
.panelen div{flex:1;background:linear-gradient(0deg,#ffd60a,#ff9f0a);border-radius:3px 3px 0 0;min-height:2px}
/* ---- agenda & nieuws ---- */
.afspraak{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--rand);font-size:13px}
.afspraak:last-child{border:0}
.afspraak .w{font-family:"JetBrains Mono",monospace;color:var(--zacht);min-width:78px;font-size:11.5px}
.afval{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:12px;background:rgba(48,209,88,.08);border:1px solid rgba(48,209,88,.3);margin-bottom:8px;font-size:13px}
.afval.snel{background:rgba(255,214,10,.12);border-color:var(--geel)}
.nieuws{display:block;padding:8px 0;border-bottom:1px solid var(--rand);text-decoration:none}
.nieuws:last-child{border:0}
.nieuws .t{font-size:13px;font-weight:600;line-height:1.3}
.nieuws .s{font-size:11px;color:var(--zacht);margin-top:2px}
.nieuws .bron{color:var(--accent2);font-weight:700}
/* ---- weer ---- */
.weer-nu{display:flex;align-items:center;gap:14px}
.weer-nu .ic{font-size:46px;line-height:1}
.weer-nu .temp{font-size:44px;font-weight:800;font-family:"JetBrains Mono",monospace;line-height:1}
.weer-nu .omschr{font-size:13.5px;color:var(--zacht)}
.raster4{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:10px 0}
.raster4 div,.raster3 div{background:var(--vlak2);border-radius:10px;padding:6px 8px;font-size:10.5px;color:var(--zacht)}
.raster4 b,.raster3 b{display:block;color:var(--tekst);font-size:14.5px}
.raster3{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.uren{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(44px,1fr);gap:4px;overflow:auto;scrollbar-width:none;margin-bottom:10px}
.uur{text-align:center;font-size:10.5px;color:var(--zacht);padding:6px 0;border-radius:8px;background:var(--vlak)}
.uur b{display:block;color:var(--tekst);font-size:13.5px}
.uur .i{font-size:17px;display:block;margin:2px 0}
.uur .kans{color:var(--cyaan)}
.regen svg{width:100%;height:50px;display:block}
.regen .as{display:flex;justify-content:space-between;font-size:10px;color:var(--zwak);font-family:"JetBrains Mono",monospace}
.dagen{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px}
.dag{text-align:center;background:var(--vlak2);border-radius:10px;padding:6px;font-size:11.5px;color:var(--zacht)}
.dag .i{font-size:19px;display:block}
.dag b{color:var(--tekst)}
.tabs{display:flex;gap:4px;margin:-3px 0 10px;overflow-x:auto;scrollbar-width:none;flex:none}
.tab{white-space:nowrap;padding:6px 12px;border-radius:999px;font-size:12.5px;color:var(--zacht);background:var(--vlak)}
.tab.aan{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-weight:700}
.venster{flex:1;min-height:260px;border-radius:13px;overflow:hidden;position:relative;background:#0b0f14}
.venster > *{position:absolute;inset:0;width:100%;height:100%;border:0}
.verberg{display:none!important}
.radar{object-fit:contain;background:#0b0f14}
.knmi{padding:9px 12px;border-radius:12px;margin-bottom:8px;border:1px solid;background:var(--vlak2)}
.knmi b{display:block;font-size:14.5px}
.knmi small{color:var(--zacht)}
.ok-blok{display:flex;align-items:center;gap:10px;padding:12px;border-radius:12px;background:rgba(48,209,88,.08);border:1px solid rgba(48,209,88,.3)}
.aqi{display:flex;align-items:center;gap:12px}
.aqi .ring{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:18px;font-family:"JetBrains Mono",monospace;border:4px solid;flex:none}
.aqi small{color:var(--zacht);font-size:11px;display:block}
.uitleg{font-size:12.5px;color:var(--tekst);line-height:1.45;margin:10px 0 8px}
.stof{display:grid;grid-template-columns:76px 1fr 46px;gap:8px;align-items:center;font-size:11.5px;color:var(--zacht);margin:4px 0}
.stof .balk{height:6px;border-radius:3px;background:var(--vlak);overflow:hidden}
.stof .balk div{height:100%;border-radius:3px}
.stof b{color:var(--tekst);text-align:right;font-family:"JetBrains Mono",monospace;font-size:11.5px}
.zonmaan{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.zonmaan > div{background:var(--vlak2);border-radius:12px;padding:10px 12px;font-size:11.5px;color:var(--zacht)}
.zonmaan .groot{font-size:28px;line-height:1;display:block;margin-bottom:4px}
.zonmaan b{color:var(--tekst);font-size:14px;display:block}
.boog svg{width:100%;height:46px;display:block;margin-top:6px}
/* ---- compacte lampen ---- */
.hoofdlamp{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:13px;background:var(--vlak);border:1px solid var(--rand);margin-bottom:10px}
.hoofdlamp.aan{background:rgba(255,214,10,.1);border-color:rgba(255,214,10,.4)}
.hoofdlamp .bol{width:30px;height:30px;border-radius:50%;flex:none;background:#2a2f37;display:grid;place-items:center;font-size:14px}
.hoofdlamp .n{font-size:14px;font-weight:700}
.hoofdlamp .s{font-size:11px;color:var(--zacht)}
.hoofdlamp input{margin-left:auto;width:38%;accent-color:var(--geel)}
.drie{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.sub{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--zwak);margin:12px 0 6px;font-weight:700}
/* ---- compacte energie ---- */
.e-rij{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.e-rij div{background:var(--vlak2);border-radius:10px;padding:6px 9px;font-size:10px;color:var(--zacht);text-transform:uppercase;letter-spacing:.06em}
.e-rij b{display:block;font-size:15px;font-family:"JetBrains Mono",monospace;text-transform:none;letter-spacing:0;color:var(--tekst)}
/* ---- regio ---- */
.regio .rij{padding:6px 0}
.regio .rij .t{font-size:12.5px}
/* ---- nieuws-labels ---- */
.label{font-size:9.5px;font-weight:800;padding:1px 6px;border-radius:5px;margin-right:6px;letter-spacing:.04em}
.label.belangrijk{background:rgba(255,69,58,.18);color:#ff8a80}
.label.f1{background:rgba(255,214,10,.16);color:#ffe680}
/* ---- testtabblad ---- */
.test-knop{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:12px 14px;border-radius:14px;margin-bottom:8px;
  background:var(--vlak);border:1px solid var(--rand);transition:.15s}
.test-knop:hover{background:var(--vlak)}
.test-knop .i{font-size:24px;width:34px;text-align:center;flex:none}
.test-knop b{display:block;font-size:14px}
.test-knop small{display:block;font-size:11.5px;color:var(--zacht);margin-top:2px;line-height:1.35}
.test-knop.rood{border-color:rgba(255,59,48,.45);background:rgba(255,59,48,.10)}
.test-knop.blauw{border-color:rgba(10,132,255,.45);background:rgba(10,132,255,.10)}
.veld{display:flex;gap:8px;margin-bottom:8px}
.veld input,.veld select{flex:1;min-width:0;background:var(--vlak2);border:1px solid var(--rand);color:var(--tekst);border-radius:10px;padding:9px 11px;font:inherit;font-size:13px}
.veld button{padding:9px 14px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-weight:700;font-size:13px}
.uitleg-klein{font-size:12px;color:var(--zacht);line-height:1.45;margin:0 0 10px}
/* ---- deurbel ---- */
.deurbel{position:absolute;inset:0;z-index:1900;display:none;flex-direction:column;background:#04060a;padding:14px}
.deurbel.open{display:flex}
.deurbel .bovenbalk{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.deurbel .bovenbalk h2{margin:0;font-size:24px;font-weight:800}
.deurbel .bovenbalk .bel{font-size:30px;animation:schud .6s ease-in-out 4}
@keyframes schud{0%,100%{transform:rotate(0)}25%{transform:rotate(-18deg)}75%{transform:rotate(18deg)}}
.deurbel .bovenbalk button{margin-left:auto;padding:10px 18px;border-radius:12px;background:#fff;color:#000;font-weight:800}
.deurbel .camvak{display:grid;grid-template-columns:2fr 1fr;grid-template-rows:repeat(3,minmax(0,1fr));gap:10px;flex:1;min-height:0}
.deurbel .camvak .cam{aspect-ratio:auto;height:100%}
.deurbel .camvak .cam.groot{grid-row:1 / span 3}
.deurbel .camvak .cam .live-knop{display:none}
@media (max-width:760px){.deurbel .camvak{grid-template-columns:1fr;grid-template-rows:none;overflow:auto}.deurbel .camvak .cam{aspect-ratio:16/9;height:auto}.deurbel .camvak .cam.groot{grid-row:auto}}
/* ==== Dashboard (glassy) ==== */
.p-dashboard{grid-template-columns:repeat(12,minmax(0,1fr));grid-template-rows:none!important;grid-auto-rows:max-content;align-content:start;overflow-y:auto;scrollbar-width:none}
.p-dashboard::-webkit-scrollbar{display:none}
.d-kop{grid-column:1/-1;display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;padding:2px 4px 0}
.d-kop h3{margin:0;font-family:var(--serif);font-weight:400;font-size:38px;line-height:1}
.d-kop h3 i{color:var(--accent)}
.d-kop p{margin:4px 0 0;color:var(--zacht);font-size:13px}
.pillen{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}
.pil{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:999px;font-size:12.5px;font-weight:700;border:1px solid var(--rand);background:var(--vlak2);color:var(--tekst)}
.pil.donker{background:var(--tekst);color:var(--bg);border-color:transparent}
.d-hero{grid-column:span 8;min-height:200px;display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center}
.d-datum{grid-column:span 4}
.tegel{grid-column:span 3;min-height:126px;display:flex;flex-direction:column;cursor:default}
.d-licht{grid-column:span 4;height:390px;display:flex;flex-direction:column}
.d-cam{grid-column:span 5;height:390px;display:flex;flex-direction:column}
.d-nieuws{grid-column:span 3;height:390px;display:flex;flex-direction:column}
.hero-kleur{background:linear-gradient(135deg,var(--accent),var(--accent2))!important;border-color:rgba(255,255,255,.25)!important;color:#fff;
  box-shadow:0 18px 50px color-mix(in srgb,var(--accent) 40%,transparent), inset 0 1px 0 rgba(255,255,255,.35)!important}
.hero-kleur .zacht{color:rgba(255,255,255,.88)}
.label-pil{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.2);letter-spacing:.02em}
.label-pil::before{content:"";width:6px;height:6px;border-radius:50%;background:#fff}
.hero-groot{font-family:var(--serif);font-size:38px;line-height:1.08;margin:10px 0 6px;font-weight:400}
.hero-groot i{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:6px}
.hero-stats{display:flex;gap:0;margin:12px 0 14px;flex-wrap:wrap}
.hero-stats div{padding:0 16px;border-left:1px solid rgba(255,255,255,.3);font-size:11px;color:rgba(255,255,255,.85)}
.hero-stats div:first-child{padding-left:0;border-left:0}
.hero-stats b{display:block;font-size:20px;color:#fff;font-family:"JetBrains Mono",monospace}
.hero-knoppen{display:flex;gap:8px;flex-wrap:wrap}
.hero-knoppen button{padding:8px 15px;border-radius:999px;font-size:12.5px;font-weight:700;border:1px solid rgba(255,255,255,.6)}
.hero-knoppen button:first-child{background:#fff;color:var(--accent);border-color:#fff}
.ring{position:relative;width:150px;height:150px}
.ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.ring .midden{position:absolute;inset:0;display:grid;place-items:center;text-align:center}
.ring .midden b{display:block;font-size:28px;font-family:"JetBrains Mono",monospace}
.ring .midden small{font-size:10.5px;color:rgba(255,255,255,.85)}
.ring .zonnetje{position:absolute;width:22px;height:22px;border-radius:50%;background:#fff;display:grid;place-items:center;font-size:12px;box-shadow:0 2px 10px rgba(0,0,0,.2)}
.dag-kop{display:flex;align-items:center;gap:12px}
.dag-kop .nr{font-family:var(--serif);font-size:54px;line-height:.9;color:var(--accent)}
.dag-kop b{display:block;font-size:15px}
.dag-kop small{color:var(--zacht);font-size:11.5px}
.week{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin:12px 0 10px;text-align:center}
.week div{padding:6px 0;border-radius:10px;font-size:10.5px;color:var(--zacht)}
.week div b{display:block;font-size:13px;color:var(--tekst);margin-top:2px}
.week .vandaag{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff}
.week .vandaag b{color:#fff}
.afspraak-kaart{display:flex;gap:10px;align-items:center;padding:7px 10px;border-radius:12px;background:var(--vlak2);border:1px solid var(--rand);margin-bottom:6px;font-size:12.5px}
.afspraak-kaart .w{font-family:"JetBrains Mono",monospace;font-size:11px;color:var(--zacht);min-width:42px}
.afspraak-kaart .streep{width:3px;align-self:stretch;border-radius:2px;background:var(--accent);flex:none}
.afspraak-kaart .tag{margin-left:auto;font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent);white-space:nowrap}
.tegel .boven{display:flex;align-items:center;justify-content:space-between}
.tegel .ic{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--vlak2);border:1px solid var(--rand);font-size:14px}
.tegel .chg{font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(52,211,153,.16);color:var(--goed)}
.tegel .waarde{font-size:30px;font-weight:800;font-family:"JetBrains Mono",monospace;margin-top:10px;line-height:1}
.tegel .lbl{font-size:12.5px;font-weight:700;margin-top:6px}
.tegel .sub{font-size:11px;color:var(--zacht);margin:2px 0 0;letter-spacing:0;text-transform:none;font-weight:400}
.tegel .onder{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin-top:auto}
.tegel svg.spark{width:84px;height:30px;flex:none}
.t-accent{background:linear-gradient(135deg,var(--accent),var(--accent2))!important;color:#fff;border-color:rgba(255,255,255,.25)!important;cursor:pointer;
  box-shadow:0 14px 40px color-mix(in srgb,var(--accent) 40%,transparent)!important}
.t-accent .ic{background:rgba(255,255,255,.22);border-color:transparent}
.t-accent .sub{color:rgba(255,255,255,.88)}
.t-accent .chg{background:#fff;color:var(--accent)}
.t-accent .waarde{font-size:19px;font-family:Inter,sans-serif;line-height:1.2;font-weight:800}
/* ==== Woonkamer ==== */
.p-woonkamer{grid-template-columns:repeat(12,minmax(0,1fr));grid-template-rows:auto minmax(0,1fr);overflow:hidden}
.w-klok{grid-column:span 5;display:flex;flex-direction:column;justify-content:space-between;min-height:250px}
.w-weer{grid-column:span 7;min-height:250px}
.w-licht{grid-column:span 4;display:flex;flex-direction:column;min-height:0}
.w-cam{grid-column:span 5;display:flex;flex-direction:column;min-height:0}
.w-vandaag{grid-column:span 3;display:flex;flex-direction:column;min-height:0}
.w-groet{font-family:var(--serif);font-size:30px;line-height:1}
.w-groet i{color:var(--accent)}
.w-tijd{font-size:104px;font-weight:300;letter-spacing:-.04em;line-height:.9;margin:10px 0 4px;font-variant-numeric:tabular-nums}
.w-datum{font-size:17px;color:var(--zacht);text-transform:capitalize}
.w-zon{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.w-weer-boven{display:flex;align-items:center;gap:18px}
.w-weer-boven .ic{font-size:64px;line-height:1}
.w-weer-boven .t{font-size:64px;font-weight:300;letter-spacing:-.03em;line-height:1}
.w-weer-boven .om{font-size:15px;color:var(--zacht)}
.w-weer-boven .stats{margin-left:auto;display:grid;grid-template-columns:repeat(3,auto);gap:6px 18px;font-size:11px;color:var(--zacht)}
.w-weer-boven .stats b{display:block;font-size:17px;color:var(--tekst)}
.w-uren{display:grid;grid-template-columns:repeat(8,1fr);gap:6px;margin:14px 0 12px}
.w-uren div{text-align:center;padding:8px 0;border-radius:14px;background:var(--vlak2);border:1px solid var(--rand);font-size:11px;color:var(--zacht)}
.w-uren .i{display:block;font-size:20px;margin:3px 0}
.w-uren b{display:block;color:var(--tekst);font-size:15px}
.w-uren .kans{color:var(--cyaan);font-size:10.5px}
.w-meldingen{display:flex;gap:8px;flex-wrap:wrap}
.w-tip{display:flex;align-items:center;gap:8px;padding:9px 13px;border-radius:14px;background:var(--vlak2);border:1px solid var(--rand);font-size:13px;font-weight:600}
.w-tip.let{background:rgba(14,127,194,.12);border-color:rgba(14,127,194,.35)}
.w-tip.vorst{background:rgba(120,190,255,.2);border-color:rgba(80,160,230,.5)}
.w-lampen{display:grid;grid-template-columns:1fr 1fr;gap:8px;overflow:auto;min-height:0;flex:1;align-content:start;scrollbar-width:none}
.w-camgrid{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:1fr;gap:8px;flex:1;min-height:0}
.w-camgrid .cam{aspect-ratio:auto;height:100%;min-height:0}
.w-camgrid.een{grid-template-columns:1fr}
.w-lijst{display:flex;flex-direction:column;gap:7px;overflow:auto;min-height:0;flex:1;scrollbar-width:none}
.w-item{display:flex;gap:10px;align-items:center;padding:9px 11px;border-radius:14px;background:var(--vlak2);border:1px solid var(--rand);font-size:13px}
.w-item .i{font-size:20px}
.w-item small{display:block;color:var(--zacht);font-size:11px}
.alarm.rustig{animation:none!important;background:linear-gradient(160deg,#c62828,#8e0000)!important}
.alarm.rustig.politie{background:linear-gradient(160deg,#1f5fd6,#0a2c78)!important}
@media (max-width:1100px){.d-hero,.d-datum,.d-licht,.d-cam,.d-nieuws,.w-klok,.w-weer,.w-licht,.w-cam,.w-vandaag{grid-column:span 12}.tegel{grid-column:span 6}.p-woonkamer{overflow:auto;grid-template-rows:none}.w-licht,.w-cam,.w-vandaag{min-height:320px}}
@media (max-width:760px){.d-hero{grid-template-columns:1fr}.ring{margin:auto}.w-tijd{font-size:76px}.w-weer-boven{flex-wrap:wrap}.w-weer-boven .stats{margin-left:0}.w-uren{grid-template-columns:repeat(4,1fr)}.hero-groot{font-size:30px}}
.alarm,.deurbel{color:#fff}
.cam span{color:#fff}
.w-camgrid.drie .cam:first-child{grid-column:span 2}
/* ---- alarm ---- */
.alarm{position:absolute;inset:0;z-index:2000;display:none;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;
  background:#7a0000;animation:alarmbg 1s steps(2) infinite}
.alarm.open{display:flex}
.alarm.politie{animation:politiebg 1s steps(2) infinite}
@keyframes alarmbg{0%{background:#b00000}50%{background:#3a0000}}
@keyframes politiebg{0%{background:#0033a8}50%{background:#020b30}}
.alarm .groot{font-size:clamp(30px,5.6vw,68px);font-weight:900;letter-spacing:.07em}
.alarm .titel{font-size:clamp(22px,3.3vw,42px);font-weight:800;margin:16px 0 6px;max-width:1100px;overflow-wrap:anywhere}
.alarm .adres{font-size:clamp(16px,2vw,24px);opacity:.9}
.alarm .info{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;margin:22px 0}
.alarm .blok{background:rgba(0,0,0,.35);border-radius:16px;padding:14px 22px;min-width:150px}
.alarm .blok b{display:block;font-size:34px;font-family:"JetBrains Mono",monospace}
.alarm .blok.best{outline:3px solid #fff}
.alarm .knoppen{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
.alarm .knoppen a,.alarm .knoppen button{padding:15px 24px;border-radius:14px;font-size:19px;font-weight:800;text-decoration:none;color:#b00000;background:#fff}
.alarm.politie .knoppen a,.alarm.politie .knoppen button{color:#0033a8}
.alarm .knoppen .stil{background:rgba(0,0,0,.4);color:#fff!important}
.alarm .aftel{margin-top:16px;font-size:13px;opacity:.75;font-family:"JetBrains Mono",monospace}
/* ---- nacht ---- */
.nacht{position:absolute;inset:0;z-index:1500;background:rgba(0,0,0,.93);display:none;flex-direction:column;align-items:center;justify-content:center;color:#5c6470;cursor:pointer}
.nacht.open{display:flex}
.nacht .t{font-family:"JetBrains Mono",monospace;font-size:clamp(70px,14vw,180px);font-weight:700;color:#3d434c}
.nacht .s{font-size:15px;margin-top:6px}
/* ---- laag scherm (laptop 1366x768) ---- */
@media (max-height:820px) and (min-width:761px){
  .kop{padding:7px 14px}
  .klok .t{font-size:25px}
  .raster{gap:10px;padding:10px 12px 12px}
  .kolom{gap:10px}
  .kaart{padding:11px 13px}
  .hero-titel{font-size:20px;margin:7px 0 2px}
  .weer-nu .ic{font-size:38px}
  .weer-nu .temp{font-size:38px}
  .groet{padding:10px 16px}
  .groet h3{font-size:19px}
}
@media (max-width:1450px) and (min-width:761px){
  .chips .chip.extra{display:none}
  .logo small{display:none}
  .pag-knop{padding:8px 11px}
}
@media (max-width:1100px){
  .raster{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  .raster .kolom.k3{grid-column:1 / -1}
  .chips{display:none}
}
@media (max-width:760px){
  .rail{display:none}
  .paginas{display:flex}
  .lijf{margin:0 8px 8px;border-radius:22px;flex:none}
  .hero-titel{font-size:25px!important}
  :host{height:auto;min-height:100vh}
  .wrap{height:auto;min-height:100vh;overflow:visible}
  .raster{grid-template-columns:minmax(0,1fr);padding:10px}
  .p-dashboard{grid-template-rows:auto}
  .kolom{overflow:visible}
  .kop{flex-wrap:wrap;padding:10px}
  .paginas{order:3;flex-basis:100%}
  .pag-knop{flex:1;padding:9px 6px;font-size:12.5px}
  .klok .t{font-size:24px}
  .kaart.groei{min-height:auto}
  .venster{min-height:380px}
  .storm{flex-wrap:wrap;font-size:12.5px;padding:8px 12px}
  .groet .blokjes{margin-left:0}
  .teller{grid-template-columns:repeat(2,1fr)}
}
`;

// ---------- Het paneel ----------

class HuisPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    try {
      this._thuis = localStorage.getItem("meldkamer_thuis") || "dashboard";
    } catch (e) {
      this._thuis = "dashboard";
    }
    this._pagina = this._thuis;
    this._verjaardagen = [];
    this._wkKaarten = {};
    this._weerTab = "windy";
    this._dingGezien = {};
    this._deurbelKaarten = {};
    this._handtekening = {};
    this._agenda = [];
    this._energie = null;
    this._wakkerTot = 0;
    this._alarmId = null;
    this._liveKaarten = {};
  }

  set hass(h) {
    const eerste = !this._hass;
    this._hass = h;
    if (eerste) this._bouw();
    Object.values(this._liveKaarten).forEach((k) => (k.hass = h));
    if (!this._gepland) {
      this._gepland = true;
      setTimeout(() => {
        this._gepland = false;
        this._teken();
      }, 400);
    }
  }
  get hass() {
    return this._hass;
  }
  set narrow(v) {}
  set panel(v) {}

  connectedCallback() {
    // De witte menubalk van Home Assistant verbergen (via ☰ weer te openen)
    const verberg = () =>
      this.dispatchEvent(new CustomEvent("hass-dock-sidebar", { detail: { dock: "always_hidden" }, bubbles: true, composed: true }));
    verberg();
    setTimeout(verberg, 1500);
    this._tik = setInterval(() => this._seconde(), 1000);
    this._traag = setInterval(() => this._laadExtra(), 5 * 60 * 1000);
    this._cam = setInterval(() => this._ververstCams(), 10000);
  }
  disconnectedCallback() {
    clearInterval(this._tik);
    clearInterval(this._traag);
    clearInterval(this._cam);
    this._stopGeluid();
  }

  // ---- opbouw ----

  _bouw() {
    if (!document.querySelector(`link[href="${FONTS}"]`)) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = FONTS;
      document.head.appendChild(l);
    }
    this.shadowRoot.innerHTML = `
      <style>${CSS}</style>
      <div class="wrap">
        <header class="kop">
          <button class="menu" data-actie="menu" title="Menu">☰</button>
          <div class="logo"><div class="bol">🏠</div><div><h1>Huis <i>Sterkenburg</i></h1><small>Nunspeet</small></div></div>
          <nav class="paginas">
            <button class="pag-knop aan" data-actie="pagina" data-pagina="dashboard">🏠 Dashboard</button>
            <button class="pag-knop" data-actie="pagina" data-pagina="woonkamer">🛋️ Woonkamer</button>
            <button class="pag-knop" data-actie="pagina" data-pagina="meldkamer">🚒 Meldkamer</button>
            <button class="pag-knop" data-actie="pagina" data-pagina="weer">⛈️ Weer & storm</button>
            <button class="pag-knop" data-actie="pagina" data-pagina="test">🧪 Test</button>
          </nav>
          <div class="chips" id="chips"></div>
          <div class="klok"><div class="t" id="klok">--:--:--</div><div class="d" id="datum"></div></div>
        </header>
        <div class="storm" id="storm"></div>
        <div class="lijf">
          <nav class="rail">
            <div class="avatar" id="avatar">S</div>
            <div class="stok">
              <button class="aan" data-actie="pagina" data-pagina="dashboard">🏠<span class="tip">Dashboard</span></button>
              <button data-actie="pagina" data-pagina="woonkamer">🛋️<span class="tip">Woonkamer</span></button>
              <button data-actie="pagina" data-pagina="meldkamer">🚒<span class="tip">Meldkamer</span></button>
              <button data-actie="pagina" data-pagina="weer">⛈️<span class="tip">Weer & storm</span></button>
              <button data-actie="pagina" data-pagina="test">🧪<span class="tip">Test</span></button>
            </div>
          </nav>
          <div class="inhoud">

        <main class="raster pagina p-meldkamer" id="p-meldkamer">
          <section class="kolom k1">
            <div class="kaart hero" id="hero"></div>
            <div class="kaart groei"><h2>👮 Politie in de buurt <span class="r" id="politie-info"></span></h2><div class="scroll" id="politie"></div></div>
          </section>
          <section class="kolom k2">
            <div class="kaart groei">
              <h2>📈 Post Nunspeet <span class="r" id="historie-info"></span></h2>
              <div class="grafiek" id="grafiek"></div>
              <div class="cats" id="cats"></div>
              <div class="scroll" id="historie"></div>
            </div>
          </section>
          <section class="kolom k3">
            <div class="kaart"><h2>🔥 Brandweer Nederland <span class="r">live</span></h2><div id="nl"></div></div>
            <div class="kaart groei"><h2>✈️ In de lucht <span class="r" id="vlucht-info"></span></h2><div class="scroll" id="vluchten"></div></div>
          </section>
        </main>

        <main class="raster pagina p-dashboard" id="p-dashboard">
          <div class="d-kop" id="d-kop"></div>
          <div class="kaart d-hero hero-kleur" id="d-hero"></div>
          <div class="kaart d-datum" id="d-datum"></div>
          <div class="kaart tegel" id="t-temp"></div>
          <div class="kaart tegel" id="t-zon"></div>
          <div class="kaart tegel" id="t-stroom"></div>
          <div class="kaart tegel t-accent" id="t-melding" data-actie="pagina" data-pagina="meldkamer"></div>
          <div class="kaart d-licht" id="bediening"></div>
          <div class="kaart d-cam"><h2>📷 Camera's <span class="r" id="cam-info"></span></h2><div class="camgrid" id="camgrid"></div></div>
          <div class="kaart d-nieuws"><h2>📰 Nieuws <span class="r">NU.nl</span></h2><div class="scroll" id="nieuws"></div></div>
        </main>

        <main class="raster pagina p-woonkamer" id="p-woonkamer">
          <div class="kaart w-klok" id="w-klok"></div>
          <div class="kaart w-weer" id="w-weer"></div>
          <div class="kaart w-licht" id="w-licht"></div>
          <div class="kaart w-cam"><h2>📷 Camera's</h2><div class="w-camgrid" id="w-cams"></div></div>
          <div class="kaart w-vandaag" id="w-vandaag"></div>
        </main>

        <main class="raster pagina p-weer" id="p-weer">
          <section class="kolom k1">
            <div class="kaart" id="weer"></div>
            <div class="kaart" id="detail"></div>
          </section>
          <section class="kolom k2">
            <div class="kaart groei">
              <div class="tabs" id="wtabs"></div>
              <div class="venster" id="wvenster">
                <iframe id="windy" loading="lazy" allow="fullscreen"></iframe>
                <img class="radar verberg" id="radar" alt="Buienradar">
                <iframe class="verberg" id="bliksem" loading="lazy" allow="fullscreen"></iframe>
              </div>
            </div>
          </section>
          <section class="kolom k3">
            <div class="kaart" id="knmi"></div>
            <div class="kaart" id="lucht"></div>
            <div class="kaart" id="zonmaan"></div>
          </section>
        </main>

        <main class="raster pagina p-test" id="p-test">
          <section class="kolom k1">
            <div class="kaart">
              <h2>🚒 Brandweer & politie</h2>
              <p class="uitleg-klein">Deze knoppen doen precies wat een echte melding doet: lampen, Google Home, pop-up op je telefoon en het grote scherm. Er staat steeds TEST bij.</p>
              <button class="test-knop rood" data-actie="test" data-soort="brand"><span class="i">🚒</span><div><b>Test melding post Nunspeet</b><small>Rood-wit knipperen, overloop, carport, buitendeur, Google Home en pop-up</small></div></button>
              <button class="test-knop blauw" data-actie="test" data-soort="politie"><span class="i">👮</span><div><b>Test politiemelding</b><small>Slaapkamerlamp blauw-wit, Google Home en blauw scherm</small></div></button>
              <div class="sub">Eigen testmelding</div>
              <div class="veld"><input id="eigen-tekst" placeholder="bijv. P 1 Woningbrand Molenstraat Nunspeet"></div>
              <div class="veld"><select id="eigen-soort"><option value="brand">🚒 Brandweer</option><option value="politie">👮 Politie</option></select><button data-actie="eigen-test">Verstuur</button></div>
            </div>
          </section>
          <section class="kolom k2">
            <div class="kaart">
              <h2>🔔 Deurbel</h2>
              <button class="test-knop" data-actie="test-deurbel"><span class="i">🔔</span><div><b>Test deurbel</b><small>Alle camera's live in beeld, ding-dong op de laptop en de Google Home</small></div></button>
            </div>
            <div class="kaart">
              <h2>🔊 Geluid van deze laptop</h2>
              <button class="test-knop" data-actie="geluid" data-geluid="sirene"><span class="i">🚨</span><div><b>Sirene</b><small>Het geluid bij een brandweermelding (5 seconden)</small></div></button>
              <button class="test-knop" data-actie="geluid" data-geluid="piep"><span class="i">📟</span><div><b>Piep</b><small>Het geluid bij een politiemelding</small></div></button>
              <button class="test-knop" data-actie="geluid" data-geluid="deurbel"><span class="i">🛎️</span><div><b>Ding-dong</b><small>Het deurbelgeluid</small></div></button>
            </div>
          </section>
          <section class="kolom k3">
            <div class="kaart">
              <h2>🗣️ Google Home laten praten</h2>
              <div class="veld"><select id="speaker"></select></div>
              <div class="veld"><input id="zeg-tekst" value="Dit is een test van Huis Sterkenburg."><button data-actie="zeg">Zeg het</button></div>
            </div>
            <div class="kaart">
              <h2>📺 Schermen bekijken</h2>
              <p class="uitleg-klein">Alleen op dit scherm, zonder lampen of Google Home.</p>
              <button class="test-knop" data-actie="voorbeeld" data-wat="brand"><span class="i">🔴</span><div><b>Alarmscherm brandweer</b></div></button>
              <button class="test-knop" data-actie="voorbeeld" data-wat="politie"><span class="i">🔵</span><div><b>Alarmscherm politie</b></div></button>
              <button class="test-knop" data-actie="voorbeeld" data-wat="deurbel"><span class="i">📷</span><div><b>Deurbelscherm</b></div></button>
              <button class="test-knop" data-actie="voorbeeld" data-wat="nacht"><span class="i">🌙</span><div><b>Nachtscherm (10 seconden)</b></div></button>
              <div class="sub">Licht of donker</div>
              <div class="veld"><select id="thema-keuze"><option value="auto">🌗 Automatisch (licht overdag, donker 's avonds)</option><option value="licht">☀️ Altijd licht</option><option value="donker">🌙 Altijd donker</option></select><button data-actie="thema">Opslaan</button></div>
            </div>
          </section>
        </main>

          </div>
        </div>
        <div class="deurbel" id="deurbel"></div>
        <div class="nacht" id="nacht"><div class="t" id="nachtklok"></div><div class="s" id="nachtinfo"></div><div class="s">Tik om het scherm te wekken</div></div>
        <div class="alarm" id="alarm"></div>
      </div>`;
    const root = this.shadowRoot;
    root.addEventListener("click", (e) => this._klik(e));
    root.addEventListener("input", (e) => this._invoer(e));
    root.addEventListener("contextmenu", (e) => {
      const el = e.target.closest("[data-meer]");
      if (el) {
        e.preventDefault();
        this._meerInfo(el.dataset.meer);
      }
    });
    this._actief = Date.now();
    ["pointerdown", "keydown", "wheel"].forEach((ev) => root.addEventListener(ev, () => (this._actief = Date.now()), { passive: true }));
    window.addEventListener("pointerdown", () => this._audio(), { once: true });
    this._audio();
    this._laadExtra();
    this._toonWeerTab();
    this._toonPagina(this._thuis);
    const naam = (this._hass.user?.name || "S").trim();
    this.shadowRoot.getElementById("avatar").textContent = naam[0].toUpperCase();
    try {
      this._hass.connection.subscribeEvents(() => this._deurbel({ test: true }), "meldkamer_deurbel");
    } catch (e) {
      /* geen abonnement mogelijk */
    }
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
  _a(id) {
    return this._s(id)?.attributes || {};
  }
  _ent(domein) {
    return Object.values(this._hass.states)
      .filter((s) => s.entity_id.startsWith(domein + ".") && !s.attributes.hidden && s.state !== "unavailable")
      .sort((a, b) => this._naam(a).localeCompare(this._naam(b)));
  }
  _naam(s) {
    return s.attributes.friendly_name || s.entity_id;
  }
  _veranderd(sleutel, waarde) {
    const h = typeof waarde === "string" ? waarde : JSON.stringify(waarde);
    if (this._handtekening[sleutel] === h) return false;
    this._handtekening[sleutel] = h;
    return true;
  }
  _sig(...ids) {
    return ids.map((id) => this._s(id)?.last_updated || "-").join("|");
  }
  _plek() {
    const i = this._a("sensor.meldkamer_instellingen");
    return { lat: i.lat ?? this._hass?.config?.latitude ?? 52.37, lon: i.lon ?? this._hass?.config?.longitude ?? 5.78 };
  }
  _p2000() {
    return this._a("sensor.meldkamer_laatste_melding");
  }

  // ---- tekenen ----

  _teken() {
    if (!this._hass) return;
    const storm = this._aan("input_boolean.meldkamer_stormmodus");
    if (storm !== this.hasAttribute("storm")) {
      this.toggleAttribute("storm", storm);
      this._weerTab = storm ? "bliksem" : "windy";
      this._toonWeerTab();
    }
    const zon = this._s("sun.sun");
    const uur = new Date().getHours();
    let dag = zon ? zon.state === "above_horizon" : uur >= 8 && uur < 17;
    let keuze = "auto";
    try {
      keuze = localStorage.getItem("meldkamer_thema") || "auto";
    } catch (e) {
      /* geen opslag */
    }
    if (keuze === "licht") dag = true;
    if (keuze === "donker") dag = false;
    const wk = this._pagina === "woonkamer";
    this.setAttribute("thema", dag || wk ? "licht" : "donker");
    this.toggleAttribute("avond", wk && !dag);
    this._tekenChips();
    this._tekenStorm();
    this._tekenHero();
    this._tekenHistorie();
    this._tekenNL();
    this._tekenPolitie();
    this._tekenVluchten();
    this._tekenGroet();
    this._tekenBediening();
    this._tekenCamInfo();
    this._tekenEnergie();
    this._tekenAgenda();
    this._tekenNieuws();
    this._tekenWeer();
    this._tekenDetail();
    this._tekenKnmi();
    this._tekenLucht();
    this._tekenZonMaan();
    this._tekenWoonkamer();
    this._controleerDeurbel();
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
    r.querySelectorAll("[data-sinds]").forEach((el) => (el.textContent = tijdGeleden(el.dataset.sinds)));
    const af = r.getElementById("aftel");
    if (af && this._alarmEind) af.textContent = `Sluit vanzelf over ${Math.max(0, Math.ceil((this._alarmEind - Date.now()) / 1000))} s`;
    this._tekenNacht(nu);
    const wt = r.getElementById("w-tijd");
    if (wt) wt.textContent = `${pad(nu.getHours())}:${pad(nu.getMinutes())}`;
    const stil = Date.now() - (this._actief || 0);
    if (this._meldkamerTot && Date.now() < this._meldkamerTot) {
      // Na een melding 10 minuten op het Meldkamer-tabblad blijven
      if (this._pagina !== "meldkamer" && stil > 30 * 1000) this._toonPagina("meldkamer");
    } else {
      if (this._meldkamerTot) {
        this._meldkamerTot = null;
        this._toonPagina(this._thuis);
      } else if (this._pagina !== this._thuis && stil > 5 * 60 * 1000) this._toonPagina(this._thuis);
    }
    if (this._nachtVoorbeeldTot && Date.now() > this._nachtVoorbeeldTot) this._nachtVoorbeeldTot = null;
    if (this.hasAttribute("modus") && !this._meldkamerTot && !r.getElementById("alarm").classList.contains("open")) this.removeAttribute("modus");
  }

  _tekenChips() {
    const ids = ["sensor.meldkamer_knmi", "sensor.meldkamer_weer", "sensor.meldkamer_vliegtuigen", "sensor.meldkamer_laatste_melding"];
    if (!this._veranderd("chips", this._sig(...ids))) return;
    const knmi = this._s("sensor.meldkamer_knmi");
    const weer = this._s("sensor.meldkamer_weer");
    const vl = this._s("sensor.meldkamer_vliegtuigen");
    const fout = this._p2000().fout;
    const nu = weer?.attributes?.nu || {};
    const code = knmi?.state;
    const chips = [`<div class="chip ${fout ? "fout" : ""}" title="${esc(fout || "")}"><span class="stip"></span>${fout ? "P2000 storing" : "P2000 live"}</div>`];
    if (weer && weer.state !== "unknown")
      chips.push(`<div class="chip">${weerIcoon(nu.weather_code, nu.is_day)} <b>${Math.round(weer.state)}°</b> ${windRichting(nu.wind_direction_10m)} ${beaufort(nu.wind_speed_10m)}</div>`);
    if (code && KNMI_KLEUR[code]) chips.push(`<div class="chip" style="border-color:${KNMI_KLEUR[code]};color:${KNMI_KLEUR[code]}">⚠️ <b style="color:inherit">Code ${esc(code)}</b></div>`);
    else if (knmi) chips.push(`<div class="chip extra">✅ Geen weeralarm</div>`);
    if (vl && vl.state !== "unknown") chips.push(`<div class="chip extra">✈️ <b>${esc(vl.state)}</b></div>`);
    this.shadowRoot.getElementById("chips").innerHTML = chips.join("");
  }

  _tekenStorm() {
    if (!this._veranderd("storm", this._sig("sensor.meldkamer_knmi", "input_boolean.meldkamer_stormmodus", "sensor.meldkamer_weer"))) return;
    const w = (this._a("sensor.meldkamer_knmi").waarschuwingen || [])[0];
    const nu = this._a("sensor.meldkamer_weer").nu || {};
    const tekst = w ? `Code ${esc(w.kleur)}: ${esc(w.soort)}${w.tot ? " · tot " + klokTijd(w.tot) : ""}` : "Geen officiële waarschuwing";
    this.shadowRoot.getElementById("storm").innerHTML = `
      <span class="bliksem">⚡</span> STORMMODUS <span style="opacity:.55">|</span> ${tekst}
      <span style="margin-left:auto">💨 Windstoten ${Math.round(nu.wind_gusts_10m ?? 0)} km/u</span>
      <button class="klein-knop" data-actie="toggle" data-id="input_boolean.meldkamer_stormmodus">Uitzetten</button>`;
  }

  // ---- Meldkamer-tabblad ----

  _meldingen() {
    return this._p2000().meldingen || [];
  }

  _badge(m) {
    if (m.proef) return `<span class="badge">PROEF</span>`;
    return `<span class="badge ${m.prio ? "p" + m.prio : ""}">${m.prio ? "P" + m.prio : "–"}</span>`;
  }

  _routeHtml(r) {
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
    if (!this._veranderd("hero", this._sig("sensor.meldkamer_laatste_melding"))) return;
    const d = this._p2000();
    const m = d.melding;
    const knoppen = `<button class="klein-knop" data-actie="test" data-soort="brand">🧪 Test brandweer</button><button class="klein-knop politie" data-actie="test" data-soort="politie">🧪 Test politie</button>`;
    const teller = `<div class="teller">
        <div><b>${d.vandaag ?? 0}</b><small>Vandaag</small></div><div><b>${d.week ?? 0}</b><small>Week</small></div>
        <div><b>${d.maand ?? 0}</b><small>Maand</small></div><div><b>${d.jaar ?? 0}</b><small>Jaar</small></div></div>`;
    const el = this.shadowRoot.getElementById("hero");
    if (!m) {
      el.innerHTML = `<h2>🚒 Laatste uitruk <span class="r">${knoppen}</span></h2>
        <div class="leeg">Nog geen uitruk van post Nunspeet ontvangen. Zodra de bevelvoerder of kazerne wordt gealarmeerd, zie je het hier.</div>${teller}`;
      return;
    }
    el.innerHTML = `
      <h2>🚒 Laatste uitruk <span class="r">${knoppen}</span></h2>
      <div class="hero-top">
        ${this._badge(m)}
        <span class="badge cat" style="color:${CAT_KLEUR[m.cat] || "#fff"}">${esc(m.cat || "Melding")}</span>
        ${m.test ? '<span class="badge" style="background:var(--geel);color:#000">TEST</span>' : ""}
        <span class="geleden" data-sinds="${esc(m.tijd)}">${tijdGeleden(m.tijd)}</span>
      </div>
      <div class="hero-titel">${esc(m.kort || m.titel)}</div>
      <div class="hero-adres">${m.adres ? "📍 " + esc(m.adres) + " · " : ""}${m.route ? m.route.afstand_km + " km van huis · " : ""}${klokTijd(m.tijd)}</div>
      ${(m.eenheden || []).length ? `<div class="eenheden">${m.eenheden.slice(0, 6).map((e) => `<span class="eenheid">${esc(e)}</span>`).join("")}</div>` : ""}
      ${this._routeHtml(m.route)}
      ${teller}`;
  }

  _tekenHistorie() {
    if (!this._veranderd("historie", this._sig("sensor.meldkamer_laatste_melding"))) return;
    const d = this._p2000();
    const r = this.shadowRoot;
    const dagen = d.per_dag || new Array(30).fill(0);
    const max = Math.max(2, ...dagen);
    const bw = 100 / dagen.length;
    const balken = dagen
      .map((n, i) => {
        const h = n ? Math.max(4, (n / max) * 84) : 1.2;
        return `<rect x="${i * bw + 0.5}" y="${88 - h}" width="${bw - 1}" height="${h}" rx="1" fill="${n ? (i === dagen.length - 1 ? "var(--accent)" : "#ff6b5e") : "var(--lege-balk)"}"><title>${n} melding(en)</title></rect>`;
      })
      .join("");
    const lijnen = [0.5, 1].map((f) => `<line x1="0" x2="100" y1="${88 - f * 84}" y2="${88 - f * 84}" stroke="#1f242b" stroke-width=".3"/>`).join("");
    const start = new Date(Date.now() - 29 * 86400000);
    r.getElementById("grafiek").innerHTML = `
      <svg viewBox="0 0 100 90" preserveAspectRatio="none">${lijnen}${balken}</svg>
      <div class="as"><span>${datumKort(start)}</span><span>laatste 30 dagen · max ${max}/dag</span><span>vandaag</span></div>`;
    const cats = Object.entries(d.per_cat || {}).filter(([k]) => k !== "Proefalarm").sort((a, b) => b[1] - a[1]);
    r.getElementById("cats").innerHTML = cats.map(([k, n]) => `<span><i style="background:${CAT_KLEUR[k] || "#888"}"></i>${esc(k)} <b>${n}</b></span>`).join("");
    r.getElementById("historie-info").textContent = d.totaal ? `${d.totaal} uitrukken bijgehouden` : "";
    const lijst = this._meldingen();
    r.getElementById("historie").innerHTML = lijst.length
      ? lijst
          .map(
            (m, i) => `<div class="rij ${m.proef ? "proef" : ""} ${i === 0 && !m.proef && Date.now() - new Date(m.tijd) < 3600000 ? "nieuw" : ""}">
            ${this._badge(m)}
            <div><div class="t">${esc(m.kort || m.titel)}</div><div class="s">${esc(m.adres || m.cat || "")}${m.route?.auto ? ` · 🚗 ${m.route.auto.minuten} min` : ""}</div></div>
            <div class="k">${datumKort(m.tijd)} ${klokTijd(m.tijd)}<br><span data-sinds="${esc(m.tijd)}">${tijdGeleden(m.tijd)}</span></div></div>`
          )
          .join("")
      : `<div class="leeg">De geschiedenis wordt vanaf nu opgebouwd. Elke uitruk van post Nunspeet komt hier te staan.</div>`;
  }

  _tekenNL() {
    if (!this._veranderd("nl", this._sig("sensor.meldkamer_laatste_melding"))) return;
    const lijst = (this._p2000().nl || []).slice(0, 6);
    this.shadowRoot.getElementById("nl").innerHTML = lijst.length
      ? lijst
          .map(
            (m) => `<div class="rij">${this._badge(m)}
            <div><div class="t">${esc(m.kort || m.titel)}</div><div class="s">${esc((m.eenheden || [])[0] || "")}</div></div>
            <div class="k">${klokTijd(m.tijd)}<br><span data-sinds="${esc(m.tijd)}">${tijdGeleden(m.tijd)}</span></div></div>`
          )
          .join("")
      : `<div class="leeg">Nog geen meldingen ontvangen.</div>`;
  }

  _tekenPolitie() {
    if (!this._veranderd("politie", this._sig("sensor.meldkamer_laatste_melding"))) return;
    const lijst = (this._p2000().politie || []).slice(0, 8);
    this.shadowRoot.getElementById("politie-info").textContent = "Nunspeet en omgeving";
    this.shadowRoot.getElementById("politie").innerHTML = lijst.length
      ? lijst
          .map(
            (m) => `<div class="rij">${this._badge(m)}
            <div><div class="t">${esc(m.kort || m.titel)}</div><div class="s">${esc(m.adres || "")}${m.test ? " · TEST" : ""}</div></div>
            <div class="k">${datumKort(m.tijd)} ${klokTijd(m.tijd)}<br><span data-sinds="${esc(m.tijd)}">${tijdGeleden(m.tijd)}</span></div></div>`
          )
          .join("")
      : `<div class="leeg">Geen politiemeldingen in Nunspeet, Elspeet, Vierhouten, Hulshorst of Doornspijk. 👍</div>`;
  }

  _tekenVluchten() {
    if (!this._veranderd("vlucht", this._sig("sensor.meldkamer_vliegtuigen"))) return;
    const lijst = (this._a("sensor.meldkamer_vliegtuigen").lijst || []).slice(0, 12);
    const straal = this._a("sensor.meldkamer_instellingen").vliegtuig_straal_km || 30;
    this.shadowRoot.getElementById("vlucht-info").textContent = `${lijst.length} binnen ${straal} km`;
    this.shadowRoot.getElementById("vluchten").innerHTML = lijst.length
      ? lijst
          .map((a) => {
            const type = VLIEGTUIG_TYPE[(a.type || "").toUpperCase()] || a.type || "Onbekend type";
            const mij = maatschappij(a.naam) || (a.reg?.startsWith("PH-") ? "Nederlands toestel" : "");
            return `<div class="vlucht ${a.helikopter ? "heli" : ""}">
              <div class="ic" style="${a.helikopter ? "" : `transform:rotate(${(a.koers || 0) - 45}deg)`}">${a.helikopter ? "🚁" : "✈"}</div>
              <div><div class="t">${esc(a.naam || a.reg || "?")}<small>${esc(mij)}</small></div><div class="s">${esc(type)}${a.reg ? " · " + esc(a.reg) : ""}</div></div>
              <div class="k"><b>${a.afstand_km} km</b>${a.hoogte_m != null ? a.hoogte_m.toLocaleString("nl-NL") + " m" : ""}${a.kmh != null ? " · " + a.kmh + " km/u" : ""}</div></div>`;
          })
          .join("")
      : `<div class="leeg">Geen vliegtuigen of helikopters in de buurt.</div>`;
  }

  // ---- Dashboard-tabblad ----

  // ---------- hulpjes voor het dashboard ----------

  _spark(waarden, kleur = "var(--accent)", vul = true) {
    const w = waarden.filter((x) => x != null && !isNaN(x));
    if (w.length < 2) return "";
    const min = Math.min(...w), max = Math.max(...w), sp = max - min || 1;
    const pts = w.map((v, i) => [(i / (w.length - 1)) * 100, 28 - ((v - min) / sp) * 24]);
    const lijn = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
    return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none">
      ${vul ? `<path d="${lijn} L100 30 L0 30Z" fill="${kleur}" opacity=".14"/>` : ""}
      <path d="${lijn}" fill="none" stroke="${kleur}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  _weerData() {
    return this._a("sensor.meldkamer_weer");
  }

  // Wanneer regent het vandaag, of wanneer is het weer droog?
  _regenZin() {
    const r = this._a("sensor.meldkamer_buienradar");
    const w = this._weerData();
    const nu = Date.now();
    const vandaag = new Date().toDateString();
    const uren = (w.uren || []).filter((u) => new Date(u.tijd).toDateString() === vandaag && new Date(u.tijd).getTime() >= nu - 3600000);
    const nat = (u) => (u.regen ?? 0) >= 0.2 || (u.regenkans ?? 0) >= 60;
    if ((r.nu ?? 0) >= 0.1) {
      if (r.samenvatting && /droog/.test(r.samenvatting)) return { icoon: "🌧️", tekst: r.samenvatting.replace("Regen, droog rond", "Het regent nu, droog rond") };
      const droog = uren.find((u) => !nat(u) && new Date(u.tijd).getTime() > nu);
      return { icoon: "🌧️", tekst: droog ? `Het regent nu, droog rond ${klokTijd(droog.tijd)}` : "Het regent nu, vandaag blijft het nat" };
    }
    if (r.samenvatting && /verwacht rond/.test(r.samenvatting)) return { icoon: "🌦️", tekst: r.samenvatting };
    const eerste = uren.find(nat);
    if (eerste) {
      const daarna = uren.find((u) => new Date(u.tijd) > new Date(eerste.tijd) && !nat(u));
      return { icoon: "🌦️", tekst: `Regen vanaf ${klokTijd(eerste.tijd)} (${eerste.regenkans ?? "?"}%)${daarna ? `, droog rond ${klokTijd(daarna.tijd)}` : ""}` };
    }
    return { icoon: "☀️", tekst: "Vandaag blijft het droog" };
  }

  // Moet je morgenvroeg de autoruiten krabben?
  _krabben() {
    const uren = this._weerData().uren || [];
    const ochtend = uren.filter((u) => {
      const d = new Date(u.tijd);
      return d.getTime() > Date.now() && d.getHours() >= 4 && d.getHours() <= 8;
    });
    if (!ochtend.length) return null;
    const koudste = ochtend.reduce((a, b) => (b.temp < a.temp ? b : a));
    const morgen = new Date(koudste.tijd).toDateString() !== new Date().toDateString();
    const wanneer = morgen ? "Morgenvroeg" : "Vanochtend";
    const t = Math.round(koudste.temp * 10) / 10;
    const vocht = koudste.vocht ?? 85;
    const dauwDicht = koudste.dauw != null ? koudste.temp - koudste.dauw <= 2 : vocht >= 85;
    if (koudste.temp <= 0 && (dauwDicht || vocht >= 75)) return { niveau: "ja", tekst: `${wanneer} ${t}°: ruiten krabben 🧊` };
    if (koudste.temp <= 0) return { niveau: "misschien", tekst: `${wanneer} ${t}°: kans op ijs op de ruit` };
    if (koudste.temp <= 2.5 && dauwDicht && (koudste.wolken ?? 100) < 60) return { niveau: "misschien", tekst: `${wanneer} ${t}°: mogelijk een bevroren ruit` };
    return null;
  }

  _zonVoortgang() {
    const d0 = (this._weerData().dagen || [])[0] || {};
    const op = new Date(d0.zonop), onder = new Date(d0.zononder);
    if (isNaN(op) || isNaN(onder)) return null;
    const nu = Date.now();
    return { op, onder, f: Math.max(0, Math.min(1, (nu - op) / (onder - op))), dag: nu > op && nu < onder };
  }

  _groetWoord() {
    const u = new Date().getHours();
    return u < 6 ? "Goedenacht" : u < 12 ? "Goedemorgen" : u < 18 ? "Goedemiddag" : "Goedenavond";
  }

  // ---------- Dashboard ----------

  _tekenGroet() {
    const sig = this._sig("sensor.meldkamer_weer", "sensor.meldkamer_buienradar", "sun.sun") + new Date().getMinutes();
    if (!this._veranderd("groet", sig)) return;
    const r = this.shadowRoot;
    const nu = new Date();
    const naam = (this._hass.user?.name || "").split(" ")[0];
    r.getElementById("d-kop").innerHTML = `
      <div><h3>${this._groetWoord()}${naam ? `, <i>${esc(naam)}</i>` : ""}</h3>
        <p>${nu.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })} · week ${this._weekNr(nu)} · Nunspeet</p></div>
      <div class="pillen">
        <button class="pil" data-actie="pagina" data-pagina="weer">⛈️ Weer & storm</button>
        <button class="pil donker" data-actie="alle" data-dienst="turn_off">🌑 Alle lampen uit</button>
      </div>`;
    const w = this._weerData();
    const n = w.nu || {};
    const d0 = (w.dagen || [])[0] || {};
    const regen = this._regenZin();
    const krab = this._krabben();
    const zon = this._zonVoortgang();
    const dl = this._daglicht(d0);
    let ring = "";
    if (zon) {
      const omtrek = 2 * Math.PI * 62;
      const hoek = zon.f * 2 * Math.PI - Math.PI / 2;
      const zx = 75 + Math.cos(hoek) * 62 - 11, zy = 75 + Math.sin(hoek) * 62 - 11;
      const rest = zon.dag ? zon.onder - Date.now() : 0;
      ring = `<div class="ring"><svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="62" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="9"/>
          <circle cx="75" cy="75" r="62" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-dasharray="${omtrek}" stroke-dashoffset="${omtrek * (1 - zon.f)}"/></svg>
        ${zon.dag ? `<div class="zonnetje" style="left:${zx}px;top:${zy}px">☀️</div>` : ""}
        <div class="midden"><div><b>${zon.dag ? Math.round(zon.f * 100) + "%" : "🌙"}</b><small>${zon.dag ? `zon onder over<br>${Math.floor(rest / 3600000)}u ${pad(Math.floor((rest % 3600000) / 60000))}m` : `zon op ${klokTijd(d0.zonop)}`}</small></div></div></div>`;
    }
    r.getElementById("d-hero").innerHTML = n.temperature_2m == null
      ? `<div><span class="label-pil">Vandaag in Nunspeet</span><div class="hero-groot">Het weer wordt <i>geladen</i>…</div></div>`
      : `<div>
        <span class="label-pil">Vandaag in Nunspeet</span>
        <div class="hero-groot">${weerIcoon(n.weather_code, n.is_day)} <i>${weerTekst(n.weather_code).toLowerCase()}</i> en ${Math.round(n.temperature_2m)}°</div>
        <div class="zacht" style="font-size:13.5px">${regen.icoon} ${esc(regen.tekst)}${krab ? ` · ${esc(krab.tekst)}` : ""}</div>
        <div class="hero-stats">
          <div>Max / min<b>${Math.round(d0.max ?? 0)}° / ${Math.round(d0.min ?? 0)}°</b></div>
          <div>Vochtigheid<b>${Math.round(n.relative_humidity_2m ?? 0)}%</b></div>
          <div>Wind<b>${windRichting(n.wind_direction_10m)} ${beaufort(n.wind_speed_10m)}</b></div>
          <div>Daglicht<b>${dl ? Math.floor(dl / 3600) + "u" + pad(Math.round((dl % 3600) / 60)) : "–"}</b></div>
        </div>
        <div class="hero-knoppen"><button data-actie="pagina" data-pagina="weer">Weerbericht ↗</button><button data-actie="pagina" data-pagina="woonkamer">🛋️ Woonkamer</button></div>
      </div>${ring}`;
  }

  _daglicht(d0) {
    if (d0.daglicht) return d0.daglicht;
    const op = new Date(d0.zonop), onder = new Date(d0.zononder);
    return isNaN(op) || isNaN(onder) ? null : (onder - op) / 1000;
  }

  _weekNr(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dag = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dag);
    return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  }

  _instelling(sleutel, standaard) {
    const v = this._a("sensor.meldkamer_instellingen")[sleutel];
    return v == null ? standaard : v;
  }

  _zoekNaam(lijst, woord) {
    const w = String(woord).toLowerCase();
    return lijst.find((l) => this._naam(l).toLowerCase() === w) || lijst.find((l) => this._naam(l).toLowerCase().includes(w)) || null;
  }

  _tekenBediening() {
    const lampen = this._ent("light");
    const luiken = this._ent("cover");
    const toggles = [
      ["input_boolean.meldkamer_brandalarm_pauze", "🚨 Alarm", true],
      ["input_boolean.meldkamer_rolluiken_pauze", "🪟 Rolluiken auto", true],
      ["input_boolean.meldkamer_nachtmodus_uit", "🌙 Nachtscherm", true],
      ["input_boolean.meldkamer_stormmodus", "⚡ Stormmodus", false],
    ];
    const inst = this._a("sensor.meldkamer_instellingen");
    const sig = [...lampen, ...luiken].map((s) => s.entity_id + s.last_updated).join() + this._sig(...toggles.map((t) => t[0]), "sensor.meldkamer_instellingen");
    if (!this._veranderd("bediening", sig)) return;
    const hoofd = this._zoekNaam(lampen, inst.hoofdlamp || "lamp sem");
    const gekozen = [];
    (inst.dashboard_lampen || ["overloop", "woonkamer", "carport", "wc"]).forEach((w) => {
      const l = this._zoekNaam(lampen.filter((x) => x !== hoofd && !gekozen.includes(x)), w);
      if (l) gekozen.push(l);
    });
    const kleurVan = (l) => {
      const rgb = l.attributes.rgb_color;
      return l.state === "on" ? (rgb ? `rgb(${rgb.join(",")})` : "#ffd60a") : "#333";
    };
    const pct = (l) => (l.state === "on" && l.attributes.brightness ? Math.round((l.attributes.brightness / 255) * 100) : 0);
    const hoofdHtml = hoofd
      ? `<div class="hoofdlamp ${hoofd.state === "on" ? "aan" : ""}">
          <button class="bol" data-actie="toggle" data-id="${esc(hoofd.entity_id)}" style="background:${hoofd.state === "on" ? kleurVan(hoofd) : "#2a2f37"};box-shadow:${hoofd.state === "on" ? "0 0 16px " + kleurVan(hoofd) : "none"}">💡</button>
          <button style="text-align:left" data-actie="toggle" data-id="${esc(hoofd.entity_id)}" data-meer="${esc(hoofd.entity_id)}"><div class="n">${esc(this._naam(hoofd))}</div><div class="s">${hoofd.state === "on" ? pct(hoofd) + "% aan" : "Uit"}</div></button>
          <input type="range" min="1" max="100" value="${pct(hoofd) || 1}" data-dimmer="${esc(hoofd.entity_id)}" aria-label="Helderheid">
        </div>`
      : "";
    const lampHtml = gekozen
      .map(
        (l) => `<button class="lamp ${l.state === "on" ? "aan" : ""}" data-actie="toggle" data-id="${esc(l.entity_id)}" data-meer="${esc(l.entity_id)}" title="Rechtsklik voor helderheid en kleur">
          <span class="bol" style="background:${kleurVan(l)};color:${kleurVan(l)}"></span><span class="n">${esc(this._naam(l))}</span><span class="s">${l.state === "on" ? pct(l) + "%" : "Uit"}</span></button>`
      )
      .join("");
    const luik = this._zoekNaam(luiken, inst.hoofdrolluik || "sem");
    const luikRij = (naam, ids, status) => `<div class="luik"><div class="n">${naam}${status ? `<div class="s">${status}</div>` : ""}</div>
          <button data-actie="luik" data-dienst="open_cover" data-id="${ids}" title="Open">▲</button>
          <button data-actie="luik" data-dienst="stop_cover" data-id="${ids}" title="Stop">■</button>
          <button data-actie="luik" data-dienst="close_cover" data-id="${ids}" title="Dicht">▼</button></div>`;
    const status = (c) => {
      const pos = c.attributes.current_position;
      return ({ open: "Open", closed: "Dicht", opening: "Gaat open…", closing: "Gaat dicht…" }[c.state] || c.state) + (pos != null ? " · " + pos + "%" : "");
    };
    const toggleHtml = toggles
      .map(([id, label, omgekeerd]) => {
        if (!this._s(id)) return "";
        const aan = omgekeerd ? !this._aan(id) : this._aan(id);
        return `<button class="toggle ${aan ? "aan" : ""}" data-actie="toggle" data-id="${id}">${label}<span class="sw"></span></button>`;
      })
      .join("");
    this.shadowRoot.getElementById("bediening").innerHTML = `
      <h2>💡 Verlichting <span class="r">${lampen.filter((l) => l.state === "on").length} van ${lampen.length} aan</span></h2>
      <div class="scroll">
        ${hoofdHtml}
        ${gekozen.length ? `<div class="drie">${lampHtml}</div>` : `<div class="leeg">Geen lampen gevonden met de namen overloop, woonkamer, carport of wc.</div>`}
        ${lampen.length ? `<div class="alle" style="margin-top:8px"><button class="aan-knop" data-actie="alle" data-dienst="turn_on">💡 Alle lampen aan</button><button data-actie="alle" data-dienst="turn_off">🌑 Alle lampen uit</button></div>` : ""}
        ${luiken.length ? `<div class="sub">🪟 Rolluiken</div><div class="luiken" style="margin-top:0">
          ${luik ? luikRij(esc(this._naam(luik)), esc(luik.entity_id), status(luik)) : ""}
          ${luiken.length > 1 ? luikRij("Alle rolluiken", luiken.map((c) => c.entity_id).join(","), "") : ""}</div>` : ""}
      </div>
      <div class="toggles">${toggleHtml}</div>`;
  }

  // Camera's: per camera kiezen of hij altijd live staat (per apparaat onthouden)
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
    return cams.filter((c) => !(c.entity_id.endsWith("_last_recording") && ids.has(c.entity_id.replace(/_last_recording$/, "_live_view"))));
  }
  async _kaartHulp() {
    if (!window.loadCardHelpers) {
      try {
        const r = document.createElement("partial-panel-resolver");
        const panels = [{ component_name: "lovelace", url_path: "huis-tmp" }];
        let routes;
        if (r.getRoutes) routes = r.getRoutes(panels);
        else {
          r.hass = { panels };
          r._updateRoutes();
          routes = r.routerOptions;
        }
        await routes?.routes?.["huis-tmp"]?.load?.();
      } catch (e) {
        /* andere versie van Home Assistant */
      }
      for (let i = 0; i < 50 && !window.loadCardHelpers; i++) await new Promise((r) => setTimeout(r, 100));
    }
    return window.loadCardHelpers ? window.loadCardHelpers() : null;
  }
  async _liveKaart(id) {
    if (this._liveKaarten[id]) return this._liveKaarten[id];
    const helpers = await this._kaartHulp();
    if (!helpers) return null;
    const kaart = helpers.createCardElement({
      type: "picture-entity", entity: id, camera_view: "live", show_name: false, show_state: false, tap_action: { action: "more-info" },
    });
    kaart.hass = this._hass;
    this._liveKaarten[id] = kaart;
    return kaart;
  }
  _camVak(c, isLive) {
    return `<div class="cam" ${isLive ? "" : `data-actie="meer"`} data-id="${esc(c.entity_id)}">
      ${isLive ? `<div class="live-houder"></div><b class="live">● LIVE</b>` : `<img alt="">`}
      <button class="live-knop ${isLive ? "aan" : ""}" data-actie="live" data-id="${esc(c.entity_id)}">📡 ${isLive ? "Live" : "Altijd live"}</button>
      <span>📷 ${esc(this._naam(c).replace(/ live view$/i, ""))}</span></div>`;
  }
  _tekenCams() {
    const grid = this.shadowRoot.getElementById("camgrid");
    const cams = this._camLijst();
    const live = this._liveLijst();
    const structuur = cams.map((c) => c.entity_id + (live.includes(c.entity_id) ? ":live" : "")).join();
    if (!cams.length) {
      grid.innerHTML = `<div class="leeg">Nog geen camera's gekoppeld.</div>`;
      this._camStructuur = structuur;
      return;
    }
    if (this._camStructuur !== structuur) {
      this._camStructuur = structuur;
      const groot = cams.filter((c) => live.includes(c.entity_id));
      const klein = cams.filter((c) => !live.includes(c.entity_id));
      // Zonder live camera's: de eerste twee groot tonen
      const grootLijst = groot.length ? groot : klein.slice(0, 2);
      const kleinLijst = groot.length ? klein : klein.slice(2);
      grid.innerHTML =
        grootLijst.map((c) => this._camVak(c, live.includes(c.entity_id))).join("") +
        (kleinLijst.length ? `<div class="klein">${kleinLijst.map((c) => this._camVak(c, false)).join("")}</div>` : "");
      grid.querySelectorAll(".cam").forEach(async (vak) => {
        const houder = vak.querySelector(".live-houder");
        if (!houder) return;
        const kaart = await this._liveKaart(vak.dataset.id);
        if (kaart) houder.appendChild(kaart);
      });
    }
    grid.querySelectorAll(".cam img").forEach((img) => {
      const c = this._s(img.closest(".cam").dataset.id);
      if (c?.attributes?.entity_picture) img.src = `${c.attributes.entity_picture}&t=${Date.now()}`;
    });
  }
  _ververstCams() {
    if (this._pagina === "dashboard") this._tekenCams();
    if (this._pagina === "woonkamer") this._tekenWkCams();
  }
  _tekenCamInfo() {
    const n = this._camLijst().length;
    const el = this.shadowRoot.getElementById("cam-info");
    if (el) el.textContent = n ? `${n} camera's · tik voor live beeld` : "";
    if (this._veranderd("camlijst", this._camLijst().map((c) => c.entity_id).join())) this._tekenCams();
  }

  _vermogenSensoren() {
    const alle = Object.values(this._hass.states).filter((s) => s.attributes.device_class === "power" && !isNaN(parseFloat(s.state)));
    const naam = (s) => (s.entity_id + " " + this._naam(s)).toLowerCase();
    const naarW = (s) => parseFloat(s.state) * (s.attributes.unit_of_measurement === "kW" ? 1000 : 1);
    const isPaneel = (s) => /inverter|micro|paneel/.test(naam(s));
    const isZonTotaal = (s) => !isPaneel(s) && /envoy|current power production|solar|zon|pv|productie/.test(naam(s));
    const isFase = (s) => /_l[123]\b|phase|fase/.test(s.entity_id);
    const net = alle.find((s) => !isPaneel(s) && !isZonTotaal(s) && !isFase(s) && /p1|dsmr|homewizard|power$|vermogen/.test(naam(s)));
    const zonTotaal = alle.find(isZonTotaal) || null;
    const panelen = alle.filter(isPaneel);
    return { net, zonTotaal, panelen, naarW };
  }

  _tekenEnergie() {
    const { net, zonTotaal, panelen, naarW } = this._vermogenSensoren();
    const w = this._weerData();
    const sig = [net, zonTotaal, ...panelen].map((s) => s && s.state).join() + JSON.stringify(this._energie) + this._sig("sensor.meldkamer_weer", "sensor.meldkamer_laatste_melding");
    if (!this._veranderd("energie", sig)) return;
    const r = this.shadowRoot;
    const fmt = (x) => (Math.abs(x) >= 1000 ? (x / 1000).toFixed(1) + " kW" : Math.round(x) + " W");
    const e = this._energie || {};
    const n = w.nu || {};
    const temps = (w.uren || []).filter((u) => new Date(u.tijd).getTime() >= Date.now() - 3600000).slice(0, 12).map((u) => u.temp);
    const verschil = temps.length > 6 ? Math.round(temps[6] - temps[0]) : null;
    r.getElementById("t-temp").innerHTML = `
      <div class="boven"><span class="ic">🌡️</span>${verschil != null ? `<span class="chg" style="${verschil < 0 ? "background:rgba(14,127,194,.15);color:var(--cyaan)" : ""}">${verschil >= 0 ? "↑" : "↓"} ${Math.abs(verschil)}° in 6u</span>` : ""}</div>
      <div class="waarde">${n.temperature_2m != null ? Math.round(n.temperature_2m) + "°" : "–"}</div>
      <div class="onder"><div><div class="lbl">Buiten</div><div class="sub">voelt als ${n.apparent_temperature != null ? Math.round(n.apparent_temperature) + "°" : "–"} · ${Math.round(n.relative_humidity_2m ?? 0)}% vocht</div></div>${this._spark(temps)}</div>`;
    const zonW = zonTotaal ? naarW(zonTotaal) : panelen.reduce((t, s) => t + naarW(s), 0);
    r.getElementById("t-zon").innerHTML = `
      <div class="boven"><span class="ic">☀️</span>${e.zon != null ? `<span class="chg">${e.zon.toFixed(1)} kWh vandaag</span>` : ""}</div>
      <div class="waarde">${zonTotaal || panelen.length ? fmt(zonW) : "–"}</div>
      <div class="onder"><div><div class="lbl">Zonnepanelen</div><div class="sub">${panelen.length ? panelen.length + " panelen · " : ""}opbrengst nu</div></div>${this._spark((e.uren || []).map((u) => u.zon), "#f59e0b")}</div>`;
    const verbruik = e.stroom != null ? e.stroom + (e.zon || 0) - (e.terug || 0) : null;
    const netW = net ? naarW(net) : null;
    r.getElementById("t-stroom").innerHTML = `
      <div class="boven"><span class="ic">⚡</span>${netW != null ? `<span class="chg" style="${netW > 0 ? "background:rgba(239,91,57,.14);color:var(--accent)" : ""}">${netW < 0 ? "terug " : "net "}${fmt(Math.abs(netW))}</span>` : ""}</div>
      <div class="waarde">${verbruik != null ? verbruik.toFixed(1) : "–"}<span style="font-size:14px"> kWh</span></div>
      <div class="onder"><div><div class="lbl">Stroom vandaag</div><div class="sub">${e.gas != null ? "gas " + e.gas.toFixed(2) + " m³" : "verbruik in huis"}</div></div>${this._spark((e.uren || []).map((u) => u.verbruik), "#0e7fc2")}</div>`;
    const d = this._p2000();
    const m = (d.meldingen || []).find((x) => !x.proef && /nunspeet|elspeet|hulshorst|vierhouten/i.test((x.titel || "") + " " + (x.adres || "")));
    r.getElementById("t-melding").innerHTML = `
      <div class="boven"><span class="ic">🚒</span><span class="chg">${m ? (m.prio ? "P" + m.prio : "melding") : "rustig"}</span></div>
      <div class="waarde">${m ? esc(m.kort || m.titel) : "Geen uitrukken"}</div>
      <div class="onder"><div><div class="sub">${m ? `<span data-sinds="${esc(m.tijd)}">${tijdGeleden(m.tijd)}</span> · ${d.week ?? 0} deze week` : "Laatste melding Nunspeet"}</div></div>${this._spark((d.per_dag || []).slice(-14), "#fff", false)}</div>`;
  }

  async _laadEnergie() {
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
      Object.keys(ids).forEach((k) => (ids[k] = ids[k].filter(Boolean)));
      const alle = [...ids.stroom, ...ids.terug, ...ids.zon, ...ids.gas];
      if (!alle.length) throw new Error("geen energie-instellingen");
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const stats = await this._hass.callWS({
        type: "recorder/statistics_during_period", start_time: start.toISOString(), period: "hour", statistic_ids: alle, types: ["change"],
      });
      const uurSom = (lijst) => {
        const arr = new Array(24).fill(0);
        lijst.forEach((id) =>
          (stats[id] || []).forEach((p) => {
            const u = new Date(typeof p.start === "number" ? p.start : Date.parse(p.start)).getHours();
            arr[u] += p.change || 0;
          })
        );
        return arr;
      };
      const st = uurSom(ids.stroom), te = uurSom(ids.terug), zo = uurSom(ids.zon), ga = uurSom(ids.gas);
      const som = (a) => a.reduce((t, x) => t + x, 0);
      const uit = {};
      if (ids.stroom.length) uit.stroom = som(st);
      if (ids.terug.length) uit.terug = som(te);
      if (ids.zon.length) uit.zon = som(zo);
      if (ids.gas.length) uit.gas = som(ga);
      uit.uren = st.map((_, i) => ({ zon: zo[i], verbruik: Math.max(0, st[i] + zo[i] - te[i]) }));
      this._energie = uit;
    } catch (e) {
      this._energie = null;
    }
    this._handtekening.energie = null;
    this._tekenEnergie();
  }

  async _laadAgenda() {
    const agendas = this._ent("calendar");
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const eind = new Date(start.getTime() + 15 * 86400000);
    const items = [];
    for (const a of agendas) {
      try {
        const r = await this._hass.callApi("GET", `calendars/${a.entity_id}?start=${start.toISOString()}&end=${eind.toISOString()}`);
        const isVerjaardag = /verjaar|birthday|jarig/i.test(a.entity_id + " " + this._naam(a));
        r.forEach((ev) => items.push({ ...ev, verjaardag: isVerjaardag || /jarig|verjaardag|birthday/i.test(ev.summary || "") }));
      } catch (e) {
        /* agenda niet bereikbaar */
      }
    }
    const tijd = (x) => new Date(x.dateTime || x.date + "T00:00");
    items.sort((a, b) => tijd(a.start) - tijd(b.start));
    const nu = new Date();
    const over4 = new Date(start.getTime() + 4 * 86400000);
    this._agenda = items.filter((ev) => !ev.verjaardag && tijd(ev.end) > nu && tijd(ev.start) < over4).slice(0, 6);
    this._verjaardagen = items.filter((ev) => ev.verjaardag).slice(0, 5);
    this._handtekening.agenda = null;
    this._handtekening.woonkamer = null;
    this._tekenAgenda();
    this._tekenWoonkamer();
  }

  _afvalInfo() {
    const v = this._a("sensor.meldkamer_afval").volgende;
    if (!v) return null;
    const iconen = { gft: "🟢", groen: "🟢", rest: "⚫", papier: "🔵", plastic: "🟠", pmd: "🟠", glas: "🟣" };
    const icoon = Object.entries(iconen).find(([k]) => v.soort.toLowerCase().includes(k))?.[1] || "🗑️";
    const wanneer = v.dagen === 0 ? "Vandaag" : v.dagen === 1 ? "Morgen" : `Over ${v.dagen} dagen`;
    return { ...v, icoon, wanneer };
  }

  _evTijd(ev) {
    if (!ev.start.dateTime) return "Hele dag";
    const d = new Date(ev.start.dateTime);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  _evDag(ev) {
    const d = new Date(ev.start.dateTime || ev.start.date + "T00:00");
    const v = new Date();
    v.setHours(0, 0, 0, 0);
    const x = Math.round((new Date(d).setHours(0, 0, 0, 0) - v) / 86400000);
    return x === 0 ? "Vandaag" : x === 1 ? "Morgen" : d.toLocaleDateString("nl-NL", { weekday: "long" });
  }

  _tekenAgenda() {
    const sig = this._sig("sensor.meldkamer_afval") + JSON.stringify(this._agenda) + JSON.stringify(this._verjaardagen) + new Date().getDate();
    if (!this._veranderd("agenda", sig)) return;
    const nu = new Date();
    const maandag = new Date(nu);
    maandag.setDate(nu.getDate() - ((nu.getDay() + 6) % 7));
    const dagen = Array.from({ length: 7 }, (_, i) => new Date(maandag.getTime() + i * 86400000));
    const afval = this._afvalInfo();
    const items = [];
    if (afval && afval.dagen <= 2) items.push(`<div class="afspraak-kaart"><span class="streep" style="background:var(--goed)"></span><span>${afval.icoon}</span><span><b>${afval.wanneer}</b> ${esc(afval.soort)}</span><span class="tag">afval</span></div>`);
    this._verjaardagen.slice(0, 1).forEach((ev) => items.push(`<div class="afspraak-kaart"><span class="streep" style="background:#ec4899"></span><span>🎂</span><span><b>${this._evDag(ev)}</b> ${esc(ev.summary)}</span></div>`));
    this._agenda.slice(0, Math.max(0, 3 - items.length)).forEach((ev) =>
      items.push(`<div class="afspraak-kaart"><span class="w">${this._evTijd(ev)}</span><span class="streep"></span><span>${esc(ev.summary)}</span>${this._evDag(ev) !== "Vandaag" ? `<span class="tag">${this._evDag(ev)}</span>` : ""}</div>`)
    );
    if (afval && afval.dagen > 2 && items.length < 3) items.push(`<div class="afspraak-kaart"><span class="streep" style="background:var(--goed)"></span><span>${afval.icoon}</span><span>${esc(afval.soort)} · ${afval.wanneer.toLowerCase()}</span></div>`);
    const vandaag = this._agenda.filter((e) => this._evDag(e) === "Vandaag").length;
    this.shadowRoot.getElementById("d-datum").innerHTML = `
      <div class="dag-kop"><span class="nr">${pad(nu.getDate())}</span><div><b style="text-transform:capitalize">${nu.toLocaleDateString("nl-NL", { weekday: "long" })}</b>
        <small>${nu.toLocaleDateString("nl-NL", { month: "long", year: "numeric" })} · ${vandaag} ${vandaag === 1 ? "afspraak" : "afspraken"} vandaag</small></div></div>
      <div class="week">${dagen.map((d) => `<div class="${d.toDateString() === nu.toDateString() ? "vandaag" : ""}">${d.toLocaleDateString("nl-NL", { weekday: "short" }).slice(0, 2)}<b>${d.getDate()}</b></div>`).join("")}</div>
      ${items.length ? items.join("") : `<div class="afspraak-kaart"><span>☕</span><span>Geen afspraken de komende dagen</span></div>`}`;
  }

  // ---------- Woonkamer ----------

  _tekenWoonkamer() {
    if (!this._hass || this._pagina !== "woonkamer") return;
    const lampen = this._ent("light");
    const luiken = this._ent("cover");
    const sig =
      this._sig("sensor.meldkamer_weer", "sensor.meldkamer_buienradar", "sensor.meldkamer_afval", "sun.sun") +
      [...lampen, ...luiken].map((x) => x.entity_id + x.state + x.attributes.brightness + (x.attributes.current_position ?? "")).join() +
      JSON.stringify(this._agenda) + JSON.stringify(this._verjaardagen) + new Date().getMinutes();
    if (!this._veranderd("woonkamer", sig)) return;
    const r = this.shadowRoot;
    const w = this._weerData();
    const n = w.nu || {};
    const d0 = (w.dagen || [])[0] || {};
    const nu = new Date();
    const mn = maan(nu);
    r.getElementById("w-klok").innerHTML = `
      <div class="w-groet">${this._groetWoord()} <i>✦</i></div>
      <div><div class="w-tijd" id="w-tijd">${pad(nu.getHours())}:${pad(nu.getMinutes())}</div>
      <div class="w-datum">${nu.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div></div>
      <div class="w-zon"><span class="pil">🌅 ${klokTijd(d0.zonop) || "–"}</span><span class="pil">🌇 ${klokTijd(d0.zononder) || "–"}</span><span class="pil">${mn.icoon} ${mn.naam}</span></div>`;
    const regen = this._regenZin();
    const krab = this._krabben();
    const uren = (w.uren || []).filter((u) => new Date(u.tijd).getTime() >= Date.now() - 3600000).slice(0, 8);
    r.getElementById("w-weer").innerHTML = n.temperature_2m == null
      ? `<h2>🌤️ Weer</h2><div class="leeg">Het weer wordt geladen…</div>`
      : `<div class="w-weer-boven">
          <span class="ic">${weerIcoon(n.weather_code, n.is_day)}</span>
          <div><div class="t">${Math.round(n.temperature_2m)}°</div><div class="om">${weerTekst(n.weather_code)} · voelt als ${Math.round(n.apparent_temperature)}°</div></div>
          <div class="stats"><div>Vochtigheid<b>${Math.round(n.relative_humidity_2m ?? 0)}%</b></div><div>Wind<b>${windRichting(n.wind_direction_10m)} ${beaufort(n.wind_speed_10m)}</b></div><div>Max / min<b>${Math.round(d0.max ?? 0)}° / ${Math.round(d0.min ?? 0)}°</b></div></div>
        </div>
        <div class="w-uren">${uren
          .map((u, i) => {
            const d = new Date(u.tijd);
            return `<div>${i === 0 ? "Nu" : pad(d.getHours()) + ":00"}<span class="i">${weerIcoon(u.code, d.getHours() >= 8 && d.getHours() < 17 ? 1 : 0)}</span><b>${Math.round(u.temp)}°</b><span class="kans">${u.regenkans ?? 0}%</span></div>`;
          })
          .join("")}</div>
        <div class="w-meldingen">
          <span class="w-tip let">${regen.icoon} ${esc(regen.tekst)}</span>
          ${krab ? `<span class="w-tip vorst">${krab.niveau === "ja" ? "🧊" : "❄️"} ${esc(krab.tekst)}</span>` : `<span class="w-tip">🚗 Geen ijs op de ruit verwacht</span>`}
        </div>`;
    const kleurVan = (l) => {
      const rgb = l.attributes.rgb_color;
      return l.state === "on" ? (rgb ? `rgb(${rgb.join(",")})` : "#f5b301") : "#cfc5bc";
    };
    const pct = (l) => (l.state === "on" && l.attributes.brightness ? Math.round((l.attributes.brightness / 255) * 100) : 0);
    const inst = this._a("sensor.meldkamer_instellingen");
    let kamer = lampen.filter((l) => /woonkamer|living/i.test(this._naam(l)));
    // Aanvullen met de vaste lampen van het dashboard, zodat er geen lege plek is
    [inst.hoofdlamp || "lamp sem", ...(inst.dashboard_lampen || [])].forEach((x) => {
      const l = this._zoekNaam(lampen, x);
      if (l && !kamer.includes(l)) kamer.push(l);
    });
    kamer = kamer.slice(0, 6);
    const ids = luiken.map((c) => c.entity_id).join(",");
    r.getElementById("w-licht").innerHTML = `
      <h2>💡 Woonkamer <span class="r">${lampen.filter((l) => l.state === "on").length} lampen aan</span></h2>
      <div class="w-lampen">${
        kamer
          .map(
            (l) => `<button class="lamp ${l.state === "on" ? "aan" : ""}" data-actie="toggle" data-id="${esc(l.entity_id)}" data-meer="${esc(l.entity_id)}">
          <span class="bol" style="background:${kleurVan(l)};color:${kleurVan(l)}"></span><span class="n">${esc(this._naam(l))}</span><span class="s">${l.state === "on" ? pct(l) + "%" : "Uit"}</span></button>`
          )
          .join("") || `<div class="leeg">Geen woonkamerlampen gevonden.</div>`
      }</div>
      <div class="alle" style="margin:10px 0 8px"><button class="aan-knop" data-actie="alle" data-dienst="turn_on">💡 Alles aan</button><button data-actie="alle" data-dienst="turn_off">🌑 Alles uit</button></div>
      ${luiken.length ? `<div class="luik"><div class="n">🪟 Rolluiken<div class="s">${luiken.filter((c) => c.state === "closed").length} van ${luiken.length} dicht</div></div>
        <button data-actie="luik" data-dienst="open_cover" data-id="${ids}" title="Open">▲</button>
        <button data-actie="luik" data-dienst="stop_cover" data-id="${ids}" title="Stop">■</button>
        <button data-actie="luik" data-dienst="close_cover" data-id="${ids}" title="Dicht">▼</button></div>` : ""}`;
    const afval = this._afvalInfo();
    const lijst = [];
    if (afval) lijst.push(`<div class="w-item"><span class="i">${afval.icoon}</span><div><b>${afval.wanneer}: ${esc(afval.soort)}</b><small>${afval.dagen <= 1 ? "Container aan de weg zetten" : new Date(afval.datum).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}</small></div></div>`);
    this._verjaardagen.forEach((ev) => lijst.push(`<div class="w-item"><span class="i">🎂</span><div><b>${esc(ev.summary)}</b><small style="text-transform:capitalize">${this._evDag(ev)}</small></div></div>`));
    this._agenda.slice(0, 4).forEach((ev) => lijst.push(`<div class="w-item"><span class="i">📅</span><div><b>${esc(ev.summary)}</b><small style="text-transform:capitalize">${this._evDag(ev)} · ${this._evTijd(ev)}</small></div></div>`));
    if (!lijst.length) lijst.push(`<div class="w-item"><span class="i">☕</span><div><b>Niets op de planning</b><small>Geniet van je dag</small></div></div>`);
    lijst.push(`<div class="w-item"><span class="i">${mn.icoon}</span><div><b>${mn.naam}</b><small>${mn.verlicht}% verlicht · volle maan ${mn.volle.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}</small></div></div>`);
    r.getElementById("w-vandaag").innerHTML = `<h2>📌 Vandaag & binnenkort</h2><div class="w-lijst">${lijst.join("")}</div>`;
    this._tekenWkCams();
  }

  async _tekenWkCams() {
    const grid = this.shadowRoot.getElementById("w-cams");
    if (!grid) return;
    const cams = this._camLijst();
    const live = this._liveLijst();
    const keuze = [...cams.filter((c) => live.includes(c.entity_id)), ...cams.filter((c) => !live.includes(c.entity_id))].slice(0, 4);
    const structuur = keuze.map((c) => c.entity_id + (live.includes(c.entity_id) ? ":l" : "")).join();
    if (grid.dataset.structuur !== structuur) {
      grid.dataset.structuur = structuur;
      grid.classList.toggle("een", keuze.length === 1);
      grid.classList.toggle("drie", keuze.length === 3);
      grid.innerHTML = keuze.length
        ? keuze
            .map((c) => `<div class="cam" data-actie="meer" data-id="${esc(c.entity_id)}">${live.includes(c.entity_id) ? `<div class="live-houder"></div><b class="live">● LIVE</b>` : `<img alt="">`}<span>${esc(this._naam(c).replace(/ live view$/i, ""))}</span></div>`)
            .join("")
        : `<div class="leeg">Nog geen camera's gekoppeld.</div>`;
      for (const vak of grid.querySelectorAll(".cam")) {
        const houder = vak.querySelector(".live-houder");
        if (!houder) continue;
        const id = vak.dataset.id;
        if (!this._wkKaarten[id]) {
          const helpers = await this._kaartHulp();
          if (!helpers) continue;
          this._wkKaarten[id] = helpers.createCardElement({ type: "picture-entity", entity: id, camera_view: "live", show_name: false, show_state: false, tap_action: { action: "none" } });
        }
        this._wkKaarten[id].hass = this._hass;
        this._liveKaarten["wk:" + id] = this._wkKaarten[id];
        houder.appendChild(this._wkKaarten[id]);
      }
    }
    grid.querySelectorAll(".cam img").forEach((img) => {
      const c = this._s(img.closest(".cam").dataset.id);
      if (c?.attributes?.entity_picture) img.src = `${c.attributes.entity_picture}&t=${Date.now()}`;
    });
  }

  _tekenNieuws() {
    if (!this._veranderd("nieuws", this._sig("sensor.meldkamer_nieuws"))) return;
    const items = (this._a("sensor.meldkamer_nieuws").items || []).slice(0, 10);
    this.shadowRoot.getElementById("nieuws").innerHTML = items.length
      ? items
          .map((n) => `<a class="nieuws" href="${esc(n.link)}" target="_blank" rel="noopener"><div class="t">${n.soort === "belangrijk" ? '<span class="label belangrijk">BELANGRIJK</span>' : n.soort === "f1" ? '<span class="label f1">🏎️ F1</span>' : ""}${esc(n.titel)}</div><div class="s"><span class="bron">${esc(n.bron)}</span> · <span data-sinds="${esc(n.tijd)}">${tijdGeleden(n.tijd)}</span></div></a>`)
          .join("")
      : `<div class="leeg">Nieuws wordt geladen…</div>`;
  }

  // ---- Weer-tabblad ----

  _tekenWeer() {
    if (!this._veranderd("weer", this._sig("sensor.meldkamer_weer", "sensor.meldkamer_buienradar"))) return;
    const w = this._a("sensor.meldkamer_weer");
    const el = this.shadowRoot.getElementById("weer");
    if (!w.nu) {
      el.innerHTML = `<h2>🌤️ Weer</h2><div class="leeg">Weergegevens worden geladen…</div>`;
      return;
    }
    const nu = w.nu;
    const d0 = (w.dagen || [])[0] || {};
    const uurNu = new Date().getHours();
    const uren = (w.uren || []).filter((u) => new Date(u.tijd).getTime() >= Date.now() - 3600 * 1000).slice(0, 12);
    const r = this._a("sensor.meldkamer_buienradar");
    let regen = "";
    if (r.reeks?.length) {
      const max = Math.max(1, ...r.reeks.map((x) => x.mm));
      const bw = 100 / r.reeks.length;
      const balken = r.reeks
        .map((x, i) => {
          const h = Math.max(x.mm > 0 ? 3 : 0, (Math.sqrt(x.mm) / Math.sqrt(max)) * 48);
          return `<rect x="${i * bw + 0.3}" y="${50 - h}" width="${bw - 0.6}" height="${h}" rx="0.6" fill="${x.mm > 2 ? "#0a84ff" : "#64d2ff"}"/>`;
        })
        .join("");
      regen = `<div class="regen"><div style="font-size:13px;margin:4px 0 6px">☔ <b>${esc(r.samenvatting)}</b></div>
        <svg viewBox="0 0 100 50" preserveAspectRatio="none"><line x1="0" y1="49.6" x2="100" y2="49.6" stroke="#333" stroke-width=".5"/>${balken}</svg>
        <div class="as"><span>${esc(r.reeks[0].tijd)}</span><span>${esc(r.reeks[Math.floor(r.reeks.length / 2)].tijd)}</span><span>${esc(r.reeks[r.reeks.length - 1].tijd)}</span></div></div>`;
    }
    el.innerHTML = `
      <h2>🌤️ Weer in Nunspeet <span class="r">🌅 ${klokTijd(d0.zonop)} · 🌇 ${klokTijd(d0.zononder)}</span></h2>
      <div class="weer-nu">
        <div class="ic">${weerIcoon(nu.weather_code, nu.is_day)}</div>
        <div><div class="temp">${Math.round(nu.temperature_2m)}°</div><div class="omschr">${weerTekst(nu.weather_code)} · voelt als ${Math.round(nu.apparent_temperature)}°</div></div>
        <div style="margin-left:auto;text-align:right;font-size:12.5px;color:var(--zacht)">↑ ${Math.round(d0.max ?? 0)}° ↓ ${Math.round(d0.min ?? 0)}°<br>${d0.regenkans ?? 0}% kans op regen</div>
      </div>
      <div class="raster4">
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

  _tekenDetail() {
    if (!this._veranderd("detail", this._sig("sensor.meldkamer_weer"))) return;
    const w = this._a("sensor.meldkamer_weer");
    const nu = w.nu || {};
    const d0 = (w.dagen || [])[0] || {};
    const uv = d0.uv ?? nu.uv_index;
    const uvTekst = uv == null ? "" : uv < 3 ? "laag" : uv < 6 ? "matig" : uv < 8 ? "hoog" : "zeer hoog";
    const zicht = nu.visibility != null ? (nu.visibility >= 10000 ? ">10 km" : (nu.visibility / 1000).toFixed(1) + " km") : "–";
    const gevoel = nu.apparent_temperature != null && nu.temperature_2m != null ? Math.round(nu.apparent_temperature - nu.temperature_2m) : null;
    this.shadowRoot.getElementById("detail").innerHTML = `
      <h2>📋 Vandaag in detail</h2>
      <div class="raster3">
        <div>UV-index<b>${rond(uv, 0)} <span style="font-size:11px;color:var(--zacht)">${uvTekst}</span></b></div>
        <div>Zicht<b>${zicht}</b></div>
        <div>Dauwpunt<b>${rond(nu.dew_point_2m, 0)}°</b></div>
        <div>Neerslag<b>${rond(d0.regen, 1)} mm</b></div>
        <div>Uren regen<b>${rond(d0.regenuren, 0)} u</b></div>
        <div>Max windstoot<b>${rond(d0.windstoten, 0)} km/u</b></div>
        <div>Bewolking<b>${rond(nu.cloud_cover, 0)}%</b></div>
        <div>Windchill<b>${gevoel == null ? "–" : (gevoel > 0 ? "+" : "") + gevoel + "°"}</b></div>
        <div>Neerslag nu<b>${rond(nu.precipitation, 1)} mm</b></div>
      </div>`;
  }

  _toonWeerTab() {
    const r = this.shadowRoot;
    const storm = this.hasAttribute("storm");
    if (!storm && this._weerTab === "bliksem") this._weerTab = "windy";
    const tabs = [["windy", "🌩️ Windy · regen & onweer"], ["radar", "🌧️ Buienradar"]];
    if (storm) tabs.push(["bliksem", "⚡ Bliksem live"]);
    r.getElementById("wtabs").innerHTML = tabs
      .map(([id, label]) => `<button class="tab ${this._weerTab === id ? "aan" : ""}" data-actie="wtab" data-tab="${id}">${label}</button>`)
      .join("");
    const { lat, lon } = this._plek();
    const zet = (id, src) => {
      const el = r.getElementById(id);
      el.classList.toggle("verberg", !src);
      if (src && el.getAttribute("src") !== src) el.setAttribute("src", src);
    };
    zet(
      "windy",
      this._weerTab === "windy"
        ? `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&detailLat=${lat}&detailLon=${lon}&zoom=8&level=surface&overlay=rain&product=ecmwf&menu=&message=true&marker=true&calendar=now&type=map&location=coordinates&detail=&metricWind=km%2Fh&metricTemp=%C2%B0C&radarRange=-1`
        : ""
    );
    zet("bliksem", this._weerTab === "bliksem" ? `https://map.blitzortung.org/#8/${lat}/${lon}` : "");
    r.getElementById("radar").classList.toggle("verberg", this._weerTab !== "radar");
    if (this._weerTab === "radar") this._ververstRadar();
  }

  _ververstRadar() {
    const img = this.shadowRoot.getElementById("radar");
    const src = `https://image.buienradar.nl/2.0/image/animation/RadarMapRainNL?height=512&width=500&renderBackground=True&renderBranding=False&renderText=True&t=${Math.floor(Date.now() / 300000)}`;
    if (img.getAttribute("src") !== src) img.src = src;
  }

  _tekenKnmi() {
    if (!this._veranderd("knmi", this._sig("sensor.meldkamer_knmi", "input_boolean.meldkamer_stormmodus"))) return;
    const lijst = this._a("sensor.meldkamer_knmi").waarschuwingen || [];
    const storm = this._aan("input_boolean.meldkamer_stormmodus");
    const tijd = (iso) => {
      const d = new Date(iso);
      return isNaN(d) ? "" : d.toLocaleString("nl-NL", { weekday: "short", hour: "2-digit", minute: "2-digit" });
    };
    this.shadowRoot.getElementById("knmi").innerHTML = `
      <h2>⚠️ KNMI <span class="r"><button class="klein-knop" data-actie="toggle" data-id="input_boolean.meldkamer_stormmodus">⚡ Stormmodus ${storm ? "uit" : "aan"}</button></span></h2>
      ${lijst.length
        ? lijst.map((w) => `<div class="knmi" style="border-color:${KNMI_KLEUR[w.kleur] || "#555"}"><b style="color:${KNMI_KLEUR[w.kleur] || "inherit"}">Code ${esc(w.kleur)}: ${esc(w.soort)}</b>
            <small>${esc(w.gebied)}${w.vanaf ? " · vanaf " + tijd(w.vanaf) : ""}${w.tot ? " · tot " + tijd(w.tot) : ""}</small></div>`).join("")
        : `<div class="ok-blok"><span style="font-size:24px">✅</span><div><b>Geen waarschuwingen</b><div style="font-size:12px;color:var(--zacht)">Rustig weer in Gelderland</div></div></div>`}`;
  }

  _tekenLucht() {
    if (!this._veranderd("lucht", this._sig("sensor.meldkamer_luchtkwaliteit"))) return;
    const l = this._s("sensor.meldkamer_luchtkwaliteit");
    const el = this.shadowRoot.getElementById("lucht");
    if (!l || isNaN(parseFloat(l.state))) {
      el.innerHTML = `<h2>🌫️ Luchtkwaliteit</h2><div class="leeg">Laden…</div>`;
      return;
    }
    const w = parseFloat(l.state);
    const [, label, kleur, advies] = AQI.find(([g]) => w < g);
    const a = l.attributes;
    const stoffen = STOFFEN.map(([k, naam, who, uitleg]) => ({ naam, uitleg, waarde: a[k], ratio: (a[k] ?? 0) / who }));
    const hoogste = stoffen.reduce((x, y) => (y.ratio > x.ratio ? y : x));
    const kleurStof = (r) => (r < 0.5 ? "#30d158" : r < 1 ? "#a3d95b" : r < 2 ? "#ffd60a" : "#ff453a");
    el.innerHTML = `<h2>🌫️ Luchtkwaliteit</h2>
      <div class="aqi"><div class="ring" style="border-color:${kleur};color:${kleur}">${Math.round(w)}</div><div><b style="font-size:16px">${label}</b><small>Europese luchtindex (0 = schoon, 100+ = slecht)</small></div></div>
      <div class="uitleg">${advies} De meeste vervuiling komt nu van <b>${hoogste.naam}</b>: ${hoogste.uitleg}. Dat is <b>${Math.round(hoogste.ratio * 100)}%</b> van wat de WHO als gezonde grens ziet.</div>
      ${stoffen.map((s) => `<div class="stof"><span>${s.naam}</span><div class="balk"><div style="width:${Math.min(100, s.ratio * 100)}%;background:${kleurStof(s.ratio)}"></div></div><b>${rond(s.waarde, 0)}</b></div>`).join("")}
      <div style="font-size:10.5px;color:var(--zwak);margin-top:6px">Balkje vol = WHO-advieswaarde · waarden in µg/m³</div>`;
  }

  _tekenZonMaan() {
    const sig = this._sig("sensor.meldkamer_weer") + new Date().getHours();
    if (!this._veranderd("zonmaan", sig)) return;
    const d0 = (this._a("sensor.meldkamer_weer").dagen || [])[0] || {};
    const mn = maan();
    const op = new Date(d0.zonop), onder = new Date(d0.zononder);
    let boog = "";
    if (!isNaN(op) && !isNaN(onder)) {
      const f = Math.max(0, Math.min(1, (Date.now() - op) / (onder - op)));
      const x = 4 + f * 92;
      const y = 42 - Math.sin(f * Math.PI) * 36;
      const opDag = Date.now() > op && Date.now() < onder;
      boog = `<div class="boog"><svg viewBox="0 0 100 46" preserveAspectRatio="none">
        <path d="M4 42 Q50 -30 96 42" fill="none" stroke="#3a3f47" stroke-width="1" stroke-dasharray="2 2"/>
        <line x1="0" x2="100" y1="42" y2="42" stroke="#2a2f37" stroke-width=".6"/>
        ${opDag ? `<circle cx="${x}" cy="${y}" r="3.6" fill="#ffd60a"/>` : ""}</svg></div>`;
    }
    const dl = this._daglicht(d0);
    const daglicht = dl ? `${Math.floor(dl / 3600)} uur ${Math.round((dl % 3600) / 60)} min` : "–";
    this.shadowRoot.getElementById("zonmaan").innerHTML = `<h2>🌗 Zon & maan</h2>
      <div class="zonmaan">
        <div><span class="groot">☀️</span><b>${klokTijd(d0.zonop) || "–"} – ${klokTijd(d0.zononder) || "–"}</b>${daglicht} daglicht</div>
        <div><span class="groot">${mn.icoon}</span><b>${mn.naam}</b>${mn.verlicht}% verlicht · volle maan ${mn.volle.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}</div>
      </div>${boog}`;
  }

  // ---- nachtscherm ----

  _tekenNacht(nu) {
    const el = this.shadowRoot.getElementById("nacht");
    const u = nu.getHours();
    const isNacht = u >= NACHT_VAN || u < NACHT_TOT;
    const uit = this._aan("input_boolean.meldkamer_nachtmodus_uit");
    const alarm = this.shadowRoot.getElementById("alarm").classList.contains("open");
    const deurbel = this.shadowRoot.getElementById("deurbel").classList.contains("open");
    const toon = (this._nachtVoorbeeldTot && Date.now() < this._nachtVoorbeeldTot) || (isNacht && !uit && !alarm && !deurbel && Date.now() > this._wakkerTot);
    el.classList.toggle("open", toon);
    if (toon) {
      const m = this._p2000().melding;
      const w = this._s("sensor.meldkamer_weer");
      this.shadowRoot.getElementById("nachtinfo").textContent =
        (w && w.state !== "unknown" ? `${Math.round(w.state)}° buiten` : "") + (m ? ` · laatste uitruk ${tijdGeleden(m.tijd)}` : "");
    }
  }

  // ---- alarm ----

  _controleerAlarm() {
    const d = this._p2000();
    const kandidaten = [d.melding, (d.politie || [])[0]].filter((m) => m && m.relevant);
    if (!kandidaten.length) return;
    const m = kandidaten.sort((a, b) => new Date(b.tijd) - new Date(a.tijd))[0];
    let gezien = null;
    try {
      gezien = localStorage.getItem("meldkamer_alarm_gezien");
    } catch (e) {
      /* geen opslag */
    }
    if (this._alarmId === m.id || gezien === m.id) return;
    if (gezien === null) return this._bevestig(m.id); // eerste keer openen: geen alarm voor oude meldingen
    const vers = Date.now() - new Date(m.tijd).getTime() < 15 * 60 * 1000;
    if (!vers || this._aan("input_boolean.meldkamer_brandalarm_pauze")) return this._bevestig(m.id);
    this._toonAlarm(m);
  }

  _toonAlarm(m) {
    this._alarmId = m.id;
    this.setAttribute("modus", m.soort === "politie" ? "politie" : "brand");
    const woonkamer = this._thuis === "woonkamer";
    if (woonkamer) this._meldkamerTot = null;
    else {
      this._meldkamerTot = Date.now() + 10 * 60 * 1000;
      this._toonPagina("meldkamer");
    }
    const politie = m.soort === "politie";
    const r = m.route;
    const el = this.shadowRoot.getElementById("alarm");
    el.classList.toggle("politie", politie);
    el.innerHTML = `
      <div class="groot">${politie ? "👮 POLITIE" : "🚒 BRANDWEER NUNSPEET"}${m.prio ? " · P" + m.prio : ""}</div>
      ${m.test ? '<div style="font-size:20px;font-weight:800;margin-top:8px;background:#ffd60a;color:#000;padding:4px 14px;border-radius:8px">TEST</div>' : ""}
      <div class="titel">${esc(m.kort || m.titel)}</div>
      <div class="adres">${m.adres ? "📍 " + esc(m.adres) : ""}</div>
      ${r ? `<div class="info">
        ${r.auto ? `<div class="blok ${r.sneller === "auto" ? "best" : ""}">🚗 Auto<b>${r.auto.minuten} min</b>${r.auto.km} km</div>` : ""}
        ${r.fiets ? `<div class="blok ${r.sneller === "fiets" ? "best" : ""}">🚲 Fiets<b>${r.fiets.minuten} min</b>${r.fiets.km} km</div>` : ""}
        ${r.advies ? `<div class="blok">🧭 Route<b style="font-size:21px;margin-top:6px">${esc(r.advies)}</b></div>` : ""}
      </div>` : ""}
      ${(m.eenheden || []).length ? `<div style="margin-bottom:18px;opacity:.85;font-size:14.5px">${m.eenheden.slice(0, 5).map(esc).join(" · ")}</div>` : ""}
      <div class="knoppen">
        ${r?.maps_auto ? `<a href="${esc(r.maps_auto)}" target="_blank" rel="noopener">🚗 Navigeer</a>` : ""}
        ${r?.maps_fiets ? `<a href="${esc(r.maps_fiets)}" target="_blank" rel="noopener">🚲 Fiets</a>` : ""}
        <button class="stil" data-actie="stil">🔇 Geluid uit</button>
        <button data-actie="bevestig">✓ Gezien</button>
      </div>
      <div class="aftel" id="aftel"></div>`;
    el.classList.add("open");
    el.classList.toggle("rustig", woonkamer);
    if (woonkamer) this._piepHard();
    else if (politie) this._piep();
    else this._startSirene();
    const duur = woonkamer ? 60 * 1000 : ALARM_DUUR;
    this._alarmEind = Date.now() + duur;
    clearTimeout(this._alarmTimer);
    this._alarmTimer = setTimeout(() => this._sluitAlarm(), duur);
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
    this._stopGeluid();
    clearTimeout(this._alarmTimer);
    this._alarmEind = null;
    this.shadowRoot.getElementById("alarm").classList.remove("open");
    if (this._alarmId && !this._isVoorbeeld) this._bevestig(this._alarmId);
    this._isVoorbeeld = false;
    this._wakkerTot = Date.now() + 5 * 60 * 1000;
  }

  _toon(freqs, duur, type = "sawtooth", volume = 0.22) {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    freqs.forEach(([f, d]) => osc.frequency.setValueAtTime(f, t + d));
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.03);
    gain.gain.setValueAtTime(volume, t + duur - 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duur + 0.05);
  }

  _startSirene() {
    this._audio();
    this._stopGeluid();
    const speel = () => this._toon([[1020, 0], [680, 0.45], [1020, 0.9], [680, 1.35]], 1.8);
    speel();
    let keer = 0;
    this._geluid = setInterval(() => {
      if (++keer > 30) return this._stopGeluid();
      speel();
    }, 3000);
  }

  _piep() {
    this._audio();
    this._stopGeluid();
    [0, 450, 900].forEach((ms) => setTimeout(() => this._toon([[1400, 0]], 0.25, "square", 0.18), ms));
  }

  _piepHard() {
    this._audio();
    this._stopGeluid();
    [0, 700, 1400, 2100].forEach((ms) => setTimeout(() => this._toon([[1050, 0]], 0.42, "square", 0.55), ms));
  }

  _stopGeluid() {
    clearInterval(this._geluid);
    this._geluid = null;
  }

  // ---- deurbel ----

  _controleerDeurbel() {
    const bellen = Object.values(this._hass.states).filter(
      (s) => s.entity_id.startsWith("event.") && (s.entity_id.endsWith("_ding") || s.attributes.event_type === "ding")
    );
    for (const b of bellen) {
      const vorige = this._dingGezien[b.entity_id];
      this._dingGezien[b.entity_id] = b.state;
      if (vorige === undefined || vorige === b.state || b.state === "unavailable" || b.state === "unknown") continue;
      if (b.attributes.event_type && !["ding", "doorbell", "pressed"].includes(b.attributes.event_type)) continue;
      if (Date.now() - new Date(b.state).getTime() < 60 * 1000) this._deurbel({ event: b.entity_id });
    }
  }

  _deurbelCamera(info) {
    const cams = this._camLijst();
    if (info.event) {
      const prefix = info.event.replace(/^event\./, "").replace(/_ding$/, "");
      const cam = cams.find((c) => c.entity_id.startsWith("camera." + prefix));
      if (cam) return cam;
    }
    return cams.find((c) => /deur|bel|voor|ding/i.test(this._naam(c))) || cams[0];
  }

  async _deurbel(info = {}, metGeluid = true) {
    const el = this.shadowRoot.getElementById("deurbel");
    this.setAttribute("fel", "");
    const cams = this._camLijst();
    const bel = this._deurbelCamera(info);
    const rest = cams.filter((c) => c !== bel).slice(0, 3);
    const nu = new Date();
    el.innerHTML = `<div class="bovenbalk"><span class="bel">🔔</span><div><h2>Er wordt aangebeld${info.test ? " · TEST" : ""}</h2>
        <div style="color:var(--zacht);font-size:13px">${bel ? esc(this._naam(bel).replace(/ live view$/i, "")) + " · " : ""}${pad(nu.getHours())}:${pad(nu.getMinutes())}:${pad(nu.getSeconds())}</div></div>
        <button data-actie="deurbel-sluit">✓ Sluiten</button></div>
      <div class="camvak">
        ${bel ? `<div class="cam groot" data-id="${esc(bel.entity_id)}"><div class="live-houder"></div><b class="live">● LIVE</b><span>🔔 ${esc(this._naam(bel).replace(/ live view$/i, ""))}</span></div>` : `<div class="leeg">Geen camera's gekoppeld.</div>`}
        ${rest.map((c) => `<div class="cam" data-id="${esc(c.entity_id)}"><div class="live-houder"></div><b class="live">● LIVE</b><span>📷 ${esc(this._naam(c).replace(/ live view$/i, ""))}</span></div>`).join("")}
      </div>`;
    el.classList.add("open");
    if (metGeluid) this._dingDong();
    clearTimeout(this._deurbelTimer);
    this._deurbelTimer = setTimeout(() => this._sluitDeurbel(), 2 * 60 * 1000);
    for (const vak of el.querySelectorAll(".cam[data-id]")) {
      const kaart = await this._deurbelKaart(vak.dataset.id);
      if (kaart) vak.querySelector(".live-houder").appendChild(kaart);
    }
  }

  async _deurbelKaart(id) {
    if (!this._deurbelKaarten[id]) {
      const helpers = await this._kaartHulp();
      if (!helpers) return null;
      this._deurbelKaarten[id] = helpers.createCardElement({
        type: "picture-entity", entity: id, camera_view: "live", show_name: false, show_state: false, tap_action: { action: "none" },
      });
    }
    const k = this._deurbelKaarten[id];
    k.hass = this._hass;
    this._liveKaarten["db:" + id] = k;
    return k;
  }

  _sluitDeurbel() {
    clearTimeout(this._deurbelTimer);
    const el = this.shadowRoot.getElementById("deurbel");
    this.removeAttribute("fel");
    el.classList.remove("open");
    el.innerHTML = "";
    Object.keys(this._liveKaarten).filter((k) => k.startsWith("db:")).forEach((k) => delete this._liveKaarten[k]);
  }

  _dingDong() {
    try {
      const a = new Audio("/local/meldkamer/deurbel.wav");
      a.volume = 1;
      a.play().catch(() => this._toon([[659, 0]], 0.6, "sine", 0.3));
    } catch (e) {
      /* geen geluid */
    }
  }

  _vulSpeakers() {
    const sel = this.shadowRoot.getElementById("speaker");
    if (!sel || sel.dataset.gevuld) return;
    const spelers = this._ent("media_player").filter((m) => !/diw7022|tv|apple|vsx|dlna/i.test(m.entity_id + this._naam(m)));
    const voorkeur = spelers.find((m) => /sem|google|home|mini/i.test(this._naam(m))) || spelers[0];
    sel.innerHTML = spelers.map((m) => `<option value="${esc(m.entity_id)}" ${m === voorkeur ? "selected" : ""}>${esc(this._naam(m))}</option>`).join("") || "<option>Geen speakers gevonden</option>";
    sel.dataset.gevuld = "1";
  }

  _zeg() {
    const r = this.shadowRoot;
    const speler = r.getElementById("speaker").value;
    const tekst = r.getElementById("zeg-tekst").value.trim();
    const tts = this._ent("tts").find((t) => /google/i.test(t.entity_id)) || this._ent("tts")[0];
    if (!tts || !speler.startsWith("media_player.") || !tekst) return alert("Geen spraakdienst of speaker gevonden.");
    this._hass.callService("tts", "speak", { entity_id: tts.entity_id, media_player_entity_id: speler, message: tekst, language: "nl", cache: false });
  }

  _voorbeeld(wat) {
    if (wat === "nacht") {
      this._nachtVoorbeeldTot = Date.now() + 10 * 1000;
      return;
    }
    if (wat === "deurbel") return this._deurbel({ test: true }, true);
    const politie = wat === "politie";
    this._toonAlarm({
      id: "voorbeeld-" + Date.now(), soort: politie ? "politie" : "brand", prio: 1, test: true,
      kort: politie ? "Voorbeeld: Verdachte situatie Stationsplein Nunspeet" : "Voorbeeld: Woningbrand Stationsplein Nunspeet",
      adres: "Stationsplein, Nunspeet", eenheden: [politie ? "Politie (voorbeeld)" : "Brandweer NOG (Bevelvoerder Nunspeet)"],
      route: { auto: { minuten: 4, km: 1.8 }, fiets: { minuten: 6, km: 1.8 }, advies: "Via Zeeweg-rotonde (2 min sneller)", sneller: "auto" },
    });
    this._meldkamerTot = null;
    this._isVoorbeeld = true;
  }

  // ---- bediening ----

  _toonPagina(p) {
    this._pagina = p;
    const r = this.shadowRoot;
    ["meldkamer", "dashboard", "woonkamer", "weer", "test"].forEach((n) => r.getElementById("p-" + n)?.classList.toggle("aan", n === p));
    if (p === "test") {
      this._vulSpeakers();
      try {
        this.shadowRoot.getElementById("thema-keuze").value = localStorage.getItem("meldkamer_thema") || "auto";
      } catch (e) {
        /* geen opslag */
      }
    }
    r.querySelectorAll(".pag-knop, .rail button[data-pagina]").forEach((b) => b.classList.toggle("aan", b.dataset.pagina === p));
    const pag = r.getElementById("p-" + p);
    if (pag) {
      pag.querySelectorAll(".kaart").forEach((k, i) => k.style.setProperty("--i", i));
      pag.classList.remove("animeer");
      void pag.offsetWidth;
      pag.classList.add("animeer");
    }
    if (p === "dashboard" && this._hass) this._tekenCams();
    if (p === "woonkamer" && this._hass) this._handtekening.woonkamer = null;
    if (p === "weer") this._toonWeerTab();
    if (this._hass) setTimeout(() => this._teken(), 30);
  }

  _meerInfo(entityId) {
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  _invoer(e) {
    const id = e.target.dataset?.dimmer;
    if (!id) return;
    clearTimeout(this._dimTimer);
    this._dimTimer = setTimeout(() => this._hass.callService("light", "turn_on", { entity_id: id, brightness_pct: +e.target.value }), 250);
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
      case "alle":
        h.callService("light", el.dataset.dienst, { entity_id: "all" });
        break;
      case "luik":
        h.callService("cover", el.dataset.dienst, { entity_id: id.split(",") });
        break;
      case "pagina":
        if (["dashboard", "woonkamer"].includes(el.dataset.pagina)) {
          this._thuis = el.dataset.pagina;
          try {
            localStorage.setItem("meldkamer_thuis", this._thuis);
          } catch (e2) {
            /* geen opslag */
          }
        }
        this._toonPagina(el.dataset.pagina);
        break;
      case "wtab":
        this._weerTab = el.dataset.tab;
        this._toonWeerTab();
        break;
      case "live":
        this._zetLive(id);
        break;
      case "meer":
        this._meerInfo(id);
        break;
      case "test": {
        const politie = el.dataset.soort === "politie";
        if (confirm(politie ? "Test-politiemelding geven? De slaapkamerlamp knippert blauw-wit en de Google Home praat mee." : "Test-brandmelding geven? Alle alarmlampen, de Google Home en je telefoon doen mee."))
          h.callService("meldkamer", "test_melding", { soort: politie ? "politie" : "brand" });
        break;
      }
      case "stil":
        this._stopGeluid();
        break;
      case "eigen-test": {
        const r = this.shadowRoot;
        const tekst = r.getElementById("eigen-tekst").value.trim();
        const soort = r.getElementById("eigen-soort").value;
        if (!tekst) return alert("Typ eerst een meldingstekst.");
        h.callService("meldkamer", "test_melding", { soort, tekst: "TEST " + tekst });
        break;
      }
      case "test-deurbel":
        h.callService("meldkamer", "test_deurbel", {});
        break;
      case "deurbel-sluit":
        this._sluitDeurbel();
        break;
      case "geluid": {
        const g = el.dataset.geluid;
        this._audio();
        if (g === "sirene") {
          this._startSirene();
          setTimeout(() => this._stopGeluid(), 5000);
        } else if (g === "piep") this._piep();
        else this._dingDong();
        break;
      }
      case "thema":
        try {
          localStorage.setItem("meldkamer_thema", this.shadowRoot.getElementById("thema-keuze").value);
        } catch (e3) {
          /* geen opslag */
        }
        this._teken();
        break;
      case "zeg":
        this._zeg();
        break;
      case "voorbeeld":
        this._voorbeeld(el.dataset.wat);
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
    if (this._weerTab === "radar") this._ververstRadar();
  }
}

customElements.define("meldkamer-panel", HuisPanel);
