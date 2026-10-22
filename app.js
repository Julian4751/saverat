'use strict';

/* ---------- Datos de ejemplo (no son promociones reales) ---------- */
const RUBROS = {
    'Supermercado': 'fisico',
    'Farmacia': 'fisico',
    'Combustible': 'fisico',
    'Juegos y software': 'digital',
    'Suscripciones': 'digital'
};
const TIPOS = { fisico: 'Compra física', digital: 'Compra digital' };
const rubrosDe = tipo => Object.keys(RUBROS).filter(r => RUBROS[r] === tipo);

const BENEFICIOS = [
    { id: 'mp', nombre: 'Mercado Pago', ini: 'MP', rubro: 'Supermercado', tasa: 0.15, tope: 3000, usado: 800 },
    { id: 'bn', nombre: 'Banco Nación', ini: 'BN', rubro: 'Farmacia', tasa: 0.10, tope: 3000, usado: 450 },
    { id: 'bp', nombre: 'Banco Provincia', ini: 'BP', rubro: 'Combustible', tasa: 0.10, tope: 4000, usado: 0 },
    { id: 'dns', nombre: 'Cuenta DNI', ini: 'CD', rubro: 'Supermercado', tasa: 0.20, tope: 5000, usado: 3600 },
    { id: 'naranja', nombre: 'Naranja X', ini: 'NX', rubro: 'Juegos y software', tasa: 0.25, tope: 2500, usado: 2350 },
    { id: 'ppay', nombre: 'Personal Pay', ini: 'PP', rubro: 'Suscripciones', tasa: 0.20, tope: 2000, usado: 300 },
    { id: 'santander', nombre: 'Santander', ini: 'SA', rubro: 'Supermercado', tasa: 0.10, tope: 4000, usado: 1000 },
    { id: 'uala', nombre: 'Ualá', ini: 'UA', rubro: 'Juegos y software', tasa: 0.10, tope: 2000, usado: 0 },
    { id: 'modo', nombre: 'MODO', ini: 'MO', rubro: 'Suscripciones', tasa: 0.15, tope: 2500, usado: 500 }
];

const MEDIOS_INICIALES = ['mp', 'bn', 'dns', 'naranja', 'modo'];
// Reintegros ya acumulados con los medios iniciales (dato de ejemplo)
const AHORRO_INICIAL = MEDIOS_INICIALES.reduce((s, id) => s + BENEFICIOS.find(b => b.id === id).usado, 0);
const KEY = 'orquestador-v1';

/* ---------- Estado ---------- */
function estadoInicial() {
    const usados = {};
    BENEFICIOS.forEach(b => { usados[b.id] = b.usado; });
    const recordatorios = [
        { id: 'r1', lugar: 'Supermercado del barrio', tipo: 'fisico', rubro: 'Supermercado', dias: [6], hora: '10:00', monto: 12000, activo: true, ultimo: '' }
    ];
    return { medios: [...MEDIOS_INICIALES], usados, historial: [], recordatorios, ahorrado: AHORRO_INICIAL };
}

function cargar() {
    const base = estadoInicial();
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
            const guardado = JSON.parse(raw);
            const d = Object.assign(base, guardado);
            // Migración de versiones anteriores: sin "ahorrado" ni "tipo" de hábito
            if (typeof guardado.ahorrado !== 'number') {
                d.ahorrado = d.medios.reduce((s, id) => s + (d.usados[id] || 0), 0);
            }
            d.recordatorios.forEach(a => { if (!a.tipo) a.tipo = RUBROS[a.rubro] || 'fisico'; });
            return d;
        }
    } catch (e) { /* sin almacenamiento: se usa memoria */ }
    return base;
}

function guardar() {
    try {
        localStorage.setItem(KEY, JSON.stringify(datos));
    } catch (e) { /* ignorar */ }
}

let datos = cargar();
const ui = {
    tab: 'tablero',
    filtro: 'todos',
    consulta: { rubro: 'Supermercado', monto: 12000 },
    registro: { rubro: 'Supermercado', monto: 12000, medio: null, aplicado: true },
    aviso: { lugar: '', tipo: 'fisico', rubro: 'Supermercado', dias: [], hora: '10:00' },
    modal: null,
    previo: null,
    cambio: null
};

