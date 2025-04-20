const vscode = require('vscode');
const storage = require('../data/storage');

/**
 * Create and manage a webview panel for displaying request details
 */
class RequestPanel {
  // Track all active panels
  static activePanels = new Map();

  /**
   * Create a new panel
   * @param {Object} data Request/response data to display
   */
  static create(data) {
    // Extract host and endpoint for reference
    const host = data.request.host || 'unknown-host';
    const url = new URL(data.request.url, `http://${host}`);
    const endpoint = url.pathname;
    const method = data.request.method;

    // Find index of this request
    const hosts = storage.getHosts();
    if (
      !hosts[host] ||
      !hosts[host].endpoints[endpoint] ||
      !hosts[host].endpoints[endpoint][method]
    ) {
      console.log('Error finding request in storage');
      return;
    }

    const requestIndex = hosts[host].endpoints[endpoint][method].findIndex(
      req => req.timestamp.getTime() === data.timestamp.getTime()
    );

    if (requestIndex === -1) {
      console.log('Error finding request in storage');
      return;
    }

    // Create a unique ID for this request panel
    const panelId = `${host}-${endpoint}-${method}-${requestIndex}`;

    // Check if we already have a panel for this request
    if (this.activePanels.has(panelId)) {
      // If we do, just show it and refresh its content
      const existingPanel = this.activePanels.get(panelId);
      existingPanel.panel.reveal();
      this.refreshPanel(existingPanel.panel, data);
      return;
    }

    // Create and show panel
    const panel = vscode.window.createWebviewPanel(
      'requestDetails',
      `${data.request.method} ${
        new URL(data.request.url, `http://${data.request.host}`).pathname
      }`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    // Generate HTML content
    panel.webview.html = this.generateHtml(data);

    // Store the panel info
    this.activePanels.set(panelId, {
      panel,
      host,
      endpoint,
      method,
      requestIndex,
      data,
    });

    // Handle panel disposal
    panel.onDidDispose(() => {
      this.activePanels.delete(panelId);
    });

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'updateRequestNotes':
            storage.updateRequestNotes(
              host,
              endpoint,
              method,
              requestIndex,
              message.text
            );
            break;
          case 'navigateToCodeReference':
            if (data.codeReferences && data.codeReferences[message.refIndex]) {
              vscode.commands.executeCommand(
                'openSecure.navigateToCodeReference',
                data.codeReferences[message.refIndex]
              );
            }
            break;
          case 'validateCodeReference':
            if (data.codeReferences && data.codeReferences[message.refIndex]) {
              vscode.commands.executeCommand(
                'openSecure.validateCodeReference',
                host,
                endpoint,
                method,
                requestIndex,
                message.refIndex,
                data.codeReferences[message.refIndex]
              );
            }
            break;
          case 'removeCodeReference':
            if (data.codeReferences && data.codeReferences[message.refIndex]) {
              storage.removeCodeReference(
                host,
                endpoint,
                method,
                requestIndex,
                message.refIndex
              );

              // Get updated data
              const updatedData =
                storage.getHosts()[host].endpoints[endpoint][method][
                  requestIndex
                ];

              // Update local data reference
              this.activePanels.get(panelId).data = updatedData;

              // Refresh the panel
              this.refreshPanel(panel, updatedData);
            }
            break;
        }
      },
      undefined,
      []
    );
  }

  /**
   * Update a specific panel with new data
   * @param {string} host The host
   * @param {string} endpoint The endpoint
   * @param {string} method The HTTP method
   * @param {number} requestIndex The request index
   * @param {Object} updatedData The updated data
   */
  static updatePanel(host, endpoint, method, requestIndex, updatedData) {
    const panelId = `${host}-${endpoint}-${method}-${requestIndex}`;

    if (this.activePanels.has(panelId)) {
      const panelInfo = this.activePanels.get(panelId);
      panelInfo.data = updatedData;
      this.refreshPanel(panelInfo.panel, updatedData);
    }
  }

  /**
   * Generate HTML for code references
   * @param {Array} codeReferences Array of code references
   * @returns {string} HTML content
   */
  static generateCodeReferencesHtml(codeReferences) {
    if (!codeReferences || codeReferences.length === 0) {
      return '';
    }

    return `
    <div class="panel">
      <div class="panel-header">Code References</div>
      <div class="panel-content">
        ${codeReferences
          .map((ref, index) => {
            // Format the creation date if available
            const creationDate = ref.createdAt
              ? new Date(ref.createdAt).toLocaleString()
              : 'Unknown date';

            // Determine if we should show any validity indicators
            const validityClass =
              ref.isValid === false ? 'code-ref-invalid' : '';
            const warningIcon = ref.isValid === false ? '⚠️ ' : '';

            // Git information display
            const gitInfo = ref.gitInfo
              ? `
                  <div class="code-ref-git">
                    <span class="code-ref-commit" title="${
                      ref.gitInfo.commitHash
                    }">Commit: ${ref.gitInfo.commitHash.substring(0, 7)}</span>
                    <span class="code-ref-branch">Branch: ${
                      ref.gitInfo.branch
                    }</span>
                  </div>
                `
              : '';

            return `
          <div class="code-reference ${validityClass}" data-index="${index}">
            <div class="code-ref-header">
              <span class="code-ref-file">${this.escapeHtml(
                ref.filePath
              )}</span>
              <span class="code-ref-lines">Lines ${ref.startLine + 1}-${
              ref.endLine + 1
            }</span>
              <span class="code-ref-date" title="Created on ${creationDate}">Added: ${creationDate}</span>
            </div>
            ${gitInfo}
            <div class="code-ref-actions">
              <button class="code-ref-goto">Go to code</button>
              <button class="code-ref-validate">Validate</button>
              <button class="code-ref-delete">Remove</button>
            </div>
            <pre class="code-ref-content">${warningIcon}${this.escapeHtml(
              ref.text
            )}</pre>
            ${
              ref.isValid === false
                ? `<div class="code-ref-warning">This code reference is invalid: ${
                    ref.invalidReason ||
                    'The code may have been modified or deleted.'
                  }</div>`
                : ''
            }
          </div>
        `;
          })
          .join('')}
      </div>
    </div>
  `;
  }

  /**
   * Refresh the panel content
   * @param {vscode.WebviewPanel} panel Panel to refresh
   * @param {Object} data Updated data
   */
  static refreshPanel(panel, data) {
    panel.webview.html = this.generateHtml(data);
  }

  /**
   * Generate HTML for the request viewer panel
   * @param {Object} data Request/response data
   * @returns {string} HTML content
   */
  static generateHtml(data) {
    const host = data.request.host || 'unknown-host';
    const url = new URL(data.request.url, `http://${host}`);
    const endpoint = url.pathname;

    const hosts = storage.getHosts();
    const endpointNotes =
      (hosts[host] &&
        hosts[host].endpoints[endpoint] &&
        hosts[host].endpoints[endpoint].notes) ||
      '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Request Details</title>
    <style>
        body {
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            margin: 0;
            padding: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        .split-view {
            display: flex;
            flex: 1;
            overflow: hidden;
        }
        .request-panel, .response-panel {
            flex: 1;
            overflow: auto;
            padding: 0;
            position: relative;
            border-right: 1px solid var(--vscode-panel-border);
        }
        .response-panel {
            border-right: none;
        }
        .panel-header {
            padding: 8px 12px;
            background: linear-gradient(to bottom, var(--vscode-titleBar-activeBackground), var(--vscode-editor-background));
            color: var(--vscode-titleBar-activeForeground);
            font-weight: bold;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .panel-header .method {
            padding: 2px 6px;
            border-radius: 3px;
            margin-right: 8px;
            font-size: 0.9em;
        }
        .panel-header .status {
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 0.9em;
        }
        .raw-content {
            padding: 0;
            margin: 0;
            white-space: pre;
            tab-size: 4;
            counter-reset: line;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        }
        .raw-content .line {
            display: block;
            position: relative;
            padding-left: 4em;
            min-height: 1.5em;
            padding-right: 1em;
        }
        .raw-content .line:before {
            counter-increment: line;
            content: counter(line);
            position: absolute;
            left: 0;
            width: 3em;
            text-align: right;
            padding-right: 0.5em;
            color: var(--vscode-editorLineNumber-foreground);
            border-right: 1px solid var(--vscode-panel-border);
        }
        .raw-content .line:hover {
            background-color: var(--vscode-editor-lineHighlightBackground);
        }
        .method-get { background-color: #61affe; color: white; }
        .method-post { background-color: #49cc90; color: white; }
        .method-put { background-color: #fca130; color: white; }
        .method-delete { background-color: #f93e3e; color: white; }
        .method-patch { background-color: #50e3c2; color: white; }
        .status-2xx { background-color: #49cc90; color: white; }
        .status-3xx { background-color: #fca130; color: white; }
        .status-4xx, .status-5xx { background-color: #f93e3e; color: white; }
        .notes-section {
            padding: 10px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        textarea {
            width: 100%;
            min-height: 100px;
            padding: 10px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            font-family: inherit;
        }
        .code-refs {
            padding: 10px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .code-ref {
            margin-bottom: 10px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 3px;
            overflow: hidden;
        }
        .code-ref-header {
            padding: 8px 12px;
            background: linear-gradient(to bottom, var(--vscode-titleBar-activeBackground), var(--vscode-editor-background));
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .code-ref-file {
            font-weight: bold;
        }
        .code-ref-lines {
            color: var(--vscode-descriptionForeground);
        }
        .code-ref-content {
            padding: 10px;
            background-color: var(--vscode-textCodeBlock-background);
            overflow-x: auto;
            margin: 0;
        }
        .code-ref-actions {
            padding: 8px;
            background-color: var(--vscode-editor-background);
            border-top: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 8px;
        }
        .code-ref button {
            padding: 4px 8px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
        .code-ref button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .code-ref-invalid {
            border-left: 3px solid var(--vscode-editorError-foreground);
        }
        .code-ref-warning {
            padding: 8px;
            background-color: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
            border-top: 1px solid var(--vscode-inputValidation-errorBorder);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="split-view">
            <div class="request-panel">
                <div class="panel-header">
                    <div>
                        <span class="method method-${data.request.method.toLowerCase()}">${
      data.request.method
    }</span>
                        Request
                    </div>
                </div>
                <div class="raw-content">
                    ${this.formatRawRequest(data.request)}
                </div>
            </div>
            
            <div class="response-panel">
                <div class="panel-header">
                    <div>Response</div>
                    ${
                      data.response
                        ? `<span class="status status-${Math.floor(
                            data.response.statusCode / 100
                          )}xx">${data.response.statusCode}</span>`
                        : ''
                    }
                </div>
                <div class="raw-content">
                    ${
                      data.response
                        ? this.formatRawResponse(data.response)
                        : '<div class="line">No response available</div>'
                    }
                </div>
            </div>
        </div>
        
        ${
          data.codeReferences && data.codeReferences.length > 0
            ? `
        <div class="code-refs">
            <h3>Code References</h3>
            ${data.codeReferences
              .map((ref, index) => {
                const validityClass =
                  ref.isValid === false ? 'code-ref-invalid' : '';
                const warningIcon = ref.isValid === false ? '⚠️ ' : '';
                const creationDate = ref.createdAt
                  ? new Date(ref.createdAt).toLocaleString()
                  : 'Unknown date';

                return `
                    <div class="code-ref ${validityClass}" data-index="${index}">
                        <div class="code-ref-header">
                            <span class="code-ref-file">${this.escapeHtml(
                              ref.filePath
                            )}</span>
                            <span class="code-ref-lines">Lines ${
                              ref.startLine + 1
                            }-${ref.endLine + 1}</span>
                        </div>
                        ${
                          ref.gitInfo
                            ? `
                            <div class="code-ref-git">
                                <span class="code-ref-commit" title="${
                                  ref.gitInfo.commitHash
                                }">Commit: ${ref.gitInfo.commitHash.substring(
                                0,
                                7
                              )}</span>
                                <span class="code-ref-branch">Branch: ${
                                  ref.gitInfo.branch
                                }</span>
                            </div>
                        `
                            : ''
                        }
                        <pre class="code-ref-content">${warningIcon}${this.escapeHtml(
                  ref.text
                )}</pre>
                        <div class="code-ref-actions">
                            <button class="code-ref-goto" onclick="navigateToCode(${index})">Go to code</button>
                            <button class="code-ref-validate" onclick="validateCode(${index})">Validate</button>
                            <button class="code-ref-delete" onclick="removeCodeRef(${index})">Remove</button>
                        </div>
                        ${
                          ref.isValid === false
                            ? `
                            <div class="code-ref-warning">
                                This code reference is invalid: ${
                                  ref.invalidReason ||
                                  'The code may have been modified or deleted.'
                                }
                            </div>
                        `
                            : ''
                        }
                    </div>
                `;
              })
              .join('')}
        </div>
        `
            : ''
        }
        
        <div class="notes-section">
            <h3>Notes</h3>
            <textarea id="notes" placeholder="Add notes about this request/response...">${
              data.notes?.content || ''
            }</textarea>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function navigateToCode(index) {
            vscode.postMessage({
                command: 'navigateToCodeReference',
                refIndex: index
            });
        }
        
        function validateCode(index) {
            vscode.postMessage({
                command: 'validateCodeReference',
                refIndex: index
            });
        }
        
        function removeCodeRef(index) {
            vscode.postMessage({
                command: 'removeCodeReference',
                refIndex: index
            });
        }
        
        document.getElementById('notes').addEventListener('change', () => {
            vscode.postMessage({
                command: 'updateRequestNotes',
                text: document.getElementById('notes').value
            });
        });
    </script>
</body>
</html>`;
  }

  /**
   * Format raw request message
   * @param {Object} request Request object
   * @returns {string} Formatted request HTML
   */
  static formatRawRequest(request) {
    const lines = [];

    // Request line
    lines.push(`${request.method} ${request.url} HTTP/1.1`);

    // Headers
    Object.entries(request.headers).forEach(([key, value]) => {
      lines.push(`${key}: ${value}`);
    });

    // Empty line between headers and body
    lines.push('');

    // Body
    if (request.body) {
      if (typeof request.body === 'string') {
        lines.push(...request.body.split('\n'));
      } else {
        try {
          lines.push(...JSON.stringify(request.body, null, 2).split('\n'));
        } catch (e) {
          lines.push(String(request.body));
        }
      }
    }

    return lines
      .map(line => `<div class="line">${this.escapeHtml(line)}</div>`)
      .join('');
  }

  /**
   * Format raw response message
   * @param {Object} response Response object
   * @returns {string} Formatted response HTML
   */
  static formatRawResponse(response) {
    const lines = [];

    // Status line
    lines.push(
      `HTTP/1.1 ${response.statusCode} ${response.statusMessage || ''}`
    );

    // Headers
    Object.entries(response.headers).forEach(([key, value]) => {
      lines.push(`${key}: ${value}`);
    });

    // Empty line between headers and body
    lines.push('');

    // Body
    if (response.body) {
      if (typeof response.body === 'string') {
        lines.push(...response.body.split('\n'));
      } else {
        try {
          lines.push(...JSON.stringify(response.body, null, 2).split('\n'));
        } catch (e) {
          lines.push(String(response.body));
        }
      }
    }

    return lines
      .map(line => `<div class="line">${this.escapeHtml(line)}</div>`)
      .join('');
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
