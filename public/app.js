const $ = (id) => document.getElementById(id);
let yo = null;
let perfilActual = null;
let fotoDatos = '';

function aviso(texto, bien) {
  const m = $('msg-acceso');
  m.textContent = texto;
  m.className = bien ? 'ok' : 'error';
}

async function api(url, metodo = 'GET', datos) {
  const r = await fetch(url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: datos ? JSON.stringify(datos) : undefined
  });
  const j = await r.json();
  if (!r.ok) { const err = new Error(j.error || 'Algo salió mal.'); throw err; }
  return j;
}

const limpiar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function mostrarAcceso() {
  $('vista-acceso').hidden = false;
  $('vista-app').hidden = true;
  $('btn-abrir-publicar').hidden = true;
}

function mostrarApp() {
  $('vista-acceso').hidden = true;
  $('vista-app').hidden = false;
  $('quien').textContent = `${yo.nombre} · ${yo.rol === 'mayorista' ? 'Vendedor a mayoreo' : 'Consumidor'}`;
  $('btn-abrir-publicar').hidden = false;
  actualizarPrecio();
  perfilActual = null;
  cargarOfertas();
}

const UNIDADES = {
  kg: { cantidad: 'kg', precio: 'kg', largo: 'kilogramo' },
  litros: { cantidad: 'litros', precio: 'litro', largo: 'litro' },
  cantidad: { cantidad: 'piezas', precio: 'pieza', largo: 'pieza' }
};

function actualizarPrecio() {
  const u = UNIDADES[$('o-unidad').value];
  $('lbl-precio').textContent = `${yo && yo.rol === 'mayorista' ? 'Precio mayoreo' : 'Precio'} por ${u.largo} (MXN)`;
}

function dibujarOfertas(ofertas, vacio) {
  const dinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  if (!ofertas.length) {
    $('lista').innerHTML = `<div class="vacio">${vacio}</div>`;
    return;
  }
  $('lista').innerHTML = ofertas.map((o) => {
    const u = UNIDADES[o.unidad] || UNIDADES.cantidad;
    return `
    <article class="oferta">
      <div>
        <h3>${limpiar(o.producto)}</h3>
        <span class="quien"><button class="vendedor" data-perfil="${o.usuario_id}">${limpiar(o.vendedor)}</button><span class="etiqueta-rol">${o.rol_vendedor === 'mayorista' ? 'Mayoreo' : 'Consumidor'}</span> · ${limpiar(o.fecha.slice(0, 10))}</span>
      </div>
      <div class="precio">${dinero.format(o.precio_mayoreo)}<small>por ${u.precio}</small></div>
      ${o.descripcion ? `<p>${limpiar(o.descripcion)}</p>` : ''}
      ${o.tiene_foto ? `<img class="foto" src="/api/ofertas/${o.id}/foto" alt="Foto de ${limpiar(o.producto)}" loading="lazy">` : ''}
      <div class="pie">
        <span>Disponible: <b>${o.cantidad}</b> ${u.cantidad}</span>
        ${o.zona ? `<span class="zona">Zona: ${limpiar(o.zona)}</span>` : ''}
        <span class="contacto">Contacto: ${limpiar(o.contacto)}</span>
        ${o.usuario_id === yo.id ? `<button class="borrar" data-id="${o.id}">Eliminar</button>` : ''}
      </div>
    </article>`;
  }).join('');
}

async function cargarOfertas() {
  if (perfilActual !== null) return verPerfil(perfilActual);
  $('perfil-cabecera').hidden = true;
  $('titulo-feed').textContent = 'Ofertas recientes';
  dibujarOfertas(await api('/api/ofertas'), 'Todavía no hay ofertas publicadas.');
}

async function verPerfil(id) {
  const p = await api('/api/usuarios/' + id);
  perfilActual = p.usuario.id;
  const mio = p.usuario.id === yo.id;
  $('perfil-nombre').textContent = mio ? 'Mi perfil' : p.usuario.nombre;
  $('perfil-rol').textContent = p.usuario.rol === 'mayorista' ? 'Vendedor a mayoreo' : 'Consumidor';
  $('perfil-resumen').textContent = mio ? `${yo.nombre} · ${p.ofertas.length} ${p.ofertas.length === 1 ? 'publicación' : 'publicaciones'}`
    : `${p.ofertas.length} ${p.ofertas.length === 1 ? 'publicación' : 'publicaciones'}`;
  $('perfil-cabecera').hidden = false;
  $('titulo-feed').textContent = mio ? 'Mis publicaciones' : `Publicaciones de ${p.usuario.nombre}`;
  dibujarOfertas(p.ofertas, mio ? 'Todavía no has publicado nada.' : 'Esta persona todavía no ha publicado nada.');
  window.scrollTo(0, 0);
}

