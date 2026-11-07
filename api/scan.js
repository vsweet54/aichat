/**
 * POST /api/scan - Screen capture & OCR analysis endpoint
 */

const {
  setCorsHeaders,
  checkRateLimit,
  getClientIp,
  validateAppSecret,
  validateScanInput
} = require('../lib/security');
const {
  classifyQuestion,
  buildScanSystemPrompt
} = require('../lib/question-classifier');
const {
  validateModelChoice,
  checkVisionSupport
} = require('../lib/model-registry');
const { callOpenRouterWithFallback } = require('../lib/openrouter');

/**
 * Helper to parse AI markdown response into direct answer vs full explanation
 */
function parseSolutionSections(content, questionType) {
  let answer = '';
  let explanation = '';

  // Match "**Jawaban Singkat:**" or "**Direct Answer:**"
  const answerMatch = content.match(/\*\*(?:Jawaban Singkat|Direct Answer|Jawaban):\*\*\s*([^\n\r]+)/i);
  if (answerMatch && answerMatch[1]) {
    answer = answerMatch[1].trim();
  }

  // If not found with bold pattern, look for "Jawaban: X" or "Answer: X"
  if (!answer) {
    const fallbackMatch = content.match(/(?:Jawaban|Answer):\s*([^\n\r]+)/i);
    if (fallbackMatch && fallbackMatch[1]) {
      answer = fallbackMatch[1].trim();
    }
  }

  // Explanation is the content following the answer, or the full content if not split
  explanation = content;

  return {
    answer: answer || 'Lihat penjelasan lengkap di bawah',
    explanation
  };
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // 1. Rate Limiting
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded. Please wait a moment.',
      retryAfterSeconds: rateLimit.resetInSeconds
    });
  }

  // 2. Secret Validation
  const auth = validateAppSecret(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }

  // 3. Input Validation
  const validation = validateScanInput(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const { imageBase64, ocrText, prompt: userPrompt, model, language } = validation.data;

  // 4. Classify Question Type
  const classification = classifyQuestion(ocrText);
  const systemPrompt = buildScanSystemPrompt(classification.type, language);

  // 5. Model Selection & Vision Check
  const apiKey = process.env.OPENROUTER_API_KEY;
  const baseUrl = process.env.OPENROUTER_URL;
  let preferredModel = model || 'nvidia/nemotron-3.5-super-vl:free';

  const hasImage = Boolean(imageBase64);
  let isVisionProcessed = false;

  // Check if requested model supports vision
  let supportsVision = checkVisionSupport({ id: preferredModel });
  if (hasImage && !supportsVision) {
    // If user provided image but picked a non-vision model, prefer a free vision model
    preferredModel = 'nvidia/nemotron-3.5-super-vl:free';
    supportsVision = true;
  }

  // Prepare messages payload
  const messages = [
    {
      role: 'system',
      content: systemPrompt
    }
  ];

  const userInstruction = userPrompt ? `Instruksi tambahan: ${userPrompt}\n` : '';
  const textContext = ocrText ? `Teks Soal / Hasil OCR:\n"""\n${ocrText}\n"""\n` : '';

  if (hasImage && supportsVision) {
    // Multimodal payload
    isVisionProcessed = true;
    let formattedImageUrl = imageBase64;
    if (!formattedImageUrl.startsWith('data:')) {
      formattedImageUrl = `data:image/jpeg;base64,${imageBase64}`;
    }

    messages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: `${userInstruction}${textContext}Analisis gambar dan teks soal berikut, lalu berikan jawaban yang akurat beserta pembahasannya:`
        },
        {
          type: 'image_url',
          image_url: {
            url: formattedImageUrl
          }
        }
      ]
    });
  } else {
    // Text-only payload
    messages.push({
      role: 'user',
      content: `${userInstruction}${textContext}Pecahkan soal di atas secara presisi dengan format yang telah ditentukan.`
    });
  }

  try {
    const result = await callOpenRouterWithFallback({
      messages,
      preferredModel,
      requiresVision: isVisionProcessed,
      temperature: 0.3, // Lower temperature for high factual accuracy in questions
      maxTokens: 2500
    });

    const parsed = parseSolutionSections(result.content, classification.type);

    return res.status(200).json({
      success: true,
      detectedType: classification.type,
      confidence: classification.confidence,
      questionText: ocrText || 'Analisis Berdasarkan Gambar',
      answer: parsed.answer,
      explanation: parsed.explanation,
      fullContent: result.content,
      modelUsed: result.modelUsed,
      isVisionProcessed,
      fallbackUsed: result.fallbackUsed,
      usage: result.usage
    });
  } catch (error) {
    console.error('[API /scan] Execution Error:', error);
    return res.status(502).json({
      success: false,
      error: 'Failed to solve or analyze question: ' + error.message
    });
  }
};
