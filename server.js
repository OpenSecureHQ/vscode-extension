const express = require('express');
const { parseRequestResponse } = require('./utils/parser');
const net = require('net');

/**
 * Find an available port starting from the given port
 * @param {number} startPort - Port to start checking from
 * @returns {Promise<number>} Available port number
 */
function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', err => {
      if (err.code === 'EADDRINUSE') {
        // Port is in use, try the next one
        findAvailablePort(startPort + 1).then(resolve, reject);
      } else {
        reject(err);
      }
    });
    server.listen(startPort, () => {
      server.close(() => {
        resolve(startPort);
      });
    });
  });
}

/**
 * Creates an Express server to handle Burp Suite data
 * @param {number} startPort - Starting port number to try
 * @param {Function} dataCallback - Callback to pass parsed data back to the extension
 * @returns {Promise<Object>} The Express server instance and its port
 */
async function createServer(startPort = 3700, dataCallback) {
  const port = await findAvailablePort(startPort);
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  app.post('/burp-data', async (req, res) => {
    try {
      const rawRequest = JSON.stringify(req.body);
      const parsed = await parseRequestResponse(rawRequest);

      // console.log(parsed.request);

      console.log('Received request data');

      // Send the data back to the VS Code extension
      if (dataCallback && typeof dataCallback === 'function') {
        dataCallback(parsed);
      }

      res.status(200).json({ status: 'success' });
    } catch (error) {
      console.error('Parsing error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  const server = app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });

  return { server, port };
}

module.exports = { createServer };
