'use strict';
require('dotenv').config();

const express = require('express');
const path    = require('path');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const { initDb } = require('./db');
const { configurarPush } = require('./push');
const routes  = require('./routes');

async function main() {
  await initDb();
  configurarPush();

  const app = express();

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'", "'unsafe-inline'"],
        styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc:    ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'"],
        workerSrc:  ["'self'"],
        imgSrc:     ["'self'", "data:"],
      },
    },
  }));

  app.use(cors());
  app.use(express.json({ limit: '10kb' }));

  app.use('/api', rateLimit({ windowMs: 60000, max: 60 }));
  app.use('/api/alerta', rateLimit({ windowMs: 60000, max: 10 }));

  app.use('/api', routes);

  // Service Worker — debe estar en la raíz
  app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, '../public/sw.js'));
  });

  app.use(express.static(path.join(__dirname, '../public'), { maxAge: '1h' }));

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'No encontrado' });
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  const PORT = parseInt(process.env.PORT) || 3000;
  app.listen(PORT, () => {
    console.log(`🚨 Pánico Edificio corriendo en puerto ${PORT}`);
    console.log(`📋 Edificio: ${process.env.EDIFICIO_NOMBRE || 'Sin configurar'}`);
  });
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
