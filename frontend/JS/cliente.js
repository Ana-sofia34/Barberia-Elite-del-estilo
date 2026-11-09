/* =========================================================
   Barbería Élite del Estilo — Panel del Cliente (lógica)
   ========================================================= */

/* ======================
   CONFIGURACIÓN WOMPI
   ====================== */

// 🔑 Reemplaza con tu llave pública real de Wompi.
// Sandbox/pruebas: empieza con "pub_test_..."
// Producción: empieza con "pub_prod_..."
const WOMPI_PUBLIC_KEY = "pub_test_TU_LLAVE_AQUI";

// Usa "https://production.wompi.co/v1" cuando pases a producción con llave pub_prod_
const WOMPI_API_BASE = "https://sandbox.wompi.co/v1";

const estadoTexto = {
    pendiente: "Pendiente",
    confirmada: "Confirmada",
    en_proceso: "En proceso",
    finalizada: "Finalizada",
    cancelada: "Cancelada",
    no_asistio: "No asistió"
};

const MESES = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];

/* ======================
   UTILIDADES
   ====================== */

const $ = id => document.getElementById(id);

const esc = s => String(s ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[ch]));

const dinero = n => "$" + (Number(n) || 0).toLocaleString("es-CO");

function hoyLocal(){
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function ahoraLocal(){
    const d = new Date();
    return hoyLocal() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function parseFecha(f){
    const [y, m, d] = String(f).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}

function fechaLarga(f){
    return parseFecha(f).toLocaleDateString("es-CO", { weekday:"short", day:"numeric", month:"short" });
}

function hora12(h){
    if(!h) return "";
    const [hh, mm] = h.split(":").map(Number);
    const suf = hh >= 12 ? "p. m." : "a. m.";
    return ((hh % 12) || 12) + ":" + String(mm).padStart(2, "0") + " " + suf;
}

/* ---------- Toasts ---------- */
function toast(mensaje, tipo = "info"){
    const iconos = {
        success:"bi-check-circle-fill",
        error:"bi-exclamation-octagon-fill",
        warning:"bi-exclamation-triangle-fill",
        info:"bi-info-circle-fill"
    };
    const el = document.createElement("div");
    el.className = "toast-item " + tipo;
    el.innerHTML = `<i class="bi ${iconos[tipo] || iconos.info}"></i><span>${esc(mensaje)}</span>`;
    $("toasts").appendChild(el);
    setTimeout(() => {
        el.classList.add("out");
        setTimeout(() => el.remove(), 320);
    }, 4500);
}

/* ---------- Confirmación (reemplaza confirm()) ---------- */
function confirmar(titulo, texto, textoBoton = "Confirmar"){
    return new Promise(resolve => {
        $("confirmTitulo").textContent = titulo;
        $("confirmTexto").textContent = texto;
        $("btnConfirmOk").innerHTML = textoBoton;

        const el = $("modalConfirm");
        const modal = bootstrap.Modal.getOrCreateInstance(el);
        let aceptado = false;

        const ok = $("btnConfirmOk");
        const onOk = () => { aceptado = true; modal.hide(); };

        ok.addEventListener("click", onOk, { once:true });
        el.addEventListener("hidden.bs.modal", () => {
            ok.removeEventListener("click", onOk);
            resolve(aceptado);
        }, { once:true });

        modal.show();
    });
}

/* ======================
   SESIÓN
   ====================== */

function getSesion(){
    const raw = localStorage.getItem("usuario");
    if(!raw) return null;
    try{
        return JSON.parse(raw);
    }catch(e){
        // Compatibilidad por si la sesión se guardó como texto plano en versiones antiguas
        return { usuario: raw, rol: "cliente" };
    }
}

const sesion = getSesion();

if(!sesion){
    window.location.href = "login.html";
}

const usuario = sesion ? (sesion.nombre || sesion.usuario || sesion.correo || "Cliente") : "Cliente";

function saludo(){
    const h = new Date().getHours();
    if(h < 12) return "Buenos días";
    if(h < 19) return "Buenas tardes";
    return "Buenas noches";
}

function iniciarPerfil(){
    $("nombre").textContent = usuario;
    $("avatar").textContent = usuario.charAt(0).toUpperCase();
    $("saludo").textContent = saludo() + ", " + usuario.split(" ")[0];
    $("hoyTexto").textContent = new Date().toLocaleDateString("es-CO", {
        weekday:"long", day:"numeric", month:"long", year:"numeric"
    });
}

/* ======================
   SERVICIOS Y BARBEROS (comparten datos con el panel de administrador)
   ====================== */

function getServicios(){
    let s = JSON.parse(localStorage.getItem("servicios"));
    if(!s){
        s = [
            {id:1, nombre:"Corte", precio:25000, duracion:30, activo:true},
            {id:2, nombre:"Fade", precio:35000, duracion:40, activo:true},
            {id:3, nombre:"Barba", precio:20000, duracion:20, activo:true},
            {id:4, nombre:"Cejas", precio:10000, duracion:10, activo:true},
            {id:5, nombre:"Premium", precio:45000, duracion:60, activo:true}
        ];
        localStorage.setItem("servicios", JSON.stringify(s));
    }
    return s;
}

function getBarberos(){
    let b = JSON.parse(localStorage.getItem("barberos"));
    if(!b){
        b = [
            {id:1, nombre:"Julián Restrepo", especialidad:"Fades", activo:true, horariosBloqueados:[]},
            {id:2, nombre:"Andrés Gómez", especialidad:"Barbas clásicas", activo:true, horariosBloqueados:[]},
            {id:3, nombre:"Camilo Vargas", especialidad:"Diseños y líneas", activo:true, horariosBloqueados:[]},
            {id:4, nombre:"Santiago Molina", especialidad:"Cortes ejecutivos", activo:true, horariosBloqueados:[]}
        ];
        localStorage.setItem("barberos", JSON.stringify(b));
    }
    return b;
}

function poblarSelects(){
    const selectServicio = $("servicio");
    const selectBarbero = $("barbero");

    const servicios = getServicios().filter(s => s.activo);
    const barberos = getBarberos().filter(b => b.activo);

    selectServicio.innerHTML = servicios.length
        ? servicios.map(s =>
            `<option value="${esc(s.nombre)} - ${s.precio}" data-precio="${s.precio}" data-duracion="${s.duracion || ""}">${esc(s.nombre)} — ${dinero(s.precio)}</option>`
          ).join("")
        : `<option value="">No hay servicios disponibles</option>`;

    selectBarbero.innerHTML = barberos.length
        ? barberos.map(b =>
            `<option value="${esc(b.nombre)}">${esc(b.nombre)}${b.especialidad ? " · " + esc(b.especialidad) : ""}</option>`
          ).join("")
        : `<option value="">No hay barberos disponibles</option>`;

    // Preseleccionar el barbero elegido en el sitio principal, si sigue activo
    const barberoElegido = localStorage.getItem("barberoElegido");
    if(barberoElegido){
        for(const opt of selectBarbero.options){
            if(opt.value === barberoElegido){
                selectBarbero.value = barberoElegido;
                break;
            }
        }
    }

    actualizarResumenReserva();
}

function actualizarResumenReserva(){
    const opt = $("servicio").options[$("servicio").selectedIndex];
    if(!opt || !opt.dataset.precio){
        $("resumenDuracion").textContent = "—";
        $("resumenTotal").textContent = "$0";
        return;
    }
    const dur = opt.dataset.duracion;
    $("resumenDuracion").textContent = dur ? dur + " min aprox." : "Duración variable";
    $("resumenTotal").textContent = dinero(opt.dataset.precio);
}

/* ======================
   CITAS (con migración defensiva de datos antiguos)
   ====================== */

function getCitas(){
    const citas = JSON.parse(localStorage.getItem("citas")) || [];
    let cambiado = false;

    citas.forEach(c => {
        if(!c.id){ c.id = Date.now() + Math.floor(Math.random() * 100000); cambiado = true; }
        if(!c.estado){ c.estado = "pendiente"; cambiado = true; }
        if(c.precio === undefined || c.precio === null){
            c.precio = parseInt((c.servicio || "").split(" - ")[1]) || 0;
            cambiado = true;
        }
        if(!c.pago){
            c.pago = { metodo:"efectivo", estado:"pendiente", fechaPago:null };
            cambiado = true;
        }
    });

    if(cambiado) localStorage.setItem("citas", JSON.stringify(citas));
    return citas;
}

function setCitas(c){ localStorage.setItem("citas", JSON.stringify(c)); }

/* ---------- Filtros ---------- */
let filtroActual = "todas";

const ESTADOS_CERRADOS = ["finalizada", "cancelada", "no_asistio"];

function esProxima(c){
    return !ESTADOS_CERRADOS.includes(c.estado) && (c.fecha + " " + c.hora) >= ahoraLocal();
}

const filtros = {
    todas:       () => true,
    proximas:    c => esProxima(c),
    finalizadas: c => c.estado === "finalizada",
    canceladas:  c => c.estado === "cancelada" || c.estado === "no_asistio"
};

function setFiltro(nombre, btn){
    filtroActual = nombre;
    document.querySelectorAll(".filter").forEach(f => f.classList.toggle("active", f === btn));
    cargar();
}

/* ---------- Render ---------- */
function actualizarEstadisticas(citas){
    $("totalCitas").textContent = citas.length;

    const proximas = citas.filter(esProxima)
        .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));

    if(proximas.length){
        const p = proximas[0];
        $("proximaCita").textContent = fechaLarga(p.fecha);
        $("proximaNota").textContent = hora12(p.hora) + " · " + p.barbero;
    }else{
        $("proximaCita").textContent = "Sin agendar";
        $("proximaNota").textContent = "Reserva tu próxima visita";
    }

    const invertido = citas
        .filter(c => c.pago && c.pago.estado === "pagado")
        .reduce((t, c) => t + (Number(c.precio) || 0), 0);
    $("totalInvertido").textContent = dinero(invertido);
}

