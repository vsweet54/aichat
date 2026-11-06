// AI CBT Solver — Triple Provider Proxy
// OpenRouter → NVIDIA NIM → Gemini Flash (Gemini sebagai fallback terakhir)
// POST /api/chat

const OPENROUTER_KEY  = process.env.OPENROUTER_API_KEY;
const NVIDIA_KEY      = process.env.NVIDIA_API_KEY;
const GEMINI_KEY      = process.env.GEMINI_API_KEY;

const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.2-11b-vision-instruct:free";
const NVIDIA_MODEL     = process.env.NVIDIA_MODEL     || "meta/llama-3.2-90b-vision-instruct";
const GEMINI_MODEL     = process.env.GEMINI_MODEL     || "gemini-3.8-flash";
const GEMINI_BACKUP    = "gemini-1.5-flash";

const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 25000);
const MAX_RETRY  = 2;
// Gemini sengaja ditaruh di urutan terakhir sebagai cadangan pamungkas
const PROVIDER_ORDER = ["openrouter", "nvidia", "gemini"];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchT(url, opts, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

async function callOpenRouter(messages) {
  if (!OPENROUTER_KEY) throw { status: 500, message: "OPENROUTER_API_KEY belum diatur" };
  const models = [OPENROUTER_MODEL, "meta-llama/llama-3.2-11b-vision-instruct:free", "google/gemini-2.0-flash-exp:free"].filter(Boolean);
  let lastErr;
  for (const m of [...new Set(models)]) {
    for (let i = 0; i <= MAX_RETRY; i++) {
      if (i > 0) await sleep(1000 * i);
      try {
        const res = await fetchT("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENROUTER_KEY}`,
            "HTTP-Referer": "https://aichat-nine-beta.vercel.app",
            "X-Title": "AI CBT Solver"
          },
          body: JSON.stringify({ model: m, messages, max_tokens: 400, temperature: 0.1 })
        });
        const data = await res.json();
        if (res.status === 429 || res.status === 503) { if (i < MAX_RETRY) continue; break; }
        if (!res.ok) { lastErr = { status: res.status, message: data?.error?.message || `OpenRouter HTTP ${res.status}` }; break; }
        const text = data?.choices?.[0]?.message?.content;
        if (!text) { lastErr = { status: 500, message: "OpenRouter: response kosong" }; break; }
        return { text, model: data.model || m };
      } catch (e) {
        if (e.name === "AbortError") { if (i < MAX_RETRY) continue; lastErr = { status: 408, message: "OpenRouter timeout" }; break; }
        lastErr = e;
        break;
      }
    }
  }
  throw lastErr || { status: 500, message: "OpenRouter semua model gagal" };
}

async function callNvidia(messages) {
  if (!NVIDIA_KEY) throw { status: 500, message: "NVIDIA_API_KEY belum diatur" };
  const models = [NVIDIA_MODEL, "meta/llama-3.2-90b-vision-instruct", "mistralai/pixtral-12b"].filter(Boolean);
  let lastErr;
  for (const m of [...new Set(models)]) {
    for (let i = 0; i <= MAX_RETRY; i++) {
      if (i > 0) await sleep(1000 * i);
      try {
        const res = await fetchT("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${NVIDIA_KEY}` },
          body: JSON.stringify({ model: m, messages, max_tokens: 400, temperature: 0.1 })
        });
        const data = await res.json();
        if (res.status === 429 || res.status === 503) { if (i < MAX_RETRY) continue; break; }
        if (!res.ok) { lastErr = { status: res.status, message: data?.detail || `NVIDIA HTTP ${res.status}` }; break; }
        const text = data?.choices?.[0]?.message?.content;
        if (!text) { lastErr = { status: 500, message: "NVIDIA: response kosong" }; break; }
        return { text, model: m };
      } catch (e) {
        if (e.name === "AbortError") { if (i < MAX_RETRY) continue; lastErr = { status: 408, message: "NVIDIA timeout" }; break; }
        lastErr = e;
        break;
      }
    }
  }
  throw lastErr || { status: 500, message: "NVIDIA semua model gagal" };
}

async function callGemini(payload) {
  if (!GEMINI_KEY) throw { status: 500, message: "GEMINI_API_KEY belum diatur" };
  const models = [GEMINI_MODEL, "gemini-3.8-flash", GEMINI_BACKUP, "gemini-1.5-flash", "gemini-1.5-pro"].filter(Boolean);
  let lastErr;
  for (const model of [...new Set(models)]) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
    for (let i = 0; i <= MAX_RETRY; i++) {
      if (i > 0) await sleep(1000 * i);
      try {
        const res = await fetchT(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (res.status === 429 || res.status === 503) { if (i < MAX_RETRY) continue; break; }
        if (!res.ok) {
          lastErr = { status: res.status, message: data?.error?.message || `Gemini HTTP ${res.status}` };
          break; // Jika model 404 / deprecated, lanjut coba model Gemini berikutnya
        }
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) { lastErr = { status: 500, message: "Gemini: response kosong" }; break; }
        return { text, model };
      } catch (e) {
        if (e.name === "AbortError") { if (i < MAX_RETRY) continue; lastErr = { status: 408, message: "Gemini timeout" }; break; }
        lastErr = e;
        break;
      }
    }
  }
  throw lastErr || { status: 503, message: "Gemini semua model penuh" };
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
  return { contents: [{ parts }], generationConfig: { temperature: 0.1, maxOutputTokens: 400 } };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); return res.status(200).end(); }
  if (req.method !== "POST") return res.status(405).json({ error: "Method tidak diizinkan" });

  const body = typeof req.body === "object" ? req.body : {};
  const { provider = "auto", messages, ...rest } = body;
  if (!messages && !rest.contents) return res.status(400).json({ error: "Field 'messages' diperlukan" });

  const queue = provider === "auto" ? PROVIDER_ORDER : [provider, ...PROVIDER_ORDER.filter(p => p !== provider)];
  const errors = [];

  for (const p of queue) {
    try {
      let result;
      if (p === "openrouter") result = await callOpenRouter(messages || []);
      else if (p === "nvidia") result = await callNvidia(messages || []);
      else if (p === "gemini") result = await callGemini(rest.contents ? rest : toGeminiPayload(messages || []));
      else continue;
      return res.status(200).json({ provider: p, model: result.model, text: result.text, tried: errors.map(e => e.provider) });
    } catch (e) {
      errors.push({ provider: p, error: e.message, status: e.status });
    }
  }

  return res.status(502).json({ error: "Semua provider gagal merespons", details: errors });
}