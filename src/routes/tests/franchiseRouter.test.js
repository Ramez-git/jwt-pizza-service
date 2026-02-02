const request = require('supertest');
const app = require('../../service');
const { registerDiner, loginAdmin, authHeader } = require('./testUtils');

describe('franchiseRouter', () => {
  test('GET /api/franchise lists franchises (public)', async () => {
    const res = await request(app).get('/api/franchise');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('franchises');
    expect(res.body).toHaveProperty('more');
  });

  test('POST /api/franchise forbidden for non-admin', async () => {
    const diner = await registerDiner(app);

    const res = await request(app)
      .post('/api/franchise')
      .set(authHeader(diner.token))
      .send({ name: `Nope_${Date.now()}`, admins: [{ email: diner.email }] });

    expect(res.status).toBe(403);
  });

  test('Admin can create franchise; user can view their franchises; store create auth checks work', async () => {
    const diner = await registerDiner(app);
    const admin = await loginAdmin(app);

    const franchiseName = `Fr_${Date.now()}`;
    const createRes = await request(app)
      .post('/api/franchise')
      .set(authHeader(admin.token))
      .send({ name: franchiseName, admins: [{ email: diner.email }] });

    expect(createRes.status).toBe(200);
    expect(createRes.body).toHaveProperty('id');
    expect(createRes.body).toHaveProperty('admins');
    expect(createRes.body.admins.length).toBeGreaterThan(0);

    const franchiseId = createRes.body.id;

    const mineRes = await request(app)
      .get(`/api/franchise/${diner.user.id}`)
      .set(authHeader(diner.token));

    expect(mineRes.status).toBe(200);
    expect(Array.isArray(mineRes.body)).toBe(true);
    expect(mineRes.body.some((f) => f.id === franchiseId)).toBe(true);

    const other = await registerDiner(app);
    const otherSees = await request(app)
      .get(`/api/franchise/${diner.user.id}`)
      .set(authHeader(other.token));
    expect(otherSees.status).toBe(200);
    expect(otherSees.body).toEqual([]);

    const storeRes = await request(app)
      .post(`/api/franchise/${franchiseId}/store`)
      .set(authHeader(diner.token))
      .send({ name: `S_${Date.now()}` });

    expect(storeRes.status).toBe(200);
    expect(storeRes.body).toHaveProperty('id');
    expect(storeRes.body).toHaveProperty('name');
    const storeId = storeRes.body.id;

    const delForbidden = await request(app)
      .delete(`/api/franchise/${franchiseId}/store/${storeId}`)
      .set(authHeader(other.token));

    expect(delForbidden.status).toBe(403);

    const delOk = await request(app)
      .delete(`/api/franchise/${franchiseId}/store/${storeId}`)
      .set(authHeader(admin.token));
    expect([200, 204]).toContain(delOk.status);

    const delFr = await request(app)
      .delete(`/api/franchise/${franchiseId}`)
      .set(authHeader(admin.token));
    expect([200, 204]).toContain(delFr.status);
  });
});
