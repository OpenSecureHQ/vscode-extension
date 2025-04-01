/**
 * Generate HTML content for the webview panel
 * @param {Object} data Request/response data
 * @returns {string} HTML content
 */
function getWebviewContent(data) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Request Details</title>
    <style>
        body { font-family: var(--vscode-font-family); padding: 20px; }
        h2 { color: var(--vscode-editor-foreground); }
        pre { background-color: var(--vscode-editor-background); padding: 10px; overflow: auto; }
    </style>
</head>
<body>
    <h2>Request Details</h2>
    <h3>Method: ${data.request.method}</h3>
    <h3>URL: ${data.request.url}</h3>
    
    <h3>Request Headers</h3>
    <pre>${JSON.stringify(data.request.headers, null, 2)}</pre>
    
    <h3>Request Body</h3>
    <pre>${data.request.body || 'No Body'}</pre>
    
    <h2>Response Details</h2>
    <h3>Status: ${data.response.statusCode}</h3>
    
    <h3>Response Headers</h3>
    <pre>${JSON.stringify(data.response.headers, null, 2)}</pre>
    
    <h3>Response Body</h3>
    <pre>${data.response.body || 'No Body'}</pre>
</body>
</html>`;
}

module.exports = {
  getWebviewContent,
};
