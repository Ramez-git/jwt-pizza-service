const os = require('os');
const config = require('./config');

// ─── Counters & Gauges ────────────────────────────────────────────────────────

const requests = { total: 0, get: 0, post: 0, put: 0, delete: 0 };
const auth = { success: 0, fail: 0 };
const pizzas = { sold: 0, failed: 0, revenue: 0 };
const latency = { service: 0, pizza: 0 };
let activeUsers = 0;

// ─── Middleware ───────────────────────────────────────────────────────────────

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

// ─── Auth Tracking ────────────────────────────────────────────────────────────

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

// ─── Pizza Purchase Tracking ──────────────────────────────────────────────────

function pizzaPurchase(success, durationMs, price) {
  if (success) {
    pizzas.sold++;
    pizzas.revenue += price;
  } else {
    pizzas.failed++;
  }
  latency.pizza = durationMs;
}

// ─── System Metrics ───────────────────────────────────────────────────────────

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return parseFloat((cpuUsage * 100).toFixed(2));
}

function getMemoryUsagePercentage() {
  const used = os.totalmem() - os.freemem();
  return parseFloat(((used / os.totalmem()) * 100).toFixed(2));
}

// ─── OTel Metric Builder ──────────────────────────────────────────────────────

function buildMetric(name, value, type, unit) {
  const dataPoint = {
    asInt: Math.round(value),
    timeUnixNano: Date.now() * 1_000_000,
    attributes: [{ key: 'source', value: { stringValue: config.metrics.source } }],
  };

  const metric = { name, unit, [type]: { dataPoints: [dataPoint] } };

  if (type === 'sum') {
    metric[type].aggregationTemporality = 'AGGREGATION_TEMPORALITY_CUMULATIVE';
    metric[type].isMonotonic = true;
  }

  return metric;
}

// ─── Send to Grafana ──────────────────────────────────────────────────────────

async function sendMetricToGrafana(metricName, metricValue, type, unit) {
  const body = JSON.stringify({
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [buildMetric(metricName, metricValue, type, unit)],
          },
        ],
      },
    ],
  });

  try {
    const response = await fetch(config.metrics.endpointUrl, {
      method: 'POST',
      body,
      headers: {
        Authorization: `Bearer ${config.metrics.accountId}:${config.metrics.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`Failed to push metric [${metricName}] to Grafana: ${text}`);
    }
  } catch (err) {
    console.error('Error sending metric:', err.message);
  }
}

// ─── Periodic Reporting ───────────────────────────────────────────────────────

function sendMetricsPeriodically(periodMs = 10000) {
  setInterval(async () => {
    // HTTP requests (sum)
    await sendMetricToGrafana('http_requests_total',  requests.total,  'sum', '1');
    await sendMetricToGrafana('http_requests_get',    requests.get,    'sum', '1');
    await sendMetricToGrafana('http_requests_post',   requests.post,   'sum', '1');
    await sendMetricToGrafana('http_requests_put',    requests.put,    'sum', '1');
    await sendMetricToGrafana('http_requests_delete', requests.delete, 'sum', '1');

    // Auth (sum)
    await sendMetricToGrafana('auth_success', auth.success, 'sum', '1');
    await sendMetricToGrafana('auth_fail',    auth.fail,    'sum', '1');

    // Active users (gauge)
    await sendMetricToGrafana('active_users', activeUsers, 'gauge', '1');

    // System (gauge)
    await sendMetricToGrafana('cpu_usage_percent',    getCpuUsagePercentage(),    'gauge', '%');
    await sendMetricToGrafana('memory_usage_percent', getMemoryUsagePercentage(), 'gauge', '%');

    // Pizzas (sum)
    await sendMetricToGrafana('pizzas_sold',   pizzas.sold,    'sum', '1');
    await sendMetricToGrafana('pizzas_failed', pizzas.failed,  'sum', '1');
    await sendMetricToGrafana('pizza_revenue', pizzas.revenue, 'sum', '1');

    // Latency (gauge)
    await sendMetricToGrafana('latency_service_ms', latency.service, 'gauge', 'ms');
    await sendMetricToGrafana('latency_pizza_ms',   latency.pizza,   'gauge', 'ms');

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