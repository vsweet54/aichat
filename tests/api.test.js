const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const server = require('../server');

const TEST_PORT = 3199;

test.before(async () => {
  await new Promise(resolve => server.listen(TEST_PORT, '127.0.0.1', resolve));
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
});

test('GET /api/health mengembalikan status ok dan daftar provider', async () => {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'ok');
  assert.ok(data.providers);
  assert.equal(data.providers.details.pollinations.active, true);
});

test('GET /api/models mengembalikan model terkelompok', async () => {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/models`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.models));
  assert.ok(data.models.length > 0);
  assert.ok(data.grouped['Pollinations']);
});

test('POST /api/chat menolak pesan kosong', async () => {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [] })
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error.code, 'INVALID_INPUT');
});

test('POST /api/image membuat URL gambar dengan benar', async () => {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Cyberpunk neon robot assistant' })
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.imageUrl);
  assert.ok(data.imageUrl.includes('pollinations.ai'));
});

test('GET /api/search menangani query valid', async () => {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/search?q=kotlin+android`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.query, 'kotlin android');
  assert.ok(Array.isArray(data.results));
});
