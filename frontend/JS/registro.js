const API_URL = "http://localhost:3000";

// Catálogo de barberos (compartido con el panel de administrador).
// Los USUARIOS ya no se guardan en localStorage: viven en la base de datos.
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

// Pide al servidor qué barberos ya tienen cuenta.
async function getBarberosOcupados(){
    try{
        const r = await fetch(`${API_URL}/usuarios/barberos-ocupados`);
        if(!r.ok) return [];
        return await r.json();
    }catch(e){
        return [];
    }
}

(async function poblarBarberos(){
    const select = document.getElementById("barberoAsociado");
    const yaTomados = await getBarberosOcupados();

    getBarberos().forEach(b=>{
        const ocupado = yaTomados.includes(b.nombre);
        const opt = document.createElement("option");
        opt.value = b.nombre;
        opt.textContent = b.nombre + (ocupado ? " (ya tiene cuenta)" : "");
        if(ocupado) opt.disabled = true;
        select.appendChild(opt);
    });
})();

function mostrarPassword(id, boton){
    const input = document.getElementById(id);
    const icono = boton.querySelector("i");
    if(input.type === "password"){
        input.type = "text";
        icono.classList.replace("bi-eye-fill", "bi-eye-slash-fill");
    }else{
        input.type = "password";
        icono.classList.replace("bi-eye-slash-fill", "bi-eye-fill");
    }
}

// Medidor de fortaleza de contraseña
document.getElementById("password").addEventListener("input", function(){
    const v = this.value;
    let nivel = 0;
    if(v.length >= 4) nivel++;
    if(v.length >= 8) nivel++;
    if(/[A-Z]/.test(v) && /[a-z]/.test(v)) nivel++;
    if(/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) nivel++;
    if(v.length === 0) nivel = 0;

    const textos = ["Mínimo 4 caracteres", "Débil", "Aceptable", "Buena", "Excelente"];
    document.getElementById("strength").dataset.level = nivel;
    document.getElementById("strengthLabel").textContent = textos[nivel];
});

function mostrarError(mensaje){
    document.getElementById("alertaExito").classList.remove("show");
    document.getElementById("mensajeError").textContent = mensaje;
    const alerta = document.getElementById("alertaError");
    alerta.classList.add("show");
    alerta.scrollIntoView({behavior:"smooth", block:"center"});
}

function ocultarError(){
    document.getElementById("alertaError").classList.remove("show");
}

function validarEmail(correo){
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(correo);
}

function setCargando(cargando){
    const btn = document.getElementById("btnRegistro");
    btn.disabled = cargando;
    btn.classList.toggle("loading", cargando);
}

document.getElementById("btnRegistro").addEventListener("click", async function () {

    const campos = {
        nombre: document.getElementById("nombre"),
        usuario: document.getElementById("usuario"),
        email: document.getElementById("email"),
        telefono: document.getElementById("telefono"),
        nacimiento: document.getElementById("nacimiento"),
        password: document.getElementById("password"),
        password2: document.getElementById("password2")
    };

    document.querySelectorAll(".is-invalid").forEach(c => c.classList.remove("is-invalid"));
    ocultarError();

    const valores = {};
    for (const clave in campos) {
        valores[clave] = campos[clave].value.trim();
    }

    const codigoAdmin = document.getElementById("codigoAdmin").value.trim();
    const codigoBarbero = document.getElementById("codigoBarbero").value.trim();
    const barberoAsociado = document.getElementById("barberoAsociado").value;
    const staffBox = document.getElementById("staffBox");

    // ---- Validaciones de formato (la existencia la valida la base de datos) ----
    let vacio = false;
    for (const clave in campos) {
        if (valores[clave] === "") {
            campos[clave].classList.add("is-invalid");
            vacio = true;
        }
    }
    if (vacio) {
        mostrarError("Por favor completa todos los campos.");
        return;
    }

    if (!validarEmail(valores.email)) {
        campos.email.classList.add("is-invalid");
        mostrarError("Ingresa un correo electrónico válido.");
        return;
    }

    if (valores.password.length < 4) {
        campos.password.classList.add("is-invalid");
        mostrarError("La contraseña debe tener al menos 4 caracteres.");
        return;
    }

    if (valores.password !== valores.password2) {
        campos.password.classList.add("is-invalid");
        campos.password2.classList.add("is-invalid");
        mostrarError("Las contraseñas no coinciden.");
        return;
    }

    if (!document.getElementById("terminos").checked) {
        mostrarError("Debes aceptar los términos y condiciones.");
        return;
    }

    if (codigoAdmin !== "" && codigoBarbero !== "") {
        staffBox.open = true;
        mostrarError("Usa solo un código de acceso: el de administrador o el de barbero, no ambos.");
        return;
    }

    if (codigoBarbero !== "" && !barberoAsociado) {
        staffBox.open = true;
        document.getElementById("barberoAsociado").classList.add("is-invalid");
        mostrarError("Selecciona a cuál barbero corresponde esta cuenta.");
        return;
    }

    setCargando(true);

    try {

        // El servidor valida: usuario/correo duplicados, códigos de rol,
        // barbero ya asignado, y guarda en la base de datos.
        const respuesta = await fetch(`${API_URL}/usuarios`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                nombre: valores.nombre,
                usuario: valores.usuario,
                correo: valores.email,
                telefono: valores.telefono,
                nacimiento: valores.nacimiento,
                contraseña: valores.password,
                codigoAdmin: codigoAdmin,
                codigoBarbero: codigoBarbero,
                barberoAsociado: barberoAsociado
            })
        });

        const datos = await respuesta.json().catch(() => ({}));

        if (!respuesta.ok) {
            // Marca el campo problemático según lo que diga el servidor
            if (datos.campo === "codigoAdmin" || datos.campo === "codigoBarbero" || datos.campo === "barberoAsociado") {
                staffBox.open = true;
                const el = document.getElementById(datos.campo);
                if (el) el.classList.add("is-invalid");
            } else if (datos.campo === "usuario") {
                campos.usuario.classList.add("is-invalid");
            } else if (datos.campo === "correo") {
                campos.email.classList.add("is-invalid");
            }
            mostrarError(datos.mensaje || "No se pudo crear la cuenta en el servidor.");
            setCargando(false);
            return;
        }

        const rol = datos.rol || "cliente";
        document.getElementById("mensajeExito").textContent =
            rol === "administrador" ? "Cuenta de administrador creada con éxito. Redirigiendo al inicio de sesión..."
            : rol === "barbero"     ? "Cuenta de barbero creada con éxito. Redirigiendo al inicio de sesión..."
            :                         "Cuenta creada con éxito. Redirigiendo al inicio de sesión...";

        document.getElementById("alertaExito").classList.add("show");
        document.getElementById("formRegistro").reset();
        document.getElementById("strength").dataset.level = 0;
        document.getElementById("strengthLabel").textContent = "Mínimo 4 caracteres";
        window.scrollTo({top:0, behavior:"smooth"});

        setTimeout(function () {
            window.location.href = "login.html";
        }, 1800);

    } catch (error) {

        console.error("Error:", error);
        mostrarError("No se pudo conectar con el servidor. Verifica que Node.js esté funcionando.");
        setCargando(false);
    }

});