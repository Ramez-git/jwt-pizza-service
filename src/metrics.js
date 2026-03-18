const os = require('os');
const config = require('./config');

const requests = { total: 0, get: 0, post: 0, put: 0, delete: 0 };
const auth = { success: 0, fail: 0 };
const pizzas = { sold: 0, failed: 0, revenue: 0 };
const latency = { service: 0, pizza: 0 };
let activeUsers = 0;


function requestTracker(req, res, next) {
  const start = Date.now();
  const method = req.method.toLowerCase();

  requests.total++;
  if (requests[method] !== undefined) requests[method]++;

  res.on('finish', () => {
    latency.service = Date.now() - start;
  });

  next();
}


function authAttempt(success) {
  if (success) {
    auth.success++;
    activeUsers++;
  } else {
    auth.fail++;
  }
}

function userLogout() {
  if (activeUsers > 0) activeUsers--;
}


function pizzaPurchase(success, durationMs, price) {
  if (success) {
    pizzas.sold++;
    pizzas.revenue += price;
  } else {
    pizzas.failed++;
  }
  latency.pizza = durationMs;
}


function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return parseFloat((cpuUsage * 100).toFixed(2));
}

function getMemoryUsagePercentage() {
  const used = os.totalmem() - os.freemem();
  return parseFloat(((used / os.totalmem()) * 100).toFixed(2));
}

function toPrometheusLine(name, value, labels = {}) {
  const labelStr = Object.entries(labels)
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
  const labelPart = labelStr ? `{${labelStr}}` : '';
  return `# TYPE ${name} gauge\n${name}${labelPart} ${value}`;
}

async function sendToGrafana(metricLines) {
  const body = metricLines.join('\n');

  try {
    const response = await fetch(config.metrics.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        Authorization:
          'Basic ' +
          Buffer.from(`${config.metrics.accountId}:${config.metrics.apiKey}`).toString('base64'),
      },
      body,
    });

    if (!response.ok) {
      console.error('Failed to send metrics to Grafana:', response.status, await response.text());
    }
  } catch (err) {
    console.error('Error sending metrics:', err.message);
  }
}

function sendMetricsPeriodically(periodMs = 10000) {
  setInterval(async () => {
    const src = config.metrics.source;

    const lines = [
      // HTTP
      toPrometheusLine('http_requests_total',  requests.total,  { source: src }),
      toPrometheusLine('http_requests_get',    requests.get,    { source: src }),
      toPrometheusLine('http_requests_post',   requests.post,   { source: src }),
      toPrometheusLine('http_requests_put',    requests.put,    { source: src }),
      toPrometheusLine('http_requests_delete', requests.delete, { source: src }),

      // Auth
      toPrometheusLine('auth_success', auth.success, { source: src }),
      toPrometheusLine('auth_fail',    auth.fail,    { source: src }),

      // Users
      toPrometheusLine('active_users', activeUsers, { source: src }),

      // System
      toPrometheusLine('cpu_usage_percent',    getCpuUsagePercentage(),    { source: src }),
      toPrometheusLine('memory_usage_percent', getMemoryUsagePercentage(), { source: src }),

      // Pizzas
      toPrometheusLine('pizzas_sold',    pizzas.sold,    { source: src }),
      toPrometheusLine('pizzas_failed',  pizzas.failed,  { source: src }),
      toPrometheusLine('pizza_revenue',  pizzas.revenue, { source: src }),

      // Latency (ms)
      toPrometheusLine('latency_service_ms', latency.service, { source: src }),
      toPrometheusLine('latency_pizza_ms',   latency.pizza,   { source: src }),
    ];

    await sendToGrafana(lines);

    // Reset per-interval counters
    requests.total = requests.get = requests.post = requests.put = requests.delete = 0;
    auth.success = auth.fail = 0;
    pizzas.sold = pizzas.failed = pizzas.revenue = 0;
  }, periodMs);
}

module.exports = {
  requestTracker,
  authAttempt,
  userLogout,
  pizzaPurchase,
  sendMetricsPeriodically,
};