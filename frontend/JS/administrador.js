// ======================
// CONFIGURACIÓN
// ======================

// Debe coincidir con el puerto del backend (PORT en el .env, por defecto 3000)
const API_URL = "http://localhost:3000";

// Estados válidos según las rutas del backend
const ESTADOS_CITA = {
    pendiente: "Pendiente",
    confirmada: "Confirmada",
    completada: "Completada",
    cancelada: "Cancelada"
};

const ESTADOS_PAGO = {
    pagado: "Pagado",
    pendiente: "Pago pendiente",
    rechazado: "Pago rechazado"
};

const ROLES = {
    cliente: "Cliente",
    barbero: "Barbero",
    administrador: "Administrador"
};

let citasCache = [];
let usuariosCache = [];

// ======================
// SESIÓN
// ======================
// localStorage se usa SOLO para guardar la sesión (usuario y token JWT),
// nunca como base de datos. Todos los datos del panel vienen de MySQL.

function getSesion(){
    const raw = localStorage.getItem("usuario");
    if(!raw) return null;
    try{ return JSON.parse(raw); }catch(e){ return null; }
}

// NOTA: ajusta aquí la clave si tu login.html guarda el token con otro nombre.
function getToken(){
    const directo = localStorage.getItem("token")
        || localStorage.getItem("jwt")
        || localStorage.getItem("authToken");
    if(directo) return directo;
    const s = getSesion();
    return (s && s.token) ? s.token : null;
}

function limpiarSesion(){
    ["usuario", "token", "jwt", "authToken"].forEach(k => localStorage.removeItem(k));
}

function irALogin(){
    limpiarSesion();
    window.location.href = "login.html";
}

const sesion = getSesion();

// Esta comprobación solo evita mostrar el panel; la seguridad real
// la aplica el servidor (token + rol administrador consultado en MySQL).
const sesionValida = !!(sesion && sesion.rol === "administrador" && getToken());

if(!sesionValida){
    irALogin();
}

const nombreAdmin = sesion ? (sesion.nombre || sesion.correo || "") : "";
document.getElementById("nombre").innerText = nombreAdmin;
document.getElementById("avatar").innerText = nombreAdmin ? nombreAdmin.charAt(0).toUpperCase() : "?";

function cerrarSesion(){
    irALogin();
}

// Id del administrador actual (para no permitir que se modifique a sí mismo)
function idPropio(){
    if(sesion && Number.isInteger(sesion.id_usuario)) return sesion.id_usuario;
    try{
        const payload = getToken().split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const datos = JSON.parse(atob(payload));
        return Number.isInteger(datos.id_usuario) ? datos.id_usuario : null;
    }catch(e){
        return null;
    }
}

// ======================
// UTILIDADES
// ======================

