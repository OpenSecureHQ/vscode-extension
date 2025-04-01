const { HTTPParser } = require('http-parser-js');

/**
 * Parser Output Format:
 * {
 *   request: {
 *     raw: 'Full raw HTTP request string',
 *     method: 'GET',
 *     url: '/path',
 *     host: 'example.com',  // New field
 *     version: '1.1',
 *     headers: {
 *       'host': 'example.com',
 *       'content-type': 'application/json',
 *       // ... other headers in lowercase
 *     },
 *     body: 'Request body content'
 *   },
 *   response: {
 *     raw: 'Full raw HTTP response string',
 *     statusCode: 200,
 *     statusMessage: 'OK',
 *     version: '1.1',
 *     headers: {
 *       'content-type': 'application/json',
 *       'server': 'nginx',
 *       // ... other headers in lowercase
 *     },
 *     body: 'Response body content'
 *   } // null if no response
 * }
 */

// Map HTTP method codes to their string representations
const HTTP_METHODS = {
  0: 'DELETE',
  1: 'GET',
  2: 'HEAD',
  3: 'POST',
  4: 'PUT',
  5: 'CONNECT',
  6: 'OPTIONS',
  7: 'TRACE',
  8: 'COPY',
  9: 'LOCK',
  10: 'MKCOL',
  11: 'MOVE',
  12: 'PROPFIND',
  13: 'PROPPATCH',
  14: 'SEARCH',
  15: 'UNLOCK',
  16: 'BIND',
  17: 'REBIND',
  18: 'UNBIND',
  19: 'ACL',
  20: 'REPORT',
  21: 'MKACTIVITY',
  22: 'CHECKOUT',
  23: 'MERGE',
  24: 'M-SEARCH',
  25: 'NOTIFY',
  26: 'SUBSCRIBE',
  27: 'UNSUBSCRIBE',
  28: 'PATCH',
  29: 'PURGE',
  30: 'MKCALENDAR',
  31: 'LINK',
  32: 'UNLINK',
};

function parseHttpMessage(rawMessage, isResponse = false) {
  const parser = new HTTPParser(
    isResponse ? HTTPParser.RESPONSE : HTTPParser.REQUEST
  );
  const parsed = { headers: {}, raw: rawMessage };

  return new Promise(resolve => {
    parser[HTTPParser.kOnHeadersComplete] = info => {
      parsed.version = `${info.versionMajor}.${info.versionMinor}`;
      parsed.headers = Object.fromEntries(
        Array.from({ length: info.headers.length / 2 }, (_, i) => [
          info.headers[i * 2].toLowerCase(),
          info.headers[i * 2 + 1],
        ])
      );

      if (isResponse) {
        parsed.statusCode = info.statusCode;
        parsed.statusMessage = info.statusMessage;
      } else {
        // Convert method code to string
        parsed.method = HTTP_METHODS[info.method] || `UNKNOWN(${info.method})`;
        parsed.url = info.url;

        // Extract host from headers
        parsed.host = parsed.headers.host || '';
      }
    };

    parser[HTTPParser.kOnBody] = (chunk, offset, length) => {
      parsed.body = chunk.toString('utf8', offset, offset + length);
    };

    parser[HTTPParser.kOnMessageComplete] = () => resolve(parsed);

    parser.execute(Buffer.from(rawMessage));
    parser.finish();
  });
}

module.exports = {
  async parseRequestResponse(payload) {
    const { request, response } = JSON.parse(payload);
    return {
      request: await parseHttpMessage(request.raw),
      response: response ? await parseHttpMessage(response, true) : null,
    };
  },
};
