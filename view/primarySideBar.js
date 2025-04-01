const vscode = require('vscode');

/**
 * Tree data provider for the sidebar
 */
class RequestDataProvider {
  constructor(requestDataStore) {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.requestDataStore = requestDataStore;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (!element) {
      // Root level - return request items
      return this.requestDataStore.map((data, index) => {
        const method = data.request.method || 'UNKNOWN';
        const url = data.request.url || 'No URL';
        const status = data.response ? data.response.statusCode : 'No Response';

        return new RequestItem(
          `${method} ${url} (${status})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          index,
          data
        );
      });
    } else if (element instanceof RequestItem) {
      // Request level - return request details and response
      const data = this.requestDataStore[element.index];
      return [
        new DetailItem(
          'Request Headers',
          JSON.stringify(data.request.headers, null, 2)
        ),
        new DetailItem('Request Body', data.request.body || 'No Body'),
        new DetailItem(
          'Response Headers',
          JSON.stringify(data.response.headers, null, 2)
        ),
        new DetailItem('Response Body', data.response.body || 'No Body'),
      ];
    }
    return [];
  }
}

/**
 * Tree item for a request
 */
class RequestItem extends vscode.TreeItem {
  constructor(label, collapsibleState, index, data) {
    super(label, collapsibleState);
    this.index = index;
    this.data = data;
    this.tooltip = `${data.request.method} ${data.request.url}`;
    this.description = new Date().toLocaleTimeString();
    this.command = {
      command: 'openSecure.viewRequest',
      title: 'View Request Details',
      arguments: [data],
    };
    this.iconPath = new vscode.ThemeIcon('globe');
    this.contextValue = 'request';
  }
}

/**
 * Tree item for request/response details
 */
class DetailItem extends vscode.TreeItem {
  constructor(label, value) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = value;
    this.description =
      value.length > 50 ? value.substring(0, 50) + '...' : value;
  }
}

module.exports = {
  RequestDataProvider,
  RequestItem,
  DetailItem,
};
