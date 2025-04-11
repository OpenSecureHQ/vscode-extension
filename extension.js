const vscode = require('vscode');
const { createServer } = require('./server');
const RequestsProvider = require('./view/requestsProvider');
const RequestPanel = require('./view/requestsPanel');
const storage = require('./data/storage');
const path = require('path');

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

  // Add these commands to the activate function in extension.js:

  // Register command to add code reference to a request
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'openSecure.addCodeReference',
      async requestItem => {
        // Get active editor
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage(
            'No active editor. Please open a file and select code first.'
          );
          return;
        }

        // Get selected text
        const selection = editor.selection;
        if (selection.isEmpty) {
          vscode.window.showWarningMessage('Please select code to reference.');
          return;
        }

        // Get file path, relative to workspace if possible
        let filePath = editor.document.uri.fsPath;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          const workspaceFolder = workspaceFolders[0].uri.fsPath;
          if (filePath.startsWith(workspaceFolder)) {
            filePath = filePath.substring(workspaceFolder.length);
            if (filePath.startsWith('/') || filePath.startsWith('\\')) {
              filePath = filePath.substring(1);
            }
          }
        }

        // Create code reference
        const codeRef = {
          filePath: filePath,
          startLine: selection.start.line,
          endLine: selection.end.line,
          text: editor.document.getText(selection),
        };

        // Add to storage
        const host = requestItem.data.request.host || 'unknown-host';
        const url = new URL(requestItem.data.request.url, `http://${host}`);
        const endpoint = url.pathname;
        const method = requestItem.data.request.method;

        // Find index in storage
        const hosts = storage.getHosts();
        if (
          !hosts[host] ||
          !hosts[host].endpoints[endpoint] ||
          !hosts[host].endpoints[endpoint][method]
        ) {
          vscode.window.showErrorMessage('Error finding request in storage');
          return;
        }

        const requestIndex = hosts[host].endpoints[endpoint][method].findIndex(
          req =>
            req.timestamp.getTime() === requestItem.data.timestamp.getTime()
        );

        if (requestIndex === -1) {
          vscode.window.showErrorMessage('Error finding request in storage');
          return;
        }

        storage.addCodeReference(host, endpoint, method, requestIndex, codeRef);
        vscode.window.showInformationMessage(
          `Code reference added to ${method} ${endpoint}`
        );
      }
    )
  );

  // Register command to navigate to code reference
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'openSecure.navigateToCodeReference',
      async codeRef => {
        try {
          // Check if path is relative and resolve against workspace
          let fullPath = codeRef.filePath;
          if (!path.isAbsolute(fullPath)) {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
              fullPath = path.join(workspaceFolders[0].uri.fsPath, fullPath);
            }
          }

          // Open document
          const document = await vscode.workspace.openTextDocument(fullPath);
          const editor = await vscode.window.showTextDocument(document);

          // Select the referenced range
          const startPos = new vscode.Position(codeRef.startLine, 0);
          const endPos = new vscode.Position(
            codeRef.endLine,
            document.lineAt(codeRef.endLine).text.length
          );
          editor.selection = new vscode.Selection(startPos, endPos);

          // Scroll to selection
          editor.revealRange(
            new vscode.Range(startPos, endPos),
            vscode.TextEditorRevealType.InCenter
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Error opening file: ${error.message}`
          );
        }
      }
    )
  );
}

/**
 * Deactivate the extension
 */
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