function cargar(){
    const mias = getCitas().filter(c => c.cliente === usuario);

    actualizarEstadisticas(mias);

    const citas = mias
        .filter(filtros[filtroActual])
        .sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));

    const lista = $("lista");

    if(citas.length === 0){
        lista.innerHTML = `
        <li>
            <div class="empty-state">
                <i class="bi bi-calendar-x"></i>
                <p>${mias.length === 0 ? "Aún no tienes citas reservadas." : "No hay citas en esta categoría."}</p>
            </div>
        </li>`;
        return;
    }

    lista.innerHTML = citas.map(cita => {

        const puedeEliminar = cita.estado !== "finalizada";
        const pago = cita.pago || { estado:"pendiente", metodo:"efectivo" };
        const pagado = pago.estado === "pagado";
        const f = parseFecha(cita.fecha);
        const nombreServicio = esc((cita.servicio || "").split(" - ")[0]);

        const btnPagar = !pagado && cita.estado !== "cancelada"
            ? `<button class="btn-pagar-cita" onclick="pagarCitaExistente(${cita.id})">
                   <i class="bi bi-credit-card"></i> Pagar
               </button>`
            : "";

        return `
        <li class="cita">
            <div class="cita-date">
                <span class="d">${f.getDate()}</span>
                <span class="m">${MESES[f.getMonth()]}</span>
            </div>

            <div class="cita-main">
                <div class="cita-servicio">${nombreServicio}</div>
                <div class="cita-detalle">
                    <span><i class="bi bi-person"></i>${esc(cita.barbero)}</span>
                    <span><i class="bi bi-clock"></i>${hora12(cita.hora)}</span>
                    <span><i class="bi bi-cash-stack"></i>${dinero(cita.precio)}</span>
                </div>
                <div class="cita-badges">
                    <span class="badge-estado badge-${esc(cita.estado)}">${estadoTexto[cita.estado] || esc(cita.estado)}</span>
                    <span class="badge-pago ${pagado ? "badge-pago-pagado" : "badge-pago-pendiente"}">
                        <i class="bi ${pagado ? "bi-check-circle-fill" : "bi-hourglass-split"}"></i>
                        ${pagado ? "Pagado" : "Pago pendiente"}
                    </span>
                </div>
            </div>

            <div class="cita-actions">
                ${btnPagar}
                <button class="btn-del" aria-label="Cancelar cita"
                    ${puedeEliminar ? "" : 'disabled title="No se puede eliminar una cita finalizada"'}
                    onclick="eliminar(${cita.id})">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
        </li>`;
    }).join("");
}

