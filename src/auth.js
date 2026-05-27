'use strict';
const jwt = require('jsonwebtoken');

const secret = () => process.env.JWT_SECRET || 'panico_edificio_secret_2024';

function generarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, username: usuario.username, rol: usuario.rol },
    secret(),
    { expiresIn: '12h' }
  );
}

function verificarToken(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token requerido' });
  try {
    req.usuario = jwt.verify(auth.slice(7), secret());
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function soloAdmin(req, res, next) {
  if (req.usuario?.rol !== 'admin')
    return res.status(403).json({ error: 'Solo administrador' });
  next();
}

module.exports = { generarToken, verificarToken, soloAdmin };
