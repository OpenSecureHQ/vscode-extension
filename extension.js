const vscode = require('vscode');
const { createServer } = require('./server');

let server;

/**
 * VS Code calls this when your extension is activated.
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('Extension "OpenSecure" activated.');

  // Start the Express server
  server = createServer();
}

function deactivate() {
  // Clean up if you like
  if (server) {
    server.close();
    console.log('Server stopped.');
  }
}

module.exports = {
  activate,
  deactivate,
};
