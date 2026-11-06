/**
 * Unit tests for Question Classifier and Prompt Builder
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  QuestionType,
  classifyQuestion,
  containsMathSymbols,
  buildScanSystemPrompt
} = require('../lib/question-classifier');

describe('Question Classifier', () => {
  test('identifies multiple choice questions', () => {
    const text = `Sebuah mobil bergerak dengan kecepatan 60 km/jam selama 2 jam. Jarak tempuh mobil adalah:
A. 100 km
B. 120 km
C. 140 km
D. 160 km`;

    const result = classifyQuestion(text);
    assert.equal(result.type, QuestionType.MULTIPLE_CHOICE);
    assert.ok(result.options.length >= 2);
  });

  test('identifies mathematical equations', () => {
    const text = 'Hitunglah nilai dari integral \\int (3x^2 + 2x - 5) dx dengan batas 0 sampai 2.';
    const result = classifyQuestion(text);
    assert.equal(result.type, QuestionType.MATH);
    assert.equal(result.isMath, true);
  });

  test('identifies essay questions', () => {
    const text = 'Jelaskan perbedaan mendasar antara pembelahan mitosis dan meiosis pada sel eukariotik!';
    const result = classifyQuestion(text);
    assert.equal(result.type, QuestionType.ESSAY);
  });

  test('identifies general text', () => {
    const text = 'Ini adalah kutipan teks biasa tanpa pertanyaan khusus.';
    const result = classifyQuestion(text);
    assert.equal(result.type, QuestionType.GENERAL_TEXT);
  });
});

describe('Math Symbol Detection', () => {
  test('detects complex math symbols', () => {
    assert.equal(containsMathSymbols('\\sqrt{x^2 + y^2} = r'), true);
    assert.equal(containsMathSymbols('lim_{x \\to 0} \\frac{\\sin x}{x} = 1'), true);
    assert.equal(containsMathSymbols('Halo dunia apa kabar'), false);
  });
});

describe('Prompt Builder', () => {
  test('builds Indonesian solver prompt', () => {
    const prompt = buildScanSystemPrompt(QuestionType.MULTIPLE_CHOICE, 'id');
    assert.ok(prompt.includes('NEO AI'));
    assert.ok(prompt.includes('MULTIPLE_CHOICE'));
    assert.ok(prompt.includes('Jawaban Singkat:'));
  });

  test('builds English solver prompt', () => {
    const prompt = buildScanSystemPrompt(QuestionType.MATH, 'en');
    assert.ok(prompt.includes('NEO AI'));
    assert.ok(prompt.includes('MATH'));
    assert.ok(prompt.includes('Direct Answer:'));
  });
});
