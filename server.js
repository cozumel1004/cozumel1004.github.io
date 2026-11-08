const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const PORT = 3000;

const db = new Database('tienda.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('mayorista','consumidor'))
  );
  CREATE TABLE IF NOT EXISTS ofertas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    producto TEXT NOT NULL,
    descripcion TEXT,
    cantidad INTEGER NOT NULL,
    precio_mayoreo REAL NOT NULL,
    contacto TEXT NOT NULL,
    unidad TEXT NOT NULL DEFAULT 'cantidad',
    zona TEXT NOT NULL DEFAULT '',
    foto TEXT,
    fecha TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );
`);
const columnasOfertas = db.prepare('PRAGMA table_info(ofertas)').all().map((c) => c.name);
if (!columnasOfertas.includes('unidad')) db.exec("ALTER TABLE ofertas ADD COLUMN unidad TEXT NOT NULL DEFAULT 'cantidad'");
if (!columnasOfertas.includes('zona')) db.exec("ALTER TABLE ofertas ADD COLUMN zona TEXT NOT NULL DEFAULT ''");
if (!columnasOfertas.includes('foto')) db.exec('ALTER TABLE ofertas ADD COLUMN foto TEXT');

const app = express();
app.use(express.json({ limit: '3mb' }));
app.use(session({
  secret: 'cambia-esta-clave-por-algo-largo-y-secreto',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(express.static('public'));

const requiereLogin = (req, res, next) =>
  req.session.usuario ? next() : res.status(401).json({ error: 'Inicia sesión primero.' });

const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

app.post('/api/registro', (req, res) => {
  const { nombre, email, password, rol } = req.body;
  if (!nombre || !email || !password || !['mayorista', 'consumidor'].includes(rol))
    return res.status(400).json({ error: 'Completa todos los campos y elige un tipo de cuenta.' });
  if (!emailValido(email.trim()))
    return res.status(400).json({ error: 'Escribe un correo válido.' });
  if (password.length < 6)
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });

  const correoLimpio = email.trim().toLowerCase();
  try {
    db.prepare('INSERT INTO usuarios (nombre,email,password,rol) VALUES (?,?,?,?)')
      .run(nombre.trim(), correoLimpio, bcrypt.hashSync(password, 10), rol);
  } catch {
    return res.status(400).json({ error: 'Ese correo ya está registrado.' });
  }
  res.json({ ok: true, email: correoLimpio });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get((email || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(password || '', u.password))
    return res.status(400).json({ error: 'Correo o contraseña incorrectos.' });
  req.session.usuario = { id: u.id, nombre: u.nombre, rol: u.rol };
  res.json(req.session.usuario);
});

app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/yo', (req, res) => res.json(req.session.usuario || null));

const OFERTA_SQL = `
  SELECT o.id, o.usuario_id, o.producto, o.descripcion, o.cantidad, o.unidad, o.zona,
         o.precio_mayoreo, o.contacto, o.fecha,
         (o.foto IS NOT NULL AND o.foto != '') AS tiene_foto,
         u.nombre AS vendedor, u.rol AS rol_vendedor
  FROM ofertas o JOIN usuarios u ON u.id = o.usuario_id`;

app.get('/api/ofertas', requiereLogin, (req, res) => {
  res.json(db.prepare(OFERTA_SQL + ' ORDER BY o.id DESC').all());
});

app.get('/api/ofertas/:id/foto', requiereLogin, (req, res) => {
  const o = db.prepare('SELECT foto FROM ofertas WHERE id = ?').get(req.params.id);
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
  const { producto, descripcion, cantidad, unidad, zona, precio_mayoreo, contacto, foto } = req.body;
  if (!producto || !(cantidad > 0) || !(precio_mayoreo > 0) || !zona || !zona.trim() || !contacto)
    return res.status(400).json({ error: 'Completa producto, cantidad, precio, zona y contacto.' });
  if (!['kg', 'litros', 'cantidad'].includes(unidad))
    return res.status(400).json({ error: 'Elige si se vende por kilogramos, litros o cantidad.' });
  if (foto && !/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(foto))
    return res.status(400).json({ error: 'La foto no es válida.' });
  if (foto && foto.length > 2500000)
    return res.status(400).json({ error: 'La foto es muy pesada.' });
  db.prepare(`INSERT INTO ofertas (usuario_id,producto,descripcion,cantidad,unidad,zona,precio_mayoreo,contacto,foto)
              VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(req.session.usuario.id, producto.trim(), (descripcion || '').trim(),
         unidad === 'cantidad' ? Math.floor(cantidad) : Number(cantidad), unidad, zona.trim().slice(0, 80),
         Number(precio_mayoreo), contacto.trim(), foto || null);
  res.json({ ok: true });
});

app.delete('/api/ofertas/:id', requiereLogin, (req, res) => {
  db.prepare('DELETE FROM ofertas WHERE id = ? AND usuario_id = ?')
    .run(req.params.id, req.session.usuario.id);
  res.json({ ok: true });
});

const servidor = app.listen(PORT, () => {
  console.log(`Listo: abre http://localhost:${PORT}`);
  console.log('Versión: mayoristas y consumidores pueden publicar y eliminar sus ofertas.');
});
servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\nEl puerto ${PORT} ya está ocupado: hay otra copia de la página corriendo.`);
    console.error('Ciérrala (Ctrl + C en su terminal) o corre este comando y vuelve a intentar:');
    console.error(`  lsof -ti :${PORT} | xargs kill\n`);
  } else {
    console.error(e);
  }
  process.exit(1);
});
