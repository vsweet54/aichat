// AI CBT Solver — Triple Provider Proxy
// OpenRouter → NVIDIA NIM → Gemini Flash (auto-fallback)
// POST /api/chat
// Body: { "provider": "auto"|"openrouter"|"nvidia"|"gemini", ...payload }

// ─── Config ───────────────────────────────────────────────────────────────
const OPENROUTER_KEY  = process.env.OPENROUTER_API_KEY;
const NVIDIA_KEY      = process.env.NVIDIA_API_KEY;
const GEMINI_KEY      = process.env.GEMINI_API_KEY;

// Model vision terbaik per provider (semua GRATIS)
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "qwen/qwen2.5-vl-72b-instruct:free";
const NVIDIA_MODEL     = process.env.NVIDIA_MODEL     || "meta/llama-3.2-11b-vision-instruct";
const GEMINI_MODEL     = process.env.GEMINI_MODEL     || "gemini-2.0-flash";
const GEMINI_BACKUP    = "gemini-1.5-flash";

const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 25000);
const MAX_RETRY  = 2;

// Urutan fallback default
const PROVIDER_ORDER = ["openrouter", "nvidia", "gemini"];

// ─── Endpoints ────────────────────────────────────────────────────────────
const ENDPOINTS = {
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  nvidia:     "https://integrate.api.nvidia.com/v1/chat/completions",
  gemini:     `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
};

// ─── Helpers ──────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchT(url, opts, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

// ─── OpenRouter call (OpenAI-compatible, support vision) ──────────────────
// Model gratis vision: qwen/qwen2.5-vl-72b-instruct:free
//                      meta-llama/llama-3.2-11b-vision-instruct:free
//                      google/gemini-2.0-flash-exp:free
async function callOpenRouter(messages) {
  if (!OPENROUTER_KEY) throw { status: 500, message: "OPENROUTER_API_KEY belum diatur" };

  for (let i = 0; i <= MAX_RETRY; i++) {
    if (i > 0) await sleep(1000 * i);
    try {
      const res = await fetchT(ENDPOINTS.openrouter, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_KEY}`,
          "HTTP-Referer": "https://aichat-nine-beta.vercel.app",
          "X-Title": "AI CBT Solver"
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages,
          max_tokens: 400,
          temperature: 0.1
        })
      });

      const data = await res.json();
      if (res.status === 429 || res.status === 503) {
        if (i < MAX_RETRY) continue;
        throw { status: res.status, message: "OpenRouter rate limit / overload" };
      }
      if (!res.ok) throw { status: res.status, message: data?.error?.message || `OpenRouter HTTP ${res.status}` };

      // Ambil teks jawaban (OpenAI format)
      const text = data?.choices?.[0]?.message?.content;
      if (!text) throw { status: 500, message: "OpenRouter: response kosong" };
      return { text, model: data.model || OPENROUTER_MODEL };
    } catch (e) {
      if (e.name === "AbortError") { if (i < MAX_RETRY) continue; throw { status: 408, message: "OpenRouter timeout" }; }
      if (e.status) throw e;
      if (i < MAX_RETRY) continue;
      throw { status: 500, message: e.message };
    }
  }
}

// ─── NVIDIA NIM call (OpenAI-compatible, support vision) ──────────────────
// Model gratis vision: meta/llama-3.2-11b-vision-instruct
//                      google/paligemma
async function callNvidia(messages) {
  if (!NVIDIA_KEY) throw { status: 500, message: "NVIDIA_API_KEY belum diatur" };

  for (let i = 0; i <= MAX_RETRY; i++) {
    if (i > 0) await sleep(1000 * i);
    try {
      const res = await fetchT(ENDPOINTS.nvidia, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${NVIDIA_KEY}`
        },
        body: JSON.stringify({
          model: NVIDIA_MODEL,
          messages,
          max_tokens: 400,
          temperature: 0.1
        })
      });

      const data = await res.json();
      if (res.status === 429 || res.status === 503) {
        if (i < MAX_RETRY) continue;
        throw { status: res.status, message: "NVIDIA rate limit / overload" };
      }
      if (!res.ok) throw { status: res.status, message: data?.detail || `NVIDIA HTTP ${res.status}` };

      const text = data?.choices?.[0]?.message?.content;
      if (!text) throw { status: 500, message: "NVIDIA: response kosong" };
      return { text, model: NVIDIA_MODEL };
    } catch (e) {
      if (e.name === "AbortError") { if (i < MAX_RETRY) continue; throw { status: 408, message: "NVIDIA timeout" }; }
      if (e.status) throw e;
      if (i < MAX_RETRY) continue;
      throw { status: 500, message: e.message };
    }
  }
}

// ─── Gemini call (native format, support vision) ───────────────────────────
// Model: gemini-2.0-flash (1500 req/hari gratis) → gemini-1.5-flash (backup)
async function callGemini(geminiPayload) {
  if (!GEMINI_KEY) throw { status: 500, message: "GEMINI_API_KEY belum diatur" };

  const models = [GEMINI_MODEL, GEMINI_BACKUP];
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
    for (let i = 0; i <= MAX_RETRY; i++) {
      if (i > 0) await sleep(1000 * i);
      try {
        const res = await fetchT(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geminiPayload)
        });

        const data = await res.json();
        if (res.status === 429 || res.status === 503) {
          if (i < MAX_RETRY) continue;
          break; // coba model backup
        }
        if (!res.ok) throw { status: res.status, message: data?.error?.message || `Gemini HTTP ${res.status}` };

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw { status: 500, message: "Gemini: response kosong" };
        return { text, model };
      } catch (e) {
        if (e.name === "AbortError") { if (i < MAX_RETRY) continue; break; }
        if (e.status) throw e;
        if (i < MAX_RETRY) continue;
        break;
      }
    }
  }
  throw { status: 503, message: "Gemini semua model penuh, coba lagi sebentar" };
}

// ─── Convert messages OpenAI → Gemini format ──────────────────────────────
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
            const mimeType = meta.split(":")[1].split(";")[0];
            parts.push({ inlineData: { mimeType, data } });
          }
        }
      }
    }
  }
  return {
    contents: [{ parts }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 400 }
  };
}

// ─── Main handler ──────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method tidak diizinkan" });

  res.setHeader("Access-Control-Allow-Origin", "*");

  const body = typeof req.body === "object" ? req.body : {};
  const { provider = "auto", messages, ...geminiPayload } = body;

  if (!messages && !geminiPayload.contents) {
    return res.status(400).json({ error: "Field 'messages' atau 'contents' diperlukan" });
  }

  // Tentukan urutan provider
  const queue = provider === "auto"
    ? PROVIDER_ORDER
    : [provider, ...PROVIDER_ORDER.filter(p => p !== provider)];

  const errors = [];

  for (const p of queue) {
    try {
      let result;

      if (p === "openrouter") {
        result = await callOpenRouter(messages || []);
      } else if (p === "nvidia") {
        result = await callNvidia(messages || []);
      } else if (p === "gemini") {
        // Gemini butuh format berbeda
        const payload = geminiPayload.contents
          ? geminiPayload
          : toGeminiPayload(messages || []);
        result = await callGemini(payload);
      } else {
        continue;
      }

      return res.status(200).json({
        provider: p,
        model: result.model,
        text: result.text,
        tried: errors.map(e => e.provider)
      });

    } catch (e) {
      errors.push({ provider: p, error: e.message, status: e.status });
      // Lanjut ke provider berikutnya
    }
  }

  // Semua gagal
  return res.status(502).json({
    error: "Semua provider gagal merespons",
    details: errors
  });
}
