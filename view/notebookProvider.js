const vscode = require('vscode');
const { TextDecoder } = require('util');

/**
 * Provides functionality for HTTP request notebooks
 */
class HttpRequestNotebookProvider {
  constructor(storage) {
    this.storage = storage;
    this.disposables = [];
  }

  /**
   * Register the notebook serializer and provider
   * @returns {vscode.Disposable} The disposable registration
   */
  register() {
    // Register notebook serializer
    const serializer = vscode.workspace.registerNotebookSerializer(
      'opensecure-notebook',
      {
        deserializeNotebook: async (content, token) => {
          let data;
          try {
            const contentString = new TextDecoder().decode(content);
            data = contentString ? JSON.parse(contentString) : {};
          } catch (error) {
            console.error('Error parsing notebook data:', error);
            data = {}; // Default to empty object on parse error
          }
          return this._createNotebookData(data);
        },
        serializeNotebook: async (data, token) => {
          // For now, we don't need to save changes back
          return Buffer.from(JSON.stringify({}));
        },
      }
    );

    this.disposables.push(serializer);
    return serializer;
  }

  /**
   * Open a request as a notebook
   * @param {Object} data The request/response data
   */
  async openRequestNotebook(data) {
    // Create a temporary notebook file URI
    const fileName = `request-${Date.now()}.osreq`;
    const uri = vscode.Uri.parse(`untitled:${fileName}`);

    // Create notebook data
    const notebookData = await this._createNotebookData(data);

    // Open the notebook document
    const doc = await vscode.workspace.openNotebookDocument(
      'opensecure-notebook',
      notebookData
    );
    await vscode.window.showNotebookDocument(doc);
  }

  /**
   * Create notebook data from request/response
   * @param {Object} data The request/response data
   * @returns The notebook data
   */
  async _createNotebookData(data) {
    const cells = [];

    // Check if we have valid data
    if (!data || !data.request) {
      // Create an empty notebook with placeholder content
      cells.push(
        new vscode.NotebookCellData(
          vscode.NotebookCellKind.Markup,
          `# New HTTP Request Notebook
        
This notebook will display HTTP request and response details.`,
          'markdown'
        )
      );

      // Empty request cell
      cells.push(
        new vscode.NotebookCellData(
          vscode.NotebookCellKind.Code,
          `// Waiting for request data...`,
          'http'
        )
      );

      // Empty response cell
      cells.push(
        new vscode.NotebookCellData(
          vscode.NotebookCellKind.Code,
          `// Waiting for response data...`,
          'http'
        )
      );

      return new vscode.NotebookData(cells);
    }

    // Map numeric method to string if needed
    let methodStr = 'UNKNOWN';
    if (data.request.method !== undefined) {
      if (typeof data.request.method === 'number') {
        // Map from http-parser-js method codes to string representations
        const methodMap = {
          0: 'DELETE',
          1: 'GET',
          2: 'HEAD',
          3: 'POST',
          4: 'PUT',
          5: 'CONNECT',
          6: 'OPTIONS',
          7: 'TRACE',
          8: 'COPY',
          9: 'LOCK',
          10: 'MKCOL',
          11: 'MOVE',
          12: 'PROPFIND',
          13: 'PROPPATCH',
          14: 'SEARCH',
          15: 'UNLOCK',
          16: 'BIND',
          17: 'REBIND',
          18: 'UNBIND',
          19: 'ACL',
          20: 'REPORT',
          21: 'MKACTIVITY',
          22: 'CHECKOUT',
          23: 'MERGE',
          24: 'M-SEARCH',
          25: 'NOTIFY',
          26: 'SUBSCRIBE',
          27: 'UNSUBSCRIBE',
          28: 'PATCH',
          29: 'PURGE',
          30: 'MKCALENDAR',
          31: 'LINK',
          32: 'UNLINK',
        };
        methodStr =
          methodMap[data.request.method] || `METHOD(${data.request.method})`;
      } else {
        methodStr = String(data.request.method);
      }
    }

    // Title cell
    let url = '/unknown';
    try {
      if (data.request.url) {
        url = new URL(data.request.url, 'http://example.com').pathname;
      }
    } catch (e) {
      url = data.request.url || '/unknown';
    }

    cells.push(
      new vscode.NotebookCellData(
        vscode.NotebookCellKind.Markup,
        `# ${methodStr} ${url}
        
**Timestamp:** ${new Date(data.timestamp || Date.now()).toLocaleString()}`,
        'markdown'
      )
    );

    // Request section
    cells.push(
      new vscode.NotebookCellData(
        vscode.NotebookCellKind.Markup,
        `## Request`,
        'markdown'
      )
    );

    // Request cell - use raw HTTP request if available
    cells.push(
      new vscode.NotebookCellData(
        vscode.NotebookCellKind.Code,
        data.request.raw || this._formatRawRequest(data.request, methodStr),
        'http'
      )
    );

    // Response section
    const statusInfo = data.response
      ? ` (${data.response.statusCode || '???'} ${
          data.response.statusMessage || ''
        })`
      : ' (No response)';

    cells.push(
      new vscode.NotebookCellData(
        vscode.NotebookCellKind.Markup,
        `## Response${statusInfo}`,
        'markdown'
      )
    );

    // Response cell - use raw HTTP response if available
    cells.push(
      new vscode.NotebookCellData(
        vscode.NotebookCellKind.Code,
        data.response
          ? data.response.raw || this._formatRawResponse(data.response)
          : '// No response data available',
        'http'
      )
    );

    return new vscode.NotebookData(cells);
  }

  /**
   * Format a request into a raw HTTP format if raw is not available
   * @param {Object} request The request object
   * @param {String} methodStr The HTTP method as a string
   * @returns {string} Formatted raw request
   */
  _formatRawRequest(request, methodStr) {
    if (!request) {
      return '// No request data available';
    }

    let output = `${methodStr} ${request.url || '/unknown'} HTTP/${
      request.version || '1.1'
    }\r\n`;

    // Add headers if they exist
    if (request.headers) {
      Object.entries(request.headers).forEach(([key, value]) => {
        output += `${key}: ${value}\r\n`;
      });
    }

    // Add empty line between headers and body
    output += '\r\n';

    // Add body if exists
    if (request.body) {
      output += request.body;
    }

    return output;
  }

  /**
   * Format a response into a raw HTTP format if raw is not available
   * @param {Object} response The response object
   * @returns {string} Formatted raw response
   */
  _formatRawResponse(response) {
    if (!response) {
      return '// No response data available';
    }

    let output = `HTTP/${response.version || '1.1'} ${
      response.statusCode || '???'
    } ${response.statusMessage || ''}\r\n`;

    // Add headers if they exist
    if (response.headers) {
      Object.entries(response.headers).forEach(([key, value]) => {
        output += `${key}: ${value}\r\n`;
      });
    }

    // Add empty line between headers and body
    output += '\r\n';

    // Add body if exists
    if (response.body) {
      output += response.body;
    }

    return output;
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.disposables.forEach(d => d.dispose());
  }
}

module.exports = HttpRequestNotebookProvider;