function pestana(login) {
  $('form-login').hidden = !login;
  $('form-registro').hidden = login;
  $('tab-login').classList.toggle('activa', login);
  $('tab-registro').classList.toggle('activa', !login);
  aviso('', false);
}
$('tab-login').onclick = () => pestana(true);
$('tab-registro').onclick = () => pestana(false);

$('btn-login').onclick = async () => {
  try {
    yo = await api('/api/login', 'POST', { email: $('l-email').value, password: $('l-pass').value });
    mostrarApp();
  } catch (e) {
    aviso(e.message, false);
  }
};

$('btn-registro').onclick = async () => {
  try {
    const r = await api('/api/registro', 'POST', {
      nombre: $('r-nombre').value,
      email: $('r-email').value,
      password: $('r-pass').value,
      rol: document.querySelector('input[name=rol]:checked').value
    });
    pestana(true);
    $('l-email').value = r.email;
    aviso('Cuenta creada. Ya puedes iniciar sesión.', true);
  } catch (e) { aviso(e.message, false); }
};

$('btn-salir').onclick = async () => { await api('/api/logout', 'POST'); yo = null; perfilActual = null; mostrarAcceso(); };

$('btn-publicar').onclick = async () => {
  try {
    await api('/api/ofertas', 'POST', {
      producto: $('o-producto').value,
      descripcion: $('o-desc').value,
      cantidad: Number($('o-cantidad').value),
      unidad: $('o-unidad').value,
      zona: $('o-zona').value,
      precio_mayoreo: Number($('o-precio').value),
      contacto: $('o-contacto').value,
      foto: fotoDatos
    });
    ['o-producto', 'o-desc', 'o-cantidad', 'o-precio', 'o-zona', 'o-contacto', 'o-foto'].forEach((i) => ($(i).value = ''));
    fotoDatos = '';
    $('o-vista').hidden = true;
    $('msg-oferta').textContent = '';
    $('modal-publicar').close();
    cargarOfertas();
  } catch (e) { $('msg-oferta').textContent = e.message; }
};

$('btn-abrir-publicar').onclick = () => { $('msg-oferta').textContent = ''; $('modal-publicar').showModal(); };
$('btn-cancelar').onclick = () => $('modal-publicar').close();
$('o-unidad').onchange = actualizarPrecio;

$('o-foto').onchange = (e) => {
  const archivo = e.target.files[0];
  fotoDatos = '';
  $('o-vista').hidden = true;
  if (!archivo) return;
  const url = URL.createObjectURL(archivo);
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, 1000 / Math.max(img.width, img.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(img.width * k);
    lienzo.height = Math.round(img.height * k);
    const ctx = lienzo.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    fotoDatos = lienzo.toDataURL('image/jpeg', 0.8);
    $('o-vista').src = fotoDatos;
    $('o-vista').hidden = false;
    URL.revokeObjectURL(url);
  };
  img.onerror = () => {
    $('msg-oferta').textContent = 'No se pudo leer esa imagen. Prueba con otra.';
    URL.revokeObjectURL(url);
  };
  img.src = url;
};

$('quien').onclick = () => verPerfil(yo.id);
$('btn-volver').onclick = () => { perfilActual = null; cargarOfertas(); window.scrollTo(0, 0); };

$('lista').onclick = async (e) => {
  if (e.target.dataset.perfil) {
    try { await verPerfil(e.target.dataset.perfil); } catch (err) { alert(err.message); }
    return;
  }
  const id = e.target.dataset.id;
  if (id && confirm('¿Eliminar esta publicación? No se puede deshacer.')) { await api('/api/ofertas/' + id, 'DELETE'); cargarOfertas(); }
};

api('/api/yo').then((u) => {
  yo = u;
  if (u) return mostrarApp();
  mostrarAcceso();
});
