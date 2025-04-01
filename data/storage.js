/**
 * Data storage and management for HTTP requests
 */
class DataStorage {
  constructor() {
    // Structure:
    // {
    //   hosts: {
    //     'example.com': {
    //       endpoints: {
    //         '/path': {
    //           notes: 'Endpoint notes',
    //           GET: [...requests],
    //           POST: [...requests]
    //         }
    //       }
    //     }
    //   }
    // }
    this.hosts = {};
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
      url = new URL(
        data.request.url,
        `http://${data.request.host || 'unknown-host'}`
      );
    }

    const endpoint = url.pathname;
    const method = data.request.method;
    const host = data.request.host || 'unknown-host';

    // Initialize host object if it doesn't exist
    if (!this.hosts[host]) {
      this.hosts[host] = {
        endpoints: {},
      };
    }

    // Initialize endpoint object if it doesn't exist
    if (!this.hosts[host].endpoints[endpoint]) {
      this.hosts[host].endpoints[endpoint] = {};
    }

    // Initialize method array if it doesn't exist
    if (!this.hosts[host].endpoints[endpoint][method]) {
      this.hosts[host].endpoints[endpoint][method] = [];
    }

    // Add the request data
    this.hosts[host].endpoints[endpoint][method].push({
      timestamp: new Date(),
      request: data.request,
      response: data.response,
      notes: {
        request: '',
        endpoint: this.hosts[host].endpoints[endpoint].notes || '',
      },
    });

    // Notify listeners
    this.notifyChange();
  }

  /**
   * Update notes for an endpoint
   * @param {string} host The host
   * @param {string} endpoint Path of the endpoint
   * @param {string} notes New notes content
   */
  updateEndpointNotes(host, endpoint, notes) {
    if (this.hosts[host] && this.hosts[host].endpoints[endpoint]) {
      this.hosts[host].endpoints[endpoint].notes = notes;
      this.notifyChange();
    }
  }

  /**
   * Update notes for a specific request
   * @param {string} host The host
   * @param {string} endpoint Path of the endpoint
   * @param {string} method HTTP method
   * @param {number} index Index of the request
   * @param {string} notes New notes content
   */
  updateRequestNotes(host, endpoint, method, index, notes) {
    if (
      this.hosts[host] &&
      this.hosts[host].endpoints[endpoint] &&
      this.hosts[host].endpoints[endpoint][method] &&
      this.hosts[host].endpoints[endpoint][method][index]
    ) {
      this.hosts[host].endpoints[endpoint][method][index].notes.request = notes;
    }
  }

  /**
   * Get all hosts
   * @returns {Object} The hosts data
   */
  getHosts() {
    return this.hosts;
  }
}

// Singleton instance
const storage = new DataStorage();

module.exports = storage;
