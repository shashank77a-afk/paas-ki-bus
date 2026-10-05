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

// समय को बिना UTC में बदले सीधे लोकल (IST) टाइम में दिखाने का पक्का तरीका
function ageText(t) {
  if (!t) return "";
  
  // API से आने वाले "YYYY-MM-DD HH:MM:SS" को टुकड़ों में तोड़ना
  let p = t.split(/[- :]/);
  
  if (p.length >= 5) {
    // इसे सीधे लोकल टाइम के रूप में सेट करना (जिससे Android 5.5 घंटे नहीं जोड़ेगा)
    // p[1] - 1 इसलिए क्योंकि जावास्क्रिप्ट में महीने 0 से शुरू होते हैं
    let d = new Date(p[0], p[1] - 1, p[2], p[3], p[4], p[5] || 0);
    
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }
  
  return t; // अगर फॉर्मेट अलग हुआ तो जो आ रहा है वही दिखाएगा 
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