// Escapa texto que viene de la base de datos antes de ponerlo en el HTML
function esc(valor){
    return String(valor === null || valor === undefined ? "" : valor)
        .replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function dinero(n){
    return "$" + (Number(n) || 0).toLocaleString("es-CO");
}

function fechaCorta(v){
    if(!v) return "-";
    const s = String(v);
    if(s.includes("T")){
        const d = new Date(s);
        if(!Number.isNaN(d.getTime())){
            return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
        }
    }
    return s.slice(0, 10);
}

function horaCorta(v){
    if(!v) return "-";
    return String(v).slice(0, 5);
}

function fechaHora(v){
    if(!v) return "";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("es-CO");
}

// Interpreta TINYINT 0/1 o BIT (que mysql2 entrega como Buffer)
function esVerdadero(v){
    if(v && typeof v === "object" && Array.isArray(v.data)){
        return v.data.length > 0 && v.data[v.data.length - 1] === 1;
    }
    return Number(v) === 1;
}

let temporizadorAlerta = null;

function mostrarAlerta(texto, tipo){
    const el = document.getElementById("alertaPanel");
    if(!el) return;
    el.className = "alerta-panel " + (tipo === "ok" ? "alerta-ok" : "alerta-error");
    el.textContent = texto;
    el.style.display = "block";
    clearTimeout(temporizadorAlerta);
    temporizadorAlerta = setTimeout(() => { el.style.display = "none"; }, 6000);
}

// ======================
// API
// ======================

async function api(ruta, opciones){
    const o = opciones || {};
    const headers = { "Authorization": "Bearer " + getToken() };
    if(o.body !== undefined) headers["Content-Type"] = "application/json";

    let respuesta;
    try{
        respuesta = await fetch(API_URL + ruta, {
            method: o.method || "GET",
            headers: headers,
            body: o.body !== undefined ? JSON.stringify(o.body) : undefined
        });
    }catch(e){
        throw new Error("No se pudo conectar con el servidor. Verifica que el backend esté encendido.");
    }

    let datos = null;
    try{ datos = await respuesta.json(); }catch(e){ datos = null; }

    if(respuesta.status === 401){
        irALogin();
        throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
    }

    if(!respuesta.ok){
        throw new Error((datos && datos.error) || ("Error en la solicitud (" + respuesta.status + ")"));
    }

    return datos;
}

// ======================
// RESUMEN
// ======================

async function cargarResumen(){
    const r = await api("/admin/resumen");
    document.getElementById("totalCitas").innerText = Number(r.totalCitas) || 0;
    document.getElementById("citasPendientes").innerText = Number(r.citasPendientes) || 0;
    document.getElementById("totalUsuarios").innerText = Number(r.totalUsuarios) || 0;
    document.getElementById("ingresosTotales").innerText = dinero(r.ingresos);
}

// Monto de citas no canceladas que aún no están pagadas (calculado con las citas cargadas)
function renderPorCobrar(){
    const total = citasCache
        .filter(c => String(c.estado_pago || "pendiente").toLowerCase() !== "pagado")
        .filter(c => String(c.estado || "").toLowerCase() !== "cancelada")
        .reduce((s, c) => s + (Number(c.precio) || 0), 0);
    document.getElementById("pagosPendientes").innerText = dinero(total);
}

// ======================
// CITAS
// ======================

async function cargarCitas(){
    citasCache = await api("/admin/citas");
    renderCitas();
    renderServicios();
    renderBarberos();
    renderPorCobrar();
}

function renderCitas(){
    const filtroEstado = document.getElementById("filtroEstado").value;
    const filtroPago = document.getElementById("filtroPago").value;

    const citas = citasCache.filter(c => {
        const estado = String(c.estado || "pendiente").toLowerCase();
        const pago = String(c.estado_pago || "pendiente").toLowerCase();
        return (!filtroEstado || estado === filtroEstado) && (!filtroPago || pago === filtroPago);
    });

    const cuerpo = document.getElementById("cuerpoCitas");

    if(citas.length === 0){
        cuerpo.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="bi bi-calendar-x"></i><p>No hay citas para este filtro.</p></div></td></tr>`;
        return;
    }

    cuerpo.innerHTML = citas.map(c => {
        const id = Number(c.id_cita);
        const estado = String(c.estado || "pendiente").toLowerCase();
        const estadoPago = String(c.estado_pago || "pendiente").toLowerCase();

        let opcionesEstado = Object.entries(ESTADOS_CITA).map(([valor, texto]) =>
            `<option value="${valor}" ${valor === estado ? "selected" : ""}>${texto}</option>`
        ).join("");

        // Si la cita tiene un estado que no está en la lista, se muestra sin permitir elegirlo
        if(!ESTADOS_CITA[estado]){
            opcionesEstado = `<option value="${esc(estado)}" selected disabled>${esc(estado)}</option>` + opcionesEstado;
        }

        const pagoTexto = ESTADOS_PAGO[estadoPago] || esc(estadoPago);
        const pagoClase = estadoPago === "pagado" ? "badge-pago-pagado"
            : (estadoPago === "rechazado" ? "badge-pago-rechazado" : "badge-pago-pendiente");

        const detallePago = [
            esc(c.metodo_pago || "Sin método"),
            c.fecha_pago ? esc(fechaHora(c.fecha_pago)) : ""
        ].filter(Boolean).join(" · ");

        const btnPagar = estadoPago !== "pagado"
            ? `<button class="btn-ok-ghost" onclick="marcarPagado(${id})"><i class="bi bi-cash-coin me-1"></i>Marcar pagado</button>`
            : "";

        const btnCancelar = (estado !== "cancelada" && estado !== "completada")
            ? `<button class="btn-danger-ghost" onclick="cancelarCitaAdmin(${id})">Cancelar</button>`
            : "";

        return `
        <tr>
            <td>
                ${esc(c.nombre_cliente || "Cliente")}
                <div class="detalle-pago" style="text-transform:none;">${esc(c.correo_cliente || "")}</div>
            </td>
            <td>${esc(String(c.servicio || "").split(" - ")[0])}</td>
            <td>${esc(c.barbero || "-")}</td>
            <td>${esc(fechaCorta(c.fecha))} ${esc(horaCorta(c.hora))}</td>
            <td>${dinero(c.precio)}</td>
            <td>
                <select class="form-select form-select-sm" style="min-width:140px;" onchange="cambiarEstadoCita(${id}, this.value)">
                    ${opcionesEstado}
                </select>
            </td>
            <td>
                <span class="badge-pago ${pagoClase}">${pagoTexto}</span>
                <div class="detalle-pago">${detallePago}</div>
                ${c.transaccion_id ? `<div class="detalle-pago" style="text-transform:none;">Trans.: ${esc(c.transaccion_id)}</div>` : ""}
            </td>
            <td>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    ${btnPagar}
                    ${btnCancelar}
                </div>
            </td>
        </tr>`;
    }).join("");
}

async function cambiarEstadoCita(id, estado){
    try{
        await api("/admin/citas/" + id + "/estado", { method: "PATCH", body: { estado: estado } });
        mostrarAlerta("Estado de la cita actualizado.", "ok");
        await Promise.all([cargarCitas(), cargarResumen()]);
    }catch(e){
        mostrarAlerta(e.message);
        renderCitas(); // restaura el valor anterior en el selector
    }
}

async function cancelarCitaAdmin(id){
    if(!confirm("¿Cancelar esta cita?")) return;
    await cambiarEstadoCita(id, "cancelada");
}

async function marcarPagado(id){
    try{
        await api("/admin/citas/" + id + "/pago", { method: "PATCH", body: { estado_pago: "pagado" } });
        mostrarAlerta("Pago registrado.", "ok");
        await Promise.all([cargarCitas(), cargarResumen()]);
    }catch(e){
        mostrarAlerta(e.message);
    }
}

// ======================
// SERVICIOS Y BARBEROS (solo lectura, calculados desde las citas)
// ======================

function agruparCitas(clave){
    const mapa = new Map();
    citasCache.forEach(c => {
        const etiqueta = clave(c) || "Sin definir";
        const g = mapa.get(etiqueta) || { etiqueta: etiqueta, citas: 0, cobrado: 0 };
        g.citas += 1;
        if(String(c.estado_pago || "").toLowerCase() === "pagado"){
            g.cobrado += Number(c.precio) || 0;
        }
        mapa.set(etiqueta, g);
    });
    return Array.from(mapa.values()).sort((a, b) => b.citas - a.citas);
}

function filasAgrupadas(grupos){
    if(grupos.length === 0){
        return `<tr><td colspan="3"><div class="empty-state"><i class="bi bi-inbox"></i><p>Aún no hay citas registradas.</p></div></td></tr>`;
    }
    return grupos.map(g => `
        <tr>
            <td>${esc(g.etiqueta)}</td>
            <td>${g.citas}</td>
            <td>${dinero(g.cobrado)}</td>
        </tr>`).join("");
}

function renderServicios(){
    const grupos = agruparCitas(c => String(c.servicio || "").split(" - ")[0].trim());
    document.getElementById("cuerpoServicios").innerHTML = filasAgrupadas(grupos);
}

function renderBarberos(){
    const grupos = agruparCitas(c => String(c.barbero || "").trim());
    document.getElementById("cuerpoBarberos").innerHTML = filasAgrupadas(grupos);
}

// ======================
// USUARIOS
// ======================

async function cargarUsuarios(){
    usuariosCache = await api("/admin/usuarios");
    renderUsuarios();
}

function renderUsuarios(){
    const cuerpo = document.getElementById("cuerpoUsuarios");

    if(usuariosCache.length === 0){
        cuerpo.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="bi bi-person-x"></i><p>No hay usuarios registrados aún.</p></div></td></tr>`;
        return;
    }

    const miId = idPropio();

    cuerpo.innerHTML = usuariosCache.map(u => {
        const id = Number(u.id_usuario);
        const esYo = miId !== null && id === miId;
        const rol = String(u.rol || "cliente").toLowerCase();
        const activo = String(u.estado || "").toLowerCase() === "activo";

        let opcionesRol = Object.entries(ROLES).map(([valor, texto]) =>
            `<option value="${valor}" ${valor === rol ? "selected" : ""}>${texto}</option>`
        ).join("");

        if(!ROLES[rol]){
            opcionesRol = `<option value="${esc(rol)}" selected disabled>${esc(rol)}</option>` + opcionesRol;
        }

        const verificado = esVerdadero(u.correo_verificado);

        const accion = esYo
            ? `<span class="detalle-pago" style="text-transform:none;">Tu cuenta</span>`
            : `<button class="${activo ? "btn-danger-ghost" : "btn-ok-ghost"}" onclick="toggleUsuario(${id})">${activo ? "Desactivar" : "Activar"}</button>`;

        return `
        <tr>
            <td>${esc(u.nombre || "-")}</td>
            <td>${esc(u.correo)}</td>
            <td>
                <select class="form-select form-select-sm" style="min-width:140px;" ${esYo ? "disabled" : ""} onchange="cambiarRolUsuario(${id}, this.value)">
                    ${opcionesRol}
                </select>
            </td>
            <td><span class="badge-estado ${activo ? "badge-activo" : "badge-bloqueado"}">${activo ? "Activo" : esc(u.estado || "Inactivo")}</span></td>
            <td><span class="badge-estado ${verificado ? "badge-activo" : "badge-pendiente"}">${verificado ? "Sí" : "No"}</span></td>
            <td>${accion}</td>
        </tr>`;
    }).join("");
}

async function toggleUsuario(id){
    const u = usuariosCache.find(x => Number(x.id_usuario) === id);
    if(!u) return;

    const activo = String(u.estado || "").toLowerCase() === "activo";
    const nuevoEstado = activo ? "inactivo" : "activo";

    if(!confirm(`¿${activo ? "Desactivar" : "Activar"} la cuenta de "${u.nombre || u.correo}"?`)) return;

    try{
        await api("/admin/usuarios/" + id, { method: "PATCH", body: { estado: nuevoEstado } });
        mostrarAlerta("Usuario actualizado.", "ok");
        await cargarUsuarios();
    }catch(e){
        mostrarAlerta(e.message);
        renderUsuarios();
    }
}

async function cambiarRolUsuario(id, rol){
    const u = usuariosCache.find(x => Number(x.id_usuario) === id);
    if(!u) return;

    if(!confirm(`¿Cambiar el rol de "${u.nombre || u.correo}" a ${ROLES[rol] || rol}?`)){
        renderUsuarios();
        return;
    }

    try{
        await api("/admin/usuarios/" + id, { method: "PATCH", body: { rol: rol } });
        mostrarAlerta("Rol actualizado.", "ok");
        await cargarUsuarios();
    }catch(e){
        mostrarAlerta(e.message);
        renderUsuarios();
    }
}

// ======================
// REPORTES
// ======================

function tablaReporte(titulo, primeraColumna, filas){
    const cuerpo = filas.length === 0
        ? `<tr><td colspan="4"><div class="empty-state"><p>Sin datos en este rango.</p></div></td></tr>`
        : filas.map(f => `
            <tr>
                <td style="text-transform:capitalize;">${esc(f.etiqueta)}</td>
                <td>${f.citas}</td>
                <td>${f.pagadas}</td>
                <td>${dinero(f.cobrado)}</td>
            </tr>`).join("");

    return `
        <div class="col-md-4">
            <div class="card">
                <h5 class="mb-2">${esc(titulo)}</h5>
                <div class="tabla-scroll">
                    <table class="table-custom">
                        <thead><tr><th>${esc(primeraColumna)}</th><th>Citas</th><th>Pagadas</th><th>Cobrado</th></tr></thead>
                        <tbody>${cuerpo}</tbody>
                    </table>
                </div>
            </div>
        </div>`;
}

async function generarReporte(){
    const desde = document.getElementById("repDesde").value;
    const hasta = document.getElementById("repHasta").value;

    if(desde && hasta && desde > hasta){
        mostrarAlerta("La fecha 'Desde' no puede ser posterior a la fecha 'Hasta'.");
        return;
    }

    const params = new URLSearchParams();
    if(desde) params.set("desde", desde);
    if(hasta) params.set("hasta", hasta);
    const consulta = params.toString();

    try{
        const r = await api("/admin/reportes" + (consulta ? "?" + consulta : ""));
        const s = r.resumen;

        document.getElementById("resultadoReporte").innerHTML = `
            <div class="row text-center">
                <div class="col-md-3"><div class="card stat-card"><h5>Citas en el rango</h5><h2>${s.totalCitas}</h2></div></div>
                <div class="col-md-3"><div class="card stat-card"><h5>Completadas</h5><h2>${s.completadas}</h2></div></div>
                <div class="col-md-3"><div class="card stat-card"><h5>Canceladas</h5><h2>${s.canceladas}</h2></div></div>
                <div class="col-md-3"><div class="card stat-card"><h5>Ingresos cobrados</h5><h2>${dinero(s.ingresosCobrados)}</h2></div></div>
            </div>
            <div class="row text-center mt-2">
                <div class="col-md-3"><div class="card stat-card"><h5>Pendientes</h5><h2>${s.pendientes}</h2></div></div>
                <div class="col-md-3"><div class="card stat-card"><h5>Confirmadas</h5><h2>${s.confirmadas}</h2></div></div>
                <div class="col-md-3"><div class="card stat-card"><h5>Citas pagadas</h5><h2>${s.citasPagadas}</h2></div></div>
                <div class="col-md-3"><div class="card stat-card"><h5>Por cobrar</h5><h2>${dinero(s.porCobrar)}</h2></div></div>
            </div>
            <div class="row mt-2">
                ${tablaReporte("Por método de pago", "Método", r.porMetodoPago)}
                ${tablaReporte("Por barbero", "Barbero", r.porBarbero)}
                ${tablaReporte("Por servicio", "Servicio", r.porServicio)}
            </div>
        `;
    }catch(e){
        mostrarAlerta(e.message);
    }
}

// ======================
// INIT
// ======================

async function renderTodo(){
    const resultados = await Promise.allSettled([
        cargarResumen(),
        cargarCitas(),
        cargarUsuarios()
    ]);

    const fallo = resultados.find(r => r.status === "rejected");
    if(fallo) mostrarAlerta(fallo.reason.message);
}

if(sesionValida){
    renderTodo();
}