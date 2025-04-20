# OpenSecure `opensecure-req-code-reference` README

This is a experimental project, purely vibe coded (not at all security reviewed, IT has some really serious flaws)

## Features

The idea of the app, is to save request and responses from the BURP suite, and save it in a displayable format.

## Configuration

OpenSecure can be configured through VS Code settings or using the UI:

### Using the UI

1. Click the "Choose Storage Location" button in the OpenSecure view
2. Select the folder where you want to store the data
3. The extension will automatically update the configuration and use the new location

### Using Settings

1. Open VS Code Settings (File > Preferences > Settings or Ctrl+,)
2. Search for "OpenSecure"
3. Configure the following settings:

- `opensecure.storageLocation`: Location where OpenSecure will store its data
  - Default: `${workspaceFolder}/.opensecure`
  - Can use variables like `${workspaceFolder}`
  - Can be an absolute path
- `opensecure.useWorkspaceStorage`: Whether to store data in workspace folder
  - Default: true
  - If false, uses the location specified in `storageLocation`

Example configurations:

```json
{
  "opensecure.storageLocation": "${workspaceFolder}/.opensecure", // Store in workspace
  "opensecure.useWorkspaceStorage": true // Enforce workspace storage
}
```

or

```json
{
  "opensecure.storageLocation": "/path/to/custom/location", // Custom location
  "opensecure.useWorkspaceStorage": false // Use custom location
}
```

## Installation

### Prerequisites

- Node.js (version 16 or higher)
- npm (comes with Node.js)
- Visual Studio Code (version 1.96.0 or higher)

### Building the Extension

1. Clone the repository:

```bash
git clone <repository-url>
cd vscode-opensecure
```

2. Install dependencies:

```bash
npm install
```

3. Package the extension:

```bash
npm run package
```

This will create a `.vsix` file in the root directory.
