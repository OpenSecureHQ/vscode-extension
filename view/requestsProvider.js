const vscode = require('vscode');
const { EndpointItem, MethodItem, RequestItem } = require('./treeItems');
const storage = require('../data/storage');

/**
 * Tree data provider for HTTP requests
 */
class RequestsProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;

    // Listen for data changes
    storage.addChangeListener(() => this.refresh());
  }

  /**
   * Refresh the tree view
   */
  refresh() {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get the tree item for an element
   * @param {Object} element The element to get
   * @returns {vscode.TreeItem} The tree item
   */
  getTreeItem(element) {
    return element;
  }

  /**
   * Get the children of an element
   * @param {Object} element The element to get children for
   * @returns {Array} The child elements
   */
  getChildren(element) {
    const endpoints = storage.getEndpoints();

    if (!element) {
      // Root elements are endpoints
      return Object.keys(endpoints).map(
        endpoint => new EndpointItem(endpoint, endpoints[endpoint])
      );
    } else if (element instanceof EndpointItem) {
      // Method-level items
      const methodKeys = Object.keys(element.data).filter(
        key => key !== 'notes'
      );
      return methodKeys.map(
        method => new MethodItem(method, element.endpoint, element.data[method])
      );
    } else if (element instanceof MethodItem) {
      // Request-level items
      return element.requests.map(
        (req, index) =>
          new RequestItem(`${req.timestamp.toLocaleTimeString()}`, req)
      );
    }
    return [];
  }
}

module.exports = RequestsProvider;
