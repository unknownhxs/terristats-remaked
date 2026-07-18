// https://github.com/viktorexe/terristats-discord-bot
// Tiny HTTP server used purely for health checks. Hosting providers such as
// Railway ping "/" (or "/health") to confirm the process is still alive.
const http = require('http');

/**
 * Start a minimal health-check web server.
 * @param {number} port - Port to listen on (defaults to 8000).
 * @returns {Promise<http.Server>} the running server instance.
 */
function startWebServer(port = 8000) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/' || req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Bot is running');
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    });

    server.listen(port, '0.0.0.0', () => {
      console.log(`Web server started on port ${port}`);
      resolve(server);
    });
  });
}

module.exports = { startWebServer };
