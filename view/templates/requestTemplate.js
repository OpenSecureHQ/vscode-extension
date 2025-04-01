/**
 * HTML template generator for request detail views
 */
class RequestTemplate {
  /**
   * Generate the HTML for a request detail view
   * @param {Object} data Request/response data
   * @param {string} endpointNotes Notes for the endpoint
   * @returns {string} HTML content
   */
  static generate(data, endpointNotes) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Request Details</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 10px;
            margin: 0;
        }
        
        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
            gap: 20px;
        }
        
        .panel {
            background-color: var(--vscode-widget-shadow);
            border-radius: 5px;
            overflow: hidden;
            box-shadow: 0 2px 8px var(--vscode-widget-shadow);
        }
        
        .panel-header {
            background-color: var(--vscode-titleBar-activeBackground);
            color: var(--vscode-titleBar-activeForeground);
            padding: 8px 12px;
            font-weight: bold;
            border-bottom: 1px solid var(--vscode-panel-border);
            user-select: none;
        }
        
        .panel-content {
            padding: 12px;
            overflow: auto;
            max-height: 300px;
        }
        
        .response-success { color: var(--vscode-testing-iconPassed); }
        .response-error { color: var(--vscode-testing-iconFailed); }
        .response-redirect { color: var(--vscode-testing-iconQueued); }
        
        pre {
            margin: 8px 0;
            white-space: pre-wrap;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            background-color: var(--vscode-textCodeBlock-background);
            border-radius: 3px;
            padding: 8px;
            overflow: auto;
        }
        
        .notes-area {
            width: 100%;
            min-height: 80px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            padding: 8px;
            font-family: var(--vscode-editor-font-family);
            resize: vertical;
        }
        
        .notes-area:focus {
            outline: 1px solid var(--vscode-focusBorder);
            border-color: var(--vscode-focusBorder);
        }
        
        .label {
            font-weight: bold;
            margin-right: 8px;
            color: var(--vscode-editor-foreground);
        }
        
        .header-section {
            margin-bottom: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 8px;
        }
        
        .status-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-weight: bold;
            margin-left: 8px;
        }
        
        .status-2xx { background-color: var(--vscode-debugIcon-startForeground); color: var(--vscode-button-foreground); }
        .status-3xx { background-color: var(--vscode-statusBarItem-warningBackground); color: var(--vscode-statusBarItem-warningForeground); }
        .status-4xx, .status-5xx { background-color: var(--vscode-errorForeground); color: var(--vscode-button-foreground); }
        
        .method-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-weight: bold;
            margin-right: 8px;
        }
        
        .method-GET { background-color: var(--vscode-charts-blue); }
        .method-POST { background-color: var(--vscode-charts-green); }
        .method-PUT { background-color: var(--vscode-charts-orange); }
        .method-DELETE { background-color: var(--vscode-charts-red); }
        .method-PATCH { background-color: var(--vscode-charts-purple); }
        .method-default { background-color: var(--vscode-charts-gray); }
    </style>
</head>
<body>
    <div class="container">
        <div class="panel">
            <div class="panel-header">Endpoint Notes</div>
            <div class="panel-content">
                <textarea id="endpoint-notes" class="notes-area" placeholder="Add notes about this endpoint here...">${this.escapeHtml(
                  endpointNotes
                )}</textarea>
            </div>
        </div>
        
        <div class="panel">
            <div class="panel-header">Request Notes</div>
            <div class="panel-content">
                <textarea id="request-notes" class="notes-area" placeholder="Add notes about this specific request here...">${this.escapeHtml(
                  data.notes.request || ''
                )}</textarea>
            </div>
        </div>
        
        <div class="panel">
            <div class="panel-header">Request Details</div>
            <div class="panel-content">
                <div class="header-section">
                    <span class="method-badge method-${
                      data.request.method || 'default'
                    }">${data.request.method}</span>
                    <span>${data.request.url}</span>
                </div>
                
                <div class="label">Headers:</div>
                <pre>${this.formatHeaders(data.request.headers)}</pre>
                
                ${
                  data.request.body
                    ? `
                <div class="label">Body:</div>
                <pre>${this.formatBody(
                  data.request.body,
                  data.request.headers['content-type']
                )}</pre>
                `
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
                <div class="header-section">
                    <span class="label">Status:</span>
                    <span class="status-badge status-${Math.floor(
                      data.response.statusCode / 100
                    )}xx">
                        ${data.response.statusCode} ${
                data.response.statusMessage
              }
                    </span>
                </div>
                
                <div class="label">Headers:</div>
                <pre>${this.formatHeaders(data.response.headers)}</pre>
                
                ${
                  data.response.body
                    ? `
                <div class="label">Body:</div>
                <pre>${this.formatBody(
                  data.response.body,
                  data.response.headers['content-type']
                )}</pre>
                `
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
    if (!headers || Object.keys(headers).length === 0) {
      return 'No headers';
    }

    return Object.entries(headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
  }

  /**
   * Format body based on content type
   * @param {string} body Body content
   * @param {string} contentType Content type
   * @returns {string} Formatted body
   */
  static formatBody(body, contentType) {
    if (!body) {
      return 'No body content';
    }

    try {
      if (contentType && contentType.includes('application/json')) {
        return JSON.stringify(JSON.parse(body), null, 2);
      }
    } catch (e) {
      // If parsing fails, return the original body
    }
    return body;
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

module.exports = RequestTemplate;
