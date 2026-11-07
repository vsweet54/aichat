# NEO AI FLOATING ASSISTANT - Vercel Backend

Production-ready Serverless AI Backend for the NEO AI Floating Android Assistant.
Powered by OpenRouter with dynamic free model discovery, automatic model fallback, rate limiting, and intelligent question analysis.

---

## Features

- **Dynamic Free Models**: Queries OpenRouter dynamically for available `:free` models (`google/gemini-2.0-flash-exp:free`, `meta-llama/llama-3.3-70b-instruct:free`, `qwen/qwen-2.5-coder-32b-instruct:free`, etc.) with 15-minute in-memory caching.
- **Multimodal AI Vision**: Analyzes screen captures, diagrams, and textbook figures using vision models.
- **OCR & Question Classification**: Automatically classifies problems into Multiple Choice, Mathematics, Essay, or General Text, and applies specialized step-by-step solver prompt templates.
- **Resilient Fallback System**: If a chosen model is rate-limited (HTTP 429) or times out, it automatically cycles through the fallback chain.
- **Enterprise-Grade Security**:
  - Request rate limiting per IP (30 req/min).
  - App Secret header validation (`x-app-secret`).
  - Size checks (max 4MB image, payload sanitization).
  - Strict zero-credential leakage.
- **Dual Compatibility**: Runs seamlessly as Vercel Serverless Functions or as a lightweight standalone Node.js server.

---

## API Endpoints

### 1. `GET /api/health`
Health check and environment configuration status.

**Response:**
```json
{
  "status": "healthy",
  "service": "NEO AI Floating Assistant Backend",
  "version": "1.0.0",
  "timestamp": "2026-11-06T17:10:00.000Z",
  "gateway": "OpenRouter",
  "configured": {
    "openRouterKey": true,
    "appSecretRequired": false
  }
}
```

### 2. `GET /api/models`
Retrieve dynamic list of verified free models.

**Query Parameters:**
- `refresh=true` (Requires Bearer token matching `ADMIN_TOKEN`)

**Response:**
```json
{
  "success": true,
  "count": 6,
  "defaultModel": "google/gemini-2.0-flash-exp:free",
  "data": [
    {
      "id": "google/gemini-2.0-flash-exp:free",
      "name": "Gemini 2.0 Flash (Experimental)",
      "provider": "Google",
      "isFree": true,
      "supportsVision": true,
      "contextLength": 1048576,
      "description": "High-speed multimodal AI by Google with 1M context..."
    }
  ]
}
```

### 3. `POST /api/chat`
Conversational chat with message history.

**Headers:**
- `Content-Type: application/json`
- `x-app-secret: <APP_SECRET>` (Optional, required if configured on server)

**Request Body:**
```json
{
  "messages": [
    { "role": "user", "content": "Jelaskan hukum Newton 1, 2, dan 3 dengan contoh sehari-hari!" }
  ],
  "model": "meta-llama/llama-3.3-70b-instruct:free",
  "temperature": 0.7,
  "maxTokens": 2048
}
```

**Response:**
```json
{
  "success": true,
  "message": {
    "role": "assistant",
    "content": "..."
  },
  "modelUsed": "meta-llama/llama-3.3-70b-instruct:free",
  "fallbackUsed": false
}
```

### 4. `POST /api/scan`
Process captured screen content, diagram images, or OCR text.

**Request Body:**
```json
{
  "imageBase64": "data:image/jpeg;base64,...",
  "ocrText": "1. Luas lingkaran dengan jari-jari 7 cm adalah...\nA. 154 cm²\nB. 144 cm²\nC. 124 cm²\nD. 100 cm²",
  "model": "google/gemini-2.0-flash-exp:free",
  "language": "id"
}
```

**Response:**
```json
{
  "success": true,
  "detectedType": "MULTIPLE_CHOICE",
  "confidence": 0.9,
  "questionText": "1. Luas lingkaran dengan jari-jari 7 cm adalah...",
  "answer": "A. 154 cm²",
  "explanation": "### Jawaban Singkat:\n**Jawaban Singkat:** A. 154 cm²\n\n### Langkah Pengerjaan:\nRumus luas lingkaran adalah L = π × r²...",
  "fullContent": "...",
  "modelUsed": "google/gemini-2.0-flash-exp:free",
  "isVisionProcessed": true,
  "fallbackUsed": false
}
```

---

## Deployment to Vercel

### 1. Prerequisites
- [Vercel Account](https://vercel.com)
- [OpenRouter Free Account & API Key](https://openrouter.ai/keys)

### 2. Deployment via Vercel CLI
```bash
cd backend
npm install -g vercel  # or use npx vercel
vercel login
vercel --prod
```

### 3. Environment Variables Setup in Vercel Dashboard
In your Vercel Project Settings -> **Environment Variables**:

| Variable Name | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | **Yes** | Your API Key from [openrouter.ai/keys](https://openrouter.ai/keys) |
| `OPENROUTER_URL` | No | Default: `https://openrouter.ai/api/v1` |
| `APP_SECRET` | No (Recommended) | Secret key shared with the Android APK (`x-app-secret`) |
| `ADMIN_TOKEN` | No | Secret token for admin actions (`/api/models?refresh=true`) |

---

## Local Development & Testing

```bash
cd backend

# Run automated tests
npm test

# Run local development server (port 3000)
npm start
```
