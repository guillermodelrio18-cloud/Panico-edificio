'use strict';
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

let pool;

async function initDb() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id        SERIAL PRIMARY KEY,
      username  TEXT UNIQUE NOT NULL,
      password  TEXT NOT NULL,
      rol       TEXT NOT NULL,
      creado_en TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS propietarios (
      id          SERIAL PRIMARY KEY,
      nombre      TEXT NOT NULL,
      apartamento TEXT NOT NULL,
      telefono    TEXT,
      email       TEXT,
      activo      BOOLEAN DEFAULT TRUE,
      creado_en   TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS suscripciones_push (
      id             SERIAL PRIMARY KEY,
      endpoint       TEXT UNIQUE NOT NULL,
      p256dh         TEXT NOT NULL,
      auth           TEXT NOT NULL,
      user_agent     TEXT,
      creado_en      TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS alertas (
      id             SERIAL PRIMARY KEY,
      tipo           TEXT NOT NULL,
      mensaje        TEXT NOT NULL,
      enviada_por    INTEGER,
      total_enviadas INTEGER DEFAULT 0,
      total_fallidas INTEGER DEFAULT 0,
      creado_en      TIMESTAMP DEFAULT NOW()
    );
  `);

  await seedUsuarios();
  console.log('✅ PostgreSQL listo');
}

async function seedUsuarios() {
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const vigUser   = process.env.VIGILANTE_USERNAME || 'vigilante';
  const vigPass   = process.env.VIGILANTE_PASSWORD || 'vigilante123';

  const { rows: a } = await pool.query('SELECT id FROM usuarios WHERE username=$1', [adminUser]);
  if (!a.length) {
    await pool.query('INSERT INTO usuarios (username,password,rol) VALUES ($1,$2,$3)',
      [adminUser, bcrypt.hashSync(adminPass, 10), 'admin']);
    console.log('👤 Admin creado:', adminUser);
  }

  const { rows: v } = await pool.query('SELECT id FROM usuarios WHERE username=$1', [vigUser]);
  if (!v.length) {
    await pool.query('INSERT INTO usuarios (username,password,rol) VALUES ($1,$2,$3)',
      [vigUser, bcrypt.hashSync(vigPass, 10), 'vigilante']);
    console.log('👤 Vigilante creado:', vigUser);
  }
}

const db = {
  // Usuarios
  async getUsuario(username) {
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE username=$1', [username]);
    return rows[0];
  },

  // Propietarios
  async getPropietarios() {
    const { rows } = await pool.query('SELECT * FROM propietarios WHERE activo=TRUE ORDER BY apartamento');
    return rows;
  },
  async addPropietario(nombre, apartamento, telefono, email) {
    const { rows } = await pool.query(
      'INSERT INTO propietarios (nombre,apartamento,telefono,email) VALUES ($1,$2,$3,$4) RETURNING *',
      [nombre, apartamento, telefono||null, email||null]);
    return rows[0];
  },
  async deletePropietario(id) {
    await pool.query('UPDATE propietarios SET activo=FALSE WHERE id=$1', [id]);
  },

  // Suscripciones push
  async saveSuscripcion(endpoint, p256dh, auth, user_agent) {
    await pool.query(`
      INSERT INTO suscripciones_push (endpoint, p256dh, auth, user_agent)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT(endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth`,
      [endpoint, p256dh, auth, user_agent||null]);
  },
  async getSuscripciones() {
    const { rows } = await pool.query('SELECT * FROM suscripciones_push');
    return rows;
  },
  async deleteSuscripcion(endpoint) {
    await pool.query('DELETE FROM suscripciones_push WHERE endpoint=$1', [endpoint]);
  },
  async countSuscripciones() {
    const { rows } = await pool.query('SELECT COUNT(*) as total FROM suscripciones_push');
    return parseInt(rows[0].total);
  },

  // Alertas
  async saveAlerta(tipo, mensaje, enviada_por, total_enviadas, total_fallidas) {
    const { rows } = await pool.query(
      'INSERT INTO alertas (tipo,mensaje,enviada_por,total_enviadas,total_fallidas) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [tipo, mensaje, enviada_por||null, total_enviadas, total_fallidas]);
    return rows[0].id;
  },
  async getAlertas(limite=50) {
    const { rows } = await pool.query(`
      SELECT a.*, u.username as vigilante_nombre
      FROM alertas a LEFT JOIN usuarios u ON a.enviada_por=u.id
      ORDER BY a.creado_en DESC LIMIT $1`, [limite]);
    return rows;
  },
};

module.exports = { initDb, db };
