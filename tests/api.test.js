/**
 * Integration tests for NEO AI Backend Endpoints
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const server = require('../server');

const TEST_PORT = 3199;

describe('NEO AI Backend API Integration Tests', () => {
  before(done => {
    server.listen(TEST_PORT, '127.0.0.1', done);
  });

  after(done => {
    server.close(done);
  });

  test('GET /api/health returns 200 with service information', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'healthy');
    assert.equal(data.service, 'NEO AI Floating Assistant Backend');
    assert.ok(data.timestamp);
  });

  test('GET /api/models returns list of curated free models', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/models`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length > 0);

    // Verify all models are marked free
    for (const model of body.data) {
      assert.equal(model.isFree, true, `Model ${model.id} should be free`);
      assert.ok(typeof model.supportsVision === 'boolean');
      assert.ok(model.id);
      assert.ok(model.name);
    }
  });

  test('POST /api/chat rejects invalid or empty payload with 400', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  test('POST /api/scan rejects payload missing both image and text with 400', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'test' })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('At least one of'));
  });

  test('OPTIONS preflight requests return CORS headers', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/chat`, {
      method: 'OPTIONS'
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.ok(res.headers.get('access-control-allow-headers').includes('x-app-secret'));
  });
});
