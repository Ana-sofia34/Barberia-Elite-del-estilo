const API_URL = "http://localhost:3000";

/* ======================
   ANIMACIÓN: chispas doradas en el panel de marca
   ====================== */
(function () {
    const brand = document.getElementById('brand');
    for (let i = 0; i < 14; i++) {
        const s = document.createElement('span');
        s.className = 'spark';
        s.style.left = Math.random() * 100 + '%';
        s.style.animationDuration = (6 + Math.random() * 7) + 's';
        s.style.animationDelay = (Math.random() * 7) + 's';
        brand.appendChild(s);
    }
})();


/* ======================
   UI: recordarme, mayúsculas, mostrar contraseña
   ====================== */
(function recordarCorreo() {
    const guardado = localStorage.getItem("correoRecordado");
    if (guardado) {
        document.getElementById("email").value = guardado;
        document.getElementById("recordarme").checked = true;
    }
})();

document.getElementById("password").addEventListener("keyup", e => {
    document.getElementById("capsAviso").classList.toggle("on", e.getModifierState && e.getModifierState("CapsLock"));
});

function mostrarPassword() {
    const input = document.getElementById("password");
    const icono = document.querySelector(".eye i");
    if (input.type === "password") {
        input.type = "text";
        icono.classList.replace("bi-eye-fill", "bi-eye-slash-fill");
    } else {
        input.type = "password";
        icono.classList.replace("bi-eye-slash-fill", "bi-eye-fill");
    }
}

function mostrarError(mensaje) {
    const alerta = document.getElementById("alertaError");
    document.getElementById("mensajeError").textContent = mensaje;
    alerta.classList.remove("show");
    void alerta.offsetWidth; // reinicia la animación de sacudida
    alerta.classList.add("show");
}

function ocultarError() {
    document.getElementById("alertaError").classList.remove("show");
}

function setCargando(cargando) {
    const btn = document.getElementById("btnLogin");
    btn.disabled = cargando;
    btn.classList.toggle("loading", cargando);
    document.getElementById("btnTexto").textContent = cargando ? "Verificando..." : "Iniciar Sesión";
}

function validarEmail(correo) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
}

function redirigirSegunRol(rol) {
    if (rol === "administrador") {
        window.location.href = "administrador.html";
    } else if (rol === "barbero") {
        window.location.href = "panel-barbero.html";
    } else {
        window.location.href = "barberia.html";
    }
}

/* ======================
   CONEXIÓN AL BACKEND (usuarios en MySQL)
   ====================== */
async function loginBackend(correo, password) {
    const respuesta = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            correo: correo,
            contraseña: password
        })
    });

    const datos = await respuesta.json().catch(() => ({}));
    return { ok: respuesta.ok, datos };
}

// Enter también inicia sesión
document.getElementById("formLogin").addEventListener("submit", e => {
    e.preventDefault();
    document.getElementById("btnLogin").click();
});

/* ======================
   BOTÓN INICIAR SESIÓN
   ====================== */
document.getElementById("btnLogin").addEventListener("click", async function () {

    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    emailInput.classList.remove("is-invalid");
    passwordInput.classList.remove("is-invalid");
    ocultarError();

    if (!email || !password) {
        if (!email) emailInput.classList.add("is-invalid");
        if (!password) passwordInput.classList.add("is-invalid");

        mostrarError("Por favor completa todos los campos.");
        return;
    }

    if (!validarEmail(email)) {
        emailInput.classList.add("is-invalid");
        mostrarError("Ingresa un correo electrónico válido.");
        return;
    }

    if (document.getElementById("recordarme").checked) {
        localStorage.setItem("correoRecordado", email);
    } else {
        localStorage.removeItem("correoRecordado");
    }

    setCargando(true);

    try {
        // La base de datos (vía servidor) decide si el usuario existe y si la contraseña es correcta
        const { ok, datos } = await loginBackend(email, password);

        if (!ok) {
            emailInput.classList.add("is-invalid");
            passwordInput.classList.add("is-invalid");
            mostrarError(datos.error || datos.mensaje || "Correo o contraseña incorrectos.");
            setCargando(false);
            return;
        }

        if (!datos.token || !datos.usuario) {
            mostrarError("El servidor no devolvió los datos de sesión correctamente.");
            setCargando(false);
            return;
        }

        const u = datos.usuario;   // <- antes se usaba "usuario" sin definir

        const sesion = {
            id_usuario: u.id_usuario,
            nombre: u.nombre,
            usuario: u.usuario,
            correo: u.correo,
            estado: u.estado,
            rol: u.rol,
            barberoNombre: u.barberoNombre || null
        };

        // Solo se guarda la sesión (token + datos básicos), no la lista de usuarios
        localStorage.setItem("token", datos.token);
        localStorage.setItem("usuario", JSON.stringify(sesion));

        redirigirSegunRol(sesion.rol);

    } catch (error) {
        console.error("Error al iniciar sesión:", error);
        mostrarError("No se pudo conectar con el servidor. Verifica que esté encendido.");
        setCargando(false);
    }
});