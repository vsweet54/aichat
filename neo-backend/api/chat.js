// NEO Floating AI - backend proxy (Vercel Serverless Function)
// POST /api/chat
// Header : x-app-token: <APP_TOKEN>
// Body   : { "model": "chatex" (opsional), "fallback": true (opsional), ...payload untuk Zapi }

const ZAPI_BASE_URL = process.env.ZAPI_BASE_URL || "https://api.zapi.ink";

// Urutan fallback sesuai spesifikasi
const MODEL_ORDER = ["chatex", "copilot", "dolphin", "felo", "google-aimode"];

const MODEL_PATH = {
  chatex: "/v1/ai:chatex/chat",
  copilot: "/v1/ai:copilot/chat",
  dolphin: "/v1/ai:dolphin/chat",
  felo: "/v1/ai:felo/chat",
  "google-aimode": "/v1/ai:google-aimode/chat",
};

// Timeout per model (ms). Total harus muat di maxDuration (lihat vercel.json).
const PER_MODEL_TIMEOUT_MS = Number(process.env.PER_MODEL_TIMEOUT_MS || 9000);
// Sisa waktu minimum supaya model berikutnya masih dicoba
const TOTAL_BUDGET_MS = Number(process.env.TOTAL_BUDGET_MS || 55000);

// Daftar API key: ZAPI_API_KEYS (pisahkan dengan koma) atau ZAPI_API_KEY (satu key)
function getKeys() {
  const raw = process.env.ZAPI_API_KEYS || process.env.ZAPI_API_KEY || "";
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

// Mulai dari key acak supaya beban tersebar, lalu putar ke key berikutnya
function rotatedKeys(keys) {
  const start = Math.floor(Math.random() * keys.length);
  return keys.slice(start).concat(keys.slice(0, start));
}

// Ganti ke key lain hanya jika key ditolak / kena limit
const KEY_FAILOVER_STATUS = [401, 403, 429];

async function callWithKeys(model, payload, timeoutMs, keys, deadline) {
  let lastErr;
  for (const key of rotatedKeys(keys)) {
    const left = deadline - Date.now();
    if (left < 2000) break;
    try {
      return await callModel(model, payload, Math.min(timeoutMs, left), key);
    } catch (e) {
      lastErr = e;
      if (!KEY_FAILOVER_STATUS.includes(e.status)) throw e;
    }
  }
  throw lastErr || new Error("Tidak ada API key yang bisa dipakai");
}

async function callModel(model, payload, timeoutMs, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(ZAPI_BASE_URL + MODEL_PATH[model], {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method tidak diizinkan" });
  }

  const keys = getKeys();
  if (keys.length === 0) {
    return res.status(500).json({ error: "ZAPI_API_KEYS belum diatur di server" });
  }

  // Token sederhana supaya URL publik tidak sembarang dipakai
  const expected = process.env.APP_TOKEN;
  if (expected && req.headers["x-app-token"] !== expected) {
    return res.status(401).json({ error: "Tidak diizinkan" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { model, fallback = true, ...payload } = body;

  if (model && !MODEL_PATH[model]) {
    return res.status(400).json({ error: `Model tidak dikenal: ${model}` });
  }

  // Tentukan daftar model yang dicoba
  let queue;
  if (model && !fallback) {
    queue = [model];
  } else if (model) {
    const start = MODEL_ORDER.indexOf(model);
    queue = MODEL_ORDER.slice(start);
  } else {
    queue = MODEL_ORDER;
  }

  const startedAt = Date.now();
  const errors = [];

  for (const m of queue) {
    const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt);
    if (remaining < 2000) break;
    const timeout = Math.min(PER_MODEL_TIMEOUT_MS, remaining);
    try {
      const data = await callWithKeys(m, payload, timeout, keys, startedAt + TOTAL_BUDGET_MS);
      return res.status(200).json({ model: m, data, tried: errors.map((e) => e.model) });
    } catch (e) {
      errors.push({
        model: m,
        error: e.name === "AbortError" ? "timeout" : e.message,
        status: e.status || null,
      });
    }
  }

  return res.status(502).json({
    error: "Semua model gagal merespons",
    details: errors,
  });
}
