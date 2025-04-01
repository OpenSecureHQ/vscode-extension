const vscode = require('vscode');
const { getWebviewContent } = require('./webViewUtils');

/**
 * Initialize the activity bar and related components
 * @param {vscode.ExtensionContext} context
 * @param {Array} requestDataStore
 * @param {Object} requestDataProvider
 */
function initializeActivityBar(context, requestDataStore, requestDataProvider) {
  // Register the tree data provider for the view
  const treeView = vscode.window.createTreeView('openSecureDataView', {
    treeDataProvider: requestDataProvider,
    showCollapseAll: true,
  });

  // Register a command to view request details
  context.subscriptions.push(
    vscode.commands.registerCommand('openSecure.viewRequest', item => {
      const panel = vscode.window.createWebviewPanel(
        'requestDetails',
        'Request Details',
        vscode.ViewColumn.One,
        { enableScripts: true }
      );

      panel.webview.html = getWebviewContent(item);
    })
  );

  // Add the tree view to subscriptions
  context.subscriptions.push(treeView);
}

module.exports = {
  initializeActivityBar,
};
