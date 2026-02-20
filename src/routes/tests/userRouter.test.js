const request = require('supertest');
const app = require('../../service');
const { registerDiner, loginAdmin, authHeader } = require('./testUtils');
test('GET /api/user requires auth', async () => {
  const res = await request(app).get('/api/user');
  expect(res.status).toBe(401);
});

test('GET /api/user forbids non-admin', async () => {
  const diner = await registerDiner(app);

  const res = await request(app).get('/api/user').set(authHeader(diner.token));

  expect(res.status).toBe(403);
  expect(res.body).toHaveProperty('message', 'unauthorized');
});

test('Admin can list users', async () => {
  const admin = await loginAdmin(app);

  const res = await request(app)
    .get('/api/user?page=1&limit=10&name=*')
    .set(authHeader(admin.token));

  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('users');
  expect(Array.isArray(res.body.users)).toBe(true);
  expect(res.body).toHaveProperty('more');
  expect(typeof res.body.more).toBe('boolean');

  // sanity check shape (no passwords!)
  if (res.body.users.length > 0) {
    const u = res.body.users[0];
    expect(u).toHaveProperty('id');
    expect(u).toHaveProperty('name');
    expect(u).toHaveProperty('email');
    expect(u).toHaveProperty('roles');
    expect(u).not.toHaveProperty('password');
  }
});

test('Admin list users supports pagination (limit) and more flag', async () => {
  const admin = await loginAdmin(app);

  // create a few diners so we have enough data
  await registerDiner(app);
  await registerDiner(app);
  await registerDiner(app);

  const res = await request(app)
    .get('/api/user?page=1&limit=2&name=*')
    .set(authHeader(admin.token));

  expect(res.status).toBe(200);
  expect(res.body.users.length).toBeLessThanOrEqual(2);

  expect(typeof res.body.more).toBe('boolean');
});

test('Admin list users supports name filter', async () => {
  const admin = await loginAdmin(app);
  const u1 = await registerDiner(app);
  await request(app)
    .put(`/api/user/${u1.user.id}`)
    .set(authHeader(admin.token))
    .send({ name: 'alpha pizza', email: u1.email, password: u1.password });

  const u2 = await registerDiner(app);
  await request(app)
    .put(`/api/user/${u2.user.id}`)
    .set(authHeader(admin.token))
    .send({ name: 'beta burger', email: u2.email, password: u2.password });

  const res = await request(app)
    .get('/api/user?page=1&limit=10&name=alpha')
    .set(authHeader(admin.token));

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.users)).toBe(true);
  expect(res.body.users.length).toBeGreaterThan(0);

  for (const u of res.body.users) {
    expect(u.name.toLowerCase()).toContain('alpha');
  }
});