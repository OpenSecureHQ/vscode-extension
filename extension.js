const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('Congratulations, your extension "opensecure" is now active!');

  const disposable = vscode.commands.registerCommand(
    'opensecure.ops-test',
    function () {
      vscode.window.showInformationMessage('Hello World from opensecure!');
    }
  );

  context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
