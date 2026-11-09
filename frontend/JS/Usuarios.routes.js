// Rutas de usuarios (Express Router) alineadas con server.js.
//
// IMPORTANTE: server.js ya incluye POST /usuarios y GET /usuarios/barberos-ocupados.
// Usa este archivo SOLO si prefieres separar las rutas en un módulo; en ese caso
// elimina esas dos rutas de server.js y móntalo con:
//     app.use(require("./rutas-usuarios"));
// No montes ambos a la vez: las rutas se pisarían.
//
// Variables de entorno requeridas (.env), sin valores por defecto en el código:
//   CODIGO_ADMINISTRADOR, CODIGO_BARBERO, EMAIL_USER, EMAIL_PASS

const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const rateLimit = require("express-rate-limit");
const pool = require("./conexion");

const router = express.Router();

const MINUTOS_VIGENCIA_CODIGO = 10;

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const limiteRegistro = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiados intentos. Intenta nuevamente en 15 minutos." }
});

// ---------- Utilidades ----------

function escaparHtml(texto) {
    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function textoSeguroIgual(a, b) {
    const A = Buffer.from(String(a));
    const B = Buffer.from(String(b));
    return A.length === B.length && crypto.timingSafeEqual(A, B);
}

function generarCodigo() {
    return String(crypto.randomInt(100000, 1000000));
}

// BIT de MySQL llega como Buffer; TINYINT como número.
function bandera(valor) {
    if (Buffer.isBuffer(valor)) {
        return valor.length > 0 && valor[valor.length - 1] === 1;
    }
    return Number(valor) === 1;
}

const correoValido = c => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);
const telefonoValido = t => /^[0-9+\-\s()]{7,20}$/.test(t);
const usuarioValido = u => /^[A-Za-z0-9._-]{3,50}$/.test(u);

function fechaNacimientoValida(fecha) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
    const f = new Date(`${fecha}T00:00:00Z`);
    if (Number.isNaN(f.getTime()) || f.toISOString().slice(0, 10) !== fecha) return false;
    return f <= new Date() && fecha >= "1900-01-01";
}

async function enviarCodigoVerificacion(correo, nombre, codigo) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        throw new Error("Faltan EMAIL_USER o EMAIL_PASS en el archivo .env");
    }

    await transporter.sendMail({
        from: `"Barbería Élite del Estilo" <${process.env.EMAIL_USER}>`,
        to: correo,
        subject: "Verifica tu correo electrónico",
        html: `
            <div style="font-family: Arial; padding: 20px;">
                <h2>¡Hola, ${escaparHtml(nombre)}!</h2>
                <p>Gracias por registrarte en Barbería Élite del Estilo.</p>
                <p>Tu código de verificación es:</p>
                <h1 style="color: #b8860b; letter-spacing: 5px;">${escaparHtml(codigo)}</h1>
                <p>Este código vence en ${MINUTOS_VIGENCIA_CODIGO} minutos.</p>
                <p>Si no realizaste este registro, puedes ignorar este mensaje.</p>
            </div>
        `
    });
}

// ---------- Barberos que ya tienen cuenta ----------

router.get("/usuarios/barberos-ocupados", async (req, res) => {
    try {
        const [filas] = await pool.execute(
            `SELECT barbero_nombre
             FROM USUARIO
             WHERE rol = 'barbero' AND barbero_nombre IS NOT NULL`
        );
        return res.status(200).json(filas.map(f => f.barbero_nombre));
    } catch (error) {
        console.error("Error al consultar barberos ocupados:", error.message);
        return res.status(500).json([]);
    }
});

// ---------- Registro con verificación por correo ----------

