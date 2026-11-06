// AI CBT Solver — Triple Provider Proxy with Multi-Key Auto-Rotation
// Urutan: Gemini Flash (Utama & Cepat) → NVIDIA NIM → OpenRouter
// POST /api/chat

function getKeys(prefix, singleEnv) {
  const numbered = Object.keys(process.env)
    .filter(k => new RegExp(`^${prefix}_\\d+$`).test(k))
    .sort((a, b) => Number(a.split("_").pop()) - Number(b.split("_").pop()))
    .map(k => process.env[k]);
  const csv = (process.env[`${prefix}S`] || "").split(",");
  const single = process.env[singleEnv] ? [process.env[singleEnv]] : [];
  return [...single, ...numbered, ...csv]
    .map(k => (k || "").trim().replace(/^["']|["']$/g, "").trim())
    .filter(Boolean)
    .filter((k, i, a) => a.indexOf(k) === i);
}

// Model list resmi Google untuk Auth Key
const GEMINI_MODELS = [
  "gemini-flash-latest",
  "gemini-3.8-flash",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash"
];

const NVIDIA_MODELS = [
  "meta/llama-3.2-90b-vision-instruct"
];

const OPENROUTER_MODELS = [
  "nvidia/nemotron-3.5-super-vl:free",
  "nvidia/nemotron-3.5-lightning:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "dots-studio/dots-3-note-preview:free",
  "openrouter/free"
];

// Timeout per request (Vercel maxDuration adalah 30s)
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 24000);

// Gemini di posisi pertama agar super cepat (1.5 - 2 detik), cadangan ke NVIDIA & OpenRouter
const PROVIDER_ORDER = ["gemini", "nvidia", "openrouter"];

async function fetchT(url, opts, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ─── Gemini Flash Multi-Key (Posisi 1 - Utama) ─────────────────────────────────
async function callGemini(payload) {
  const keys = getKeys("GEMINI_API_KEY", "GEMINI_API_KEY");
  if (keys.length === 0) throw { status: 500, message: "GEMINI_API_KEY belum diatur" };

  let lastErr;
  for (const key of keys) {
    for (const model of GEMINI_MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      try {
        const res = await fetchT(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key
          },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
          lastErr = { status: res.status, message: `${model}: ${data?.error?.message || res.statusText}` };
          // Jika key tidak valid (401), tidak berhak (403), atau limit kuota (429), LANGSUNG ganti ke key Gemini berikutnya!
          if (res.status === 401 || res.status === 403 || res.status === 429 || data?.error?.message?.toLowerCase().includes("quota") || data?.error?.message?.toLowerCase().includes("key")) {
            break;
          }
          continue;
        }
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) continue;
        return { text, model: `gemini (${model})` };
      } catch (e) {
        lastErr = { status: 408, message: `Gemini ${model}: ${e.name === "AbortError" ? "timeout" : e.message}` };
      }
    }
  }
  throw lastErr || { status: 503, message: "Semua key Gemini gagal/penuh" };
}

// ─── NVIDIA NIM Multi-Key (Posisi 2 - Cadangan Cerdas) ─────────────────────────
async function callNvidia(messages) {
  const keys = getKeys("NVIDIA_API_KEY", "NVIDIA_API_KEY");
  if (keys.length === 0) throw { status: 500, message: "NVIDIA_API_KEY belum diatur" };

  let lastErr;
  for (const key of keys) {
    for (const m of NVIDIA_MODELS) {
      try {
        const res = await fetchT("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": `Bearer ${key}`
          },
          body: JSON.stringify({ model: m, messages, max_tokens: 300, temperature: 0.1 })
        });
        const data = await res.json();
        if (!res.ok) {
          lastErr = { status: res.status, message: `${m}: ${data?.detail || data?.error?.message || res.statusText}` };
          if (res.status === 429) break;
          continue;
        }
        const text = data?.choices?.[0]?.message?.content;
        if (!text) continue;
        return { text, model: m };
      } catch (e) {
        lastErr = { status: 408, message: `${m}: ${e.name === "AbortError" ? "timeout" : e.message}` };
      }
    }
  }
  throw lastErr || { status: 500, message: "NVIDIA semua key/model gagal" };
}

// ─── OpenRouter Multi-Key (Posisi 3 - Cadangan Terakhir) ───────────────────────
async function callOpenRouter(messages) {
  const keys = getKeys("OPENROUTER_API_KEY", "OPENROUTER_API_KEY");
  if (keys.length === 0) throw { status: 500, message: "OPENROUTER_API_KEY belum diatur" };

  let lastErr;
  for (const key of keys) {
    for (const model of OPENROUTER_MODELS) {
      try {
        const res = await fetchT("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`,
            "HTTP-Referer": "https://aichat-nine-beta.vercel.app",
            "X-Title": "AI CBT Solver"
          },
          body: JSON.stringify({ model, messages, max_tokens: 300, temperature: 0.1 })
        });
        const data = await res.json();
        if (!res.ok) {
          lastErr = { status: res.status, message: `${model}: ${data?.error?.message || res.statusText}` };
          if (res.status === 429 && data?.error?.message?.includes("free-models-per-day")) break;
          continue;
        }
        const text = data?.choices?.[0]?.message?.content;
        if (!text) continue;
        return { text, model: data.model || model };
      } catch (e) {
        lastErr = { status: 408, message: `${model}: ${e.name === "AbortError" ? "timeout" : e.message}` };
      }
    }
  }
  throw lastErr || { status: 500, message: "OpenRouter semua key/model gagal" };
}

function toGeminiPayload(messages) {
  const parts = [];
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const c of msg.content) {
        if (c.type === "text") parts.push({ text: c.text });
        if (c.type === "image_url") {
          const url = c.image_url?.url || "";
          if (url.startsWith("data:")) {
            const [meta, data] = url.split(",");
            parts.push({ inlineData: { mimeType: meta.split(":")[1].split(";")[0], data } });
          }
        }
      }
    }
  }
  return { contents: [{ parts }], generationConfig: { temperature: 0.1, maxOutputTokens: 300 } };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method tidak diizinkan" });

  const body = typeof req.body === "object" ? req.body : {};
  const { provider = "auto", messages, ...rest } = body;
  if (!messages && !rest.contents) return res.status(400).json({ error: "Field 'messages' diperlukan" });

  const queue = provider === "auto"
    ? PROVIDER_ORDER
    : [provider, ...PROVIDER_ORDER.filter(p => p !== provider)];
  const errors = [];

  for (const p of queue) {
    try {
      let result;
      if (p === "gemini")         result = await callGemini(rest.contents ? rest : toGeminiPayload(messages || []));
      else if (p === "nvidia")    result = await callNvidia(messages || []);
      else if (p === "openrouter") result = await callOpenRouter(messages || []);
      else continue;
      return res.status(200).json({
        provider: p,
        model: result.model,
        text: result.text,
        tried: errors.map(e => e.provider)
      });
    } catch (e) {
      errors.push({ provider: p, error: e.message || String(e), status: e.status || 500 });
    }
  }

  return res.status(502).json({ error: "Semua provider gagal merespons", details: errors });
}