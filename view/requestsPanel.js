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

    // Always create a new unique panel for each request (no reuse)
    const panelKey = `${host}-${endpoint}-${method}-${requestIndex}`;
    const panelId = `${panelKey}-${Date.now()}-${Math.random()}`;

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
      panelId,
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
        // Always fetch latest data from storage after any code ref op
        let updatedData;
        switch (message.command) {
          case 'refreshPanel':
            updatedData =
              storage.getHosts()[host].endpoints[endpoint][method][
                requestIndex
              ];
            this.activePanels.get(panelId).data = updatedData;
            this.refreshPanel(panel, updatedData);
            break;
          case 'updateRequestNotes':
            storage.updateRequestNotes(
              host,
              endpoint,
              method,
              requestIndex,
              message.text
            );
            updatedData =
              storage.getHosts()[host].endpoints[endpoint][method][
                requestIndex
              ];
            this.activePanels.get(panelId).data = updatedData;
            this.refreshPanel(panel, updatedData);
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
              updatedData =
                storage.getHosts()[host].endpoints[endpoint][method][
                  requestIndex
                ];
              this.activePanels.get(panelId).data = updatedData;
              this.refreshPanel(panel, updatedData);
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
              updatedData =
                storage.getHosts()[host].endpoints[endpoint][method][
                  requestIndex
                ];
              this.activePanels.get(panelId).data = updatedData;
              this.refreshPanel(panel, updatedData);
            }
            break;
          default:
            updatedData =
              storage.getHosts()[host].endpoints[endpoint][method][
                requestIndex
              ];
            this.activePanels.get(panelId).data = updatedData;
            this.refreshPanel(panel, updatedData);
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
    // Find all panels that match this request
    for (const [panelId, panelInfo] of this.activePanels.entries()) {
      if (
        panelInfo.host === host &&
        panelInfo.endpoint === endpoint &&
        panelInfo.method === method &&
        panelInfo.requestIndex === requestIndex
      ) {
        // Update the panel's data
        panelInfo.data = updatedData;
        // Force refresh the panel
        this.refreshPanel(panelInfo.panel, updatedData);
      }
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

            // Construct remote URL if possible
            let remoteUrl = '';
            if (
              ref.gitInfo &&
              ref.gitInfo.remoteUrl &&
              ref.gitInfo.commitHash
            ) {
              // Assume remoteUrl is like https://github.com/org/repo
              // filePath is relative to repo root
              remoteUrl = `${ref.gitInfo.remoteUrl.replace(/\/$/, '')}/blob/${
                ref.gitInfo.commitHash
              }/${ref.filePath}#L${ref.startLine + 1}-L${ref.endLine + 1}`;
            }

            return `
          <div class="code-reference ${validityClass}" data-index="${index}">
            <div class="code-ref-header">
              <span class="code-ref-file">${this.escapeHtml(
                ref.filePath
              )}</span>
              ${
                remoteUrl
                  ? `<a href="${remoteUrl}" target="_blank" class="code-ref-link">View on GitHub</a>`
                  : ''
              }
              <span class="code-ref-lines">Lines ${ref.startLine + 1}-${
              ref.endLine + 1
            }</span>
            </div>
            ${gitInfo}
            <div class="code-ref-actions">
              <button class="code-ref-goto">Go to code</button>
              <button class="code-ref-validate">Validate</button>
              <button class="code-ref-delete">Remove</button>
            </div>
            <pre class="code-ref-content" style="font-family: 'Fira Mono', 'Consolas', 'Monaco', monospace; font-size: 13px; background: #222; color: #eee; border-radius: 4px; padding: 10px; overflow-x: auto;">
${warningIcon}${this.escapeHtml(ref.text)}
            </pre>
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
    if (!panel || !panel.webview) return;
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
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codicons/0.0.1/codicon.min.css">
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
            min-height: 100vh;
            overflow-y: auto;
        }
        .panel-controls {
            padding: 8px 12px;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: flex-end;
        }
        .refresh-button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            cursor: pointer;
            padding: 6px 12px;
            display: flex;
            align-items: center;
            gap: 6px;
            border-radius: 4px;
            font-size: 12px;
            transition: background-color 0.2s ease;
        }
        .refresh-button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .refresh-button .codicon {
            font-size: 14px;
        }
        .split-view {
            display: flex;
            flex: 1;
            min-height: fit-content;
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
        .panel-header .left {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .panel-header .right {
            display: flex;
            align-items: center;
            gap: 8px;
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
            padding: 16px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .notes-section h3 {
            margin-top: 0;
            margin-bottom: 12px;
            color: var(--vscode-editor-foreground);
        }
        textarea {
            width: 100%;
            min-height: 100px;
            padding: 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            font-family: inherit;
            border-radius: 4px;
            resize: vertical;
        }
        textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        .code-refs {
            padding: 16px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .code-refs-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        .code-refs-title {
            font-size: 16px;
            font-weight: bold;
            color: var(--vscode-editor-foreground);
        }
        .code-ref {
            margin-bottom: 16px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            overflow: hidden;
            background-color: var(--vscode-editor-background);
            transition: all 0.2s ease;
        }
        .code-ref:hover {
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            transform: translateY(-1px);
        }
        .code-ref-header {
            padding: 12px;
            background: linear-gradient(to bottom, var(--vscode-titleBar-activeBackground), var(--vscode-editor-background));
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .code-ref-file {
            font-weight: bold;
            color: var(--vscode-editor-foreground);
        }
        .code-ref-lines {
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
        }
        .code-ref-content {
            padding: 16px;
            background-color: var(--vscode-textCodeBlock-background);
            overflow-x: auto;
            margin: 0;
            font-family: 'Fira Code', 'Consolas', 'Monaco', monospace;
            font-size: 13px;
            line-height: 1.5;
            border-radius: 0 0 6px 6px;
        }
        .code-ref-actions {
            padding: 12px;
            background-color: var(--vscode-editor-background);
            border-top: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 8px;
        }
        .code-ref button {
            padding: 6px 12px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: background-color 0.2s ease;
        }
        .code-ref button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .code-ref-invalid {
            border-left: 4px solid var(--vscode-editorError-foreground);
        }
        .code-ref-warning {
            padding: 12px;
            background-color: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
            border-top: 1px solid var(--vscode-inputValidation-errorBorder);
            font-size: 0.9em;
        }
        .code-ref-link {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            font-size: 0.9em;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .code-ref-link:hover {
            text-decoration: underline;
        }
        .code-ref-git {
            margin: 8px 12px;
            display: flex;
            gap: 12px;
            align-items: center;
            font-size: 0.9em;
        }
        .code-ref-commit {
            color: var(--vscode-descriptionForeground);
            font-family: 'Fira Code', 'Consolas', 'Monaco', monospace;
        }
        .code-ref-branch {
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="panel-controls">
            <button class="refresh-button" onclick="refreshPanel()" title="Refresh entire panel">
                <span class="codicon codicon-refresh"></span>
                Refresh Panel
            </button>
        </div>
        <div class="split-view">
            <div class="request-panel">
                <div class="panel-header">
                    <div class="left">
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
                    <div class="left">Response</div>
                    <div class="right">
                        ${
                          data.response
                            ? `<span class="status status-${Math.floor(
                                data.response.statusCode / 100
                              )}xx">${data.response.statusCode}</span>`
                            : ''
                        }
                    </div>
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
            <div class="code-refs-header">
                <div class="code-refs-title">
                    <span class="codicon codicon-references"></span>
                    Code References
                </div>
            </div>
            ${data.codeReferences
              .map((ref, index) => {
                const validityClass =
                  ref.isValid === false ? 'code-ref-invalid' : '';
                const warningIcon = ref.isValid === false ? '⚠️ ' : '';
                const creationDate = ref.createdAt
                  ? new Date(ref.createdAt).toLocaleString()
                  : 'Unknown date';
                let remoteUrl = '';
                if (
                  ref.gitInfo &&
                  ref.gitInfo.remoteUrl &&
                  ref.gitInfo.commitHash
                ) {
                  remoteUrl = `${ref.gitInfo.remoteUrl.replace(
                    /\/$/,
                    ''
                  )}/blob/${ref.gitInfo.commitHash}/${ref.filePath}#L${
                    ref.startLine + 1
                  }-L${ref.endLine + 1}`;
                }
                return `
                    <div class="code-ref ${validityClass}" data-index="${index}">
                        <div class="code-ref-header">
                            <div class="left">
                                <span class="code-ref-file">${this.escapeHtml(
                                  ref.filePath
                                )}</span>
                                <span class="code-ref-lines">Lines ${
                                  ref.startLine + 1
                                }-${ref.endLine + 1}</span>
                            </div>
                            <div class="right">
                                ${
                                  remoteUrl
                                    ? `<a href="${remoteUrl}" target="_blank" class="code-ref-link">$(link-external) View on GitHub</a>`
                                    : ''
                                }
                            </div>
                        </div>
                        ${
                          ref.gitInfo
                            ? `
                            <div class="code-ref-git">
                                <span class="code-ref-commit" title="${
                                  ref.gitInfo.commitHash
                                }">$(git-commit) ${ref.gitInfo.commitHash.substring(
                                0,
                                7
                              )}</span>
                                <span class="code-ref-branch">$(git-branch) ${
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
                            <button class="code-ref-goto" onclick="navigateToCode(${index})">
                                <span class="codicon codicon-go-to-file"></span>
                                Go to code
                            </button>
                            <button class="code-ref-validate" onclick="validateCode(${index})">
                                <span class="codicon codicon-check"></span>
                                Validate
                            </button>
                            <button class="code-ref-delete" onclick="removeCodeRef(${index})">
                                <span class="codicon codicon-trash"></span>
                                Remove
                            </button>
                        </div>
                        ${
                          ref.isValid === false
                            ? `
                            <div class="code-ref-warning">
                                $(warning) This code reference is invalid: ${
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
        
        function refreshPanel() {
            vscode.postMessage({
                command: 'refreshPanel'
            });
        }
        
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