router.post("/usuarios", limiteRegistro, async (req, res) => {
    let conexion;

    try {
        const {
            nombre, usuario, correo, telefono, nacimiento, contraseña,
            codigoAdmin = "", codigoBarbero = "", barberoAsociado = ""
        } = req.body;

        const campos = [nombre, usuario, correo, telefono, nacimiento, contraseña,
                        codigoAdmin, codigoBarbero, barberoAsociado];

        if (campos.some(c => typeof c !== "string")) {
            return res.status(400).json({ error: "Completa todos los campos obligatorios" });
        }

        const nombreN = nombre.trim();
        const usuarioN = usuario.trim();
        const correoN = correo.trim().toLowerCase();
        const telefonoN = telefono.trim();
        const nacimientoN = nacimiento.trim();
        const adminN = codigoAdmin.trim();
        const barberoCodN = codigoBarbero.trim();
        const barberoN = barberoAsociado.trim();

        if (nombreN.length < 2 || nombreN.length > 100) {
            return res.status(400).json({ error: "El nombre debe tener entre 2 y 100 caracteres" });
        }
        if (!usuarioValido(usuarioN)) {
            return res.status(400).json({ error: "El usuario debe tener de 3 a 50 caracteres: letras, números, punto, guion o guion bajo", campo: "usuario" });
        }
        if (correoN.length > 254 || !correoValido(correoN)) {
            return res.status(400).json({ error: "Debes ingresar un correo válido", campo: "correo" });
        }
        if (!telefonoValido(telefonoN)) {
            return res.status(400).json({ error: "Ingresa un teléfono válido", campo: "telefono" });
        }
        if (!fechaNacimientoValida(nacimientoN)) {
            return res.status(400).json({ error: "Ingresa una fecha de nacimiento válida", campo: "nacimiento" });
        }
        if (contraseña.length < 8) {
            return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres", campo: "password" });
        }
        if (Buffer.byteLength(contraseña, "utf8") > 72) {
            return res.status(400).json({ error: "La contraseña no puede superar los 72 bytes", campo: "password" });
        }

        // Códigos de rol: se validan solo en el servidor y sin valores por defecto.
        const quiereAdmin = adminN !== "";
        const quiereBarbero = barberoCodN !== "";

        if (quiereAdmin && quiereBarbero) {
            return res.status(400).json({ error: "Usa solo un código de acceso: el de administrador o el de barbero, no ambos" });
        }

        if (quiereAdmin) {
            if (!process.env.CODIGO_ADMINISTRADOR) {
                console.error("Falta CODIGO_ADMINISTRADOR en el archivo .env");
                return res.status(500).json({ error: "Error de configuración del servidor" });
            }
            if (!textoSeguroIgual(adminN, process.env.CODIGO_ADMINISTRADOR)) {
                return res.status(403).json({ error: "El código de administrador no es válido", campo: "codigoAdmin" });
            }
        }

        if (quiereBarbero) {
            if (!process.env.CODIGO_BARBERO) {
                console.error("Falta CODIGO_BARBERO en el archivo .env");
                return res.status(500).json({ error: "Error de configuración del servidor" });
            }
            if (!textoSeguroIgual(barberoCodN, process.env.CODIGO_BARBERO)) {
                return res.status(403).json({ error: "El código de barbero no es válido", campo: "codigoBarbero" });
            }
            if (!barberoN || barberoN.length > 100) {
                return res.status(400).json({ error: "Selecciona a cuál barbero corresponde esta cuenta", campo: "barberoAsociado" });
            }
        }

        const rol = quiereAdmin ? "administrador" : (quiereBarbero ? "barbero" : "cliente");

        // La base de datos decide si ya existe.
        const [existentes] = await pool.execute(
            `SELECT id_usuario, correo, correo_verificado
             FROM USUARIO
             WHERE correo = ? OR usuario = ?
             LIMIT 1`,
            [correoN, usuarioN]
        );

        if (existentes.length > 0) {
            const porCorreo = existentes[0].correo === correoN;

            if (porCorreo && !bandera(existentes[0].correo_verificado)) {
                return res.status(409).json({
                    error: "Ese correo ya está registrado pero aún no se ha verificado",
                    campo: "correo",
                    pendiente: true
                });
            }

            return res.status(409).json({
                error: porCorreo ? "Ese correo ya está registrado" : "Ese nombre de usuario ya está en uso",
                campo: porCorreo ? "correo" : "usuario"
            });
        }

        if (quiereBarbero) {
            const [ocupado] = await pool.execute(
                `SELECT id_usuario FROM USUARIO
                 WHERE rol = 'barbero' AND barbero_nombre = ?
                 LIMIT 1`,
                [barberoN]
            );

            if (ocupado.length > 0) {
                return res.status(409).json({
                    error: "Ese barbero ya tiene una cuenta creada. Elige otro o contacta al administrador",
                    campo: "barberoAsociado"
                });
            }
        }

        const passwordHash = await bcrypt.hash(contraseña, 12);
        const codigo = generarCodigo();
        const codigoExpira = new Date(Date.now() + MINUTOS_VIGENCIA_CODIGO * 60 * 1000);

        // Transacción: si el correo falla, no queda una cuenta a medias.
        conexion = await pool.getConnection();

        try {
            await conexion.beginTransaction();

            const [resultado] = await conexion.execute(
                `INSERT INTO USUARIO
                    (nombre, usuario, correo, telefono, nacimiento, \`contraseña\`,
                     estado, rol, barbero_nombre, bloqueado,
                     correo_verificado, codigo_verificacion, codigo_expira)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [nombreN, usuarioN, correoN, telefonoN, nacimientoN, passwordHash,
                 "pendiente", rol, quiereBarbero ? barberoN : null, 0,
                 0, codigo, codigoExpira]
            );

            try {
                await enviarCodigoVerificacion(correoN, nombreN, codigo);
            } catch (errorCorreo) {
                await conexion.rollback();
                console.error("Error al enviar el correo (registro deshecho):", errorCorreo.message);

                return res.status(502).json({
                    error: "No pudimos enviar el correo de verificación. Tu registro no se guardó; inténtalo de nuevo en unos minutos.",
                    correo_enviado: false
                });
            }

            await conexion.commit();

            return res.status(201).json({
                mensaje: "Registro exitoso. Revisa tu correo para verificar tu cuenta.",
                correo_enviado: true,
                rol,
                usuario: {
                    id_usuario: resultado.insertId,
                    nombre: nombreN,
                    correo: correoN,
                    rol,
                    correo_verificado: false
                }
            });
        } catch (errorTransaccion) {
            try {
                await conexion.rollback();
            } catch (errorRollback) {
                console.error("Error al deshacer la transacción:", errorRollback.message);
            }
            throw errorTransaccion;
        }
    } catch (error) {
        console.error("Error al registrar usuario:", error.message);

        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ error: "Ya existe una cuenta con ese correo, usuario o barbero" });
        }

        return res.status(500).json({ error: "Error al registrar el usuario" });
    } finally {
        if (conexion) conexion.release();
    }
});

module.exports = router;