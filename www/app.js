const API = "https://margdarshi.upsrtcvlt.com/php/getGpsLiveData.php";
// अपने स्टैंड यहाँ जोड़ें: [नाम, latitude, longitude]
const STANDS = [
  ["बछरावां बस स्टेशन (अनुमानित)", 26.4667, 81.1167],
  ["लालगंज", 26.167679, 80.973389]
];
const $ = (id) => document.getElementById(id);
let map, layer, allBuses = [], origin = null;

function hav(a, b, c, d) {
  const p = Math.PI / 180;
  const x = Math.sin((c - a) * p / 2) ** 2 +
    Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}

function ls(k, v) {
  try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {}
}

// समय को भारतीय समय (IST) में बदलने के लिए अपडेटेड फंक्शन
function ageText(t) {
  if (!t) return "";
  
  let safeT = t.replace(' ', 'T');
  if (safeT.length === 19) safeT += '+05:30';
  
  const d = new Date(safeT);
  if (isNaN(d.getTime())) return t;
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

const STATUS = { live: "चालू", stationary: "रुकी हुई", no_signal: "सिग्नल नहीं", under_maintenance: "मेंटेनेंस" };

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

  $("status").textContent = rows.length + " बसें मिलीं (" + radius + " km के भीतर)";
  $("list").innerHTML = rows.slice(0, 200).map(({ b, d }) => `
    <div class="card ${b.vehicle_status}">
      <div class="top"><b>${b.regNum}</b><span>${d.toFixed(1)} km</span></div>
      <div class="sub">${STATUS[b.vehicle_status] || b.vehicle_status || ""} · ${b.speed || 0} km/h · ${ageText(b.receivedTime)}</div>
      <div class="sub">${b.zone_name || ""}${b.depot_name ? " · डिपो: " + b.depot_name : ""}</div>
    </div>`).join("");

  if (window.L) {
    if (!map) {
      map = L.map("map");
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);
      layer = L.layerGroup().addTo(map);
    }
    layer.clearLayers();
    L.circleMarker(origin, { color: "blue", radius: 9 }).addTo(layer).bindPopup("आप / स्टैंड");
    rows.slice(0, 200).forEach(({ b, d }) =>
      L.circleMarker([b.latitude, b.longitude], { color: b.vehicle_status === "live" ? "green" : "gray", radius: 6 })
        .addTo(layer).bindPopup(b.regNum + "<br>" + d.toFixed(1) + " km"));
    map.setView(origin, radius <= 3 ? 13 : radius <= 6 ? 12 : radius <= 12 ? 11 : 10);
  }
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
  ["radius", "onlyLive"].forEach((id) => ($(id).onchange = () => allBuses.length && render()));$("mine").onchange = () => allBuses.length && render();
  refresh();
}
window.addEventListener("load", init);
