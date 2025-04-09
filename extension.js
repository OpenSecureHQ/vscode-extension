const vscode = require('vscode');
const { createServer } = require('./server');
const RequestsProvider = require('./view/requestsProvider');
const RequestPanel = require('./view/requestsPanel');
const storage = require('./data/storage');

/**
 * Activate the extension
 * @param {vscode.ExtensionContext} context The extension context
 */
async function activate(context) {
  console.log('Extension "OpenSecure" is now active');

  // Initialize storage system
  await storage.initialize();

  // Create status bar item
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.text = '$(database) OpenSecure';
  statusBarItem.tooltip =
    'OpenSecure: Data stored in workspace/.opensecure/data.json';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Connect status bar to storage
  storage.setStatusBarItem(statusBarItem);

  // Create the tree data provider
  const requestsProvider = new RequestsProvider();

  // Register the tree data provider
  const treeView = vscode.window.createTreeView('openSecureRequests', {
    treeDataProvider: requestsProvider,
  });

  // Start the server to listen for BURP data
  const server = createServer(3700, data => storage.addRequest(data));

  // Register refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand('openSecure.refresh', () => {
      requestsProvider.refresh();
    })
  );

  // Register view request command
  context.subscriptions.push(
    vscode.commands.registerCommand('openSecure.viewRequest', data => {
      RequestPanel.create(data);
    })
  );

  // Register command to add endpoint notes
  context.subscriptions.push(
    vscode.commands.registerCommand('openSecure.addEndpointNotes', item => {
      vscode.window
        .showInputBox({
          prompt: 'Enter notes for this endpoint',
          value:
            storage.getHosts()[item.host].endpoints[item.endpoint].notes || '',
        })
        .then(input => {
          if (input !== undefined) {
            storage.updateEndpointNotes(item.host, item.endpoint, input);
          }
        });
    })
  );

  // Register command to clear all data
  context.subscriptions.push(
    vscode.commands.registerCommand('openSecure.clearData', () => {
      vscode.window
        .showWarningMessage(
          'Are you sure you want to clear all captured data?',
          { modal: true },
          'Yes',
          'No'
        )
        .then(answer => {
          if (answer === 'Yes') {
            storage.clearData();
            requestsProvider.refresh();
            vscode.window.showInformationMessage('All data cleared');
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
    },
  });
}

/**
 * Deactivate the extension
 */
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
