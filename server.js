// server.js
const express = require('express');
const bodyParser = require('body-parser');

/**
 * Creates and returns an Express server listening on port 3700.
 */
function createServer() {
  const app = express();

  // Store the raw request data as text
  app.use(bodyParser.text({ type: '*/*' }));

  // Receive POST data from Burp
  app.post('/burp-data', (req, res) => {
    console.log(
      '=== Raw HTTP Request from Burp ===\n',
      decodeURIComponent(req.body),
      '\n======================'
    );
    res.status(200).send('OK');
  });

  // Start the server
  const server = app.listen(3700, () => {
    console.log('Listening on http://localhost:3700');
  });

  return server;
}

module.exports = { createServer };
