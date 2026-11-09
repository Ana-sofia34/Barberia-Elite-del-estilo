
const API_URL = "http://localhost:3000";

// Obtener datos de los formularios
function obtenerNombre() {
    return document.getElementById("nombre")?.value.trim() || "";
}

function obtenerCorreo() {
    return document.getElementById("correo")?.value.trim() || "";
}

function obtenerContrasena() {
    return document.getElementById("contraseña")?.value || "";
}

// Guardar sesión
function guardarSesion(datos) {
    localStorage.setItem("token", datos.token);
    localStorage.setItem("usuario", JSON.stringify(datos.usuario));
}

// REGISTRO
async function registrar() {
    const nombre = obtenerNombre();
    const correo = obtenerCorreo();
    const contraseña = obtenerContrasena();

    if (!nombre || !correo || !contraseña) {
        alert("Completa todos los campos");
        return;
    }

    try {
        const respuesta = await fetch(`${API_URL}/usuarios`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                nombre,
                correo,
                contraseña
            })
        });

        const datos = await respuesta.json();

        if (!respuesta.ok) {
            alert(datos.error || "No se pudo registrar");
            return;
        }

        alert("¡Registro exitoso! Ya puedes iniciar sesión.");

        window.location.href = "login.html";

    } catch (error) {
        console.error(error);
        alert("No fue posible conectar con el servidor");
    }
}

// LOGIN
async function ingresar() {
    const correo = obtenerCorreo();
    const contraseña = obtenerContrasena();

    if (!correo || !contraseña) {
        alert("Ingresa tu correo y contraseña");
        return;
    }

    try {
        const respuesta = await fetch(`${API_URL}/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                correo,
                contraseña
            })
        });

        const datos = await respuesta.json();

        if (!respuesta.ok) {
            alert(datos.error || "Error al iniciar sesión");
            return;
        }

        guardarSesion(datos);

        alert("¡Bienvenido a Barbería Élite!");

        window.location.href = "barberia.html";

    } catch (error) {
        console.error(error);
        alert("No fue posible conectar con el servidor");
    }
}

// CERRAR SESIÓN
function cerrarSesion() {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    localStorage.removeItem("barbero");

    window.location.href = "login.html";
}

// PROTEGER PÁGINAS
function verificarSesion() {
    const token = localStorage.getItem("token");

    if (!token) {
        window.location.href = "login.html";
    }
}

// CONSULTAR USUARIO AUTENTICADO
async function consultarUsuario() {
    const token = localStorage.getItem("token");

    if (!token) {
        window.location.href = "login.html";
        return;
    }

    try {
        const respuesta = await fetch(`${API_URL}/usuarios`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (!respuesta.ok) {
            cerrarSesion();
            return;
        }

        const datos = await respuesta.json();
        return datos[0];

    } catch (error) {
        console.error("Error consultando usuario:", error);
    }
}
