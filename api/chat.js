// AI CBT Solver — Triple Provider Proxy
// OpenRouter (cepat) → Gemini Flash (cadangan terakhir)
// POST /api/chat

const OPENROUTER_KEY  = process.env.OPENROUTER_API_KEY;
const NVIDIA_KEY      = process.env.NVIDIA_API_KEY;
const GEMINI_KEY      = process.env.GEMINI_API_KEY;

// Model OpenRouter — vision-capable models diprioritaskan
// nvidia/nemotron-3.5-super-vl:free  → vision language (VL), cepat
// nvidia/nemotron-3.5-lightning:free → sangat cepat
// nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free → omni (vision)
// dots-studio/dots-3-note-preview:free → backup
// nvidia/nemotron-3-ultra-550b-a55b:free → besar tapi free
// cohere/north-mini-code:free → backup teks
const OPENROUTER_MODELS = (process.env.OPENROUTER_MODELS || "").split(",").map(s => s.trim()).filter(Boolean).length > 0
  ? (process.env.OPENROUTER_MODELS || "").split(",").map(s => s.trim()).filter(Boolean)
  : [
    "nvidia/nemotron-3.5-super-vl:free",
    "nvidia/nemotron-3.5-lightning:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "dots-studio/dots-3-note-preview:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "cohere/north-mini-code:free",
  ];

const GEMINI_MODEL  = process.env.GEMINI_MODEL  || "gemini-3.8-flash";
const GEMINI_BACKUP = "gemini-1.5-flash";

// Timeout lebih pendek = fail-fast → coba model berikutnya lebih cepat
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 15000);
const MAX_RETRY  = 1; // maksimal 1 retry per model (bukan 2)

// Gemini sengaja terakhir — user intentional
const PROVIDER_ORDER = ["openrouter", "gemini"];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchT(url, opts, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

async function callOpenRouter(messages) {
  if (!OPENROUTER_KEY) throw { status: 500, message: "OPENROUTER_API_KEY belum diatur" };
  let lastErr;
  for (const model of OPENROUTER_MODELS) {
    for (let i = 0; i <= MAX_RETRY; i++) {
      if (i > 0) await sleep(800 * i);
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
        // Rate limit → retry
        if (res.status === 429) { if (i < MAX_RETRY) continue; break; }
        // Model tidak tersedia → langsung coba model berikutnya
        if (res.status === 404 || res.status === 410 || res.status === 400) {
          lastErr = { status: res.status, message: `${model}: ${data?.error?.message || `HTTP ${res.status}`}` };
          break;
        }
        // Error lain → retry sekali
        if (!res.ok) { lastErr = { status: res.status, message: data?.error?.message || `OpenRouter HTTP ${res.status}` }; break; }
        const text = data?.choices?.[0]?.message?.content;
        if (!text) { lastErr = { status: 500, message: `${model}: response kosong` }; break; }
        return { text, model: data.model || model };
      } catch (e) {
        if (e.name === "AbortError") { lastErr = { status: 408, message: `${model}: timeout` }; break; }
        lastErr = { status: 500, message: e.message }; break;
      }
    }
  }
  throw lastErr || { status: 500, message: "OpenRouter semua model gagal" };
}

async function callNvidia(messages) {
  if (!NVIDIA_KEY) throw { status: 500, message: "NVIDIA_API_KEY belum diatur" };
  // Gunakan model yang lebih kecil & cepat
  const models = ["meta/llama-3.2-11b-vision-instruct", "mistralai/pixtral-12b"];
  let lastErr;
  for (const m of models) {
    for (let i = 0; i <= MAX_RETRY; i++) {
      if (i > 0) await sleep(800 * i);
      try {
        const res = await fetchT("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${NVIDIA_KEY}` },
          body: JSON.stringify({ model: m, messages, max_tokens: 300, temperature: 0.1 })
        });
        const data = await res.json();
        if (res.status === 429) { if (i < MAX_RETRY) continue; break; }
        if (res.status === 404 || res.status === 410) { lastErr = { status: res.status, message: data?.detail || `${m} tidak tersedia` }; break; }
        if (!res.ok) { lastErr = { status: res.status, message: data?.detail || `NVIDIA HTTP ${res.status}` }; break; }
        const text = data?.choices?.[0]?.message?.content;
        if (!text) { lastErr = { status: 500, message: "NVIDIA: response kosong" }; break; }
        return { text, model: m };
      } catch (e) {
        if (e.name === "AbortError") { lastErr = { status: 408, message: `${m}: timeout` }; break; }
        lastErr = { status: 500, message: e.message }; break;
      }
    }
  }
  throw lastErr || { status: 500, message: "NVIDIA semua model gagal" };
}

async function callGemini(payload) {
  if (!GEMINI_KEY) throw { status: 500, message: "GEMINI_API_KEY belum diatur" };
  const models = [...new Set([GEMINI_MODEL, "gemini-3.8-flash", GEMINI_BACKUP, "gemini-1.5-flash"])];
  let lastErr;
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
    for (let i = 0; i <= MAX_RETRY; i++) {
      if (i > 0) await sleep(800 * i);
      try {
        const res = await fetchT(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (res.status === 429) { if (i < MAX_RETRY) continue; break; }
        if (!res.ok) { lastErr = { status: res.status, message: data?.error?.message || `Gemini HTTP ${res.status}` }; break; }
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) { lastErr = { status: 500, message: "Gemini: response kosong" }; break; }
        return { text, model };
      } catch (e) {
        if (e.name === "AbortError") { lastErr = { status: 408, message: `Gemini ${model}: timeout` }; break; }
        lastErr = { status: 500, message: e.message }; break;
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
      errors.push({ provider: p, error: e.message, status: e.status });
    }
  }

  return res.status(502).json({ error: "Semua provider gagal merespons", details: errors });
}