/**
 * Data storage and management for HTTP requests
 */
class DataStorage {
  constructor() {
    this.endpoints = {};
    this.listeners = [];
  }

  /**
   * Add a change listener
   * @param {Function} listener Function to call when data changes
   */
  addChangeListener(listener) {
    this.listeners.push(listener);
  }

  /**
   * Remove a change listener
   * @param {Function} listener Function to remove
   */
  removeChangeListener(listener) {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  /**
   * Notify all listeners of data change
   */
  notifyChange() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * Process and store a new request/response
   * @param {Object} data Parsed request/response data
   */
  addRequest(data) {
    // Extract endpoint from URL
    let url;
    try {
      url = new URL(data.request.url);
    } catch (e) {
      // Handle relative URLs
      url = new URL(data.request.url, 'http://example.com');
    }

    const endpoint = url.pathname;
    const method = data.request.method;

    // Initialize endpoint object if it doesn't exist
    if (!this.endpoints[endpoint]) {
      this.endpoints[endpoint] = {};
    }

    // Initialize method array if it doesn't exist
    if (!this.endpoints[endpoint][method]) {
      this.endpoints[endpoint][method] = [];
    }

    // Add the request data
    this.endpoints[endpoint][method].push({
      timestamp: new Date(),
      request: data.request,
      response: data.response,
      notes: {
        request: '',
        endpoint: this.endpoints[endpoint].notes || '',
      },
    });

    // Notify listeners
    this.notifyChange();
  }

  /**
   * Update notes for an endpoint
   * @param {string} endpoint Path of the endpoint
   * @param {string} notes New notes content
   */
  updateEndpointNotes(endpoint, notes) {
    if (this.endpoints[endpoint]) {
      this.endpoints[endpoint].notes = notes;
      this.notifyChange();
    }
  }

  /**
   * Update notes for a specific request
   * @param {string} endpoint Path of the endpoint
   * @param {string} method HTTP method
   * @param {number} index Index of the request
   * @param {string} notes New notes content
   */
  updateRequestNotes(endpoint, method, index, notes) {
    if (
      this.endpoints[endpoint] &&
      this.endpoints[endpoint][method] &&
      this.endpoints[endpoint][method][index]
    ) {
      this.endpoints[endpoint][method][index].notes.request = notes;
    }
  }

  /**
   * Get all endpoints
   * @returns {Object} The endpoints data
   */
  getEndpoints() {
    return this.endpoints;
  }
}

// Singleton instance
const storage = new DataStorage();

module.exports = storage;
