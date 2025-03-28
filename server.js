const express = require('express');
const { parseRequestResponse } = require('./utils/parser');

function createServer(port = 3700) {
  const app = express();

  app.use(express.json({ limit: '50mb' }));

  app.post('/burp-data', async (req, res) => {
    try {
      const rawRequest = JSON.stringify(req.body);
      const parsed = await parseRequestResponse(rawRequest);
      // console.log('Parsed Data:', JSON.stringify(parsed, null, 2));

      console.log(parsed.request.raw);
      console.log('\n');
      console.log(parsed.response.raw);
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

// Quick start if run directly
if (require.main === module) {
  createServer();
}
