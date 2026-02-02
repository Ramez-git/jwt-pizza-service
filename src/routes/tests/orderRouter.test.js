const request = require('supertest');
const app = require('../../service');
const { registerDiner, loginAdmin, authHeader } = require('./testUtils');

describe('orderRouter', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete global.fetch;
  });

  test('GET /api/order/menu is public', async () => {
    const res = await request(app).get('/api/order/menu');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('PUT /api/order/menu forbidden for non-admin', async () => {
    const diner = await registerDiner(app);

    const res = await request(app)
      .put('/api/order/menu')
      .set(authHeader(diner.token))
      .send({ title: 'Student', description: 'test', image: 'pizza9.png', price: 0.0001 });

    expect(res.status).toBe(403);
  });

  test('Admin can add menu item', async () => {
    const admin = await loginAdmin(app);

    const res = await request(app)
      .put('/api/order/menu')
      .set(authHeader(admin.token))
      .send({ title: `T_${Date.now()}`, description: 'desc', image: 'pizza9.png', price: 0.0001 });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('POST /api/order returns 500 when factory fails (covers else branch)', async () => {
    const diner = await registerDiner(app);
    const admin = await loginAdmin(app);

    const franchiseRes = await request(app)
      .post('/api/franchise')
      .set(authHeader(admin.token))
      .send({ name: `Fr_${Date.now()}`, admins: [{ email: diner.email }] });
    expect(franchiseRes.status).toBe(200);
    const franchiseId = franchiseRes.body.id;

    const storeRes = await request(app)
      .post(`/api/franchise/${franchiseId}/store`)
      .set(authHeader(diner.token))
      .send({ name: `S_${Date.now()}` });
    expect(storeRes.status).toBe(200);
    const storeId = storeRes.body.id;

    const menuAddRes = await request(app)
      .put('/api/order/menu')
      .set(authHeader(admin.token))
      .send({ title: `M_${Date.now()}`, description: 'desc', image: 'pizza9.png', price: 0.05 });
    expect(menuAddRes.status).toBe(200);
    const menu = menuAddRes.body;
    const menuId = menu[menu.length - 1].id;

    global.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ reportUrl: 'http://factory/report' }),
    });

    const orderRes = await request(app)
      .post('/api/order')
      .set(authHeader(diner.token))
      .send({
        franchiseId,
        storeId,
        items: [{ menuId, description: 'desc', price: 0.05 }],
      });

    expect(orderRes.status).toBe(500);
    expect(orderRes.body).toHaveProperty('message', 'Failed to fulfill order at factory');

    await request(app).delete(`/api/franchise/${franchiseId}/store/${storeId}`).set(authHeader(admin.token));
    await request(app).delete(`/api/franchise/${franchiseId}`).set(authHeader(admin.token));
  });

  test('POST /api/order returns order + jwt when factory succeeds', async () => {
    const diner = await registerDiner(app);
    const admin = await loginAdmin(app);

    const franchiseRes = await request(app)
      .post('/api/franchise')
      .set(authHeader(admin.token))
      .send({ name: `Fr_${Date.now()}`, admins: [{ email: diner.email }] });
    expect(franchiseRes.status).toBe(200);
    const franchiseId = franchiseRes.body.id;

    const storeRes = await request(app)
      .post(`/api/franchise/${franchiseId}/store`)
      .set(authHeader(diner.token))
      .send({ name: `S_${Date.now()}` });
    expect(storeRes.status).toBe(200);
    const storeId = storeRes.body.id;

    const menuAddRes = await request(app)
      .put('/api/order/menu')
      .set(authHeader(admin.token))
      .send({ title: `M_${Date.now()}`, description: 'desc', image: 'pizza9.png', price: 0.05 });
    expect(menuAddRes.status).toBe(200);
    const menu = menuAddRes.body;
    const menuId = menu[menu.length - 1].id;

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ reportUrl: 'http://factory/report', jwt: 'factory-jwt' }),
    });

    const orderRes = await request(app)
      .post('/api/order')
      .set(authHeader(diner.token))
      .send({
        franchiseId,
        storeId,
        items: [{ menuId, description: 'desc', price: 0.05 }],
      });

    expect(orderRes.status).toBe(200);
    expect(orderRes.body).toHaveProperty('order');
    expect(orderRes.body).toHaveProperty('jwt', 'factory-jwt');
    expect(orderRes.body).toHaveProperty('followLinkToEndChaos');

    await request(app).delete(`/api/franchise/${franchiseId}/store/${storeId}`).set(authHeader(admin.token));
    await request(app).delete(`/api/franchise/${franchiseId}`).set(authHeader(admin.token));
  });

  test('GET /api/order requires auth', async () => {
    const res = await request(app).get('/api/order');
    expect(res.status).toBe(401);
  });

  test('GET /api/order works with auth', async () => {
    const diner = await registerDiner(app);

    const res = await request(app).get('/api/order').set(authHeader(diner.token));
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
  });
});
