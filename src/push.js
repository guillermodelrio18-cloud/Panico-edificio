'use strict';
const webPush = require('web-push');
const { db } = require('./db');

let pushActivo = false;

function configurarPush() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('⚠️  VAPID no configurado — push desactivado');
    return;
  }
  webPush.setVapidDetails(
    VAPID_EMAIL || 'mailto:admin@edificio.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  pushActivo = true;
  console.log('✅ Web Push listo');
}

function buildPayload(tipo, edificio) {
  const map = {
    incendio:  { title: `🔥 INCENDIO — ${edificio}`,   body: 'Evacúe el edificio de inmediato por las salidas de emergencia.' },
    general:   { title: `⚠️ ALERTA — ${edificio}`,     body: 'Emergencia en el edificio. Siga las instrucciones del vigilante.' },
    evacuacion:{ title: `🚨 EVACUACIÓN — ${edificio}`, body: 'Orden de evacuación. Use las salidas de emergencia. No use el ascensor.' },
  };
  const base = map[tipo] || map.general;
  return {
    ...base,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: 'alerta-emergencia',
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [300, 100, 300, 100, 300],
    data: { tipo, url: '/' },
  };
}

async function enviarAlertas(tipo) {
  const edificio = process.env.EDIFICIO_NOMBRE || 'Edificio';
  const subs = await db.getSuscripciones();

  if (!pushActivo) {
    console.log(`[SIMULADO] Alerta ${tipo} a ${subs.length} dispositivos`);
    return { enviadas: 0, fallidas: 0, simulado: true, total: subs.length };
  }

  if (!subs.length) return { enviadas: 0, fallidas: 0, total: 0 };

  const payload = JSON.stringify(buildPayload(tipo, edificio));
  const opciones = { urgency: 'high', TTL: 300, topic: 'alerta' };

  let enviadas = 0, fallidas = 0;

  await Promise.allSettled(subs.map(async (sub) => {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload, opciones
      );
      enviadas++;
    } catch (err) {
      fallidas++;
      if (err.statusCode === 410 || err.statusCode === 404) {
        await db.deleteSuscripcion(sub.endpoint);
      }
    }
  }));

  return { enviadas, fallidas, total: subs.length };
}

module.exports = { configurarPush, enviarAlertas };
