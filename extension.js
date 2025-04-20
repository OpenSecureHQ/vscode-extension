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

  // Update status bar based on storage state
  if (storage.initialized) {
    statusBarItem.text = '$(database) OpenSecure';
    statusBarItem.tooltip =
      'OpenSecure: Data stored in workspace/.opensecure/data.json';
  } else {
    statusBarItem.text = '$(database) OpenSecure $(warning)';
    statusBarItem.tooltip =
      'OpenSecure: Storage not initialized. Click to create storage.';
    statusBarItem.command = 'openSecure.createStorage';
  }
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

  // Register choose storage location command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'openSecure.chooseStorageLocation',
      async () => {
        try {
          // Get workspace folder for default path
          const workspaceFolders = vscode.workspace.workspaceFolders;
          const defaultUri =
            workspaceFolders && workspaceFolders.length > 0
              ? vscode.Uri.file(workspaceFolders[0].uri.fsPath)
              : undefined;

          // Show open dialog to choose directory
          const selectedUri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Storage Location',
            defaultUri: defaultUri,
          });

          if (selectedUri && selectedUri[0]) {
            const selectedPath = selectedUri[0].fsPath;

            // Get current configuration
            const config = vscode.workspace.getConfiguration('opensecure');

            // Update configuration
            await config.update(
              'storageLocation',
              selectedPath,
              vscode.ConfigurationTarget.Workspace
            );
            await config.update(
              'useWorkspaceStorage',
              false,
              vscode.ConfigurationTarget.Workspace
            );

            // Show success message
            vscode.window.showInformationMessage(
              `Storage location set to: ${selectedPath}`
            );

            // Reinitialize storage with new location
            await storage.initialize();

            // Update status bar
            if (storage.initialized) {
              statusBarItem.text = '$(database) OpenSecure';
              statusBarItem.tooltip = `OpenSecure: Data stored in ${selectedPath}`;
              statusBarItem.command = undefined;
            }
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to set storage location: ${error.message}`
          );
        }
      }
    )
  );

  // Start the server to listen for BURP data
  const server = createServer(3700, data => {
    if (storage.initialized) {
      storage.addRequest(data);
    } else {
      vscode.window
        .showWarningMessage(
          'OpenSecure storage not initialized. Please create storage first.',
          'Create Storage'
        )
        .then(selection => {
          if (selection === 'Create Storage') {
            vscode.commands.executeCommand('openSecure.createStorage');
          }
        });
    }
  });

  // Register create storage command
  context.subscriptions.push(
    vscode.commands.registerCommand('openSecure.createStorage', async () => {
      const success = await storage.createStorage();
      if (success) {
        statusBarItem.text = '$(database) OpenSecure';
        statusBarItem.tooltip =
          'OpenSecure: Data stored in workspace/.opensecure/data.json';
        statusBarItem.command = undefined;
        requestsProvider.refresh();
      }
    })
  );

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

  // Register command to add code reference to a request
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

        // Calculate a checksum of the selected code for future validation
        const checksum = calculateChecksum(editor.document.getText(selection));

        // Try to get Git information if possible
        let gitInfo = null;
        try {
          // Check if the Git extension is available
          const gitExtension =
            vscode.extensions.getExtension('vscode.git')?.exports;
          if (gitExtension) {
            const api = gitExtension.getAPI(1);

            // Try to find the repository for this file
            const repository = api.repositories.find(repo =>
              editor.document.uri.fsPath.startsWith(repo.rootUri.fsPath)
            );

            if (repository && repository.state && repository.state.HEAD) {
              gitInfo = {
                branch: repository.state.HEAD.name || 'unknown',
                commitHash: repository.state.HEAD.commit || 'unknown',
                repositoryRoot: repository.rootUri.fsPath,
              };
            }
          }
        } catch (error) {
          console.log('Could not get Git information:', error);
          // Continue without Git info
        }

        // Create code reference
        const codeRef = {
          filePath: filePath,
          startLine: selection.start.line,
          endLine: selection.end.line,
          text: editor.document.getText(selection),
          createdAt: new Date().toISOString(),
          checksum: checksum,
          isValid: true,
          gitInfo: gitInfo,
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

        // Get the updated data from storage
        const updatedData =
          hosts[host].endpoints[endpoint][method][requestIndex];

        // Update any open panels for this request
        const RequestPanel = require('./view/requestsPanel');
        RequestPanel.updatePanel(
          host,
          endpoint,
          method,
          requestIndex,
          updatedData
        );

        // Show appropriate message
        if (gitInfo) {
          vscode.window.showInformationMessage(
            `Code reference added to ${method} ${endpoint} from commit ${gitInfo.commitHash.substring(
              0,
              7
            )}`
          );
        } else {
          vscode.window.showInformationMessage(
            `Code reference added to ${method} ${endpoint}`
          );
        }
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

          // Check if file exists
          try {
            await vscode.workspace.fs.stat(vscode.Uri.file(fullPath));
          } catch (error) {
            // File doesn't exist anymore
            vscode.window.showWarningMessage(
              `The file "${codeRef.filePath}" no longer exists.`
            );
            return;
          }

          // Open document
          const document = await vscode.workspace.openTextDocument(fullPath);
          const editor = await vscode.window.showTextDocument(document);

          // Check if line range is still valid
          if (
            codeRef.startLine >= document.lineCount ||
            codeRef.endLine >= document.lineCount
          ) {
            vscode.window.showWarningMessage(
              'The referenced code lines no longer exist in the file.'
            );

            // Mark as invalid
            codeRef.isValid = false;
            return;
          }

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

          // Validate if the code still matches
          const currentText = document.getText(
            new vscode.Range(startPos, endPos)
          );
          const currentChecksum = calculateChecksum(currentText);

          if (currentChecksum !== codeRef.checksum) {
            // Code has changed
            vscode.window.showWarningMessage(
              '⚠️ Warning: The code at this location has changed since it was referenced.'
            );
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Error opening file: ${error.message}`
          );
        }
      }
    )
  );

  // Register command to validate code reference
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'openSecure.validateCodeReference',
      async (host, endpoint, method, requestIndex, refIndex, codeRef) => {
        try {
          // Check if path is relative and resolve against workspace
          let fullPath = codeRef.filePath;
          if (!path.isAbsolute(fullPath)) {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
              fullPath = path.join(workspaceFolders[0].uri.fsPath, fullPath);
            }
          }

          // Check if file exists
          try {
            await vscode.workspace.fs.stat(vscode.Uri.file(fullPath));
          } catch (error) {
            // File doesn't exist
            markReferenceAsInvalid(
              host,
              endpoint,
              method,
              requestIndex,
              refIndex,
              'File no longer exists'
            );
            return;
          }

          // Open document to check content
          const document = await vscode.workspace.openTextDocument(fullPath);

          // Check if line range is still valid
          if (
            codeRef.startLine >= document.lineCount ||
            codeRef.endLine >= document.lineCount
          ) {
            markReferenceAsInvalid(
              host,
              endpoint,
              method,
              requestIndex,
              refIndex,
              'Referenced lines no longer exist'
            );
            return;
          }

          // Get the current text at those line positions
          const startPos = new vscode.Position(codeRef.startLine, 0);
          const endPos = new vscode.Position(
            codeRef.endLine,
            document.lineAt(codeRef.endLine).text.length
          );
          const currentText = document.getText(
            new vscode.Range(startPos, endPos)
          );

          // Calculate checksum
          const currentChecksum = calculateChecksum(currentText);

          // Compare with stored checksum
          if (currentChecksum !== codeRef.checksum) {
            // Code has changed
            markReferenceAsInvalid(
              host,
              endpoint,
              method,
              requestIndex,
              refIndex,
              'Code has been modified'
            );
            return;
          }

          // If we get here, the reference is still valid
          markReferenceAsValid(host, endpoint, method, requestIndex, refIndex);
          vscode.window.showInformationMessage(
            'Code reference is valid and up-to-date'
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Error validating code reference: ${error.message}`
          );
        }
      }
    )
  );

  /**
   * Calculate a simple checksum for a string
   * @param {string} text The text to checksum
   * @returns {string} A hex string checksum
   */
  function calculateChecksum(text) {
    let hash = 0;
    if (text.length === 0) return hash.toString(16);

    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return hash.toString(16);
  }

  /**
   * Mark a code reference as invalid
   * @param {string} host The host
   * @param {string} endpoint The endpoint
   * @param {string} method The HTTP method
   * @param {number} requestIndex The request index
   * @param {number} refIndex The code reference index
   * @param {string} reason The reason why it's invalid
   */
  function markReferenceAsInvalid(
    host,
    endpoint,
    method,
    requestIndex,
    refIndex,
    reason
  ) {
    const hosts = storage.getHosts();
    if (
      !hosts[host] ||
      !hosts[host].endpoints[endpoint] ||
      !hosts[host].endpoints[endpoint][method] ||
      !hosts[host].endpoints[endpoint][method][requestIndex] ||
      !hosts[host].endpoints[endpoint][method][requestIndex].codeReferences ||
      !hosts[host].endpoints[endpoint][method][requestIndex].codeReferences[
        refIndex
      ]
    ) {
      vscode.window.showErrorMessage('Error finding code reference in storage');
      return;
    }

    // Mark as invalid
    const codeRef =
      hosts[host].endpoints[endpoint][method][requestIndex].codeReferences[
        refIndex
      ];
    codeRef.isValid = false;
    codeRef.invalidReason = reason;
    codeRef.validatedAt = new Date().toISOString();

    // Save changes
    storage.saveData();

    // Update any open panels
    const updatedData = hosts[host].endpoints[endpoint][method][requestIndex];
    const RequestPanel = require('./view/requestsPanel');
    RequestPanel.updatePanel(host, endpoint, method, requestIndex, updatedData);

    vscode.window.showWarningMessage(`Code reference is invalid: ${reason}`);
  }

  /**
   * Mark a code reference as valid
   * @param {string} host The host
   * @param {string} endpoint The endpoint
   * @param {string} method The HTTP method
   * @param {number} requestIndex The request index
   * @param {number} refIndex The code reference index
   */
  function markReferenceAsValid(
    host,
    endpoint,
    method,
    requestIndex,
    refIndex
  ) {
    const hosts = storage.getHosts();
    if (
      !hosts[host] ||
      !hosts[host].endpoints[endpoint] ||
      !hosts[host].endpoints[endpoint][method] ||
      !hosts[host].endpoints[endpoint][method][requestIndex] ||
      !hosts[host].endpoints[endpoint][method][requestIndex].codeReferences ||
      !hosts[host].endpoints[endpoint][method][requestIndex].codeReferences[
        refIndex
      ]
    ) {
      vscode.window.showErrorMessage('Error finding code reference in storage');
      return;
    }

    // Mark as valid
    const codeRef =
      hosts[host].endpoints[endpoint][method][requestIndex].codeReferences[
        refIndex
      ];
    codeRef.isValid = true;
    codeRef.invalidReason = null;
    codeRef.validatedAt = new Date().toISOString();

    // Save changes
    storage.saveData();

    // Update any open panels
    const updatedData = hosts[host].endpoints[endpoint][method][requestIndex];
    const RequestPanel = require('./view/requestsPanel');
    RequestPanel.updatePanel(host, endpoint, method, requestIndex, updatedData);
  }
}

/**
 * Deactivate the extension
 */
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
