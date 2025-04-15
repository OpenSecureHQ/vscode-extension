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
          case 'updateEndpointNotes':
            storage.updateEndpointNotes(host, endpoint, message.text);
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
        .host-info {
            font-weight: bold;
            margin-bottom: 5px;
            color: var(--vscode-terminal-ansiBlue);
        }
        .code-reference {
          margin-bottom: 15px;
          border: 1px solid var(--vscode-panel-border);
          border-radius: 3px;
        }
        .code-ref-header {
          display: flex;
          padding: 5px;
          background-color: var(--vscode-editor-inactiveSelectionBackground);
          font-size: 0.9em;
          border-bottom: 1px solid var(--vscode-panel-border);
        }
        .code-ref-file {
          flex-grow: 1;
          font-weight: bold;
        }
        .code-ref-lines {
          margin-right: 10px;
          color: var(--vscode-descriptionForeground);
        }
        .code-ref-goto, .code-ref-delete {
          background: none;
          border: none;
          color: var(--vscode-button-foreground);
          background-color: var(--vscode-button-background);
          border-radius: 3px;
          padding: 2px 8px;
          cursor: pointer;
          margin-left: 5px;
        }
        .code-ref-content {
          max-height: 150px;
          overflow: auto;
          margin: 0;
          padding: 8px;
          background-color: var(--vscode-textCodeBlock-background);
          border-radius: 0 0 3px 3px;
        }
        .code-ref-date {
          margin-right: 10px;
          font-size: 0.85em;
          color: var(--vscode-descriptionForeground);
        }
        .code-ref-invalid {
          border-left: 3px solid var(--vscode-editorError-foreground);
        }
        .code-ref-warning {
          padding: 5px 8px;
          background-color: var(--vscode-inputValidation-errorBackground);
          color: var(--vscode-inputValidation-errorForeground);
          border: 1px solid var(--vscode-inputValidation-errorBorder);
          font-size: 0.9em;
          margin-top: 0;
          border-radius: 0 0 3px 3px;
        }
        .code-ref-git {
          padding: 4px 8px;
          background-color: var(--vscode-editor-lineHighlightBackground);
          font-size: 0.85em;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          border-bottom: 1px solid var(--vscode-panel-border);
        }
        .code-ref-commit {
          font-family: var(--vscode-editor-font-family);
          color: var(--vscode-gitDecoration-addedResourceForeground);
        }
        .code-ref-branch {
          color: var(--vscode-gitDecoration-modifiedResourceForeground);
        }
        .code-ref-actions {
          display: flex;
          justify-content: flex-end;
          padding: 4px 8px;
          background-color: var(--vscode-editor-inactiveSelectionBackground);
          border-bottom: 1px solid var(--vscode-panel-border);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="panel">
            <div class="panel-header">Endpoint Notes</div>
            <div class="panel-content">
                <div class="host-info">${host}${endpoint}</div>
                <textarea id="endpoint-notes" class="notes-area">${this.escapeHtml(
                  endpointNotes
                )}</textarea>
            </div>
            ${
              data.codeReferences
                ? this.generateCodeReferencesHtml(data.codeReferences)
                : ''
            }
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
                <div class="host-info">${host}</div>
                ${data.request.method}&nbsp;${data.request.url}<br>
                <pre>${this.formatHeaders(data.request.headers)}</pre>
                ${
                  data.request.body
                    ? `<pre>${this.escapeAndFormatBody(
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
                <span class="${this.getStatusClass(
                  data.response.statusCode
                )}">${data.response.statusCode} ${
                data.response.statusMessage
              }</span><br>
                <pre>${this.formatHeaders(data.response.headers)}</pre>
                ${
                  data.response.body
                    ? `<pre>${this.escapeAndFormatBody(
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

        document.querySelectorAll('.code-ref-goto').forEach((button, index) => {
        button.addEventListener('click', () => {
          const refIndex = button.closest('.code-reference').dataset.index;
          vscode.postMessage({
            command: 'navigateToCodeReference',
            refIndex: parseInt(refIndex, 10)
          });
        });
      });

      // Handle code reference validation
      document.querySelectorAll('.code-ref-validate').forEach((button, index) => {
        button.addEventListener('click', () => {
          const refIndex = button.closest('.code-reference').dataset.index;
          vscode.postMessage({
            command: 'validateCodeReference',
            refIndex: parseInt(refIndex, 10)
          });
        });
      });

      // Handle code reference deletion
      document.querySelectorAll('.code-ref-delete').forEach((button, index) => {
        button.addEventListener('click', () => {
          const refIndex = button.closest('.code-reference').dataset.index;
          vscode.postMessage({
            command: 'removeCodeReference',
            refIndex: parseInt(refIndex, 10)
          });
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
