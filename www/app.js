const API = "https://margdarshi.upsrtcvlt.com/php/getGpsLiveData.php";
// अपने स्टैंड यहाँ जोड़ें: [नाम, latitude, longitude]
const STANDS = [
  ["बछरावां", 26.4667, 81.1167],
  ["लालगंज", 26.167679, 80.973389]
];
const $ = (id) => document.getElementById(id);
let map, layer, allBuses = [], busByReg = {}, origin = null, originIsGps = true;
let markers = {}, selected = null, timer = null, busy = false;
let favs = [];

function ls(k, v) {
  try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {}
  return null;
}
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- दूरी / दिशा ----------
function hav(a, b, c, d) {
  const p = Math.PI / 180;
  const x = Math.sin((c - a) * p / 2) ** 2 +
    Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}
function bearing(lat1, lon1, lat2, lon2) {
  const p = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * p) * Math.cos(lat2 * p);
  const x = Math.cos(lat1 * p) * Math.sin(lat2 * p) - Math.sin(lat1 * p) * Math.cos(lat2 * p) * Math.cos((lon2 - lon1) * p);
  return (Math.atan2(y, x) / p + 360) % 360;
}
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const DIRS = ["उत्तर", "उत्तर-पूर्व", "पूर्व", "दक्षिण-पूर्व", "दक्षिण", "दक्षिण-पश्चिम", "पश्चिम", "उत्तर-पश्चिम"];
const dirName = (h) => DIRS[Math.round(h / 45) % 8];

// आ रही है / जा रही है (अनुमान)
function trendOf(b, d) {
  if (b.vehicle_status !== "live" || !(b.speed >= 5) || b.heading == null) return null;
  if (d < 0.3) return { k: "near" };
  const diff = angDiff(b.heading, bearing(b.latitude, b.longitude, origin[0], origin[1]));
  if (diff <= 60) return { k: "in", eta: Math.max(1, Math.round(d * 1.25 / b.speed * 60)) };
  if (diff >= 120) return { k: "out" };
  return { k: "side" };
}

// ---------- समय (साइट का समय असल में IST है, Z के बावजूद) ----------
function parseT(t) {
  const m = String(t || "").match(/(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d):(\d\d)/);
  if (!m) return null;
  const [Y, M, D, h, mi, s] = m.slice(1).map(Number);
  return { epoch: Date.UTC(Y, M - 1, D, h, mi, s) - 5.5 * 3600 * 1000, Y, M, D, h, mi };
}
const ageMin = (t) => { const p = parseT(t); return p ? Math.max(0, Math.round((Date.now() - p.epoch) / 60000)) : null; };
function timeText(t) {
  const p = parseT(t);
  if (!p) return "";
  const pad = (n) => (n < 10 ? "0" + n : "" + n);
  let clock = pad(p.h % 12 || 12) + ":" + pad(p.mi) + " " + (p.h >= 12 ? "PM" : "AM");
  if (ageMin(t) >= 1440) clock = pad(p.D) + "/" + pad(p.M) + " " + clock;
  return clock;
}
function ageLabel(t) {
  const m = ageMin(t);
  if (m == null) return "";
  if (m < 1) return "अभी का डेटा";
  if (m < 60) return m + " मिनट पुराना";
  if (m < 1440) { const h = Math.floor(m / 60), r = m % 60; return h + " घंटे" + (r ? " " + r + " मिनट" : "") + " पुराना"; }
  return Math.floor(m / 1440) + " दिन पुराना";
}


