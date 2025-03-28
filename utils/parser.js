const { HTTPParser } = require('http-parser-js');

/**
 * Parser Output Format:
 * {
 *   request: {
 *     raw: 'Full raw HTTP request string',
 *     method: 'GET/POST/etc',
 *     url: 'http://example.com/path',
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
        parsed.method = info.method;
        parsed.url = info.url;
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
