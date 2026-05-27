'use strict';

// ── Estado global ──────────────────────────────────────────────
let token    = localStorage.getItem('pe_token');
let usuario  = JSON.parse(localStorage.getItem('pe_usuario') || 'null');
let tipoSeleccionado = null;

// ── Helpers ────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch('/api' + path, {
    ...opts,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

function toast(msg, tipo = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${tipo}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 4000);
}

function fmtFecha(iso) {
  return new Date(iso).toLocaleString('es-CO', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}

// ── Auth ───────────────────────────────────────────────────────
function mostrarLogin() {
  $('screen-login').style.display = 'flex';
  $('screen-app').style.display   = 'none';
}

function mostrarApp() {
  $('screen-login').style.display = 'none';
  $('screen-app').style.display   = 'flex';
  $('lbl-rol').textContent  = usuario.rol === 'admin' ? 'Administrador' : 'Vigilante';
  $('lbl-user').textContent = usuario.username;
  $('tab-admin').style.display = usuario.rol === 'admin' ? '' : 'none';
  iniciarReloj();
  cargarTotal();
  cargarHistorial();
  if (usuario.rol === 'admin') cargarPropietarios();
  registrarSWEnBackground();
}

$('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const username = $('inp-user').value.trim();
  const password = $('inp-pass').value;
  try {
    const data = await api('/login', { method: 'POST', body: { username, password } });
    token   = data.token;
    usuario = data.usuario;
    localStorage.setItem('pe_token',   token);
    localStorage.setItem('pe_usuario', JSON.stringify(usuario));
    mostrarApp();
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('btn-logout').addEventListener('click', () => {
  localStorage.clear();
  token = null; usuario = null;
  mostrarLogin();
});

// ── Reloj ──────────────────────────────────────────────────────
function iniciarReloj() {
  const tick = () => $('reloj').textContent = new Date().toLocaleTimeString('es-CO', { hour12: false });
  tick();
  setInterval(tick, 1000);
}

// ── Tabs ───────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $(`panel-${tab}`).classList.add('active');
    if (tab === 'historial') cargarHistorial();
    if (tab === 'admin')     cargarPropietarios();
  });
});

// ── Selección tipo alerta ─────────────────────────────────────
document.querySelectorAll('.tipo-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.tipo-card').forEach(c => c.classList.remove('sel'));
    card.classList.add('sel');
    tipoSeleccionado = card.dataset.tipo;
    $('lbl-tipo').innerHTML = `Tipo: <strong>${card.querySelector('.tipo-nombre').textContent}</strong>`;
    $('btn-enviar').disabled = false;
  });
});

// ── Enviar alerta ─────────────────────────────────────────────
$('btn-enviar').addEventListener('click', () => {
  if (!tipoSeleccionado) return;
  $('modal-tipo').textContent = tipoSeleccionado.toUpperCase();
  $('modal').classList.add('show');
});

$('btn-cancelar').addEventListener('click', () => $('modal').classList.remove('show'));

$('btn-confirmar').addEventListener('click', async () => {
  $('modal').classList.remove('show');
  const btn = $('btn-enviar');
  btn.disabled = true;
  btn.textContent = 'Enviando...';
  try {
    const r = await api('/alerta', { method: 'POST', body: { tipo: tipoSeleccionado } });
    toast(`✅ Alerta enviada a ${r.enviadas} dispositivos`, 'success');
    $('status-bar').className = `status-bar activa-${tipoSeleccionado}`;
    $('status-txt').textContent = `ALERTA ${tipoSeleccionado.toUpperCase()} ACTIVA`;
    setTimeout(() => {
      $('status-bar').className = 'status-bar normal';
      $('status-txt').textContent = 'Sistema operativo';
    }, 30000);
    tipoSeleccionado = null;
    document.querySelectorAll('.tipo-card').forEach(c => c.classList.remove('sel'));
    $('lbl-tipo').textContent = 'Seleccione el tipo de alerta';
    cargarHistorial();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔔 ENVIAR ALERTA';
  }
});

// ── Push ───────────────────────────────────────────────────────
async function cargarTotal() {
  try {
    const { total } = await api('/push/total');
    $('lbl-total').textContent = total;
  } catch {}
}

async function registrarSWEnBackground() {
  try {
    await PushManager2.registrarSW();
  } catch {}
}

$('btn-push').addEventListener('click', async () => {
  $('btn-push').disabled = true;
  $('btn-push').textContent = 'Activando...';
  try {
    await PushManager2.suscribir(token);
    toast('✅ Notificaciones activadas en este dispositivo', 'success');
    cargarTotal();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    $('btn-push').disabled = false;
    $('btn-push').textContent = '+ Activar aquí';
  }
});

// ── Historial ─────────────────────────────────────────────────
async function cargarHistorial() {
  try {
    const data = await api('/alertas');
    const lista = $('historial-lista');
    if (!data.length) { lista.innerHTML = '<p class="vacío">Sin alertas registradas</p>'; return; }
    lista.innerHTML = data.map(a => `
      <div class="hist-item tipo-${a.tipo}">
        <div class="hist-icon">${a.tipo==='incendio'?'🔥':a.tipo==='evacuacion'?'🚨':'⚠️'}</div>
        <div class="hist-info">
          <div class="hist-tipo">${a.tipo.toUpperCase()}</div>
          <div class="hist-meta">${a.vigilante_nombre||'Sistema'} · ${fmtFecha(a.creado_en)}</div>
        </div>
        <div class="hist-nums">
          <span class="badge-ok">✓ ${a.total_enviadas}</span>
          ${a.total_fallidas>0?`<span class="badge-err">✗ ${a.total_fallidas}</span>`:''}
        </div>
      </div>`).join('');
  } catch {}
}

// ── Propietarios ──────────────────────────────────────────────
async function cargarPropietarios() {
  try {
    const data = await api('/propietarios');
    $('lbl-total-prop').textContent = data.length;
    const lista = $('lista-propietarios');
    if (!data.length) { lista.innerHTML = '<p class="vacío">Sin propietarios</p>'; return; }
    lista.innerHTML = data.map(p => {
      const ini = p.nombre.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase();
      return `<div class="prop-item">
        <div class="prop-av">${ini}</div>
        <div class="prop-info">
          <div class="prop-nombre">${p.nombre}</div>
          <div class="prop-meta">Apto ${p.apartamento}${p.telefono?' · '+p.telefono:''}${p.email?' · '+p.email:''}</div>
        </div>
        <button class="btn-del" onclick="borrarProp(${p.id})">🗑</button>
      </div>`;
    }).join('');
  } catch {}
}

window.borrarProp = async id => {
  if (!confirm('¿Eliminar este propietario?')) return;
  try {
    await api(`/propietarios/${id}`, { method: 'DELETE' });
    toast('Propietario eliminado', 'success');
    cargarPropietarios();
  } catch (err) { toast(err.message, 'error'); }
};

$('form-prop').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await api('/propietarios', { method: 'POST', body: {
      nombre:      $('inp-nombre').value.trim(),
      apartamento: $('inp-apto').value.trim(),
      telefono:    $('inp-tel').value.trim(),
      email:       $('inp-email').value.trim(),
    }});
    toast('Propietario agregado', 'success');
    e.target.reset();
    cargarPropietarios();
  } catch (err) { toast(err.message, 'error'); }
});

// ── Init ───────────────────────────────────────────────────────
if (token && usuario) {
  api('/me').then(() => mostrarApp()).catch(() => { localStorage.clear(); mostrarLogin(); });
} else {
  mostrarLogin();
}