/* ======================
   FLUJO DE RESERVA + PAGO
   ====================== */

let reservaPendiente = null;
let metodoSeleccionado = "wompi";

function getModalPago(){
    return bootstrap.Modal.getOrCreateInstance($("modalPago"));
}

function marcarInvalido(id){
    const el = $(id);
    el.classList.add("is-invalid");
    el.addEventListener("input", () => el.classList.remove("is-invalid"), { once:true });
    el.addEventListener("change", () => el.classList.remove("is-invalid"), { once:true });
}

function reservar(){

    const servicioSelect = $("servicio");
    const servicio = servicioSelect.value;
    const servicioNombre = servicioSelect.options[servicioSelect.selectedIndex]
        ? servicioSelect.options[servicioSelect.selectedIndex].text
        : "";
    const barbero = $("barbero").value;
    const fecha = $("fecha").value;
    const hora = $("hora").value;

    if(!servicio || !barbero){
        toast("No hay servicios o barberos disponibles en este momento. Intenta más tarde.", "warning");
        return;
    }

    if(!fecha || !hora){
        if(!fecha) marcarInvalido("fecha");
        if(!hora) marcarInvalido("hora");
        toast("Completa los campos de fecha y hora.", "warning");
        return;
    }

    if(fecha < hoyLocal()){
        marcarInvalido("fecha");
        toast("La fecha no puede ser anterior a hoy.", "warning");
        return;
    }

    if(fecha === hoyLocal() && hora < ahoraLocal().split(" ")[1]){
        marcarInvalido("hora");
        toast("La hora ya pasó. Elige un horario posterior.", "warning");
        return;
    }

    const precio = parseInt(servicio.split(" - ")[1]) || 0;

    // Se guarda temporalmente hasta que se confirme el pago
    reservaPendiente = { servicio, servicioNombre, barbero, fecha, hora, precio };

    mostrarResumenPago();
    seleccionarMetodo("wompi");
    getModalPago().show();
}

