const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const os = require('os');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const db = new Database('tienda.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, rol TEXT NOT NULL CHECK (rol IN ('mayorista','consumidor')));
  CREATE TABLE IF NOT EXISTS ofertas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL, producto TEXT NOT NULL,
    descripcion TEXT, cantidad INTEGER NOT NULL, precio_mayoreo REAL NOT NULL, contacto TEXT NOT NULL,
    unidad TEXT NOT NULL DEFAULT 'cantidad', zona TEXT NOT NULL DEFAULT '', foto TEXT,
    fecha TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (usuario_id) REFERENCES usuarios(id));
`);
// Migraciones: se puede usar con la tienda.db que ya tienes.
const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
let c = cols('usuarios');
if (!c.includes('verificado')) {
  db.exec('ALTER TABLE usuarios ADD COLUMN verificado INTEGER NOT NULL DEFAULT 0');
  db.exec('ALTER TABLE usuarios ADD COLUMN token_verif TEXT');
  db.exec('UPDATE usuarios SET verificado = 1');
}
c = cols('ofertas');
if (!c.includes('unidad')) db.exec("ALTER TABLE ofertas ADD COLUMN unidad TEXT NOT NULL DEFAULT 'cantidad'");
if (!c.includes('zona')) db.exec("ALTER TABLE ofertas ADD COLUMN zona TEXT NOT NULL DEFAULT ''");
if (!c.includes('foto')) db.exec('ALTER TABLE ofertas ADD COLUMN foto TEXT');
if (!c.includes('tipo')) db.exec("ALTER TABLE ofertas ADD COLUMN tipo TEXT NOT NULL DEFAULT 'mayoreo'");
if (!c.includes('minimo')) db.exec('ALTER TABLE ofertas ADD COLUMN minimo REAL NOT NULL DEFAULT 1');
if (!c.includes('fotos')) {
  db.exec('ALTER TABLE ofertas ADD COLUMN fotos TEXT');
  db.exec("UPDATE ofertas SET fotos = json_array(foto) WHERE foto IS NOT NULL AND foto != ''");
}

const app = express();
app.use(express.json({ limit: '12mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'cambia-esta-clave-por-algo-largo-y-secreto',
  resave: false, saveUninitialized: false, cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(express.static('public'));

const requiereLogin = (req, res, next) =>
  req.session.usuario ? next() : res.status(401).json({ error: 'Inicia sesión primero.' });
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

app.post('/api/registro', (req, res) => {
  const { nombre, email, password, rol } = req.body;
  if (!nombre || !email || !password || !['mayorista', 'consumidor'].includes(rol))
    return res.status(400).json({ error: 'Completa todos los campos y elige tu perfil.' });
  if (!emailValido(email.trim())) return res.status(400).json({ error: 'Escribe un correo válido.' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  let id;
  try {
    id = db.prepare('INSERT INTO usuarios (nombre,email,password,rol,verificado) VALUES (?,?,?,?,1)')
      .run(nombre.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10), rol).lastInsertRowid;
  } catch { return res.status(400).json({ error: 'Ese correo ya está registrado.' }); }
  // Registro directo: se crea la cuenta y se inicia sesión de una vez.
  req.session.usuario = { id: Number(id), nombre: nombre.trim(), rol };
  res.json(req.session.usuario);
});

app.post('/api/login', (req, res) => {
  const { email, password, rol } = req.body;
  const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get((email || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(password || '', u.password))
    return res.status(400).json({ error: 'Correo o contraseña incorrectos.' });
  // La pestaña elegida (Comprador / Comerciante) define con qué perfil entras.
  if (['mayorista', 'consumidor'].includes(rol) && rol !== u.rol) {
    db.prepare('UPDATE usuarios SET rol = ? WHERE id = ?').run(rol, u.id);
    u.rol = rol;
  }
  req.session.usuario = { id: u.id, nombre: u.nombre, rol: u.rol };
  res.json(req.session.usuario);
});

app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/yo', (req, res) => res.json(req.session.usuario || null));

// Cambiar de comprador a comerciante (y al revés)
app.post('/api/rol', requiereLogin, (req, res) => {
  const { rol } = req.body;
  if (!['mayorista', 'consumidor'].includes(rol)) return res.status(400).json({ error: 'Rol no válido.' });
  db.prepare('UPDATE usuarios SET rol = ? WHERE id = ?').run(rol, req.session.usuario.id);
  req.session.usuario.rol = rol;
  res.json(req.session.usuario);
});

const OFERTA_SQL = `
  SELECT o.id, o.usuario_id, o.tipo, o.producto, o.descripcion, o.cantidad, o.minimo, o.unidad, o.zona,
         o.precio_mayoreo, o.contacto, o.fecha,
         COALESCE(json_array_length(o.fotos), 0) AS n_fotos,
         u.nombre AS vendedor, u.rol AS rol_vendedor
  FROM ofertas o JOIN usuarios u ON u.id = o.usuario_id`;

app.get('/api/ofertas', requiereLogin, (req, res) => {
  const tipo = req.query.tipo;
  res.json(['mayoreo', 'local'].includes(tipo)
    ? db.prepare(OFERTA_SQL + ' WHERE o.tipo = ? ORDER BY o.id DESC').all(tipo)
    : db.prepare(OFERTA_SQL + ' ORDER BY o.id DESC').all());
});

app.get('/api/ofertas/:id/foto/:n', requiereLogin, (req, res) => {
  const o = db.prepare('SELECT json_extract(fotos, ?) AS foto FROM ofertas WHERE id = ?')
    .get(`$[${parseInt(req.params.n, 10) || 0}]`, req.params.id);
  if (!o || !o.foto) return res.status(404).end();
  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', 'private, max-age=86400');
  res.send(Buffer.from(o.foto.split(',')[1], 'base64'));
});

app.get('/api/usuarios/:id', requiereLogin, (req, res) => {
  const u = db.prepare('SELECT id, nombre, rol FROM usuarios WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Ese perfil no existe.' });
  res.json({ usuario: u, ofertas: db.prepare(OFERTA_SQL + ' WHERE o.usuario_id = ? ORDER BY o.id DESC').all(u.id) });
});

app.post('/api/ofertas', requiereLogin, (req, res) => {
  if (req.session.usuario.rol !== 'mayorista')
    return res.status(403).json({ error: 'Cambia tu perfil a Comerciante para publicar.' });
  const { tipo, producto, descripcion, cantidad, minimo, unidad, zona, precio_mayoreo, contacto, fotos } = req.body;
  if (!['mayoreo', 'local'].includes(tipo)) return res.status(400).json({ error: 'Elige Mayoreo o Local.' });
  if (!producto || !(cantidad > 0) || !(precio_mayoreo > 0) || !zona || !zona.trim() || !contacto)
    return res.status(400).json({ error: 'Completa producto, cantidad, precio, zona y contacto.' });
  const und = tipo === 'local' ? 'cantidad' : unidad;
  if (!['kg', 'litros', 'cantidad'].includes(und))
    return res.status(400).json({ error: 'Elige si se vende por kilogramos, litros o cantidad.' });
  const lista = Array.isArray(fotos) ? fotos.slice(0, 3) : [];
  for (const f of lista) {
    if (typeof f !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(f))
      return res.status(400).json({ error: 'Una foto no es válida.' });
    if (f.length > 2500000) return res.status(400).json({ error: 'Una foto es muy pesada.' });
  }
  db.prepare(`INSERT INTO ofertas (usuario_id,tipo,producto,descripcion,cantidad,minimo,unidad,zona,precio_mayoreo,contacto,fotos)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(req.session.usuario.id, tipo, producto.trim().slice(0, 120), (descripcion || '').trim().slice(0, 500),
         und === 'kg' || und === 'litros' ? Number(cantidad) : Math.floor(cantidad),
         Number(minimo) > 0 ? Number(minimo) : 1, und, zona.trim().slice(0, 80),
         Number(precio_mayoreo), contacto.trim().slice(0, 40), lista.length ? JSON.stringify(lista) : null);
  res.json({ ok: true });
});

app.delete('/api/ofertas/:id', requiereLogin, (req, res) => {
  db.prepare('DELETE FROM ofertas WHERE id = ? AND usuario_id = ?').run(req.params.id, req.session.usuario.id);
  res.json({ ok: true });
});

// 0.0.0.0 = acepta conexiones de otros dispositivos de tu red (celulares, otras compus)
const servidor = app.listen(PORT, '0.0.0.0', () => {
  console.log('\nIntercambio de Raíces — listo.');
  console.log(`  En esta computadora:  http://localhost:${PORT}`);
  for (const lista of Object.values(os.networkInterfaces()))
    for (const i of lista || [])
      if (i.family === 'IPv4' && !i.internal) console.log(`  En tu red local:      http://${i.address}:${PORT}`);
  console.log('\nAbre la dirección "red local" desde el celular conectado al mismo Wi-Fi.');
});
servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\nEl puerto ${PORT} ya está ocupado: hay otra copia corriendo.`);
    console.error(`Ciérrala (Ctrl + C) o corre:  lsof -ti :${PORT} | xargs kill\n`);
  } else console.error(e);
  process.exit(1);
});
