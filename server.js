const express = require('express');
const { parseRequestResponse } = require('./utils/parser');

/**
 * Creates an Express server to handle Burp Suite data
 * @param {number} port - Port number for the server
 * @param {Function} dataCallback - Callback to pass parsed data back to the extension
 * @returns {Object} The Express server instance
 */
function createServer(port = 3700, dataCallback) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  app.post('/burp-data', async (req, res) => {
    try {
      const rawRequest = JSON.stringify(req.body);
      const parsed = await parseRequestResponse(rawRequest);

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

  return app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

module.exports = { createServer };
