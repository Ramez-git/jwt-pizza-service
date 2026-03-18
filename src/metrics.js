const os = require('os');
const config = require('./config');

// ─── Counters (never reset - let them accumulate) ─────────────────────────────
const requests = { total: 0, get: 0, post: 0, put: 0, delete: 0 };
const auth = { success: 0, fail: 0 };
const pizzas = { sold: 0, failed: 0, revenue: 0 };

// ─── Gauges (current value) ───────────────────────────────────────────────────
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

// ─── Send a single gauge metric to Grafana ───────────────────────────────────

async function sendMetricToGrafana(metricName, metricValue) {
  const body = JSON.stringify({
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [
              {
                name: metricName,
                unit: '1',
                gauge: {
                  dataPoints: [
                    {
                      asDouble: metricValue,
                      timeUnixNano: Date.now() * 1_000_000,
                      attributes: [
                        { key: 'source', value: { stringValue: config.metrics.source } },
                      ],
                    },
                  ],
                },
              },
            ],
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
      console.error(`Failed to push metric [${metricName}]: ${text}`);
    }
  } catch (err) {
    console.error('Error sending metric:', err.message);
  }
}

// ─── Periodic Reporting ───────────────────────────────────────────────────────

function sendMetricsPeriodically(periodMs = 10000) {
  setInterval(async () => {
    // HTTP requests (accumulating counters)
    await sendMetricToGrafana('http_requests_total',  requests.total);
    await sendMetricToGrafana('http_requests_get',    requests.get);
    await sendMetricToGrafana('http_requests_post',   requests.post);
    await sendMetricToGrafana('http_requests_put',    requests.put);
    await sendMetricToGrafana('http_requests_delete', requests.delete);

    // Auth (accumulating counters)
    await sendMetricToGrafana('auth_success', auth.success);
    await sendMetricToGrafana('auth_fail',    auth.fail);

    // Active users (gauge - current value)
    await sendMetricToGrafana('active_users', activeUsers);

    // System (gauges - current value)
    await sendMetricToGrafana('cpu_usage_percent',    getCpuUsagePercentage());
    await sendMetricToGrafana('memory_usage_percent', getMemoryUsagePercentage());

    // Pizzas (accumulating counters)
    await sendMetricToGrafana('pizzas_sold',   pizzas.sold);
    await sendMetricToGrafana('pizzas_failed', pizzas.failed);
    await sendMetricToGrafana('pizza_revenue', pizzas.revenue);

    // Latency (gauges - last recorded value)
    await sendMetricToGrafana('latency_service_ms', latency.service);
    await sendMetricToGrafana('latency_pizza_ms',   latency.pizza);

  }, periodMs);
}

module.exports = {
  requestTracker,
  authAttempt,
  userLogout,
  pizzaPurchase,
  sendMetricsPeriodically,
};