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
  res.on('finish', () => { latency.service = Date.now() - start; });
  next();
}


function authAttempt(success) {
  if (success) { auth.success++; activeUsers++; }
  else { auth.fail++; }
}

function userLogout() {
  if (activeUsers > 0) activeUsers--;
}


function pizzaPurchase(success, durationMs, price) {
  if (success) { pizzas.sold++; pizzas.revenue += price; }
  else { pizzas.failed++; }
  latency.pizza = durationMs;
}


function getCpuUsagePercentage() {
  return parseFloat(((os.loadavg()[0] / os.cpus().length) * 100).toFixed(2));
}

function getMemoryUsagePercentage() {
  return parseFloat((((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(2));
}


async function sendMetricToGrafana(name, value) {
  const body = JSON.stringify({
    resourceMetrics: [{
      scopeMetrics: [{
        metrics: [{
          name,
          unit: '1',
          gauge: {
            dataPoints: [{
              asDouble: value,
              timeUnixNano: Date.now() * 1_000_000,
              attributes: [{ key: 'source', value: { stringValue: config.metrics.source } }],
            }],
          },
        }],
      }],
    }],
  });

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
    throw new Error(`${response.status}: ${text}`);
  }
}


function sendMetricsPeriodically(periodMs = 10000) {
  const send = async () => {
    try {
      const snapshot = [
        ['requests_http_all',    requests.total],
        ['requests_http_get',    requests.get],
        ['requests_http_post',   requests.post],
        ['requests_http_put',    requests.put],
        ['requests_http_delete', requests.delete],
        ['auth_success',         auth.success],
        ['auth_fail',            auth.fail],
        ['users_active',         activeUsers],
        ['system_cpu',           getCpuUsagePercentage()],
        ['system_memory',        getMemoryUsagePercentage()],
        ['pizza_sold',           pizzas.sold],
        ['pizza_failed',         pizzas.failed],
        ['pizza_revenue',        pizzas.revenue],
        ['latency_service_ms',   latency.service],
        ['latency_pizza_ms',     latency.pizza],
      ];

      for (const [name, value] of snapshot) {
        await sendMetricToGrafana(name, value);
      }
      console.log(`[metrics] sent ${snapshot.length} metrics`);
    } catch (err) {
      console.error('[metrics] send error:', err.message);
    }
  };

  // Send immediately on start, then every periodMs
  send();
  setInterval(send, periodMs);
}

module.exports = { requestTracker, authAttempt, userLogout, pizzaPurchase, sendMetricsPeriodically };