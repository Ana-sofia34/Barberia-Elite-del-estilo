
const API_URL = "http://localhost:3000";

document.addEventListener("DOMContentLoaded", () => {
    const formulario = document.getElementById("formLogin");
    const btnLogin = document.getElementById("btnLogin");

    btnLogin.addEventListener("click", ingresar);

    formulario.addEventListener("submit", (event) => {
        event.preventDefault();
        ingresar();
    });
});

async function ingresar() {
    const correo = document.getElementById("email").value.trim();
    const contraseña = document.getElementById("password").value;

    const alerta = document.getElementById("alertaError");
    const mensaje = document.getElementById("mensajeError");

    if (!correo || !contraseña) {
        alerta.style.display = "block";
        mensaje.textContent = "Ingresa tu correo y contraseña.";
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
            alerta.style.display = "block";
            mensaje.textContent = datos.mensaje || "Correo o contraseña incorrectos.";
            return;
        }

        if (!datos.token || !datos.usuario) {
            throw new Error("Respuesta incorrecta del servidor");
        }

        const sesion = {
            id_usuario: datos.usuario.id_usuario,
            nombre: datos.usuario.nombre,
            correo: datos.usuario.correo,
            estado: datos.usuario.estado,
            rol: datos.usuario.rol
        };

        localStorage.setItem("token", datos.token);
        localStorage.setItem("usuario", JSON.stringify(sesion));

        if (sesion.rol === "administrador") {
            window.location.href = "administrador.html";
        } else if (sesion.rol === "barbero") {
            window.location.href = "panel-barbero.html";
        } else if (sesion.rol === "cliente") {
            window.location.href = "barberia.html";
        } else {
            throw new Error("El usuario no tiene un rol válido");
        }

    } catch (error) {
        console.error("Error al iniciar sesión:", error);
        alerta.style.display = "block";
        mensaje.textContent = error.message === "Failed to fetch"
            ? "No se pudo conectar con el servidor."
            : error.message;
    }
}
