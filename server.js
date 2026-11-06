/**
 * Standalone Local HTTP Server for NEO AI Backend
 * Allows local development, testing, and debugging without Vercel CLI.
 */

const http = require('http');

const healthHandler = require('./api/health');
const modelsHandler = require('./api/models');
const chatHandler = require('./api/chat');
const scanHandler = require('./api/scan');

const PORT = parseInt(process.env.PORT || '3000', 10);

/**
 * Adapt Node http.IncomingMessage & ServerResponse to Vercel Function format
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
  return res;
}

const server = http.createServer(async (req, res) => {
  createVercelResponse(res);
  const fullUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  req.query = Object.fromEntries(fullUrl.searchParams.entries());
  const pathname = fullUrl.pathname.replace(/\/+$/, '') || '/';

  // Read request body for POST/PUT
  let bodyBuffer = '';
  req.on('data', chunk => {
    bodyBuffer += chunk;
    if (bodyBuffer.length > 10 * 1024 * 1024) {
      // 10MB flood protection
      res.status(413).json({ error: 'Payload Too Large' });
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
      } else if (pathname === '/api/scan') {
        await scanHandler(req, res);
      } else if (pathname === '/' || pathname === '') {
        res.status(200).json({
          message: 'NEO AI Floating Assistant Backend API is operational',
          endpoints: ['/api/health', '/api/models', '/api/chat', '/api/scan']
        });
      } else {
        res.status(404).json({ error: `Endpoint not found: ${pathname}` });
      }
    } catch (err) {
      console.error('[Server Error]', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal Server Error: ' + err.message });
      }
    }
  });
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[NEO AI Server] Listening on http://127.0.0.1:${PORT}`);
  });
}

module.exports = server;
