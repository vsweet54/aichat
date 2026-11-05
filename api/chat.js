// AI CBT Solver — Vercel Proxy (tanpa token)
// POST /api/chat
// Body: { "provider": "gemini" | "zapi", ...payload }

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-3.8-flash"];

const ZAPI_BASE = process.env.ZAPI_BASE_URL || "https://api.zapi.ink";
const ZAPI_MODEL_PATH = {
  chatex:          "/v1/ai:chatex/chat",
  copilot:         "/v1/ai:copilot/chat",
  dolphin:         "/v1/ai:dolphin/chat",
  felo:            "/v1/ai:felo/chat",
  "google-aimode": "/v1/ai:google-aimode/chat",
};
const ZAPI_ORDER = ["chatex", "copilot", "dolphin"];
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 15000);

function getZapiKeys() {
  const numbered = Object.keys(process.env)
    .filter(k => /^ZAPI_KEY_\d+$/.test(k))
    .sort((a, b) => Number(a.split("_").pop()) - Number(b.split("_").pop()))
    .map(k => process.env[k]);
  const listed = (process.env.ZAPI_API_KEYS || "").split(",");
  return [...numbered, ...listed].map(k => (k||"").trim()).filter(Boolean)
    .filter((k,i,a) => a.indexOf(k) === i);
}

async function fetchWithTimeout(url, options, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally { clearTimeout(timer); }
}

async function callSingleGemini(modelName, payload) {
  if (!GEMINI_API_KEY) throw { status: 500, message: "GEMINI_API_KEY belum diatur di Vercel" };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
  const res = await fetchWithTimeout(
    `${url}?key=${GEMINI_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    TIMEOUT_MS
  );
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Gemini HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function callGeminiWithFallback(preferredModel, payload, allowFallback = true) {
  const primary = preferredModel || DEFAULT_GEMINI_MODEL;
  const queue = allowFallback
    ? [primary, ...GEMINI_MODELS.filter(m => m !== primary)]
    : [primary];

  let lastError;
  for (const m of queue) {
    try {
      const data = await callSingleGemini(m, payload);
      return { model: m, data };
    } catch (e) {
      lastError = e;
      // If error is high demand / 503 / 429 / 404, try next model in queue
      if ([404, 429, 500, 503].includes(e.status) || (e.message && e.message.includes("high demand"))) {
        continue;
      }
      throw e;
    }
  }
  throw lastError || new Error("Semua model Gemini sedang sibuk");
}

async function callZapi(model, payload) {
  const keys = getZapiKeys();
  if (!keys.length) throw { status: 500, message: "ZAPI_KEY_1 belum diatur" };
  const path = ZAPI_MODEL_PATH[model];
  if (!path) throw { status: 400, message: `Model tidak dikenal: ${model}` };
  const start = Math.floor(Math.random() * keys.length);
  const rotated = [...keys.slice(start), ...keys.slice(0, start)];
  let lastErr;
  for (const key of rotated) {
    try {
      const res = await fetchWithTimeout(
        ZAPI_BASE + path,
        { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key }, body: JSON.stringify(payload) },
        TIMEOUT_MS
      );
      const data = await res.json();
      if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; if ([401,403,429].includes(res.status)) { lastErr = e; continue; } throw e; }
      return data;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("Semua key gagal");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method tidak diizinkan" });

  // CORS — boleh diakses dari mana saja
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const body = typeof req.body === "object" ? req.body : {};
  const { provider = "gemini", model, fallback = true, ...payload } = body;

  try {
    if (provider === "gemini") {
      const { model: usedModel, data } = await callGeminiWithFallback(model, payload, fallback !== false);
      return res.status(200).json({ provider: "gemini", model: usedModel, data });
    } else {
      const queue = model
        ? (fallback ? ZAPI_ORDER.slice(ZAPI_ORDER.indexOf(model)) : [model])
        : ZAPI_ORDER;
      const errors = [];
      for (const m of queue) {
        try {
          const data = await callZapi(m, payload);
          return res.status(200).json({ provider: "zapi", model: m, data, tried: errors.map(e => e.model) });
        } catch (e) { errors.push({ model: m, error: e.message }); }
      }
      return res.status(502).json({ error: "Semua model gagal", details: errors });
    }
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Internal error" });
  }
}
