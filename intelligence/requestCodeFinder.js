const vscode = require('vscode');
const path = require('path');

class RequestCodeFinder {
  constructor() {
    this.workspaceFolders = vscode.workspace.workspaceFolders || [];
  }

  /**
   * Find code that handles a specific HTTP request
   * @param {Object} requestData The parsed request data from parser.js
   * @returns {Promise<Array<{file: string, line: number, text: string}>>}
   */
  async findRequestHandler(requestData) {
    if (!requestData || !requestData.method || !requestData.url) {
      throw new Error('Invalid request data');
    }

    // Extract just the path part from the URL (remove query params and hash)
    const url = new URL(requestData.url, `http://${requestData.host}`);
    const path = url.pathname;

    // Generate search patterns
    const patterns = this.generateSearchPatterns(requestData.method, path);

    // Search in workspace
    const locations = await this.searchInWorkspace(patterns);

    return locations;
  }

  /**
   * Generate search patterns for the request
   * @param {string} method HTTP method
   * @param {string} path URL path
   * @returns {Array<string>} Array of search patterns
   */
  generateSearchPatterns(method, path) {
    const patterns = [];

    // Add exact path match
    patterns.push(`'${path}'`);
    patterns.push(`"${path}"`);

    // Add common route definition patterns
    patterns.push(`${method.toLowerCase()}('${path}'`);
    patterns.push(`${method.toLowerCase()}("${path}"`);
    patterns.push(`.${method.toLowerCase()}('${path}'`);
    patterns.push(`.${method.toLowerCase()}("${path}"`);

    return patterns;
  }

  /**
   * Search for patterns in workspace files
   * @param {Array<string>} patterns Array of search patterns
   * @returns {Promise<Array<{file: string, line: number, text: string}>>}
   */
  async searchInWorkspace(patterns) {
    const locations = [];

    for (const folder of this.workspaceFolders) {
      // Find all files except those in node_modules and .git
      const files = await vscode.workspace.findFiles(
        '**/*',
        '**/{node_modules,.git}/**'
      );

      for (const file of files) {
        try {
          const document = await vscode.workspace.openTextDocument(file);
          const text = document.getText();
          const lines = text.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (patterns.some(pattern => line.includes(pattern))) {
              locations.push({
                file: file.fsPath,
                line: i,
                text: line.trim(),
              });
            }
          }
        } catch (error) {
          // Skip files that can't be read as text
          continue;
        }
      }
    }

    return locations;
  }
}

module.exports = RequestCodeFinder;
