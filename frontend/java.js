 function obtenerNombre() {
    return document.getElementById("nombre").value.trim();
}

function obtenerBarbero() {
    return document.getElementById("barbero").value;
}

function guardarUsuario(nombre) {
    localStorage.setItem("usuario", nombre);
}

function validarNombre(nombre) {
    return nombre.length > 0;
}

/* ---------------- LOGIN ---------------- */
function ingresar() {
    let nombre = obtenerNombre();

    if (!validarNombre(nombre)) {
        alert("Por favor escribe tu nombre");
        return;
    }

    let barbero = obtenerBarbero();

    localStorage.setItem("barbero", barbero);
    guardarUsuario(nombre);

    window.location.href = "barberia.html";
}

/* ---------------- REGISTRO ---------------- */
function registrar() {
    let nombre = obtenerNombre();

    if (!validarNombre(nombre)) {
        alert("Por favor escribe tu nombre");
        return;
    }

    guardarUsuario(nombre);

    alert("Usuario registrado correctamente");

    window.location.href = "barberia.html";
}

/* ---------------- BOTÓN LOGIN (SI EXISTE EN ESA PÁGINA) ---------------- */
document.addEventListener("DOMContentLoaded", function () {
    const btnLogin = document.getElementById("btnLogin");

    if (btnLogin) {
        btnLogin.addEventListener("click", function () {
            window.location.href = "panel.html";
        });
    }
});