function pagarCitaExistente(id){

    const cita = getCitas().find(c => c.id === id);
    if(!cita) return;

    reservaPendiente = {
        servicio: cita.servicio,
        servicioNombre: cita.servicio.split(" - ")[0],
        barbero: cita.barbero,
        fecha: cita.fecha,
        hora: cita.hora,
        precio: cita.precio,
        _citaId: id
    };

    mostrarResumenPago();
    seleccionarMetodo("wompi");
    getModalPago().show();
}

function mostrarResumenPago(){
    const r = reservaPendiente;
    $("resumenPago").innerHTML = `
        <div class="fila"><span>Servicio</span><span>${esc(r.servicioNombre.split(" — ")[0])}</span></div>
        <div class="fila"><span>Barbero</span><span>${esc(r.barbero)}</span></div>
        <div class="fila"><span>Fecha</span><span>${esc(fechaLarga(r.fecha))} · ${hora12(r.hora)}</span></div>
        <div class="fila total"><span>Total a pagar</span><span>${dinero(r.precio)}</span></div>
    `;
}

function seleccionarMetodo(metodo){
    metodoSeleccionado = metodo;
    document.querySelectorAll(".metodo-pago").forEach(el => {
        el.classList.toggle("selected", el.dataset.metodo === metodo);
    });
}

function resetBotonPago(){
    const btn = $("btnConfirmarPago");
    btn.disabled = false;
    btn.innerHTML = `<i class="bi bi-lock-fill"></i> Confirmar pago`;
}

