const vscode = require('vscode');

/**
 * Tree item representing a host
 */
class HostItem extends vscode.TreeItem {
  constructor(host, data) {
    super(host, vscode.TreeItemCollapsibleState.Collapsed);
    this.host = host;
    this.data = data;
    this.contextValue = 'host';
    this.iconPath = new vscode.ThemeIcon('globe');
  }
}

/**
 * Tree item representing an API endpoint
 */
class EndpointItem extends vscode.TreeItem {
  constructor(endpoint, host, data) {
    super(endpoint, vscode.TreeItemCollapsibleState.Collapsed);
    this.endpoint = endpoint;
    this.host = host;
    this.data = data;
    this.contextValue = 'endpoint';
    this.iconPath = new vscode.ThemeIcon('symbol-module');

    // Add description to show the notes summary if it exists
    if (data.notes) {
      this.description =
        data.notes.length > 20
          ? data.notes.substring(0, 20) + '...'
          : data.notes;
    }

    // Add tooltip with full notes if they exist
    if (data.notes) {
      this.tooltip = data.notes;
    }
  }
}

/**
 * Tree item representing an HTTP method
 */
class MethodItem extends vscode.TreeItem {
  constructor(method, host, endpoint, requests) {
    super(method, vscode.TreeItemCollapsibleState.Collapsed);
    this.method = method;
    this.host = host;
    this.endpoint = endpoint;
    this.requests = requests;
    this.contextValue = 'method';
    this.iconPath = new vscode.ThemeIcon('symbol-method');
    this.description = `(${requests.length})`;
  }
}

/**
 * Tree item representing an HTTP request
 */
class RequestItem extends vscode.TreeItem {
  constructor(label, data, index) {
    // Use custom name if available, otherwise use timestamp
    const displayLabel = data.customName || data.timestamp.toLocaleTimeString();
    super(displayLabel, vscode.TreeItemCollapsibleState.None);
    this.data = data;
    this.index = index;
    this.contextValue = 'request';
    this.tooltip = `${data.request.method} ${data.request.url}`;

    // Get status code for the description
    if (data.response && data.response.statusCode) {
      this.description = `${data.response.statusCode}`;

      // Use different icons based on status code
      if (data.response.statusCode >= 200 && data.response.statusCode < 300) {
        this.iconPath = new vscode.ThemeIcon('pass');
      } else if (data.response.statusCode >= 400) {
        this.iconPath = new vscode.ThemeIcon('error');
      } else if (data.response.statusCode >= 300) {
        this.iconPath = new vscode.ThemeIcon('warning');
      }
    } else {
      this.iconPath = new vscode.ThemeIcon('globe');
    }

    this.command = {
      command: 'openSecure.viewRequest',
      title: 'View Request',
      arguments: [data],
    };
  }
}

module.exports = {
  HostItem,
  EndpointItem,
  MethodItem,
  RequestItem,
};