// ---------- डिपो के हिंदी नाम (जैसे RAEBARELI -> रायबरेली डिपो) ----------
const DEPOT_HI = {"AGRA FORT": "आगरा फोर्ट", "AKBARPUR": "अकबरपुर", "ALAMBAGH": "आलमबाग", "ALIGARH": "अलीगढ़", "AMBEDKAR": "अंबेडकर नगर", "AMETHI": "अमेठी", "AMROHA": "अमरोहा", "ATRAULI": "अतरौली", "AURAIYA": "औरैया", "AWADH": "अवध", "AYODHYA": "अयोध्या", "AZADNAGAR": "आज़ाद नगर", "AZAMGARH(R)": "आज़मगढ़", "BADAUN": "बदायूँ", "BADSHAHPUR": "बादशाहपुर", "BAH": "बाह", "BAHRAICH": "बहराइच", "BALLIA": "बलिया", "BALRAMPUR": "बलरामपुर", "BANDA": "बाँदा", "BARABANKI": "बाराबंकी", "BARAUT": "बड़ौत", "BAREILLY(R)": "बरेली", "BASTI": "बस्ती", "BELTHRA ROAD": "बेल्थरा रोड", "BEWAR": "बेवर", "BHAISALI": "भैसाली", "BIJNOR": "बिजनौर", "BUDDHA VIHAR": "बुद्ध विहार", "BULANDSHAHAR": "बुलंदशहर", "CHANDAULI": "चंदौली", "CHANDPUR": "चाँदपुर", "CHARBAGH": "चारबाग", "CHITRAKOOT HIRED": "चित्रकूट (अनुबंधित)", "CHUTMALPUR": "छुटमलपुर", "CIVIL LINES": "सिविल लाइंस", "DEORIA": "देवरिया", "DHAMPUR": "धामपुर", "DOHRIGHAT": "दोहरीघाट", "ETAH": "एटा", "ETAWAH": "इटावा", "FARRUKHABAD": "फर्रुखाबाद", "FATEHPUR": "फतेहपुर", "FAZALGANJ": "फज़लगंज", "FOUNDRY NAGAR": "फाउंड्री नगर", "GANGOH": "गंगोह", "GARH": "गढ़", "GHAZIABAD": "गाज़ियाबाद", "GHAZIPUR": "ग़ाज़ीपुर", "GOLA": "गोला", "GONDA": "गोंडा", "GORAKHPUR": "गोरखपुर", "GREATER NOIDA": "ग्रेटर नोएडा", "HAMIRPUR": "हमीरपुर", "HAPUR": "हापुड़", "HARDOI": "हरदोई", "HATHRAS": "हाथरस", "IDGAAH": "ईदगाह", "JAUNPUR": "जौनपुर", "JHANSI": "झाँसी", "KAISERBAGH": "कैसरबाग", "KAISERBAGH HIRED": "कैसरबाग (अनुबंधित)", "KANNAUJ": "कन्नौज", "KASGANJ": "कासगंज", "KASHI": "काशी", "KAUSHAMBI": "कौशांबी", "KHATAULI": "खतौली", "KHURJA": "खुर्जा", "KIDWAI NAGAR": "किदवई नगर", "LAKHIMPUR": "लखीमपुर", "LALGANJ": "लालगंज", "LEADER ROAD": "लीडर रोड", "LONI": "लोनी", "MAHOBA": "महोबा", "MAINPURI": "मैनपुरी", "MANJHANPUR": "मंझनपुर", "MATHURA": "मथुरा", "MATI": "माती", "MAU": "मऊ", "MEERUT": "मेरठ", "MIRZAPUR": "मिर्ज़ापुर", "MORADABAD": "मुरादाबाद", "MUZAFFAR NAGAR": "मुज़फ़्फ़रनगर", "NAJIBABAD": "नजीबाबाद", "NICHLAUL": "निचलौल", "NOIDA": "नोएडा", "NOIDA ELECTRIC": "नोएडा इलेक्ट्रिक", "ORAI": "उरई", "PADRAUNA": "पडरौना", "PILIBHIT": "पीलीभीत", "PITAL NAGRI": "पीतल नगरी", "PRATAPGARH": "प्रतापगढ़", "PRAYAG": "प्रयाग", "RAEBARELI": "रायबरेली", "RAMPUR": "रामपुर", "RAPTI NAGAR": "राप्ती नगर", "RATH": "राठ", "ROHILKHAND": "रोहिलखंड", "RUPAIDIHA": "रुपईडीहा", "SAHARANPUR(A)": "सहारनपुर", "SAHIBABAD": "साहिबाबाद", "SAIFAI": "सैफई", "SHAHGANJ": "शाहगंज", "SHAHJAHANPUR": "शाहजहाँपुर", "SHAMLI": "शामली", "SHIKOHABAD": "शिकोहाबाद", "SHUTTLE": "शटल", "SIDDHARTH NAGAR": "सिद्धार्थनगर", "SIKANDRABAD": "सिकंदराबाद", "SITAPUR": "सीतापुर", "SOHRABGATE": "सोहराब गेट", "SONAULI": "सोनौली", "SONBHADRA": "सोनभद्र", "SULTANPUR": "सुल्तानपुर", "TAJ": "ताज", "UNNAO": "उन्नाव", "UPNAGARIYA": "यूपी नगरीय", "VARANASI CANT": "वाराणसी कैंट", "VARANASI GRAMIN": "वाराणसी ग्रामीण", "VIKAS NAGAR": "विकास नगर", "VINDHYANAGAR": "विंध्यनगर", "ZERO ROAD": "ज़ीरो रोड"};
const ENF_HI = {"AGRA": "आगरा", "ALIGARH": "अलीगढ़", "AYODHYA": "अयोध्या", "AZAMGARH": "आज़मगढ़", "BAREILLY": "बरेली", "CHITRAKOOT": "चित्रकूट", "DEVIPATAN": "देवीपाटन", "ETAWAH": "इटावा", "GHAZIABAD": "गाज़ियाबाद", "GORAKHPUR": "गोरखपुर", "HQ": "मुख्यालय", "HARDOI": "हरदोई", "JHANSI": "झाँसी", "KANPUR": "कानपुर", "LUCKNOW": "लखनऊ", "MEERUT": "मेरठ", "MORADABAD": "मुरादाबाद", "NOIDA": "नोएडा", "PRAYAGRAJ": "प्रयागराज", "SAHARANPUR": "सहारनपुर", "VARANASI": "वाराणसी"};
function depotHi(n) {
  if (!n) return "";
  const u = String(n).trim().toUpperCase();
  if (DEPOT_HI[u]) return DEPOT_HI[u] + " डिपो";
  if (u.indexOf("ENFORCEMENT_") === 0) { const c = u.slice(12); return "प्रवर्तन – " + (ENF_HI[c] || c); }
  return String(n).replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase()) + " डिपो";
}

