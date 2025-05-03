const vscode = require('vscode');
const path = require('path');
const RequestCodeFinder = require('./requestCodeFinder');

class RequestCodeCommands {
  constructor() {
    this.codeFinder = new RequestCodeFinder();
  }

  /**
   * Register all request code related commands
   * @param {vscode.ExtensionContext} context
   */
  registerCommands(context) {
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'openSecure.findRequestCode',
        async requestItem => {
          if (!requestItem || !requestItem.data) {
            vscode.window.showWarningMessage('Please select a request first');
            return;
          }

          try {
            // Get request data from the item
            const requestData = requestItem.data.request;

            // Find code locations
            const locations = await this.codeFinder.findRequestHandler(
              requestData
            );

            if (locations.length === 0) {
              vscode.window.showInformationMessage(
                'No matching code found for this request'
              );
              return;
            }

            if (locations.length === 1) {
              // If only one location found, navigate directly
              await this.navigateToLocation(locations[0]);
            } else {
              // If multiple locations found, show quick pick
              const items = locations.map(loc => ({
                label: path.basename(loc.file),
                description: `Line ${loc.line + 1}: ${loc.text}`,
                location: loc,
              }));

              const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a location to navigate to',
              });

              if (selected) {
                await this.navigateToLocation(selected.location);
              }
            }
          } catch (error) {
            vscode.window.showErrorMessage(
              `Error finding code: ${error.message}`
            );
          }
        }
      )
    );
  }

  async navigateToLocation(location) {
    const document = await vscode.workspace.openTextDocument(location.file);
    const editor = await vscode.window.showTextDocument(document);

    // Select the line
    const position = new vscode.Position(location.line, 0);
    editor.selection = new vscode.Selection(position, position);

    // Reveal the line
    editor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenter
    );
  }
}

module.exports = RequestCodeCommands;
