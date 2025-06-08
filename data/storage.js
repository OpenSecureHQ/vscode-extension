const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

/**
 * Manages storage of HTTP request/response data
 */
class Storage {
  constructor() {
    this.hosts = {};
    this.storagePath = null;
    this.dataFile = null;
    this.changeListeners = [];
    this.initialized = false;
    this.statusBarItem = null;
    this.configChangeDisposable = null;
  }

  /**
   * Get the storage path from configuration
   * @returns {string} The configured storage path
   */
  getStoragePath() {
    const config = vscode.workspace.getConfiguration('opensecure');
    const useWorkspaceStorage = config.get('useWorkspaceStorage', true);
    let storageLocation = config.get(
      'storageLocation',
      '${workspaceFolder}/.opensecure'
    );

    // Replace variables in the path
    if (storageLocation.includes('${workspaceFolder}')) {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error('No workspace folder available for storage');
      }
      storageLocation = storageLocation.replace(
        '${workspaceFolder}',
        workspaceFolders[0].uri.fsPath
      );
    }

    // If not using workspace storage, use the specified location
    if (!useWorkspaceStorage) {
      return storageLocation;
    }

    // For workspace storage, ensure the path is within the workspace
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folder available for storage');
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    if (
      !path.resolve(storageLocation).startsWith(path.resolve(workspacePath))
    ) {
      throw new Error('Storage location must be within the workspace folder');
    }