const STATUS = { live: "चल रही", stationary: "रुकी हुई", no_signal: "सिग्नल नहीं", under_maintenance: "मेंटेनेंस" };
const busColor = (s) => (s === "live" ? "#1a9a3a" : s === "stationary" ? "#d93025" : "#888");

// ---------- नक्शे पर बस का चिह्न (हरा = चल रही, लाल = रुकी, तीर = दिशा) ----------
function busIcon(b, big) {
  const s = b.vehicle_status, c = busColor(s), z = big ? 62 : 46;
  const arrow = s === "live" && b.heading != null && b.speed >= 3
    ? `<g transform="rotate(${b.heading} 24 24)"><path d="M24 1 L31 11 L17 11 Z" fill="${c}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></g>` : "";
  const svg = `<svg width="${z}" height="${z}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    ${arrow}
    <g transform="translate(24 24) scale(.82) translate(-17 -17)">
      <circle cx="17" cy="17" r="16" fill="#fff" stroke="${c}" stroke-width="2.4"/>
      <rect x="8" y="8" width="18" height="16" rx="3" fill="${c}"/>
      <rect x="10" y="10" width="14" height="6" rx="1" fill="#fff"/>
      <rect x="10" y="18" width="3" height="2" fill="#fff"/><rect x="21" y="18" width="3" height="2" fill="#fff"/>
      <circle cx="12" cy="25" r="2" fill="#222"/><circle cx="22" cy="25" r="2" fill="#222"/>
    </g></svg>`;
  return L.divIcon({ html: svg, className: "busicon", iconSize: [z, z], iconAnchor: [z / 2, z / 2], popupAnchor: [0, -z / 2] });
}

