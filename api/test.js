// Test endpoint — cek apakah env variables tersedia
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  
  const status = {
    openrouter: !!process.env.OPENROUTER_API_KEY 
      ? `✅ ada (${process.env.OPENROUTER_API_KEY.slice(0,12)}...)` 
      : "❌ TIDAK ADA",
    nvidia: !!process.env.NVIDIA_API_KEY 
      ? `✅ ada (${process.env.NVIDIA_API_KEY.slice(0,10)}...)` 
      : "❌ TIDAK ADA",
    gemini: !!process.env.GEMINI_API_KEY 
      ? `✅ ada (${process.env.GEMINI_API_KEY.slice(0,10)}...)` 
      : "❌ TIDAK ADA",
    model_openrouter: process.env.OPENROUTER_MODEL || "qwen/qwen2.5-vl-72b-instruct:free (default)",
    model_nvidia: process.env.NVIDIA_MODEL || "meta/llama-3.2-11b-vision-instruct (default)",
    model_gemini: process.env.GEMINI_MODEL || "gemini-2.0-flash (default)",
  };

  // Test ping OpenRouter
  try {
    const r = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}` }
    });
    status.openrouter_ping = r.ok ? "✅ bisa konek" : `❌ HTTP ${r.status}`;
  } catch(e) { status.openrouter_ping = `❌ ${e.message}`; }

  // Test ping Gemini
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
    );
    status.gemini_ping = r.ok ? "✅ bisa konek" : `❌ HTTP ${r.status}`;
  } catch(e) { status.gemini_ping = `❌ ${e.message}`; }

  return res.status(200).json(status);
}
