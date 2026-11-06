// AI CBT Solver — Triple Provider Proxy
// Urutan: OpenRouter → NVIDIA NIM → Gemini Flash (Gemini cadangan terakhir)
// POST /api/chat

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const NVIDIA_KEY     = process.env.NVIDIA_API_KEY;
const GEMINI_KEY     = process.env.GEMINI_API_KEY;

// OpenRouter Free Models
const OPENROUTER_MODELS = [
  "nvidia/nemotron-3.5-super-vl:free",
  "nvidia/nemotron-3.5-lightning:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "dots-studio/dots-3-note-preview:free",
  "openrouter/free"
];

// NVIDIA NIM Vision Models (90B terbukti aktif & akurat)
const NVIDIA_MODELS = [
  "meta/llama-3.2-90b-vision-instruct"
];

// Gemini Models (gemini-2.0-flash punya kuota 1500 req/hari)
const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-exp",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
  "gemini-3.8-flash"
];

// Timeout 24s (Vercel maxDuration adalah 30s) agar NVIDIA 90B selesai membaca gambar
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 24000);

// Sesuai instruksi user: Gemini selalu di urutan terakhir
const PROVIDER_ORDER = ["openrouter", "nvidia", "gemini"];

async function fetchT(url, opts, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function callOpenRouter(messages) {
  if (!OPENROUTER_KEY) throw { status: 500, message: "OPENROUTER_API_KEY belum diatur" };
  let lastErr;
  for (const model of OPENROUTER_MODELS) {
    try {
      const res = await fetchT("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_KEY}`,
          "HTTP-Referer": "https://aichat-nine-beta.vercel.app",
          "X-Title": "AI CBT Solver"
        },
        body: JSON.stringify({ model, messages, max_tokens: 300, temperature: 0.1 })
      });
      const data = await res.json();
      if (!res.ok) {
        lastErr = { status: res.status, message: `${model}: ${data?.error?.message || res.statusText}` };
        // Jika terkena kuota harian akun free, langsung hentikan OpenRouter agar instan ke NVIDIA
        if (res.status === 429 && data?.error?.message?.includes("free-models-per-day")) {
          break;
        }
        continue;
      }
      const text = data?.choices?.[0]?.message?.content;
      if (!text) {
        lastErr = { status: 500, message: `${model}: response kosong` };
        continue;
      }
      return { text, model: data.model || model };
    } catch (e) {
      lastErr = { status: 408, message: `${model}: ${e.name === "AbortError" ? "timeout" : e.message}` };
    }
  }
  throw lastErr || { status: 500, message: "OpenRouter semua model gagal" };
}

async function callNvidia(messages) {
  if (!NVIDIA_KEY) throw { status: 500, message: "NVIDIA_API_KEY belum diatur" };
  let lastErr;
  for (const m of NVIDIA_MODELS) {
    try {
      const res = await fetchT("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${NVIDIA_KEY}`
        },
        body: JSON.stringify({ model: m, messages, max_tokens: 300, temperature: 0.1 })
      });
      const data = await res.json();
      if (!res.ok) {
        lastErr = { status: res.status, message: `${m}: ${data?.detail || data?.error?.message || res.statusText}` };
        continue;
      }
      const text = data?.choices?.[0]?.message?.content;
      if (!text) {
        lastErr = { status: 500, message: `${m}: response kosong` };
        continue;
      }
      return { text, model: m };
    } catch (e) {
      lastErr = { status: 408, message: `${m}: ${e.name === "AbortError" ? "timeout" : e.message}` };
    }
  }
  throw lastErr || { status: 500, message: "NVIDIA semua model gagal" };
}

async function callGemini(payload) {
  if (!GEMINI_KEY) throw { status: 500, message: "GEMINI_API_KEY belum diatur" };
  let lastErr;
  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
    try {
      const res = await fetchT(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        lastErr = { status: res.status, message: `${model}: ${data?.error?.message || res.statusText}` };
        continue;
      }
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        lastErr = { status: 500, message: `${model}: response kosong` };
        continue;
      }
      return { text, model };
    } catch (e) {
      lastErr = { status: 408, message: `Gemini ${model}: ${e.name === "AbortError" ? "timeout" : e.message}` };
    }
  }
  throw lastErr || { status: 503, message: "Gemini semua model gagal" };
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
      if (p === "openrouter") result = await callOpenRouter(messages || []);
      else if (p === "nvidia")    result = await callNvidia(messages || []);
      else if (p === "gemini")    result = await callGemini(rest.contents ? rest : toGeminiPayload(messages || []));
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