/* ---------- Utilidades ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const vista = $('#view');

const pesos = n => '$' + Math.round(n).toLocaleString('es-AR');
const parseMonto = v => Number(String(v).replace(/\D/g, '')) || 0;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const restante = b => Math.max(0, b.tope - datos.usados[b.id]);
const pct = b => Math.min(100, Math.round((datos.usados[b.id] / b.tope) * 100));
const activos = () => BENEFICIOS.filter(b => datos.medios.includes(b.id));
const restanteTotal = () => activos().reduce((s, b) => s + restante(b), 0);
const tasaTxt = b => Math.round(b.tasa * 100) + '%';

// Reintegro que se obtiene por un monto, respetando el tope restante (siempre en pesos enteros)
const reintegroPara = (b, monto) => Math.round(Math.min(monto * b.tasa, restante(b)));

function opciones(rubro, monto) {
    return activos()
        .filter(b => b.rubro === rubro)
        .map(b => ({ b, gana: reintegroPara(b, monto) }))
        .sort((x, y) => y.gana - x.gana);
}
const mejorPara = (rubro, monto) => opciones(rubro, monto)[0] || null;

function avisar(texto) {
    const t = $('#toast');
    t.textContent = texto;
    t.classList.add('show');
    clearTimeout(avisar.id);
    avisar.id = setTimeout(() => t.classList.remove('show'), 2600);
}

function irA(tab) {
    ui.tab = tab;
    render();
    window.scrollTo(0, 0);
}

// Aplica una compra: suma el reintegro al tope usado y al total ahorrado, y guarda en localStorage
function registrarCompra(b, monto, rubro, aplicado = true) {
    const antes = { ahorrado: datos.ahorrado, restante: restanteTotal() };
    const gana = aplicado ? reintegroPara(b, monto) : 0;
    datos.usados[b.id] += gana;
    datos.ahorrado += gana;
    datos.historial.push({ rubro, nombre: b.nombre, monto, gana });
    guardar();
    ui.cambio = { gana, medio: b.nombre, antes };
    return gana;
}

/* ---------- Tablero ---------- */
function animarNumero(el, desde, hasta) {
    if (!el || desde === hasta) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t0 = performance.now();
    const dur = 900;
    el.textContent = pesos(desde);
    const paso = t => {
        const p = Math.min(1, (t - t0) / dur);
        const suave = 1 - Math.pow(1 - p, 3);
        el.textContent = pesos(desde + (hasta - desde) * suave);
        if (p < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
}

function vistaTablero() {
    const cambio = ui.cambio;
    ui.cambio = null;
    const total = restanteTotal();
    const grupos = [['fisico', 'Compras físicas'], ['digital', 'Digital y gaming']];
    const filtros = [['todos', 'Todos'], ...grupos];

    const secciones = grupos
        .filter(([k]) => ui.filtro === 'todos' || ui.filtro === k)
        .map(([k, titulo]) => {
            const lista = activos().filter(b => RUBROS[b.rubro] === k);
            return `
        <section aria-label="${titulo}">
          <h2 class="section-title">${titulo}</h2>
          <div class="cards">
            ${lista.length ? lista.map(tarjeta).join('') : `<div class="empty">No tenés medios activos con beneficios de este tipo. Sumalos en <button type="button" class="link" data-ir="medios">Medios</button>.</div>`}
          </div>
        </section>`;
        }).join('');

    const deltaA = cambio ? (cambio.gana ? `+${pesos(cambio.gana)} de tu última compra` : 'Última compra sin reintegro') : 'Reintegros acumulados';
    const deltaR = cambio ? (cambio.gana ? `−${pesos(cambio.gana)} de tus topes` : 'Tope alcanzado') : 'Sumando tus medios activos';

    vista.innerHTML = `
    <header>
      <p class="eyebrow">Tablero</p>
      <h1>Tus beneficios del mes</h1>
    </header>
    <section class="metrics" aria-label="Resumen">
      <div class="metric main ${cambio ? 'flash' : ''}" role="group" aria-label="Total ahorrado: ${pesos(datos.ahorrado)}">
        <div class="label">Total ahorrado</div>
        <div class="valor" id="m-ahorrado" aria-hidden="true">${pesos(datos.ahorrado)}</div>
        <div class="delta ${cambio ? 'cambio' : ''}">${deltaA}</div>
      </div>
      <div class="metric ${cambio ? 'flash' : ''}" role="group" aria-label="Tope restante total: ${pesos(total)}">
        <div class="label">Tope restante total</div>
        <div class="valor" id="m-restante" aria-hidden="true">${pesos(total)}</div>
        <div class="delta ${cambio ? 'cambio' : ''}">${deltaR}</div>
      </div>
    </section>
    ${tarjetaHoy()}
    <div class="chips" role="group" aria-label="Filtrar por tipo">
      ${filtros.map(([k, t]) => `<button type="button" class="chip" data-filtro="${k}" aria-pressed="${ui.filtro === k}">${t}</button>`).join('')}
    </div>
    ${secciones}`;

    if (cambio) {
        animarNumero($('#m-ahorrado'), cambio.antes.ahorrado, datos.ahorrado);
        animarNumero($('#m-restante'), cambio.antes.restante, total);
    }
}

function tarjeta(b) {
    const p = pct(b);
    const rest = restante(b);
    const casi = p >= 90;
    return `
    <article class="card">
      <div class="row">
        <div class="avatar" aria-hidden="true">${b.ini}</div>
        <div class="grow"><div class="name">${b.nombre}</div><div class="small">${b.rubro}</div></div>
        <div class="badge">${tasaTxt(b)}</div>
      </div>
      <div class="bar" role="img" aria-label="${p}% del tope usado"><i class="${casi ? 'warn' : ''}" style="width:${p}%"></i></div>
      <div class="meta">
        <span>Usado <b>${pesos(datos.usados[b.id])}</b> de ${pesos(b.tope)}</span>
        <span>${rest === 0 ? '<b class="warn">Tope alcanzado</b>' : `Restante <b class="${casi ? 'warn' : ''}">${pesos(rest)}</b>`}</span>
      </div>
    </article>`;
}

/* ---------- Consultar antes de pagar ---------- */
function vistaConsultar() {
    vista.innerHTML = `
    <header>
      <p class="eyebrow">Consultar</p>
      <h1>¿Qué vas a comprar?</h1>
    </header>
    <div class="chips" role="group" aria-label="Rubro">
      ${Object.keys(RUBROS).map(r => `<button type="button" class="chip" data-rubro="${r}" aria-pressed="${ui.consulta.rubro === r}">${r}</button>`).join('')}
    </div>
    <div class="amount">
      <label for="c-monto" class="small">Monto aproximado</label>
      <input id="c-monto" inputmode="numeric" autocomplete="off" value="${ui.consulta.monto}">
    </div>
    <div id="resultados" class="cards"></div>`;
    actualizarResultados();
}

function actualizarResultados() {
    const { rubro, monto } = ui.consulta;
    const op = opciones(rubro, monto);
    const cont = $('#resultados');

    if (!op.length) {
        cont.innerHTML = `<div class="empty">Ninguno de tus medios tiene beneficios en ${rubro}. Sumá más en <button type="button" class="link" data-ir="medios">Medios</button>.</div>`;
        return;
    }

    const [mejor, ...otras] = op;
    const b = mejor.b;
    const alcanza = restante(b) >= monto * b.tasa;
    cont.innerHTML = `
    <h2 class="section-title">Mejor opción para esta compra</h2>
    <article class="card best">
      <div class="row">
        <div class="avatar" aria-hidden="true">${b.ini}</div>
        <div class="grow"><div class="name">${b.nombre}</div><div class="small">${tasaTxt(b)} de reintegro</div></div>
        <div class="gain"><strong>${pesos(mejor.gana)}</strong><span class="small">de reintegro</span></div>
      </div>
      <div class="bar" role="img" aria-label="${pct(b)}% del tope usado"><i style="width:${pct(b)}%"></i></div>
      <div class="small">${alcanza ? `Te quedan ${pesos(restante(b))} de tope: alcanza para esta compra.` : `Te quedan ${pesos(restante(b))} de tope: no alcanza para el reintegro completo.`}</div>
      <button type="button" class="btn" data-pagar="${b.id}">Voy a pagar con este</button>
    </article>
    ${otras.length ? `<h2 class="section-title">Otras opciones</h2>` + otras.map(o => `
      <article class="card">
        <div class="row">
          <div class="avatar" aria-hidden="true">${o.b.ini}</div>
          <div class="grow"><div class="name">${o.b.nombre} · ${tasaTxt(o.b)}</div><div class="small">Quedan ${pesos(restante(o.b))} de tope</div></div>
          <div class="name">${pesos(o.gana)}</div>
        </div>
      </article>`).join('') : ''}`;
}

/* ---------- Registrar compra ---------- */
function medioElegible() {
    const r = ui.registro;
    const opc = activos().filter(b => b.rubro === r.rubro);
    if (!opc.some(b => b.id === r.medio)) r.medio = opc.length ? opc[0].id : null;
    return opc;
}

function vistaRegistrar() {
    const r = ui.registro;
    const opc = medioElegible();
    vista.innerHTML = `
    <header>
      <p class="eyebrow">Registrar</p>
      <h1>Anotá tu compra</h1>
    </header>
    <div class="amount">
      <label for="r-monto" class="small">Monto pagado</label>
      <input id="r-monto" inputmode="numeric" autocomplete="off" value="${r.monto}">
    </div>
    <div class="field">
      <label for="r-rubro">Rubro</label>
      <select id="r-rubro" class="input">
        ${Object.keys(RUBROS).map(x => `<option ${x === r.rubro ? 'selected' : ''}>${x}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <span class="lbl" id="r-medio-lbl">Medio de pago</span>
      <div class="chips" role="group" aria-labelledby="r-medio-lbl">
        ${opc.length ? opc.map(b => `<button type="button" class="chip" data-medio="${b.id}" aria-pressed="${r.medio === b.id}">${b.nombre}</button>`).join('') : `<div class="empty">Ninguno de tus medios tiene beneficios en este rubro. Probá en <button type="button" class="link" data-ir="medios">Medios</button>.</div>`}
      </div>
    </div>
    <div class="switch-row">
      <div><div class="name" id="r-sw-lbl">Se aplicó el descuento</div><div class="small">Sumá el reintegro a la barra del tope</div></div>
      <button type="button" class="switch" role="switch" aria-labelledby="r-sw-lbl" aria-checked="${r.aplicado}" id="r-sw"><i></i></button>
    </div>
    <div id="preview"></div>
    <button type="button" class="btn" id="r-guardar" ${opc.length ? '' : 'disabled'}>Guardar compra</button>
    <section aria-label="Últimas compras">
      <h2 class="section-title">Últimas compras registradas</h2>
      <div id="historial"></div>
    </section>`;
    actualizarPreview();
    pintarHistorial();
}

function actualizarPreview() {
    const r = ui.registro;
    const b = BENEFICIOS.find(x => x.id === r.medio);
    const cont = $('#preview');
    if (!b) { cont.innerHTML = ''; return; }
    const gana = r.aplicado ? reintegroPara(b, r.monto) : 0;
    const antes = datos.usados[b.id];
    const despues = antes + gana;
    const pAntes = Math.min(100, (antes / b.tope) * 100);
    const pDespues = Math.min(100, (despues / b.tope) * 100);
    const completo = r.aplicado ? Math.round(r.monto * b.tasa) : 0;
    cont.innerHTML = `
    <div class="summary">
      <div class="label">Tope de ${b.nombre}</div>
      <div class="meta" style="color:#bfe6d8"><span>${pesos(antes)} → ${pesos(despues)}</span><span>de ${pesos(b.tope)}</span></div>
      <div class="bar" role="img" aria-label="Tope usado antes y después de la compra">
        <i class="preview" style="width:${pDespues}%"></i><i style="background:#fff;width:${pAntes}%"></i>
      </div>
      <div class="note">${r.aplicado
            ? `Esta compra suma ${pesos(gana)}` + (completo > gana ? ` (el ${tasaTxt(b)} serían ${pesos(completo)}, pero llegás al tope)` : '') + `. Quedan ${pesos(b.tope - despues)}.`
            : 'Sin descuento: el tope no cambia.'}</div>
    </div>`;
}

function pintarHistorial() {
    const h = datos.historial.slice(-4).reverse();
    $('#historial').innerHTML = h.length
        ? h.map(x => `<div class="hist"><span>${esc(x.rubro)} · ${esc(x.nombre)}</span><b>${pesos(x.monto)}${x.gana ? ` · +${pesos(x.gana)}` : ''}</b></div>`).join('')
        : '<div class="empty">Todavía no registraste compras.</div>';
}

function guardarCompra() {
    const r = ui.registro;
    const b = BENEFICIOS.find(x => x.id === r.medio);
    if (!b || r.monto <= 0) { avisar('Ingresá un monto mayor a cero'); return; }
    const gana = registrarCompra(b, r.monto, r.rubro, r.aplicado);
    avisar(gana ? `Listo: sumaste ${pesos(gana)} a ${b.nombre}` : 'Compra registrada');
    irA('tablero');
}

/* ---------- Hábitos y avisos ---------- */
const DIAS = [
    { n: 1, corto: 'Lun', largo: 'lunes' }, { n: 2, corto: 'Mar', largo: 'martes' },
    { n: 3, corto: 'Mié', largo: 'miércoles' }, { n: 4, corto: 'Jue', largo: 'jueves' },
    { n: 5, corto: 'Vie', largo: 'viernes' }, { n: 6, corto: 'Sáb', largo: 'sábado' },
    { n: 0, corto: 'Dom', largo: 'domingo' }
];

const diasTxt = dias => dias.length === 7 ? 'Todos los días' : DIAS.filter(d => dias.includes(d.n)).map(d => d.corto).join(', ');
const minutos = h => { const [x, y] = String(h).split(':').map(Number); return x * 60 + y; };
const hoyStr = (f = new Date()) => f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0');
const habito = id => datos.recordatorios.find(x => x.id === id);

function consejo(a) {
    const m = mejorPara(a.rubro, a.monto);
    if (!m) return `Ninguno de tus medios tiene beneficios en ${a.rubro}.`;
    return `Pagá con ${m.b.nombre} (${tasaTxt(m.b)}): reintegro estimado de ${pesos(m.gana)}. Te quedan ${pesos(restante(m.b))} de tope.`;
}

const abreviar = (s, n = 28) => s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;

// Texto ultra-conciso de la notificación: va directo al punto y termina con la pregunta
function textoAviso(a) {
    const m = mejorPara(a.rubro, a.monto);
    const lugar = abreviar(a.lugar);
    if (!m) return `Hoy en ${lugar}: sin beneficios activos.`;
    if (m.gana === 0) return `Hoy en ${lugar}: topes agotados.`;
    return `¡Hoy tenés ${tasaTxt(m.b)} en ${lugar}!`;
}

// Botón que indica el medio de pago con el descuento y abre el campo "Monto gastado"
function botonPago(a, clase = 'btn') {
    const m = mejorPara(a.rubro, a.monto);
    return m ? `<button type="button" class="${clase}" data-ya-compre="${a.id}">Pagué con ${esc(m.b.nombre)}</button>` : '';
}

function tarjetaHoy() {
    const hoy = datos.recordatorios.filter(a => a.activo && a.dias.includes(new Date().getDay()));
    if (!hoy.length) return '';
    return `
    <section class="hoy" aria-label="Compras de hoy">
      <div class="small"><b>Hoy te toca comprar</b></div>
      ${hoy.map(a => `
        <div class="hoy-item">
          <div><div class="name">${esc(a.lugar)} · ${esc(a.hora)}</div><div class="small">${esc(consejo(a))}</div></div>
          <div class="acts">
            <button type="button" class="btn ghost" data-ver-beneficio="${a.id}">Ver beneficio</button>
            ${botonPago(a)}
          </div>
        </div>`).join('')}
    </section>`;
}

function permisoHtml() {
    if (!('Notification' in window)) {
        return `<div class="perm"><div class="name">Notificaciones del sistema no disponibles</div><div class="small">Tu navegador no las soporta. Igual vas a ver el aviso dentro de la app.</div></div>`;
    }
    const p = Notification.permission;
    if (p === 'granted') {
        return `<div class="perm"><div class="name">Notificaciones activadas</div><div class="small">Te avisamos el día y la hora que elijas, con el medio de pago óptimo.</div></div>`;
    }
    if (p === 'denied') {
        return `<div class="perm"><div class="name">Notificaciones bloqueadas</div><div class="small">Habilitalas desde los permisos del sitio en tu navegador. Mientras tanto, el aviso aparece dentro de la app.</div></div>`;
    }
    return `<div class="perm"><div class="name">Activá las notificaciones</div><div class="small">Así el aviso te aparece en el celular el día de tu compra.</div><button type="button" class="btn" data-permiso>Activar notificaciones</button></div>`;
}

function tarjetaAviso(a) {
    return `
    <article class="card">
      <div class="row">
        <div class="avatar" aria-hidden="true">${esc(a.lugar.slice(0, 2).toUpperCase())}</div>
        <div class="grow"><div class="name">${esc(a.lugar)}</div><div class="small">${TIPOS[a.tipo] || ''} · ${esc(a.rubro)} · ${diasTxt(a.dias)} · ${esc(a.hora)}</div></div>
        <button type="button" class="switch" role="switch" aria-label="Aviso activo para ${esc(a.lugar)}" aria-checked="${a.activo}" data-aviso-sw="${a.id}"><i></i></button>
      </div>
      <div class="small">${esc(consejo(a))}</div>
      <div class="acts">
        <button type="button" class="btn ghost" data-aviso-test="${a.id}">Probar aviso</button>
        <button type="button" class="btn danger" data-aviso-del="${a.id}">Eliminar</button>
      </div>
    </article>`;
}

function vistaAvisos() {
    const f = ui.aviso;
    const rubros = rubrosDe(f.tipo);
    if (!rubros.includes(f.rubro)) f.rubro = rubros[0];
    vista.innerHTML = `
    <header>
      <p class="eyebrow">Avisos</p>
      <h1>Tus hábitos de compra</h1>
      <p class="sub">Cargá dónde y cuándo comprás seguido. Ese día te avisamos y, con un toque, registrás cuánto gastaste.</p>
    </header>
    ${permisoHtml()}
    <section class="card" aria-label="Nuevo hábito de compra">
      <div class="field">
        <label for="a-lugar">Nombre o tienda</label>
        <input id="a-lugar" class="input" placeholder="${f.tipo === 'digital' ? 'Ej: Steam, PlayStation Store' : 'Ej: Supermercado del barrio'}" autocomplete="off" value="${esc(f.lugar)}">
      </div>
      <div class="field">
        <span class="lbl" id="a-tipo-lbl">Tipo de compra</span>
        <div class="chips" role="group" aria-labelledby="a-tipo-lbl">
          ${Object.entries(TIPOS).map(([k, t]) => `<button type="button" class="chip" data-tipo="${k}" aria-pressed="${f.tipo === k}">${t}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label for="a-rubro">Rubro</label>
        <select id="a-rubro" class="input">${rubros.map(x => `<option ${x === f.rubro ? 'selected' : ''}>${x}</option>`).join('')}</select>
      </div>
      <div class="field">
        <span class="lbl" id="a-dias-lbl">Días de compra</span>
        <div class="dias" role="group" aria-labelledby="a-dias-lbl">
          ${DIAS.map(d => `<button type="button" class="chip" data-dia="${d.n}" aria-label="${d.largo}" aria-pressed="${f.dias.includes(d.n)}">${d.corto}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label for="a-hora">Horario del aviso</label>
        <input id="a-hora" class="input" type="time" value="${esc(f.hora)}">
      </div>
      <button type="button" class="btn" data-aviso-add>Guardar hábito</button>
    </section>
    <section aria-label="Hábitos cargados">
      <h2 class="section-title">Tus hábitos</h2>
      <div class="cards">
        ${datos.recordatorios.length ? datos.recordatorios.map(tarjetaAviso).join('') : '<div class="empty">Todavía no cargaste ningún hábito de compra.</div>'}
      </div>
    </section>`;
}

function agregarAviso() {
    const f = ui.aviso;
    const lugar = f.lugar.trim();
    if (!lugar) return avisar('Escribí el nombre o la tienda');
    if (!f.dias.length) return avisar('Elegí al menos un día');
    if (!f.hora) return avisar('Elegí el horario del aviso');
    const ahora = new Date();
    const yaPaso = ahora.getHours() * 60 + ahora.getMinutes() >= minutos(f.hora);
    datos.recordatorios.push({
        id: 'r' + Date.now(), lugar, tipo: f.tipo, rubro: f.rubro, dias: [...f.dias].sort(), hora: f.hora,
        monto: 10000, activo: true, ultimo: yaPaso ? hoyStr(ahora) : ''
    });
    guardar();
    ui.aviso = { lugar: '', tipo: f.tipo, rubro: f.rubro, dias: [], hora: f.hora };
    avisar('Hábito guardado');
    vistaAvisos();
}

function pedirPermiso() {
    if (!('Notification' in window)) return avisar('Tu navegador no soporta notificaciones');
    Promise.resolve(Notification.requestPermission())
        .then(() => { if (ui.tab === 'avisos') vistaAvisos(); })
        .catch(() => { });
}

/* Paso 1 del aviso: banner con dos acciones */
function disparar(a) {
    const cuerpo = textoAviso(a);
    const b = $('#banner');
    b.innerHTML = `
    <div class="banner-top">
      <strong>Orquestador</strong>
      <button type="button" class="cerrar" data-aviso-cerrar aria-label="Cerrar aviso"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>
    <p>${esc(cuerpo)}</p>
    <div class="acciones">
      <button type="button" class="ver" data-ver-beneficio="${a.id}">Ver beneficio</button>
      ${botonPago(a, 'ya')}
    </div>`;
    b.hidden = false;
    try {
        if ('Notification' in window && Notification.permission === 'granted') {
            const n = new Notification('Orquestador', { body: cuerpo, tag: 'aviso-' + a.id });
            n.onclick = () => { window.focus(); abrirModal('beneficio', a.id); n.close(); };
        }
    } catch (e) { /* algunos navegadores móviles exigen un service worker */ }
}

function chequear() {
    const ahora = new Date();
    const hoy = hoyStr(ahora);
    const min = ahora.getHours() * 60 + ahora.getMinutes();
    let cambio = false;
    datos.recordatorios.forEach(a => {
        if (a.activo && a.dias.includes(ahora.getDay()) && a.ultimo !== hoy && min >= minutos(a.hora)) {
            a.ultimo = hoy;
            cambio = true;
            disparar(a);
        }
    });
    if (cambio) guardar();
}

/* ---------- Modal: "Ver beneficio" y registro del monto gastado ---------- */
function abrirModal(tipo, id) {
    const a = habito(id);
    if (!a) return;
    if (!ui.modal) ui.previo = document.activeElement;
    const m = mejorPara(a.rubro, a.monto);
    ui.modal = { tipo, id, medio: m ? m.b.id : null };
    $('#banner').hidden = true;
    pintarModal();
}

function cerrarModal(restaurarFoco = true) {
    if (!ui.modal) return;
    ui.modal = null;
    const cont = $('#modal');
    cont.hidden = true;
    cont.innerHTML = '';
    document.body.style.overflow = '';
    if (restaurarFoco && ui.previo && document.contains(ui.previo)) ui.previo.focus();
    ui.previo = null;
}

function cuerpoBeneficio(a) {
    const op = opciones(a.rubro, a.monto);
    if (!op.length) {
        return `<p class="small">Ninguno de tus medios activos tiene beneficios en ${esc(a.rubro)}.</p>
      <button type="button" class="btn ghost" data-modal-cerrar>Cerrar</button>`;
    }
    const [mejor, ...otras] = op;
    const b = mejor.b;
    return `
    <p class="small">Para tu compra habitual de ${pesos(a.monto)} en ${esc(a.lugar)}.</p>
    <article class="card best">
      <div class="row">
        <div class="avatar" aria-hidden="true">${b.ini}</div>
        <div class="grow"><div class="name">${b.nombre}</div><div class="small">${tasaTxt(b)} de reintegro</div></div>
        <div class="gain"><strong>${pesos(mejor.gana)}</strong><span class="small">de reintegro</span></div>
      </div>
      <div class="bar" role="img" aria-label="${pct(b)}% del tope usado"><i style="width:${pct(b)}%"></i></div>
      <div class="meta"><span>Usado <b>${pesos(datos.usados[b.id])}</b> de ${pesos(b.tope)}</span><span>Restante <b>${pesos(restante(b))}</b></span></div>
    </article>
    ${otras.length ? `<h3 class="section-title">Otras opciones</h3>` + otras.map(o => `
      <div class="card"><div class="row">
        <div class="avatar" aria-hidden="true">${o.b.ini}</div>
        <div class="grow"><div class="name">${o.b.nombre} · ${tasaTxt(o.b)}</div><div class="small">Quedan ${pesos(restante(o.b))} de tope</div></div>
        <div class="name">${pesos(o.gana)}</div>
      </div></div>`).join('') : ''}
    ${botonPago(a)}`;
}

function cuerpoMonto(a) {
    const b = BENEFICIOS.find(x => x.id === ui.modal.medio);
    if (!b) {
        return `<p class="small">Ninguno de tus medios activos tiene beneficios en ${esc(a.rubro)}, así que no hay reintegro para sumar.</p>
      <button type="button" class="btn ghost" data-modal-cerrar>Cerrar</button>`;
    }
    return `
    <p class="small">Compra en ${esc(a.lugar)}. El reintegro se suma a <b>${b.nombre}</b> (${tasaTxt(b)}).</p>
    <form id="f-monto" novalidate>
      <div class="amount">
        <label for="m-monto" class="small">Monto gastado</label>
        <input id="m-monto" inputmode="numeric" autocomplete="off" placeholder="0" aria-describedby="m-preview m-error">
      </div>
      <p class="error" id="m-error" role="alert"></p>
      <div class="small" id="m-preview"></div>
      <button type="submit" class="btn">Confirmar</button>
    </form>`;
}

function pintarModal() {
    const m = ui.modal;
    const a = habito(m.id);
    if (!a) return cerrarModal();
    const titulo = m.tipo === 'beneficio' ? 'Tu mejor opción hoy' : '¿Cuánto gastaste?';
    const cont = $('#modal');
    cont.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="m-titulo">
      <div class="sheet-head">
        <h2 id="m-titulo" tabindex="-1">${titulo}</h2>
        <button type="button" class="x" data-modal-cerrar aria-label="Cerrar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
      ${m.tipo === 'beneficio' ? cuerpoBeneficio(a) : cuerpoMonto(a)}
    </div>`;
    cont.hidden = false;
    document.body.style.overflow = 'hidden';
    (m.tipo === 'monto' && $('#m-monto') ? $('#m-monto') : $('#m-titulo')).focus();
}

function actualizarPreviewMonto() {
    const b = BENEFICIOS.find(x => x.id === ui.modal.medio);
    const monto = parseMonto($('#m-monto').value);
    $('#m-error').textContent = '';
    const p = $('#m-preview');
    if (!b || !monto) { p.textContent = ''; return; }
    const gana = reintegroPara(b, monto);
    const completo = Math.round(monto * b.tasa);
    p.textContent = `Reintegro: ${pesos(gana)}`
        + (gana < completo ? ` (el ${tasaTxt(b)} serían ${pesos(completo)}, pero te quedan ${pesos(restante(b))} de tope)` : '')
        + `. Tope restante de ${b.nombre} después: ${pesos(restante(b) - gana)}.`;
}

/* Paso 2 del aviso: confirmar el monto gastado */
function confirmarMonto() {
    const a = habito(ui.modal.id);
    const b = BENEFICIOS.find(x => x.id === ui.modal.medio);
    const monto = parseMonto($('#m-monto').value);
    if (!a || !b) return;
    if (monto <= 0) {
        $('#m-error').textContent = 'Ingresá el monto gastado';
        $('#m-monto').focus();
        return;
    }
    a.monto = monto; // el hábito recuerda tu gasto habitual para estimar mejor la próxima vez
    const gana = registrarCompra(b, monto, a.rubro, true);
    cerrarModal(false);
    $('#banner').hidden = true;
    avisar(gana ? `Sumaste ${pesos(gana)} a ${b.nombre}` : `El tope de ${b.nombre} ya está alcanzado: sin reintegro`);
    irA('tablero');
    const h1 = $('h1', vista);
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
}

/* ---------- Mis medios ---------- */
function vistaMedios() {
    vista.innerHTML = `
    <header>
      <p class="eyebrow">Medios</p>
      <h1>¿Qué bancos y billeteras tenés?</h1>
      <p class="sub">Armamos tu tablero solo con los beneficios de lo que elijas.</p>
    </header>
    <div class="grid">
      ${BENEFICIOS.map(b => `
        <button type="button" class="medio" data-toggle="${b.id}" aria-pressed="${datos.medios.includes(b.id)}">
          <span class="avatar" aria-hidden="true">${b.ini}</span>
          <span>${b.nombre}</span>
          <span class="check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg></span>
        </button>`).join('')}
    </div>
    <div class="small" id="cuenta"></div>
    <button type="button" class="btn" data-ir="tablero">Ver mi tablero</button>
    <button type="button" class="btn ghost" id="reset">Restablecer datos de ejemplo</button>`;
    $('#cuenta').textContent = `${datos.medios.length} de ${BENEFICIOS.length} seleccionados`;
}

/* ---------- Render y eventos ---------- */
function render() {
    document.querySelectorAll('.tabs button').forEach(btn => {
        if (btn.dataset.tab === ui.tab) btn.setAttribute('aria-current', 'page');
        else btn.removeAttribute('aria-current');
    });
    ({ tablero: vistaTablero, consultar: vistaConsultar, registrar: vistaRegistrar, avisos: vistaAvisos, medios: vistaMedios })[ui.tab]();
}

document.addEventListener('click', e => {
    if (e.target.id === 'modal') return cerrarModal();
    const el = e.target.closest('button');
    if (!el) return;
    const d = el.dataset;

    if (d.tab) return irA(d.tab);
    if (d.ir) return irA(d.ir);

    if ('modalCerrar' in d) return cerrarModal();
    if (d.verBeneficio) return abrirModal('beneficio', d.verBeneficio);
    if (d.yaCompre) return abrirModal('monto', d.yaCompre);

    if (d.filtro) { ui.filtro = d.filtro; return render(); }

    if (d.rubro) { ui.consulta.rubro = d.rubro; return vistaConsultar(); }

    if (d.pagar) {
        const b = BENEFICIOS.find(x => x.id === d.pagar);
        ui.registro = { rubro: ui.consulta.rubro, monto: ui.consulta.monto, medio: b.id, aplicado: true };
        return irA('registrar');
    }

    if (d.medio) { ui.registro.medio = d.medio; return vistaRegistrar(); }

    if (el.id === 'r-sw') { ui.registro.aplicado = !ui.registro.aplicado; el.setAttribute('aria-checked', ui.registro.aplicado); return actualizarPreview(); }
    if (el.id === 'r-guardar') return guardarCompra();

    if ('permiso' in d) return pedirPermiso();
    if ('avisoAdd' in d) return agregarAviso();
    if ('avisoCerrar' in d) { $('#banner').hidden = true; return; }

    if (d.tipo) {
        ui.aviso.tipo = d.tipo;
        ui.aviso.rubro = rubrosDe(d.tipo)[0];
        vistaAvisos();
        const nuevo = $(`[data-tipo="${d.tipo}"]`, vista);
        if (nuevo) nuevo.focus();
        return;
    }

    if (d.dia !== undefined) {
        const n = Number(d.dia);
        const i = ui.aviso.dias.indexOf(n);
        if (i >= 0) ui.aviso.dias.splice(i, 1); else ui.aviso.dias.push(n);
        return el.setAttribute('aria-pressed', ui.aviso.dias.includes(n));
    }

    if (d.avisoSw) {
        const a = habito(d.avisoSw);
        if (!a) return;
        a.activo = !a.activo;
        guardar();
        return el.setAttribute('aria-checked', a.activo);
    }

    if (d.avisoTest) {
        const a = habito(d.avisoTest);
        if (a) { disparar(a); window.scrollTo(0, 0); }
        return;
    }

    if (d.avisoDel) {
        datos.recordatorios = datos.recordatorios.filter(x => x.id !== d.avisoDel);
        guardar();
        avisar('Hábito eliminado');
        return vistaAvisos();
    }

    if (d.toggle) {
        const i = datos.medios.indexOf(d.toggle);
        if (i >= 0) datos.medios.splice(i, 1); else datos.medios.push(d.toggle);
        guardar();
        return vistaMedios();
    }

    if (el.id === 'reset') {
        datos = estadoInicial();
        guardar();
        avisar('Datos de ejemplo restablecidos');
        return render();
    }
});

document.addEventListener('submit', e => {
    if (e.target.id === 'f-monto') {
        e.preventDefault();
        confirmarMonto();
    }
});

document.addEventListener('input', e => {
    if (e.target.id === 'c-monto') { ui.consulta.monto = parseMonto(e.target.value); actualizarResultados(); }
    if (e.target.id === 'r-monto') { ui.registro.monto = parseMonto(e.target.value); actualizarPreview(); }
    if (e.target.id === 'a-lugar') ui.aviso.lugar = e.target.value;
    if (e.target.id === 'a-hora') ui.aviso.hora = e.target.value;
    if (e.target.id === 'm-monto' && ui.modal) actualizarPreviewMonto();
});

document.addEventListener('change', e => {
    if (e.target.id === 'r-rubro') { ui.registro.rubro = e.target.value; vistaRegistrar(); }
    if (e.target.id === 'a-rubro') ui.aviso.rubro = e.target.value;
});

document.addEventListener('keydown', e => {
    if (!ui.modal) return;
    if (e.key === 'Escape') { cerrarModal(); return; }
    if (e.key !== 'Tab') return;
    const foco = [...$('#modal').querySelectorAll('button, input')].filter(x => !x.disabled);
    if (!foco.length) return;
    const primero = foco[0];
    const ultimo = foco[foco.length - 1];
    const activo = document.activeElement;
    if (e.shiftKey && (activo === primero || activo === $('#m-titulo'))) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && activo === ultimo) { e.preventDefault(); primero.focus(); }
});

render();
chequear();
setInterval(chequear, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) chequear(); });