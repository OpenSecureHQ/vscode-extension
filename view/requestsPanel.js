const vscode = require('vscode');
const storage = require('../data/storage');

/**
 * Create and manage a webview panel for displaying request details
 */
class RequestPanel {
  /**
   * Create a new panel
   * @param {Object} data Request/response data to display
   */
  static create(data) {
    // Create and show panel
    const panel = vscode.window.createWebviewPanel(
      'requestDetails',
      `${data.request.method} ${
        new URL(data.request.url, 'http://example.com').pathname
      }`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    // Generate HTML content
    panel.webview.html = this.generateHtml(data);

    // Extract endpoint for reference
    const url = new URL(data.request.url, 'http://example.com');
    const endpoint = url.pathname;
    const method = data.request.method;

    // Find index of this request
    const requestIndex = storage
      .getEndpoints()
      [endpoint][method].findIndex(req => req.timestamp === data.timestamp);

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'updateRequestNotes':
            storage.updateRequestNotes(
              endpoint,
              method,
              requestIndex,
              message.text
            );
            break;
          case 'updateEndpointNotes':
            storage.updateEndpointNotes(endpoint, message.text);
            break;
        }
      },
      undefined,
      []
    );
  }

  /**
   * Generate HTML for the request viewer panel
   * @param {Object} data Request/response data
   * @returns {string} HTML content
   */
  static generateHtml(data) {
    const url = new URL(data.request.url, 'http://example.com');
    const endpoint = url.pathname;
    const endpointNotes = storage.getEndpoints()[endpoint].notes || '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Request Details</title>
    <style>
        body { 
            font-family: var(--vscode-font-family); 
            padding: 10px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .container { display: flex; flex-direction: column; height: 100vh; }
        .panel { margin-bottom: 20px; }
        .panel-header { 
            background-color: var(--vscode-titleBar-activeBackground);
            color: var(--vscode-titleBar-activeForeground);
            padding: 5px 10px;
            font-weight: bold;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .panel-content { 
            background-color: var(--vscode-editor-background);
            padding: 10px;
            overflow: auto;
            max-height: 300px;
            border: 1px solid var(--vscode-panel-border);
        }
        .response-success { color: var(--vscode-terminal-ansiGreen); }
        .response-error { color: var(--vscode-terminal-ansiRed); }
        .response-redirect { color: var(--vscode-terminal-ansiYellow); }
        pre { 
            margin: 0; 
            white-space: pre-wrap; 
            background-color: var(--vscode-textCodeBlock-background);
            padding: 8px;
            border-radius: 3px;
        }
        .notes-area {
            width: 100%;
            min-height: 80px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 5px;
            font-family: var(--vscode-font-family);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="panel">
            <div class="panel-header">Endpoint Notes</div>
            <div class="panel-content">
                <textarea id="endpoint-notes" class="notes-area">${this.escapeHtml(
                  endpointNotes
                )}</textarea>
            </div>
        </div>
        
        <div class="panel">
            <div class="panel-header">Request Notes</div>
            <div class="panel-content">
                <textarea id="request-notes" class="notes-area">${this.escapeHtml(
                  data.notes.request || ''
                )}</textarea>
            </div>
        </div>
        
        <div class="panel">
            <div class="panel-header">Request Details</div>
            <div class="panel-content">
                <strong>Method:</strong> ${data.request.method}<br>
                <strong>URL:</strong> ${data.request.url}<br>
                <strong>Headers:</strong><br>
                <pre>${this.formatHeaders(data.request.headers)}</pre>
                ${
                  data.request.body
                    ? `<strong>Body:</strong><br><pre>${this.escapeAndFormatBody(
                        data.request.body,
                        data.request.headers['content-type']
                      )}</pre>`
                    : ''
                }
            </div>
        </div>
        
        ${
          data.response
            ? `
        <div class="panel">
            <div class="panel-header">Response Details</div>
            <div class="panel-content">
                <strong>Status:</strong> <span class="${this.getStatusClass(
                  data.response.statusCode
                )}">${data.response.statusCode} ${
                data.response.statusMessage
              }</span><br>
                <strong>Headers:</strong><br>
                <pre>${this.formatHeaders(data.response.headers)}</pre>
                ${
                  data.response.body
                    ? `<strong>Body:</strong><br><pre>${this.escapeAndFormatBody(
                        data.response.body,
                        data.response.headers['content-type']
                      )}</pre>`
                    : ''
                }
            </div>
        </div>
        `
            : ''
        }
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // Save notes when changed
        document.getElementById('request-notes').addEventListener('input', (e) => {
            vscode.postMessage({
                command: 'updateRequestNotes',
                text: e.target.value
            });
        });
        
        document.getElementById('endpoint-notes').addEventListener('input', (e) => {
            vscode.postMessage({
                command: 'updateEndpointNotes',
                text: e.target.value
            });
        });
    </script>
</body>
</html>`;
  }

  /**
   * Format headers for display
   * @param {Object} headers Headers object
   * @returns {string} Formatted headers
   */
  static formatHeaders(headers) {
    return Object.entries(headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
  }

  /**
   * Format and escape body based on content type
   * @param {string} body Body content
   * @param {string} contentType Content type
   * @returns {string} Formatted and escaped body
   */
  static escapeAndFormatBody(body, contentType) {
    try {
      // For JSON content, format it nicely
      if (contentType && contentType.includes('application/json')) {
        return this.escapeHtml(JSON.stringify(JSON.parse(body), null, 2));
      }
      // For HTML content, escape it to show as code
      else if (
        contentType &&
        (contentType.includes('text/html') ||
          contentType.includes('application/html'))
      ) {
        return this.escapeHtml(body);
      }
    } catch (e) {
      // If parsing fails, return the escaped original body
    }
    return this.escapeHtml(body || '');
  }

  /**
   * Get CSS class for response status
   * @param {number} statusCode HTTP status code
   * @returns {string} CSS class name
   */
  static getStatusClass(statusCode) {
    if (statusCode >= 200 && statusCode < 300) {
      return 'response-success';
    } else if (statusCode >= 400) {
      return 'response-error';
    } else if (statusCode >= 300) {
      return 'response-redirect';
    }
    return '';
  }

  /**
   * Escape HTML special characters
   * @param {string} unsafe Unsafe string
   * @returns {string} Escaped string
   */
  static escapeHtml(unsafe) {
    if (!unsafe) return '';

    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

module.exports = RequestPanel;
