const request = require('supertest');
const app = require('../../service');
const { registerDiner, loginAdmin, authHeader } = require('./testUtils');

describe('userRouter', () => {
  test('GET /api/user/me requires auth', async () => {
    const res = await request(app).get('/api/user/me');
    expect(res.status).toBe(401);
  });

  test('GET /api/user/me returns authenticated user', async () => {
    const diner = await registerDiner(app);
    const res = await request(app).get('/api/user/me').set(authHeader(diner.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: diner.user.id, email: diner.email });
  });

  test('PUT /api/user/:userId forbids non-admin updating someone else', async () => {
    const diner = await registerDiner(app);
    const admin = await loginAdmin(app);

    const res = await request(app)
      .put(`/api/user/${admin.user.id}`)
      .set(authHeader(diner.token))
      .send({ name: 'hacker', email: 'hacker@test.com', password: 'nope' });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('message', 'unauthorized');
  });

  test('Admin can update another user and gets a new token back', async () => {
    const diner = await registerDiner(app);
    const admin = await loginAdmin(app);

    const res = await request(app)
      .put(`/api/user/${diner.user.id}`)
      .set(authHeader(admin.token))
      .send({ name: 'updated name', email: diner.email, password: diner.password });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({ id: diner.user.id, name: 'updated name', email: diner.email });
  });
});