// ---------- लोकेशन / डेटा ----------
async function getGPS() {
  const G = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation;
  if (G) {
    try { await G.requestPermissions(); } catch (e) {}
    const p = await G.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
    return [p.coords.latitude, p.coords.longitude];
  }
  return new Promise((res, rej) => navigator.geolocation.getCurrentPosition(
    (p) => res([p.coords.latitude, p.coords.longitude]), rej, { enableHighAccuracy: true, timeout: 15000 }));
}

async function loadBuses() {
  $("status").textContent = "बसों का डेटा आ रहा है...";
  const r = await fetch(API, {
    method: "POST",
    headers: {
      "Referer": "https://margdarshi.upsrtcvlt.com/",
      "Origin": "https://margdarshi.upsrtcvlt.com",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  let d = r.json ? await r.json() : r;
  if (typeof d === "string") d = JSON.parse(d);
  allBuses = d.filter((b) => b.latitude && b.longitude && b.regNum);
  busByReg = {};
  allBuses.forEach((b) => (busByReg[b.regNum.toUpperCase()] = b));
}

async function resolveOrigin() {
  const v = $("origin").value;
  originIsGps = v === "gps";
  if (v === "gps") {
    $("status").textContent = "आपकी location ढूँढ रहे हैं...";
    origin = await getGPS();
  } else if (v === "custom") {
    const [la, lo] = $("custom").value.split(",").map(parseFloat);
    if (isNaN(la) || isNaN(lo)) throw new Error("सही lat,lon डालें (जैसे 26.47,81.12)");
    origin = [la, lo];
  } else {
    const s = STANDS[parseInt(v)];
    origin = [s[1], s[2]];
  }
}

// ---------- पसंदीदा बसें ----------
function loadFavs() {
  try { favs = JSON.parse(ls("favs") || "[]"); } catch (e) { favs = []; }
  const old = ls("mine"); // पुरानी "मेरी बसें" सूची अपने आप जुड़ जाए
  if (old && !favs.length) favs = old.split(/[\s,]+/).map((x) => x.toUpperCase()).filter(Boolean);
}
function toggleFav(reg) {
  const i = favs.indexOf(reg);
  if (i >= 0) favs.splice(i, 1); else favs.push(reg);
  ls("favs", JSON.stringify(favs));
  if ($("favOnly").checked) render(true);
  else document.querySelectorAll('.star[data-fav="' + reg + '"]').forEach((e) => (e.textContent = favs.includes(reg) ? "★" : "☆"));
}

// ---------- चुनी हुई बस: लिस्ट और नक्शा दोनों में हाइलाइट ----------
function selectBus(reg, fromMap) {
  if (selected && markers[selected] && busByReg[selected]) markers[selected].setIcon(busIcon(busByReg[selected], false));
  document.querySelectorAll(".card.sel").forEach((e) => e.classList.remove("sel"));
  selected = reg;
  const card = document.querySelector('.card[data-reg="' + reg + '"]');
  if (card) {
    card.classList.add("sel");
    if (fromMap) card.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  const m = markers[reg];
  if (m && map) {
    m.setIcon(busIcon(busByReg[reg], true));
    m.setZIndexOffset(1000);
    if (!fromMap) { map.setView(m.getLatLng(), 16); m.openPopup(); }
  }
}

// ---------- लिस्ट + नक्शा बनाना ----------
function depotHue(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; }

function card(b, d) {
  const reg = b.regNum.toUpperCase();
  const tr = trendOf(b, d);
  const who = originIsGps ? "आपकी" : "स्टैंड की";
  let trend = "";
  if (tr) {
    if (tr.k === "in") trend = `<div class="tr in">🟢 ${who} ओर आ रही · लगभग ${tr.eta} मिनट में <small>(अनुमान)</small></div>`;
    else if (tr.k === "out") trend = `<div class="tr out">🔴 ${originIsGps ? "आपसे" : "स्टैंड से"} दूर जा रही</div>`;
    else if (tr.k === "side") trend = `<div class="tr side">🟡 बगल से गुज़र रही</div>`;
    else trend = `<div class="tr near">📍 बिल्कुल पास में</div>`;
  }
  const moving = b.vehicle_status === "live" && b.speed >= 5 && b.heading != null;
  const dir = moving ? `<div class="line"><span class="arr" style="transform:rotate(${b.heading}deg)">↑</span> <b>${dirName(b.heading)}</b> की ओर जा रही</div>` : "";
  let route = "";
  if (b.route_description) route = `<div class="route">🛣 ${esc(b.route_description).replace(/ TO /g, " → ")}</div>`;
  else if (b.destination) route = `<div class="route">🛣 → ${esc(b.destination)}</div>`;
  else route = `<div class="route none">🛣 रूट की जानकारी उपलब्ध नहीं</div>`;
  const nxt = b.next_stop ? `<div class="line">अगला स्टॉप: <b>${esc(b.next_stop)}</b></div>` : "";
  const m = ageMin(b.receivedTime);
  const stale = m != null && m >= 15 && (b.vehicle_status === "live" || b.vehicle_status === "stationary");
  return `<div class="card ${b.vehicle_status}${selected === reg ? " sel" : ""}" data-reg="${reg}">
    <div class="top"><div class="reg">${reg}</div>
      <button class="star" data-fav="${reg}">${favs.includes(reg) ? "★" : "☆"}</button>
      <div class="dist">${d.toFixed(1)} km</div></div>
    <div class="chips">
      <span class="chip st ${b.vehicle_status}">${STATUS[b.vehicle_status] || esc(b.vehicle_status)}</span>
      ${b.depot_name ? `<span class="chip depot" style="--h:${depotHue(b.depot_name)}">🏢 ${esc(depotHi(b.depot_name))}</span>` : ""}
      ${m != null ? `<span class="chip age${stale ? " warn" : ""}">${ageLabel(b.receivedTime)}</span>` : ""}
    </div>
    ${trend}${dir}
    <div class="line">🕒 ${timeText(b.receivedTime)} · ${b.speed || 0} km/h</div>
    ${route}${nxt}
    <div class="line zone">${esc(b.zone_name || "")}</div>
  </div>`;
}

function render(keepView) {
  const radius = parseFloat($("radius").value);
  const q = $("search").value.trim().toUpperCase();
  const favMode = $("favOnly").checked;
  let rows, mode;
  if (q) {
    mode = "खोज";
    rows = allBuses.filter((b) => [b.regNum, b.route_description, b.destination, b.depot_name, depotHi(b.depot_name), b.zone_name]
      .some((v) => v && String(v).toUpperCase().includes(q)));
  } else if (favMode) {
    mode = "⭐ मेरी बसें";
    rows = favs.map((r) => busByReg[r]).filter(Boolean);
  } else {
    mode = radius + " km के भीतर";
    rows = allBuses.filter((b) => hav(origin[0], origin[1], b.latitude, b.longitude) <= radius);
    if ($("onlyLive").checked) rows = rows.filter((b) => b.vehicle_status === "live" || b.vehicle_status === "stationary");
  }
  let list = rows.map((b) => ({ b, d: hav(origin[0], origin[1], b.latitude, b.longitude) }));
  if (!q && !favMode && $("onlyComing").checked) list = list.filter(({ b, d }) => { const t = trendOf(b, d); return t && (t.k === "in" || t.k === "near"); });
  list.sort((a, b) => a.d - b.d);
  const total = list.length;
  list = list.slice(0, 200);

  $("status").textContent = total + " बसें मिलीं (" + mode + ")" + (total > 200 ? " — सबसे पास की 200 दिखा रहे हैं" : "");
  $("list").innerHTML = list.length ? list.map(({ b, d }) => card(b, d)).join("")
    : '<div class="empty">कोई बस नहीं मिली। दायरा बढ़ाएँ या फ़िल्टर हटाएँ।</div>';

  // पूरे डेटा की ताज़गी
  let newest = 0;
  allBuses.forEach((b) => { const p = parseT(b.receivedTime); if (p && p.epoch > newest) newest = p.epoch; });
  const gap = newest ? Math.round((Date.now() - newest) / 60000) : 0;
  $("banner").style.display = gap > 30 ? "block" : "none";
  $("banner").textContent = "⚠ साइट का सबसे नया डेटा भी " + (gap < 120 ? gap + " मिनट" : Math.round(gap / 60) + " घंटे") + " पुराना है";

  markers = {};
  if (window.L) {
    if (!map) {
      map = L.map("map");
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);
      layer = L.layerGroup().addTo(map);
    }
    layer.clearLayers();
    L.circleMarker(origin, { color: "#1565c0", fillColor: "#1565c0", fillOpacity: 0.9, radius: 9 }).addTo(layer)
      .bindPopup(originIsGps ? "📍 आप यहाँ हैं" : "📍 स्टैंड");
    list.forEach(({ b, d }) => {
      const reg = b.regNum.toUpperCase();
      const mk = L.marker([b.latitude, b.longitude], { icon: busIcon(b, selected === reg) }).addTo(layer);
      mk.bindPopup("<b>" + reg + "</b><br>" + d.toFixed(1) + " km · " + (STATUS[b.vehicle_status] || "") +
        "<br>" + (b.speed || 0) + " km/h" + (b.heading != null && b.speed >= 3 ? " · " + dirName(b.heading) : "") +
        (b.depot_name ? "<br>🏢 " + esc(depotHi(b.depot_name)) : ""));
      mk.on("click", () => selectBus(reg, true));
      markers[reg] = mk;
    });
    if (!keepView) {
      if ((q || favMode) && list.length) {
        const pts = list.map(({ b }) => [b.latitude, b.longitude]).concat([origin]);
        map.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
      } else map.setView(origin, radius <= 3 ? 13 : radius <= 6 ? 12 : radius <= 12 ? 11 : 10);
    }
  }
}

async function refresh(auto) {
  if (busy) return;
  busy = true;
  $("btn").disabled = true;
  try {
    await resolveOrigin();
    await loadBuses();
    render(auto === true);
  } catch (e) {
    $("status").textContent = "गड़बड़ी: " + (e.message || e);
  }
  $("btn").disabled = false;
  busy = false;
}

function setAuto() {
  if (timer) { clearInterval(timer); timer = null; }
  ls("auto", $("auto").checked ? "1" : "0");
  if ($("auto").checked) timer = setInterval(() => refresh(true), 120000);
}

function setTheme(dark) {
  document.body.classList.toggle("dark", dark);
  $("theme").textContent = dark ? "☀️" : "🌙";
  ls("dark", dark ? "1" : "0");
}

function init() {
  const sel = $("origin");
  sel.innerHTML = '<option value="gps">📍 मेरी location</option>' +
    STANDS.map((s, i) => `<option value="${i}">🚏 ${s[0]}</option>`).join("") +
    '<option value="custom">✏️ अपना lat,lon</option>';
  loadFavs();
  sel.value = ls("origin") || "gps";
  if (sel.selectedIndex < 0) sel.value = "gps";
  sel.onchange = () => { ls("origin", sel.value); $("custom").style.display = sel.value === "custom" ? "block" : "none"; if (allBuses.length) refresh(); };
  $("custom").style.display = sel.value === "custom" ? "block" : "none";
  $("btn").onclick = () => refresh();
  ["radius", "onlyLive", "onlyComing", "favOnly"].forEach((id) => ($(id).onchange = () => allBuses.length && render()));
  $("search").oninput = () => allBuses.length && render();
  $("auto").checked = ls("auto") === "1";
  $("auto").onchange = setAuto;
  setAuto();
  const saved = ls("dark");
  setTheme(saved === null ? !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) : saved === "1");
  $("theme").onclick = () => setTheme(!document.body.classList.contains("dark"));
  $("list").onclick = (e) => {
    const star = e.target.closest(".star");
    if (star) { toggleFav(star.getAttribute("data-fav")); return; }
    const c = e.target.closest(".card");
    if (c) selectBus(c.getAttribute("data-reg"), false);
  };
  refresh();
}
window.addEventListener("load", init);
