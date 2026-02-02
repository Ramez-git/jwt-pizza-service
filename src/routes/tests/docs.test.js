// src/routes/docs.test.js
const request = require('supertest');
const app = require('../../service');
jest.spyOn(console, 'log').mockImplementation(() => {});

test('GET /api/docs returns docs', async () => {
  const res = await request(app).get('/api/docs');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('endpoints');
  expect(Array.isArray(res.body.endpoints)).toBe(true);
});
