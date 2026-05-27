// push.js — Cliente de notificaciones push
window.PushManager2 = (() => {
  function urlBase64ToUint8Array(base64) {
    const pad = '='.repeat((4 - base64.length % 4) % 4);
    const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  }

  function bufToBase64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }

  async function registrarSW() {
    if (!('serviceWorker' in navigator)) throw new Error('Service Worker no disponible en este navegador');
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return reg;
  }

  async function suscribir(token) {
    // 1. Pedir permiso
    if (!('Notification' in window)) throw new Error('Notificaciones no soportadas en este navegador');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Permiso de notificaciones denegado por el usuario');

    // 2. Registrar SW
    const reg = await registrarSW();

    // 3. Obtener clave pública VAPID
    const r = await fetch('/api/push/key');
    if (!r.ok) throw new Error('No se pudo obtener la clave del servidor');
    const { key } = await r.json();

    // 4. Suscribirse al push manager
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });

    // 5. Guardar en el servidor
    const body = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: bufToBase64(sub.getKey('p256dh')),
        auth:   bufToBase64(sub.getKey('auth')),
      },
    };
    const res = await fetch('/api/push/suscribir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('No se pudo guardar la suscripción');
    return sub;
  }

  async function estasSuscrito() {
    if (!('serviceWorker' in navigator)) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return !!sub;
    } catch { return false; }
  }

  return { suscribir, estasSuscrito, registrarSW };
})();
