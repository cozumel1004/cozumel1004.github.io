const $ = (id) => document.getElementById(id);
let yo = null, vista = 'mayoreo', perfilId = null, datos = [], perfilInfo = null;
let rolElegido = 'consumidor', modoRegistro = false;
let tipoNuevo = 'mayoreo', fotos = [];

const rolNombre = (r) => (r === 'mayorista' ? 'Comerciante' : 'Comprador');
const limpiar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(url, metodo = 'GET', cuerpo) {
  const r = await fetch(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const j = await r.json();
  if (!r.ok) { const e = new Error(j.error || 'Algo salió mal.'); e.noVerificado = j.noVerificado; throw e; }
  return j;
}

/* ---------- Acceso ---------- */
function aviso(texto, bien) { const m = $('msg-acceso'); m.textContent = texto; m.className = bien ? 'ok' : 'error'; }

function pintarModo() {
  $('campo-nombre').hidden = !modoRegistro;
  $('btn-acceso').textContent = modoRegistro ? 'Crear cuenta →' : 'iniciar sesión →';
  $('btn-modo').textContent = modoRegistro ? '¿Ya tienes cuenta? Inicia sesión' : '¿Aún no formas parte? Regístrate aquí';
  $('a-pass').autocomplete = modoRegistro ? 'new-password' : 'current-password';
  aviso('', false);
}
$('btn-modo').onclick = () => { modoRegistro = !modoRegistro; pintarModo(); };
$('roles').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  rolElegido = b.dataset.rol;
  document.querySelectorAll('#roles button').forEach((x) => x.classList.toggle('on', x === b));
};

$('btn-acceso').onclick = async () => {
  const email = $('a-email').value, password = $('a-pass').value;
  try {
    yo = modoRegistro
      ? await api('/api/registro', 'POST', { nombre: $('a-nombre').value, email, password, rol: rolElegido })
      : await api('/api/login', 'POST', { email, password, rol: rolElegido });
    mostrarApp();
  } catch (e) { aviso(e.message, false); }
};
[$('a-email'), $('a-pass'), $('a-nombre')].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-acceso').click(); }));

function mostrarAcceso() { $('vista-acceso').hidden = false; $('vista-app').hidden = true; }
function mostrarApp() {
  $('vista-acceso').hidden = true; $('vista-app').hidden = false;
  pintarRol(); irA('mayoreo');
}
function pintarRol() { $('btn-abrir-publicar').hidden = yo.rol !== 'mayorista'; }

/* ---------- Menú ☰ ---------- */
function pintarMenu() {
  const otro = yo.rol === 'mayorista' ? 'Comprador' : 'Comerciante';
  $('menu').innerHTML = `<div class="quien">${limpiar(yo.nombre)} · <b>${rolNombre(yo.rol)}</b></div><hr>
    <button data-ir="mayoreo">🍎 Mayoreo</button>
    <button data-ir="local">🏘️ Local</button>
    <button data-ir="perfil">👤 Mi perfil</button><hr>
    <button data-ir="rol">🔄 Cambiar a ${otro}</button>
    <button data-ir="salir">Cerrar sesión</button>`;
}
$('btn-menu').onclick = (e) => { e.stopPropagation(); pintarMenu(); $('menu').hidden = !$('menu').hidden; };
document.addEventListener('click', (e) => { if (!e.target.closest('#menu')) $('menu').hidden = true; });
$('menu').onclick = async (e) => {
  const ir = e.target.dataset.ir; if (!ir) return;
  $('menu').hidden = true;
  if (ir === 'salir') { await api('/api/logout', 'POST'); yo = null; mostrarAcceso(); }
  else if (ir === 'rol') cambiarRol();
  else irA(ir, ir === 'perfil' ? yo.id : null);
};
$('marca').onclick = () => irA('mayoreo');

