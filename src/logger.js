const config = require('./config');

class Logger {
  httpLogger = (req, res, next) => {
    let send = res.send;
    res.send = (resBody) => {
      const logData = {
        authorized: !!req.headers.authorization,
        path: req.originalUrl,
        method: req.method,
        statusCode: res.statusCode,
        ip: req.ip || req.headers['x-forwarded-for'],
        reqBody: JSON.stringify(req.body),
        resBody: typeof resBody === 'string' ? resBody : JSON.stringify(resBody),
      };
      const level = this.statusToLogLevel(res.statusCode);
      this.log(level, 'http', logData);
      res.send = send;
      return res.send(resBody);
    };
    next();
  };

  dbLogger(query) {
    this.log('info', 'db', { query });
  }

  factoryLogger(requestBody, responseBody) {
    this.log('info', 'factory', { requestBody, responseBody });
  }

  exceptionLogger(err) {
    this.log('error', 'exception', { message: err.message, stack: err.stack });
  }

  log(level, type, logData) {
    const labels = { component: config.logging.source, level, type };
    const values = [this.nowString(), this.sanitize(logData)];
    const logEvent = { streams: [{ stream: labels, values: [values] }] };
    this.sendLogToGrafana(logEvent);
  }

  statusToLogLevel(statusCode) {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
  }

  nowString() {
    return (Math.floor(Date.now()) * 1000000).toString();
  }

  sanitize(logData) {
    logData = JSON.stringify(logData);
    return logData.replace(/\\"password\\":\s*\\"[^"]*\\"/g, '\\"password\\": \\"*****\\"');
  }

  sendLogToGrafana(event) {
    const body = JSON.stringify(event);
    fetch(config.logging.endpointUrl, {
      method: 'post',
      body,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.logging.accountId}:${config.logging.apiKey}`,
      },
    }).then((res) => {
      if (!res.ok) console.log('Failed to send log to Grafana');
    });
  }
}

module.exports = new Logger();