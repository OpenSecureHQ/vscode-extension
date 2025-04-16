# OpenSecure `opensecure-req-code-reference` README

This is a experimental project, purely vibe coded (not at all security reviewed, IT has some really serious flaws)

## Features

The idea of the app, is to save request and responses from the BURP suite, and save it in a displayable format.

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