async function cambiarRol() {
  const nuevo = yo.rol === 'mayorista' ? 'consumidor' : 'mayorista';
  try { yo = await api('/api/rol', 'POST', { rol: nuevo }); pintarRol(); render(); }
  catch (e) { alert(e.message); }
}
$('btn-rol-perfil').onclick = cambiarRol;

/* ---------- Listados ---------- */
async function irA(v, id) {
  vista = v; perfilId = id || null; $('buscar').value = '';
  try {
    if (v === 'perfil') { const p = await api('/api/usuarios/' + id); perfilInfo = p.usuario; datos = p.ofertas; }
    else datos = await api('/api/ofertas?tipo=' + v);
  } catch (e) { alert(e.message); return; }
  render(); window.scrollTo(0, 0);
}

function linkWhatsApp(tel, producto) {
  let d = String(tel).replace(/\D/g, '');
  if (d.length === 10) d = '52' + d;
  if (d.length < 11) return '';
  return `https://wa.me/${d}?text=${encodeURIComponent('Hola, me interesa: ' + producto)}`;
}
const UNI = { kg: ['kg', 'kg'], litros: ['litros', 'litro'], cantidad: ['piezas', 'pieza'] };

function tarjeta(o) {
  const dinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  const u = UNI[o.unidad] || UNI.cantidad, mio = o.usuario_id === yo.id, wa = linkWhatsApp(o.contacto, o.producto);
  const imgs = Array.from({ length: o.n_fotos }, (_, i) => `<img src="/api/ofertas/${o.id}/foto/${i}" alt="Foto de ${limpiar(o.producto)}" loading="lazy">`).join('');
  return `<article class="oferta">
    ${o.n_fotos ? `<div class="galeria">${imgs}</div>` : `<div class="sinfoto">${o.tipo === 'local' ? '🍯' : '🍎'}</div>`}
    <div class="cuerpo">
      <span class="tag">${o.tipo === 'local' ? 'LOCAL' : 'MAYOREO'}</span>
      <h3>${limpiar(o.producto)}</h3>
      <div class="precio">${dinero.format(o.precio_mayoreo)} <small>/ ${u[1]}</small></div>
      <div class="meta">Disponible: <b>${o.cantidad}</b> ${u[0]}${o.minimo > 1 ? ` · Mínimo: ${o.minimo}` : ''}</div>
      <div class="meta">📍 ${limpiar(o.zona)}</div>
      ${o.descripcion ? `<div class="meta">${limpiar(o.descripcion)}</div>` : ''}
      <button class="vendedor" data-perfil="${o.usuario_id}">${limpiar(o.vendedor)} →</button>
      <div class="btns">
        ${!mio && wa ? `<a class="wa" href="${wa}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
        <a href="tel:${limpiar(o.contacto.replace(/[^\d+]/g, ''))}">📞 ${limpiar(o.contacto)}</a>
        ${mio ? `<button class="borrar" data-borrar="${o.id}">Eliminar</button>` : ''}
      </div>
    </div></article>`;
}

function render() {
  const q = $('buscar').value.trim().toLowerCase();
  const lista = datos.filter((o) => !q || `${o.producto} ${o.descripcion} ${o.vendedor} ${o.zona}`.toLowerCase().includes(q));
  const esPerfil = vista === 'perfil';
  $('perfil-cabecera').hidden = !esPerfil;
  if (esPerfil) {
    const mio = perfilInfo.id === yo.id;
    if (mio) perfilInfo.rol = yo.rol;
    $('perfil-avatar').textContent = perfilInfo.nombre[0].toUpperCase();
    $('perfil-nombre').textContent = mio ? 'Mi perfil' : perfilInfo.nombre;
    $('perfil-rol').textContent = rolNombre(perfilInfo.rol);
    $('perfil-resumen').textContent = `${mio ? yo.nombre + ' · ' : ''}${datos.length} ${datos.length === 1 ? 'publicación' : 'publicaciones'}`;
    $('btn-rol-perfil').hidden = !mio;
    $('btn-rol-perfil').textContent = `🔄 Cambiar a ${yo.rol === 'mayorista' ? 'Comprador' : 'Comerciante'}`;
    $('titulo-feed').textContent = mio ? 'Mis publicaciones' : `Publicaciones de ${perfilInfo.nombre}`;
  } else {
    $('titulo-feed').textContent = vista === 'local' ? 'Local · productos por unidad' : 'Mayoreo de fruta · precio por kilo';
  }
  const vacio = esPerfil ? (perfilInfo.id === yo.id ? 'Todavía no has publicado nada.' : 'Esta persona todavía no ha publicado nada.') : 'Aún no hay publicaciones aquí.';
  $('lista').innerHTML = lista.length ? lista.map(tarjeta).join('') : `<div class="vacio">${vacio}</div>`;
}
$('buscar').oninput = render;

$('lista').onclick = async (e) => {
  const p = e.target.dataset.perfil, b = e.target.dataset.borrar;
  if (p) return irA('perfil', p);
  if (b && confirm('¿Eliminar esta publicación? No se puede deshacer.')) {
    try { await api('/api/ofertas/' + b, 'DELETE'); irA(vista, perfilId); } catch (err) { alert(err.message); }
  }
};

/* ---------- Publicar ---------- */
function pintarTipo() {
  document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.tipo === tipoNuevo));
  $('caja-unidad').hidden = tipoNuevo === 'local';
  actualizarPrecio();
}
function actualizarPrecio() {
  const largo = tipoNuevo === 'local' ? 'pieza' : { kg: 'kilo', litros: 'litro', cantidad: 'pieza' }[$('o-unidad').value];
  $('lbl-precio').textContent = `Precio por ${largo} (MXN)`;
}
document.querySelector('.seg').onclick = (e) => { const b = e.target.closest('button'); if (b) { tipoNuevo = b.dataset.tipo; pintarTipo(); } };
$('o-unidad').onchange = actualizarPrecio;

$('btn-abrir-publicar').onclick = () => {
  tipoNuevo = vista === 'local' ? 'local' : 'mayoreo'; pintarTipo();
  $('msg-oferta').textContent = ''; $('modal-publicar').showModal();
};
$('btn-cancelar').onclick = () => $('modal-publicar').close();

function reducir(archivo) {
  return new Promise((ok, fallo) => {
    const url = URL.createObjectURL(archivo), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1000 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); fallo(new Error('No se pudo leer una imagen. Prueba con otra.')); };
    img.src = url;
  });
}
$('o-foto').onchange = async (e) => {
  fotos = [];
  try { for (const f of [...e.target.files].slice(0, 3)) fotos.push(await reducir(f)); $('msg-oferta').textContent = ''; }
  catch (err) { $('msg-oferta').textContent = err.message; }
  $('o-vistas').innerHTML = fotos.map((f) => `<img src="${f}" alt="Vista previa">`).join('');
};

$('btn-publicar').onclick = async () => {
  try {
    await api('/api/ofertas', 'POST', {
      tipo: tipoNuevo, producto: $('o-producto').value, descripcion: $('o-desc').value,
      cantidad: Number($('o-cantidad').value), minimo: Number($('o-minimo').value) || 1,
      unidad: $('o-unidad').value, zona: $('o-zona').value, precio_mayoreo: Number($('o-precio').value),
      contacto: $('o-contacto').value, fotos
    });
    ['o-producto', 'o-desc', 'o-cantidad', 'o-precio', 'o-zona', 'o-contacto', 'o-foto'].forEach((i) => ($(i).value = ''));
    $('o-minimo').value = 1; fotos = []; $('o-vistas').innerHTML = '';
    $('modal-publicar').close();
    irA('perfil', yo.id);
  } catch (e) { $('msg-oferta').textContent = e.message; }
};

/* ---------- Inicio ---------- */
pintarModo();
api('/api/yo').then((u) => { yo = u; if (u) mostrarApp(); else mostrarAcceso(); });
