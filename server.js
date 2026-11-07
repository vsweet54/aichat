/**
 * Standalone Local HTTP Server for NEOAI Backend
 * Memungkinkan pengujian, debugging, dan penggunaan lokal tanpa Vercel CLI.
 */
const http = require('http');

const healthHandler = require('./api/health');
const modelsHandler = require('./api/models');
const chatHandler = require('./api/chat');
const imageHandler = require('./api/image');
const searchHandler = require('./api/search');
const ttsHandler = require('./api/tts');

const PORT = parseInt(process.env.PORT || '3000', 10);

/**
 * Adaptor respon HTTP standar ke helper Vercel Serverless
 */
function createVercelResponse(res) {
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };
  res.json = function (data) {
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json');
    }
    res.end(JSON.stringify(data));
    return res;
  };
  res.send = function (data) {
    res.end(data);
    return res;
  };
  return res;
}

const server = http.createServer(async (req, res) => {
  createVercelResponse(res);
  const fullUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  req.query = Object.fromEntries(fullUrl.searchParams.entries());
  const pathname = fullUrl.pathname.replace(/\/+$/, '') || '/';

  // Tangani payload body untuk POST/PUT
  let bodyBuffer = '';
  req.on('data', chunk => {
    bodyBuffer += chunk;
    if (bodyBuffer.length > 10 * 1024 * 1024) {
      res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Ukuran payload melebihi 10MB' } });
      req.destroy();
    }
  });

  req.on('end', async () => {
    if (bodyBuffer) {
      try {
        req.body = JSON.parse(bodyBuffer);
      } catch {
        req.body = bodyBuffer;
      }
    } else {
      req.body = {};
    }

    try {
      if (pathname === '/api/health') {
        await healthHandler(req, res);
      } else if (pathname === '/api/models') {
        await modelsHandler(req, res);
      } else if (pathname === '/api/chat') {
        await chatHandler(req, res);
      } else if (pathname === '/api/image') {
        await imageHandler(req, res);
      } else if (pathname === '/api/search') {
        await searchHandler(req, res);
      } else if (pathname === '/api/tts') {
        await ttsHandler(req, res);
      } else if (pathname === '/' || pathname === '') {
        res.status(200).json({
          status: 'ok',
          message: 'NEOAI Backend Serverless API is operational',
          endpoints: [
            '/api/health',
            '/api/models',
            '/api/chat',
            '/api/image',
            '/api/search',
            '/api/tts'
          ]
        });
      } else {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: `Endpoint tidak ditemukan: ${pathname}` }
        });
      }
    } catch (err) {
      console.error('[Server Error]', err);
      if (!res.headersSent) {
        res.status(500).json({
          error: { code: 'INTERNAL_SERVER_ERROR', message: err.message }
        });
      }
    }
  });
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[NEOAI Server] Berjalan di http://127.0.0.1:${PORT}`);
  });
}

module.exports = server;
