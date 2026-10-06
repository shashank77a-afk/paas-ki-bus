const API = "https://margdarshi.upsrtcvlt.com/php/getGpsLiveData.php";
// अपने स्टैंड यहाँ जोड़ें: [नाम, latitude, longitude]
const STANDS = [
  ["बछरावां", 26.4667, 81.1167],
  ["लालगंज", 26.167679, 80.973389]
];
const $ = (id) => document.getElementById(id);
let map, layer, allBuses = [], origin = null, markers = {};

function hav(a, b, c, d) {
  const p = Math.PI / 180;
  const x = Math.sin((c - a) * p / 2) ** 2 +
    Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}

function ls(k, v) {
  try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {}
}

// ---- समय: साइट का समय असल में भारतीय समय (IST) है, भले ही अंत में Z लिखा हो ----
function parseT(t) {
  const m = String(t || "").match(/(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d):(\d\d)/);
  if (!m) return null;
  const [Y, M, D, h, mi, s] = m.slice(1).map(Number);
  const epoch = Date.UTC(Y, M - 1, D, h, mi, s) - 5.5 * 3600 * 1000; // IST -> असली समय
  return { epoch, Y, M, D, h, mi };
}
function timeText(t) {
  const p = parseT(t);
  if (!p) return "";
  const ap = p.h >= 12 ? "PM" : "AM";
  const h12 = p.h % 12 || 12;
  const pad = (n) => (n < 10 ? "0" + n : "" + n);
  let clock = pad(h12) + ":" + pad(p.mi) + " " + ap;
  const min = Math.max(0, Math.round((Date.now() - p.epoch) / 60000));
  let age;
  if (min < 1) age = "अभी";
  else if (min < 60) age = min + " मिनट पहले";
  else if (min < 1440) age = Math.round(min / 60) + " घंटे पहले";
  else { age = Math.round(min / 1440) + " दिन पहले"; clock = pad(p.D) + "/" + pad(p.M) + " " + clock; }
  return clock + " (" + age + ")";
}

const STATUS = { live: "चालू", stationary: "रुकी हुई", no_signal: "सिग्नल नहीं", under_maintenance: "मेंटेनेंस" };

// ---- बस का चिह्न: हरा = चल रही, लाल = रुकी हुई, स्लेटी = बाकी ----
function busColor(s) {
  return s === "live" ? "#1a9a3a" : s === "stationary" ? "#d93025" : "#888";
}
function busIcon(s, big) {
  const c = busColor(s);
  const z = big ? 44 : 32;
  const svg = `<svg width="${z}" height="${z}" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">
    <circle cx="17" cy="17" r="16" fill="#fff" stroke="${c}" stroke-width="2"/>
    <rect x="8" y="8" width="18" height="16" rx="3" fill="${c}"/>
    <rect x="10" y="10" width="14" height="6" rx="1" fill="#fff"/>
    <rect x="10" y="18" width="3" height="2" fill="#fff"/>
    <rect x="21" y="18" width="3" height="2" fill="#fff"/>
    <circle cx="12" cy="25" r="2" fill="#222"/><circle cx="22" cy="25" r="2" fill="#222"/>
  </svg>`;
  return L.divIcon({ html: svg, className: "busicon", iconSize: [z, z], iconAnchor: [z / 2, z / 2], popupAnchor: [0, -z / 2] });
}

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
}

async function resolveOrigin() {
  const v = $("origin").value;
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

// लिस्ट की बस पर क्लिक -> नक्शे में वही बस दिखे
function focusBus(reg) {
  const m = markers[reg];
  if (!m || !map) return;
  document.querySelectorAll(".card.sel").forEach((e) => e.classList.remove("sel"));
  const card = document.querySelector('.card[data-reg="' + reg + '"]');
  if (card) card.classList.add("sel");
  $("map").scrollIntoView({ behavior: "smooth", block: "start" });
  map.setView(m.getLatLng(), 16);
  m.setZIndexOffset(1000);
  m.openPopup();
}

function render() {
  const radius = parseFloat($("radius").value);
  const onlyLive = $("onlyLive").checked;
  const mine = $("mine").value.split(/[\s,]+/).map((x) => x.toUpperCase()).filter(Boolean);
  ls("mine", $("mine").value);
  let rows = allBuses.map((b) => ({ b, d: hav(origin[0], origin[1], b.latitude, b.longitude) }))
    .filter((x) => x.d <= radius);
  if (onlyLive) rows = rows.filter((x) => x.b.vehicle_status === "live" || x.b.vehicle_status === "stationary");
  if (mine.length) rows = rows.filter((x) => mine.includes(x.b.regNum.toUpperCase()));
  rows.sort((a, b) => a.d - b.d);
  rows = rows.slice(0, 200);

  $("status").textContent = rows.length + " बसें मिलीं (" + radius + " km के भीतर)";
  $("list").innerHTML = rows.map(({ b, d }) => `
    <div class="card ${b.vehicle_status}" data-reg="${b.regNum}">
      <div class="top"><b>${b.regNum}</b><span>${d.toFixed(1)} km</span></div>
      <div class="sub">${STATUS[b.vehicle_status] || b.vehicle_status || ""} · ${b.speed || 0} km/h · ${timeText(b.receivedTime)}</div>
      <div class="sub">${b.zone_name || ""}${b.depot_name ? " · डिपो: " + b.depot_name : ""}</div>
    </div>`).join("");

  markers = {};
  if (window.L) {
    if (!map) {
      map = L.map("map");
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);
      layer = L.layerGroup().addTo(map);
    }
    layer.clearLayers();
    L.circleMarker(origin, { color: "blue", radius: 9 }).addTo(layer).bindPopup("आप / स्टैंड");
    rows.forEach(({ b, d }) => {
      const mk = L.marker([b.latitude, b.longitude], { icon: busIcon(b.vehicle_status) }).addTo(layer);
      mk.bindPopup("<b>" + b.regNum + "</b><br>" + d.toFixed(1) + " km · " + (STATUS[b.vehicle_status] || "") +
        "<br>" + (b.speed || 0) + " km/h<br>" + timeText(b.receivedTime));
      markers[b.regNum] = mk;
    });
    map.setView(origin, radius <= 3 ? 13 : radius <= 6 ? 12 : radius <= 12 ? 11 : 10);
  }
  document.querySelectorAll(".card").forEach((el) => {
    el.onclick = () => focusBus(el.getAttribute("data-reg"));
  });
}

async function refresh() {
  $("btn").disabled = true;
  try {
    await resolveOrigin();
    await loadBuses();
    render();
  } catch (e) {
    $("status").textContent = "गड़बड़ी: " + (e.message || e);
  }
  $("btn").disabled = false;
}

function init() {
  const sel = $("origin");
  sel.innerHTML = '<option value="gps">📍 मेरी location</option>' +
    STANDS.map((s, i) => `<option value="${i}">${s[0]}</option>`).join("") +
    '<option value="custom">अपना lat,lon</option>';
  $("mine").value = ls("mine") || "";
  sel.value = ls("origin") || "gps";
  sel.onchange = () => { ls("origin", sel.value); $("custom").style.display = sel.value === "custom" ? "block" : "none"; };
  sel.onchange();
  $("btn").onclick = refresh;
  ["radius", "onlyLive"].forEach((id) => ($(id).onchange = () => allBuses.length && render()));
  $("mine").onchange = () => allBuses.length && render();
  refresh();
}
window.addEventListener("load", init);
