/**
 * Unit tests for Security and Validation Utilities
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  checkRateLimit,
  validateAppSecret,
  validateChatInput,
  validateScanInput
} = require('../lib/security');

describe('Security: Rate Limiter', () => {
  test('allows initial requests under the threshold', () => {
    const ip = '192.168.1.100';
    const result = checkRateLimit(ip);
    assert.equal(result.allowed, true);
    assert.ok(result.remaining >= 0);
  });

  test('blocks requests when threshold is exceeded', () => {
    const ip = '192.168.1.200';
    for (let i = 0; i < 30; i++) {
      checkRateLimit(ip);
    }
    const blocked = checkRateLimit(ip);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
  });
});

describe('Security: App Secret Verification', () => {
  test('passes when APP_SECRET is not configured', () => {
    const originalSecret = process.env.APP_SECRET;
    delete process.env.APP_SECRET;
    const req = { headers: {} };
    const auth = validateAppSecret(req);
    assert.equal(auth.valid, true);
    process.env.APP_SECRET = originalSecret;
  });

  test('validates correct secret in header x-app-secret', () => {
    process.env.APP_SECRET = 'test-secret-123';
    const req = { headers: { 'x-app-secret': 'test-secret-123' } };
    const auth = validateAppSecret(req);
    assert.equal(auth.valid, true);
  });

  test('rejects incorrect or missing secret', () => {
    process.env.APP_SECRET = 'test-secret-123';
    const req = { headers: { 'x-app-secret': 'wrong' } };
    const auth = validateAppSecret(req);
    assert.equal(auth.valid, false);
    assert.ok(auth.error.includes('Invalid or missing'));
    delete process.env.APP_SECRET;
  });
});

describe('Validation: Chat Input', () => {
  test('validates valid chat payload', () => {
    const payload = {
      messages: [{ role: 'user', content: 'Halo Neo AI!' }],
      model: 'google/gemini-2.0-flash-exp:free',
      temperature: 0.7
    };
    const res = validateChatInput(payload);
    assert.equal(res.valid, true);
    assert.equal(res.data.messages.length, 1);
  });

  test('rejects empty messages array', () => {
    const res = validateChatInput({ messages: [] });
    assert.equal(res.valid, false);
  });

  test('rejects invalid message roles', () => {
    const res = validateChatInput({
      messages: [{ role: 'hacker', content: 'malicious prompt' }]
    });
    assert.equal(res.valid, false);
  });
});

describe('Validation: Scan Input', () => {
  test('accepts valid ocrText payload', () => {
    const res = validateScanInput({
      ocrText: '1. Apa ibu kota Indonesia?\nA. Jakarta\nB. Surabaya\nC. Bandung\nD. Medan',
      language: 'id'
    });
    assert.equal(res.valid, true);
    assert.equal(res.data.language, 'id');
  });

  test('rejects payload when both imageBase64 and ocrText are missing', () => {
    const res = validateScanInput({ prompt: 'test' });
    assert.equal(res.valid, false);
  });

  test('rejects oversized base64 images', () => {
    const bigImage = 'A'.repeat(6 * 1024 * 1024);
    const res = validateScanInput({ imageBase64: bigImage });
    assert.equal(res.valid, false);
    assert.ok(res.error.includes('exceeds maximum limit'));
  });
});
