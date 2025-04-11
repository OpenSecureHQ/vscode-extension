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
  }

  /**
   * Initialize the storage system
   */
  async initialize() {
    if (this.initialized) return;

    // Get the workspace folder path
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      // Fallback to user home directory if no workspace is open
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      this.storagePath = path.join(homeDir, '.opensecure');
    } else {
      // Use the first workspace folder
      this.storagePath = path.join(
        workspaceFolders[0].uri.fsPath,
        '.opensecure'
      );
    }

    this.dataFile = path.join(this.storagePath, 'data.json');

    try {
      // Check if directory exists, if not create it
      if (!fs.existsSync(this.storagePath)) {
        fs.mkdirSync(this.storagePath);
        console.log(`Created directory: ${this.storagePath}`);

        // Show notification that storage was initialized
        vscode.window.showInformationMessage('OpenSecure storage initialized');
      }

      // Check if data file exists, if so load it
      if (fs.existsSync(this.dataFile)) {
        await this.loadData();
      } else {
        // Create empty data file
        this.saveData();
      }

      this.initialized = true;
    } catch (error) {
      console.error('Error initializing storage:', error);
      vscode.window.showErrorMessage(
        `Failed to initialize storage: ${error.message}`
      );
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
      // Update status bar if available
      if (this.statusBarItem) {
        this.statusBarItem.text = '$(database) OpenSecure $(sync~spin)';
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
      // Update status bar after save
      if (this.statusBarItem) {
        setTimeout(() => {
          this.statusBarItem.text = '$(database) OpenSecure $(check)';
          this.statusBarItem.tooltip = `OpenSecure: Data saved to ${this.dataFile}`;

          // Revert back to normal after 2 seconds
          setTimeout(() => {
            this.statusBarItem.text = '$(database) OpenSecure';
            this.statusBarItem.tooltip = `OpenSecure: Data automatically saved to ${this.dataFile}`;
          }, 2000);
        }, 300);
      }
    } catch (error) {
      console.error('Error saving data:', error);

      // Update status bar to show error
      if (this.statusBarItem) {
        this.statusBarItem.text = '$(database) OpenSecure $(error)';
        this.statusBarItem.tooltip = `OpenSecure: Error saving data: ${error.message}`;

        // Revert back to normal after 5 seconds
        setTimeout(() => {
          this.statusBarItem.text = '$(database) OpenSecure';
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
   * Add a new request
   * @param {Object} data Request/response data
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
      this.hosts[host].endpoints[endpoint] = { notes: '' };
    }

    // Initialize method if it doesn't exist
    if (!this.hosts[host].endpoints[endpoint][method]) {
      this.hosts[host].endpoints[endpoint][method] = [];
    }

    // Add timestamp for this request
    data.timestamp = new Date();

    // Add empty notes object
    data.notes = { request: '' };

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
      this.hosts[host].endpoints[endpoint][method][index].notes.request = notes;
      this.saveData();
      this.notifyListeners();
    }
  }

  /**
   * Update notes for an endpoint
   * @param {string} host Host name
   * @param {string} endpoint Endpoint path
   * @param {string} notes Notes content
   */
  updateEndpointNotes(host, endpoint, notes) {
    if (this.hosts[host] && this.hosts[host].endpoints[endpoint]) {
      this.hosts[host].endpoints[endpoint].notes = notes;
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

  // Add this method to the Storage class in storage.js:

  /**
   * Add a code reference to a request
   * @param {string} host Host name
   * @param {string} endpoint Endpoint path
   * @param {string} method HTTP method
   * @param {number} index Request index
   * @param {Object} codeRef Code reference {filePath, startLine, endLine, text}
   */
  addCodeReference(host, endpoint, method, index, codeRef) {
    if (
      this.hosts[host] &&
      this.hosts[host].endpoints[endpoint] &&
      this.hosts[host].endpoints[endpoint][method] &&
      this.hosts[host].endpoints[endpoint][method][index]
    ) {
      // Initialize code references array if it doesn't exist
      if (!this.hosts[host].endpoints[endpoint][method][index].codeReferences) {
        this.hosts[host].endpoints[endpoint][method][index].codeReferences = [];
      }

      // Add the code reference
      this.hosts[host].endpoints[endpoint][method][index].codeReferences.push(
        codeRef
      );

      // Save and notify
      this.saveData();
      this.notifyListeners();
    }
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
}

// Create and export a singleton instance
const storage = new Storage();

module.exports = storage;
