jest.spyOn(console, 'log').mockImplementation(() => {}); 

const request = require('supertest');
const { DB, Role } = require('../../database/database.js'); 

function uniqueEmail() {
  return `user_${Date.now()}_${Math.floor(Math.random() * 100000)}@test.com`;
}
async function registerDiner(app, name = 'pizza diner') {
  const email = uniqueEmail();
  const password = 'pass123';

  const res = await request(app).post('/api/auth').send({ name, email, password });
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('user');
  expect(res.body).toHaveProperty('token');

  return { user: res.body.user, token: res.body.token, email, password };
}

async function loginAdmin(app) {
  const adminEmail = 'a@jwt.com';
  const adminPassword = 'admin';

  let res = await request(app).put('/api/auth').send({ email: adminEmail, password: adminPassword });

  if (res.status === 404) {
    await DB.addUser({
      name: 'Admin',
      email: adminEmail,
      password: adminPassword,
      roles: [{ role: Role.Admin }],
    });

    res = await request(app).put('/api/auth').send({ email: adminEmail, password: adminPassword });
  }

  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('token');
  return { user: res.body.user, token: res.body.token };
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = { registerDiner, loginAdmin, authHeader };
