/**
 * Question Classification and Prompt Engineering for NEO AI
 */

const QuestionType = {
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
  MATH: 'MATH',
  ESSAY: 'ESSAY',
  GENERAL_TEXT: 'GENERAL_TEXT'
};

/**
 * Classify question text based on linguistic and structural patterns
 * @param {string} text
 * @returns {{ type: string, confidence: number, options: string[], isMath: boolean }}
 */
function classifyQuestion(text) {
  if (!text || typeof text !== 'string') {
    return { type: QuestionType.GENERAL_TEXT, confidence: 0.5, options: [], isMath: false };
  }

  const cleanText = text.trim();

  // 1. Check for Multiple Choice Options
  // Patterns like A. B. C. D. or A) B) C) D) or (A) (B) (C) or a. b. c. d.
  const mcqPattern = /(?:(?:^|\n|\s)(?:[A-Ea-e][\.\)]|\([A-Ea-e]\))\s+[^\n]+)/g;
  const matches = cleanText.match(mcqPattern) || [];

  // Also check for multiple option letters appearing in sequence
  const optionLetters = (cleanText.match(/(?:^|\n|\s)[A-Ea-e][\.\)]/g) || []).length;

  if (matches.length >= 2 || optionLetters >= 2) {
    const extractedOptions = matches.map(m => m.trim());
    return {
      type: QuestionType.MULTIPLE_CHOICE,
      confidence: 0.9,
      options: extractedOptions,
      isMath: containsMathSymbols(cleanText)
    };
  }

  // 2. Check for Math Expressions
  const isMath = containsMathSymbols(cleanText);
  if (isMath) {
    return {
      type: QuestionType.MATH,
      confidence: 0.85,
      options: [],
      isMath: true
    };
  }

  // 3. Check for Essay / Descriptive Questions
  const essayKeywords = [
    /^(?:jelaskan|sebutkan|bagaimana|mengapa|apa yang dimaksud|uraikan|analisislah|tuliskan)/i,
    /^(?:explain|describe|why|how|what is|discuss|analyze|define)/i,
    /\?(?:\s*$)/m
  ];

  const isEssay = essayKeywords.some(pattern => pattern.test(cleanText));
  if (isEssay) {
    return {
      type: QuestionType.ESSAY,
      confidence: 0.8,
      options: [],
      isMath: false
    };
  }

  return {
    type: QuestionType.GENERAL_TEXT,
    confidence: 0.7,
    options: [],
    isMath: false
  };
}

/**
 * Checks whether text contains significant mathematical symbols or formulas
 */
function containsMathSymbols(text) {
  const mathSymbols = [
    /\\(?:int|frac|sqrt|sum|prod|alpha|beta|theta|pi|partial|infty|approx|times|div|pm)/i,
    /[\∫\∑\√\±\×\÷\≠\≤\≥\∞\π\θ\²\³]/,
    /\b(?:sin|cos|tan|log|ln|lim|dy\/dx|f\(x\))\b/i,
    /[0-9xya-z]\s*[\+\-\*\/\^]\s*[0-9xya-z]\s*=/i,
    /=\s*[-+]?[0-9]*\.?[0-9]+/
  ];

  let hitCount = 0;
  for (const pattern of mathSymbols) {
    if (pattern.test(text)) {
      hitCount++;
    }
  }

  return hitCount >= 1;
}

/**
 * Build a specialized solver prompt based on detected question type and target language
 */
function buildScanSystemPrompt(questionType, language = 'id') {
  if (language === 'en') {
    return `You are NEO AI, an ultra-intelligent, precise screen analysis assistant for students and professionals.
Detected Problem Type: ${questionType}

Instructions:
1. Provide the direct, definitive answer FIRST in a clear highlighted format:
   **Direct Answer:** [Exact option letter and text if MCQ, or numerical/formula/concise statement]
2. Provide a structured, step-by-step explanation:
   - **Step-by-Step Solution / Analysis:** Show exact working, formulas used, or textual justification.
   - **Key Concept:** Explain the underlying theory or rule in simple terms.
3. Keep the tone encouraging, clear, and authoritative.
4. Output format should be clean Markdown.`;
  }

  // Indonesian default
  return `Kamu adalah NEO AI, asisten pemecah soal dan analis layar yang cerdas, cepat, dan presisi tinggi.
Tipe Soal Terdeteksi: ${questionType}

Format Respon Wajib:
1. Tampilkan JAWABAN UTAMA secara langsung di bagian paling atas:
   **Jawaban Singkat:** [Sebutkan huruf opsi dan teks jawaban secara jelas jika Pilihan Ganda, atau hasil akhir jika Matematika/Esai]
2. **Langkah Pengerjaan / Pembahasan Lengkap:**
   - Jelaskan langkah demi langkah secara runtut dan mudah dipahami.
   - Jika ada rumus matematika, tuliskan rumus dan substitusi angkanya.
   - Jika berupa soal pilihan ganda, jelaskan mengapa opsi tersebut benar dan mengapa opsi lainnya keliru.
3. **Konsep Penting / Rumus Cepat:** Ringkasan prinsip inti yang perlu diingat.
Gunakan bahasa Indonesia yang santun, lugas, dan rapi dalam format Markdown.`;
}

module.exports = {
  QuestionType,
  classifyQuestion,
  containsMathSymbols,
  buildScanSystemPrompt
};
