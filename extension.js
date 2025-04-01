const vscode = require('vscode');
const { createServer } = require('./server');
const { initializeActivityBar } = require('./view/activityBar');
const { RequestDataProvider } = require('./view/primarySideBar');

// Store for request/response data
let requestDataStore = [];
let server;
let requestDataProvider;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('Extension "OpenSecure" activated.');

  // Initialize the data provider
  requestDataProvider = new RequestDataProvider(requestDataStore);

  // Start the Express server
  server = createServer(3700, data => {
    // Callback to receive data from server
    requestDataStore.push(data);
    // Notify the view to refresh
    requestDataProvider.refresh();
  });

  // Initialize activity bar and sidebar components
  initializeActivityBar(context, requestDataStore, requestDataProvider);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('openSecure.clearRequests', () => {
      requestDataStore = [];
      requestDataProvider.refresh();
    })
  );
}

function deactivate() {
  if (server) {
    server.close();
    console.log('Server stopped.');
  }
}

module.exports = {
  activate,
  deactivate,
};