function confirmarPago(){

    if(!reservaPendiente) return;

    if(metodoSeleccionado === "efectivo"){
        guardarCita({
            metodo: "efectivo",
            estado: "pendiente",
            fechaPago: null
        });
        return;
    }

    // ---- Pago en línea con Wompi ----
    if(typeof WidgetCheckout === "undefined"){
        toast("No se pudo cargar el widget de pagos. Revisa tu conexión e intenta de nuevo.", "error");
        return;
    }

    const referencia = "cita-" + Date.now();
    const montoEnCentavos = reservaPendiente.precio * 100;

    const checkout = new WidgetCheckout({
        currency: "COP",
        amountInCents: montoEnCentavos,
        reference: referencia,
        publicKey: WOMPI_PUBLIC_KEY
        // 🔌 Cuando tengas backend, agrega aquí:
        // signature: { integrity: "<hash generado en servidor>" }
    });

    const btn = $("btnConfirmarPago");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Abriendo pago...`;

    checkout.open(function (result){

        resetBotonPago();

        const transaction = result.transaction;

        if(!transaction){
            toast("El pago fue cancelado.", "info");
            return;
        }

        verificarTransaccionWompi(transaction.id);
    });
}

function verificarTransaccionWompi(id){

    fetch(`${WOMPI_API_BASE}/transactions/${id}`)
        .then(r => r.json())
        .then(data => {

            const estado = data.data.status; // APPROVED, DECLINED, PENDING, ERROR

            if(estado === "APPROVED"){
                guardarCita({
                    metodo: "wompi",
                    estado: "pagado",
                    fechaPago: new Date().toISOString(),
                    transaccionId: id
                });
            }else if(estado === "PENDING"){
                toast("Tu pago está pendiente de confirmación. Revisa el historial más tarde.", "warning");
                guardarCita({
                    metodo: "wompi",
                    estado: "pendiente",
                    fechaPago: null,
                    transaccionId: id
                });
            }else{
                toast("El pago no se completó (estado: " + estado + "). Intenta de nuevo.", "error");
            }
        })
        .catch(() => {
            toast("No se pudo verificar el pago. Si te realizaron un cobro, contáctanos con este ID: " + id, "error");
        });
}

function guardarCita(registroPago){

    const citas = getCitas();
    const eraPagoExistente = !!reservaPendiente._citaId;

    if(eraPagoExistente){
        const cita = citas.find(c => c.id === reservaPendiente._citaId);
        if(cita) cita.pago = registroPago;
    }else{
        citas.push({
            id: Date.now(),
            cliente: usuario,
            servicio: reservaPendiente.servicio,
            barbero: reservaPendiente.barbero,
            fecha: reservaPendiente.fecha,
            hora: reservaPendiente.hora,
            estado: "pendiente",
            precio: reservaPendiente.precio,
            pago: registroPago
        });
    }

    setCitas(citas);

    $("fecha").value = "";
    $("hora").value = "";

    getModalPago().hide();
    reservaPendiente = null;

    cargar();

    if(registroPago.estado === "pagado"){
        toast("¡Pago aprobado! Tu cita quedó reservada.", "success");
    }else if(eraPagoExistente){
        toast("Método de pago actualizado. Pagarás en el local.", "info");
    }else{
        toast("Cita reservada. Pagarás en el local.", "success");
    }
}

/* ======================
   ELIMINAR
   ====================== */

async function eliminar(id){

    let citas = getCitas();
    const cita = citas.find(c => c.id === id);

    if(cita && cita.estado === "finalizada"){
        toast("No se puede eliminar una cita ya finalizada.", "warning");
        return;
    }

    const ok = await confirmar(
        "¿Cancelar esta cita?",
        "Esta acción eliminará la reserva de tu historial y no se puede deshacer.",
        `<i class="bi bi-trash3"></i> Sí, cancelar cita`
    );
    if(!ok) return;

    citas = citas.filter(c => c.id !== id);
    setCitas(citas);
    cargar();
    toast("La cita fue cancelada.", "info");
}

/* ======================
   NAVEGACIÓN
   ====================== */

function cerrarSesion(){
    localStorage.removeItem("usuario");
    window.location.href = "login.html";
}

function irInicio(){
    window.location.href = "barberia.html";
}

function irA(idSeccion, btn){
    cerrarSidebar();
    document.querySelectorAll(".nav-btn[data-nav]").forEach(b => b.classList.toggle("active", b === btn));
    const el = $(idSeccion);
    if(el) el.scrollIntoView({ behavior:"smooth", block:"start" });
}

function abrirSidebar(){
    $("sidebar").classList.add("open");
    $("overlay").classList.add("show");
}

function cerrarSidebar(){
    $("sidebar").classList.remove("open");
    $("overlay").classList.remove("show");
}

/* ======================
   ARRANQUE
   ====================== */

if(sesion){
    iniciarPerfil();
    poblarSelects();
    $("fecha").min = hoyLocal();
    $("servicio").addEventListener("change", actualizarResumenReserva);
    $("modalPago").addEventListener("hidden.bs.modal", resetBotonPago);
    cargar();
}