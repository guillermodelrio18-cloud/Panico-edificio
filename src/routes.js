'use strict';
const express = require('express');
const bcrypt  = require('bcryptjs');
const { db }  = require('./db');
const { generarToken, verificarToken, soloAdmin } = require('./auth');
const { enviarAlertas } = require('./push');

const router = express.Router();

// ── Login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password)
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

    const usuario = await db.getUsuario(username.trim());
    if (!usuario)
      return res.status(401).json({ error: 'Usuario no encontrado' });

    const ok = bcrypt.compareSync(password, usuario.password);
    if (!ok)
      return res.status(401).json({ error: 'Contraseña incorrecta' });

    const token = generarToken(usuario);
    res.json({ token, usuario: { id: usuario.id, username: usuario.username, rol: usuario.rol } });
  } catch (err) {
    console.error('Error login:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ── Me ─────────────────────────────────────────────────────────
router.get('/me', verificarToken, (req, res) => res.json({ usuario: req.usuario }));

// ── Propietarios ───────────────────────────────────────────────
router.get('/propietarios', verificarToken, async (req, res) => {
  res.json(await db.getPropietarios());
});

router.post('/propietarios', verificarToken, soloAdmin, async (req, res) => {
  const { nombre, apartamento, telefono, email } = req.body || {};
  if (!nombre || !apartamento)
    return res.status(400).json({ error: 'Nombre y apartamento requeridos' });
  res.status(201).json(await db.addPropietario(nombre, apartamento, telefono, email));
});

router.delete('/propietarios/:id', verificarToken, soloAdmin, async (req, res) => {
  await db.deletePropietario(req.params.id);
  res.json({ ok: true });
});

// ── Push ───────────────────────────────────────────────────────
router.get('/push/key', (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: 'Push no configurado' });
  res.json({ key });
});

router.post('/push/suscribir', async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth)
      return res.status(400).json({ error: 'Datos inválidos' });
    await db.saveSuscripcion(endpoint, keys.p256dh, keys.auth, req.headers['user-agent']);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error suscripcion:', err);
    res.status(500).json({ error: 'Error guardando suscripción' });
  }
});

router.delete('/push/suscribir', async (req, res) => {
  if (req.body?.endpoint) await db.deleteSuscripcion(req.body.endpoint);
  res.json({ ok: true });
});

router.get('/push/total', verificarToken, async (req, res) => {
  res.json({ total: await db.countSuscripciones() });
});

// ── Alertas ────────────────────────────────────────────────────
router.post('/alerta', verificarToken, async (req, res) => {
  try {
    const { tipo } = req.body || {};
    if (!['incendio','general','evacuacion'].includes(tipo))
      return res.status(400).json({ error: 'Tipo inválido' });

    const mensajes = {
      incendio:   'INCENDIO detectado. Evacúe de inmediato.',
      general:    'Alerta de emergencia en el edificio.',
      evacuacion: 'Evacuación inmediata. Use las salidas de emergencia.',
    };

    const resultado = await enviarAlertas(tipo);
    await db.saveAlerta(tipo, mensajes[tipo], req.usuario.id, resultado.enviadas, resultado.fallidas);
    res.json({ ok: true, ...resultado });
  } catch (err) {
    console.error('Error alerta:', err);
    res.status(500).json({ error: 'Error enviando alerta' });
  }
});

router.get('/alertas', verificarToken, async (req, res) => {
  res.json(await db.getAlertas(30));
});

module.exports = router;
