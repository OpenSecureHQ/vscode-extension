const vscode = require('vscode');
const { createServer } = require('./server');
const RequestsProvider = require('./view/requestsProvider');
const HttpRequestNotebookProvider = require('./view/notebookProvider');
const storage = require('./data/storage');

/**
 * Activate the extension
 * @param {vscode.ExtensionContext} context The extension context
 */
function activate(context) {
  console.log('Extension "OpenSecure" is now active');

  // Create the tree data provider
  const requestsProvider = new RequestsProvider();

  // Register the tree data provider
  const treeView = vscode.window.createTreeView('openSecureRequests', {
    treeDataProvider: requestsProvider,
  });

  // Create notebook provider
  const notebookProvider = new HttpRequestNotebookProvider(storage);
  context.subscriptions.push(notebookProvider.register());

  // Start the server to listen for BURP data
  const server = createServer(3700, data => storage.addRequest(data));

  // Register refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand('openSecure.refresh', () => {
      requestsProvider.refresh();
    })
  );

  // Replace viewRequest with viewRequestAsNotebook
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'openSecure.viewRequestAsNotebook',
      data => {
        notebookProvider.openRequestNotebook(data);
      }
    )
  );

  // Keep the endpoint notes command
  context.subscriptions.push(
    vscode.commands.registerCommand('openSecure.addEndpointNotes', item => {
      vscode.window
        .showInputBox({
          prompt: 'Enter notes for this endpoint',
          value: storage.getEndpoints()[item.endpoint].notes || '',
        })
        .then(input => {
          if (input !== undefined) {
            storage.updateEndpointNotes(item.endpoint, input);
          }
        });
    })
  );

  // Clean up server on deactivation
  context.subscriptions.push({
    dispose: () => {
      if (server) {
        server.close();
        console.log('Server stopped');
      }
      notebookProvider.dispose();
    },
  });
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