    return storageLocation;
  }

  /**
   * Initialize the storage system
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Get storage path from configuration
      this.storagePath = this.getStoragePath();
      this.dataFile = path.join(this.storagePath, 'data.json');

      // Check if directory and file exist
      if (fs.existsSync(this.storagePath) && fs.existsSync(this.dataFile)) {
        await this.loadData();
        this.initialized = true;
      } else {
        this.initialized = false;
      }

      // Listen for configuration changes
      this.configChangeDisposable = vscode.workspace.onDidChangeConfiguration(
        e => {
          if (e.affectsConfiguration('opensecure')) {
            this.handleConfigChange();
          }
        }
      );
    } catch (error) {
      console.error('Error checking storage:', error);
      this.initialized = false;
    }
  }

  /**
   * Handle configuration changes
   */
  async handleConfigChange() {
    const oldPath = this.storagePath;
    const oldFile = this.dataFile;

    try {
      // Get new storage path
      this.storagePath = this.getStoragePath();
      this.dataFile = path.join(this.storagePath, 'data.json');

      // If path changed, we need to reinitialize
      if (oldPath !== this.storagePath) {
        this.initialized = false;
        await this.initialize();
      }
    } catch (error) {
      console.error('Error handling config change:', error);
      // Revert to old path if new one is invalid
      this.storagePath = oldPath;
      this.dataFile = oldFile;
    }
  }

  /**
   * Create storage directory and file
   */
  async createStorage() {
    try {
      // Get storage path from configuration
      this.storagePath = this.getStoragePath();
      this.dataFile = path.join(this.storagePath, 'data.json');

      // Check if directory exists, if not create it
      if (!fs.existsSync(this.storagePath)) {
        fs.mkdirSync(this.storagePath, { recursive: true });
        console.log(`Created directory: ${this.storagePath}`);
      }

      // Create empty data file
      this.saveData();

      // Show notification that storage was initialized
      vscode.window.showInformationMessage(
        `OpenSecure storage initialized at ${this.storagePath}`
      );

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Error creating storage:', error);
      vscode.window.showErrorMessage(
        `Failed to create storage: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Load data from storage file
   */
  async loadData() {
    try {
      const data = fs.readFileSync(this.dataFile, 'utf8');
      const parsedData = JSON.parse(data);

      // Convert stored timestamps back to Date objects
      this.hosts = parsedData;

      // Convert timestamp strings back to Date objects for each request
      Object.keys(this.hosts).forEach(host => {
        const endpoints = this.hosts[host].endpoints;
        Object.keys(endpoints).forEach(endpoint => {
          Object.keys(endpoints[endpoint]).forEach(method => {
            // Skip 'notes' property
            if (method === 'notes') return;

            endpoints[endpoint][method].forEach(request => {
              if (request.timestamp) {
                request.timestamp = new Date(request.timestamp);
              }
            });
          });
        });
      });

      console.log('Data loaded from storage');
    } catch (error) {
      console.error('Error loading data:', error);
      this.hosts = {};
    }
  }

  /**
   * Save data to storage file
   */
  saveData() {
    try {
      // Store current port information if it exists in the status bar
      const currentText = this.statusBarItem ? this.statusBarItem.text : '';
      const portMatch = currentText.match(/\(Port: (\d+)\)/);
      const currentPort = portMatch ? portMatch[1] : null;

      // Update status bar if available
      if (this.statusBarItem) {
        this.statusBarItem.text = `$(database) OpenSecure $(sync~spin)${
          currentPort ? ` (Port: ${currentPort})` : ''
        }`;
        this.statusBarItem.tooltip = 'OpenSecure: Saving data...';
      }

      // Ensure directory exists
      if (!fs.existsSync(this.storagePath)) {
        fs.mkdirSync(this.storagePath);
      }

      fs.writeFileSync(
        this.dataFile,
        JSON.stringify(this.hosts, null, 2),
        'utf8'
      );
      console.log('Data saved to storage');

      // Update status bar after save
      if (this.statusBarItem) {
        setTimeout(() => {
          this.statusBarItem.text = `$(database) OpenSecure $(check)${
            currentPort ? ` (Port: ${currentPort})` : ''
          }`;
          this.statusBarItem.tooltip = `OpenSecure: Data saved to ${this.dataFile}`;

          // Revert back to normal after 2 seconds
          setTimeout(() => {
            this.statusBarItem.text = `$(database) OpenSecure${
              currentPort ? ` (Port: ${currentPort})` : ''
            }`;
            this.statusBarItem.tooltip = `OpenSecure: Data automatically saved to ${this.dataFile}`;
          }, 2000);
        }, 300);
      }
    } catch (error) {
      console.error('Error saving data:', error);

      // Update status bar to show error
      if (this.statusBarItem) {
        const currentText = this.statusBarItem.text;
        const portMatch = currentText.match(/\(Port: (\d+)\)/);
        const currentPort = portMatch ? portMatch[1] : null;

        this.statusBarItem.text = `$(database) OpenSecure $(error)${
          currentPort ? ` (Port: ${currentPort})` : ''
        }`;
        this.statusBarItem.tooltip = `OpenSecure: Error saving data: ${error.message}`;

        // Revert back to normal after 5 seconds
        setTimeout(() => {
          this.statusBarItem.text = `$(database) OpenSecure${
            currentPort ? ` (Port: ${currentPort})` : ''
          }`;
          this.statusBarItem.tooltip = `OpenSecure: Data automatically saved to ${this.dataFile}`;
        }, 5000);
      }

      vscode.window.showErrorMessage(`Failed to save data: ${error.message}`);
    }
  }

  /**
   * Get all hosts data
   * @returns {Object} Hosts data
   */
  getHosts() {
    return this.hosts;
  }

  /**
   * Add a new request to storage
   * @param {Object} data Request data to store
   */
  addRequest(data) {
    const host = data.request.host || 'unknown-host';
    const url = new URL(data.request.url, `http://${host}`);
    const endpoint = url.pathname;
    const method = data.request.method;

    // Initialize host if it doesn't exist
    if (!this.hosts[host]) {
      this.hosts[host] = { endpoints: {} };
    }

    // Initialize endpoint if it doesn't exist
    if (!this.hosts[host].endpoints[endpoint]) {
      this.hosts[host].endpoints[endpoint] = {};
    }

    // Initialize method if it doesn't exist
    if (!this.hosts[host].endpoints[endpoint][method]) {
      this.hosts[host].endpoints[endpoint][method] = [];
    }

    // Add timestamp for this request
    data.timestamp = new Date();

    // Add empty notes object
    data.notes = { content: '' };

    // Add custom name if provided
    if (data.request.body) {
      try {
        const body = JSON.parse(data.request.body);
        if (body.operationName) {
          data.customName = body.operationName;
        }
      } catch (e) {
        // Not a JSON body or no operationName, ignore
      }
    }

    // Add to storage
    this.hosts[host].endpoints[endpoint][method].push(data);

    // Save to disk
    this.saveData();

    // Notify listeners
    this.notifyListeners();
  }

  /**
   * Update notes for a request
   * @param {string} host Host name
   * @param {string} endpoint Endpoint path
   * @param {string} method HTTP method
   * @param {number} index Request index
   * @param {string} notes Notes content
   */
  updateRequestNotes(host, endpoint, method, index, notes) {
    if (
      this.hosts[host] &&
      this.hosts[host].endpoints[endpoint] &&
      this.hosts[host].endpoints[endpoint][method] &&
      this.hosts[host].endpoints[endpoint][method][index]
    ) {
      this.hosts[host].endpoints[endpoint][method][index].notes.content = notes;
      this.saveData();
      this.notifyListeners();
    }
  }

  /**
   * Add a change listener
   * @param {Function} listener Listener function
   */
  addChangeListener(listener) {
    if (typeof listener === 'function') {
      this.changeListeners.push(listener);
    }
  }

  /**
   * Notify all listeners of data change
   */
  notifyListeners() {
    this.changeListeners.forEach(listener => listener());
  }

  /**
   * Clear all stored data
   */
  clearData() {
    this.hosts = {};
    this.saveData();
    this.notifyListeners();
  }

  /**
   * Set status bar item for save indicators
   * @param {vscode.StatusBarItem} item Status bar item
   */
  setStatusBarItem(item) {
    this.statusBarItem = item;
  }

  /**
   * Add a code reference to a specific request
   * @param {string} host The host
   * @param {string} endpoint The endpoint
   * @param {string} method The HTTP method
   * @param {number} requestIndex The index of the request
   * @param {Object} codeRef The code reference object
   * @returns {Object} The updated request data
   */
  addCodeReference(host, endpoint, method, requestIndex, codeRef) {
    if (
      !this.hosts[host] ||
      !this.hosts[host].endpoints[endpoint] ||
      !this.hosts[host].endpoints[endpoint][method]
    ) {
      console.log('Error finding request in storage');
      return null;
    }

    const request = this.hosts[host].endpoints[endpoint][method][requestIndex];
    if (!request) {
      console.log('Error finding request at index');
      return null;
    }

    // Initialize codeReferences array if it doesn't exist
    if (!request.codeReferences) {
      request.codeReferences = [];
    }

    // Add the code reference
    request.codeReferences.push(codeRef);

    // Save the data to disk
    this.saveData();

    // Notify listeners
    this.notifyListeners();

    // Return the updated request
    return request;
  }

  /**
   * Remove a code reference from a request
   * @param {string} host Host name
   * @param {string} endpoint Endpoint path
   * @param {string} method HTTP method
   * @param {number} index Request index
   * @param {number} refIndex Code reference index
   */
  removeCodeReference(host, endpoint, method, index, refIndex) {
    if (
      this.hosts[host] &&
      this.hosts[host].endpoints[endpoint] &&
      this.hosts[host].endpoints[endpoint][method] &&
      this.hosts[host].endpoints[endpoint][method][index] &&
      this.hosts[host].endpoints[endpoint][method][index].codeReferences
    ) {
      // Remove the reference at the specified index
      this.hosts[host].endpoints[endpoint][method][index].codeReferences.splice(
        refIndex,
        1
      );

      // Save and notify
      this.saveData();
      this.notifyListeners();
    }
  }

  /**
   * Rename a request with a custom name
   * @param {string} host Host name
   * @param {string} endpoint Endpoint path
   * @param {string} method HTTP method
   * @param {number} index Request index
   * @param {string} newName New name for the request
   */
  renameRequest(host, endpoint, method, index, newName) {
    if (
      this.hosts[host] &&
      this.hosts[host].endpoints[endpoint] &&
      this.hosts[host].endpoints[endpoint][method] &&
      this.hosts[host].endpoints[endpoint][method][index]
    ) {
      // Set the custom name
      this.hosts[host].endpoints[endpoint][method][index].customName = newName;

      // Save the changes
      this.saveData();

      // Notify listeners
      this.notifyListeners();
    }
  }

  /**
   * Delete a specific request
   * @param {string} host Host name
   * @param {string} endpoint Endpoint path
   * @param {string} method HTTP method
   * @param {number} index Request index
   */
  deleteRequest(host, endpoint, method, index) {
    if (
      this.hosts[host] &&
      this.hosts[host].endpoints[endpoint] &&
      this.hosts[host].endpoints[endpoint][method] &&
      this.hosts[host].endpoints[endpoint][method][index]
    ) {
      // Remove the request at the specified index
      this.hosts[host].endpoints[endpoint][method].splice(index, 1);

      // If this was the last request for this method, remove the method
      if (this.hosts[host].endpoints[endpoint][method].length === 0) {
        delete this.hosts[host].endpoints[endpoint][method];
      }

      // If this was the last method for this endpoint, remove the endpoint
      if (Object.keys(this.hosts[host].endpoints[endpoint]).length === 0) {
        delete this.hosts[host].endpoints[endpoint];
      }

      // If this was the last endpoint for this host, remove the host
      if (Object.keys(this.hosts[host].endpoints).length === 0) {
        delete this.hosts[host];
      }

      // Save the changes
      this.saveData();

      // Notify listeners
      this.notifyListeners();
    }
  }
}

// Create and export a singleton instance
const storage = new Storage();

module.exports = storage;
