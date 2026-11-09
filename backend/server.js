require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("./conexion");

const app = express();
const PUERTO = Number(process.env.PORT) || 3000;

// =====================================
// SEGURIDAD
// =====================================

app.use(helmet());

const origenesPermitidos = [
    "http://127.0.0.1:5500",
    "http://localhost:5500"
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || origenesPermitidos.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error("Origen no permitido por CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "10kb" }));

app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiadas solicitudes. Intenta nuevamente más tarde." }
}));

const limiteAutenticacion = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiados intentos. Intenta nuevamente en 15 minutos." }
});

// =====================================
// VALIDACIONES
// =====================================

const correoValido = c => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);
const telefonoValido = t => /^[0-9+\-\s()]{7,20}$/.test(t);
const usuarioValido = u => /^[A-Za-z0-9._-]{3,50}$/.test(u);

function fechaNacimientoValida(fecha) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
    const f = new Date(`${fecha}T00:00:00Z`);
    if (Number.isNaN(f.getTime()) || f.toISOString().slice(0, 10) !== fecha) return false;
    return f <= new Date() && fecha >= "1900-01-01";
}

function textoSeguroIgual(a, b) {
    const A = Buffer.from(String(a));
    const B = Buffer.from(String(b));
    if (A.length !== B.length) return false;
    return crypto.timingSafeEqual(A, B);
}

// Interpreta TINYINT 0/1 o BIT (Buffer) de MySQL.
function bandera(valor) {
    if (Buffer.isBuffer(valor)) {
        return valor.length > 0 && valor[valor.length - 1] === 1;
    }
    return Number(valor) === 1;
}

const HASH_FALSO = bcrypt.hashSync("contraseña-de-relleno-no-valida", 12);

// =====================================
// COLUMNAS REALES DE LA TABLA USUARIO
// =====================================

let columnasCache = null;

async function obtenerColumnasUsuario() {
    if (columnasCache) return columnasCache;
    const [filas] = await pool.query("SHOW COLUMNS FROM USUARIO");
    columnasCache = new Set(filas.map(f => f.Field));
    return columnasCache;
}

// =====================================
// MIDDLEWARE JWT
// =====================================

function verificarToken(req, res, next) {
    const encabezado = req.headers.authorization;

    if (!encabezado || !encabezado.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Debes iniciar sesión para acceder a este recurso" });
    }

    const token = encabezado.slice(7).trim();

    if (!token) {
        return res.status(401).json({ error: "Token no proporcionado" });
    }

    if (!process.env.JWT_SECRET) {
        console.error("JWT_SECRET no está configurado");
        return res.status(500).json({ error: "Error de configuración del servidor" });
    }

    try {
        const datos = jwt.verify(token, process.env.JWT_SECRET);

        if (!Number.isInteger(datos.id_usuario) || typeof datos.correo !== "string") {
            return res.status(401).json({ error: "Token inválido" });
        }

        req.usuario = {
            id_usuario: datos.id_usuario,
            correo: datos.correo,
            rol: datos.rol
        };

        next();
    } catch (error) {
        return res.status(401).json({
            error: "Token inválido o vencido. Inicia sesión nuevamente"
        });
    }
}

// =====================================
// RUTAS
// =====================================

app.get("/", (req, res) => {
    res.status(200).json({ mensaje: "API de Barbería Élite del Estilo funcionando" });
});

// ---------- Barberos que ya tienen cuenta (formulario de registro) ----------
app.get("/usuarios/barberos-ocupados", async (req, res) => {
    try {
        const columnas = await obtenerColumnasUsuario();

        if (!columnas.has("barbero_nombre")) {
            return res.status(200).json([]);
        }

        const [filas] = await pool.execute(
            `SELECT barbero_nombre FROM USUARIO
             WHERE rol = 'barbero' AND barbero_nombre IS NOT NULL`
        );

        return res.status(200).json(filas.map(f => f.barbero_nombre));
    } catch (error) {
        console.error("Error al consultar barberos ocupados:", error.message);
        return res.status(500).json([]);
    }
});

// ---------- Usuario autenticado ----------
app.get("/usuarios", verificarToken, async (req, res) => {
    try {
        const [usuarios] = await pool.execute(
            `SELECT id_usuario, nombre, correo, estado, rol
             FROM USUARIO WHERE id_usuario = ? LIMIT 1`,
            [req.usuario.id_usuario]
        );

        if (usuarios.length === 0) {
            return res.status(404).json({ error: "El usuario no existe" });
        }

        return res.status(200).json(usuarios);
    } catch (error) {
        console.error("Error al consultar usuario:", error.message);
        return res.status(500).json({ error: "Error al consultar el usuario" });
    }
});

// ==================================================
// CREAR CUENTA
// ==================================================

app.post("/usuarios", limiteAutenticacion, async (req, res) => {
    try {
        const {
            nombre,
            usuario,
            correo,
            telefono,
            nacimiento,
            contraseña,
            codigoAdmin = "",
            codigoBarbero = "",
            barberoAsociado = ""
        } = req.body;

        if (
            typeof nombre !== "string" ||
            typeof usuario !== "string" ||
            typeof correo !== "string" ||
            typeof telefono !== "string" ||
            typeof nacimiento !== "string" ||
            typeof contraseña !== "string" ||
            typeof codigoAdmin !== "string" ||
            typeof codigoBarbero !== "string" ||
            typeof barberoAsociado !== "string"
        ) {
            return res.status(400).json({ error: "Completa todos los campos obligatorios" });
        }

        const nombreN = nombre.trim();
        const usuarioN = usuario.trim();
        const correoN = correo.trim().toLowerCase();
        const telefonoN = telefono.trim();
        const nacimientoN = nacimiento.trim();
        const codAdmin = codigoAdmin.trim();
        const codBarbero = codigoBarbero.trim();
        const barberoN = barberoAsociado.trim();

        if (nombreN.length < 2 || nombreN.length > 100) {
            return res.status(400).json({ error: "El nombre debe tener entre 2 y 100 caracteres" });
        }

        if (!usuarioValido(usuarioN)) {
            return res.status(400).json({
                error: "El usuario debe tener de 3 a 50 caracteres: letras, números, punto, guion o guion bajo",
                campo: "usuario"
            });
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
            return res.status(400).json({
                error: "La contraseña debe tener al menos 8 caracteres",
                campo: "password"
            });
        }

        if (Buffer.byteLength(contraseña, "utf8") > 72) {
            return res.status(400).json({
                error: "La contraseña no puede superar los 72 bytes",
                campo: "password"
            });
        }

        // ---------- Rol (los códigos se validan solo en el servidor) ----------
        const quiereAdmin = codAdmin !== "";
        const quiereBarbero = codBarbero !== "";

        if (quiereAdmin && quiereBarbero) {
            return res.status(400).json({
                error: "Usa solo un código de acceso: el de administrador o el de barbero, no ambos"
            });
        }

        if (quiereAdmin) {
            if (!process.env.CODIGO_ADMINISTRADOR) {
                console.error("Falta CODIGO_ADMINISTRADOR en el .env");
                return res.status(500).json({ error: "Error de configuración del servidor" });
            }
            if (!textoSeguroIgual(codAdmin, process.env.CODIGO_ADMINISTRADOR)) {
                return res.status(403).json({
                    error: "El código de administrador no es válido",
                    campo: "codigoAdmin"
                });
            }
        }

        if (quiereBarbero) {
            if (!process.env.CODIGO_BARBERO) {
                console.error("Falta CODIGO_BARBERO en el .env");
                return res.status(500).json({ error: "Error de configuración del servidor" });
            }
            if (!textoSeguroIgual(codBarbero, process.env.CODIGO_BARBERO)) {
                return res.status(403).json({
                    error: "El código de barbero no es válido",
                    campo: "codigoBarbero"
                });
            }
            if (!barberoN || barberoN.length > 100) {
                return res.status(400).json({
                    error: "Selecciona a cuál barbero corresponde esta cuenta",
                    campo: "barberoAsociado"
                });
            }
        }

        const rol = quiereAdmin ? "administrador" : (quiereBarbero ? "barbero" : "cliente");

        // ---------- ¿Ya existe? ----------
        const columnas = await obtenerColumnasUsuario();
        const buscarPorUsuario = columnas.has("usuario");

        const [existentes] = await pool.execute(
            `SELECT id_usuario, correo FROM USUARIO
             WHERE correo = ?${buscarPorUsuario ? " OR `usuario` = ?" : ""}
             LIMIT 1`,
            buscarPorUsuario ? [correoN, usuarioN] : [correoN]
        );

        if (existentes.length > 0) {
            const porCorreo = existentes[0].correo === correoN;
            return res.status(409).json({
                error: porCorreo
                    ? "Ese correo ya está registrado"
                    : "Ese nombre de usuario ya está en uso",
                campo: porCorreo ? "correo" : "usuario"
            });
        }

        if (quiereBarbero) {
            if (!columnas.has("barbero_nombre")) {
                return res.status(500).json({
                    error: "El registro de barberos no está disponible en este momento"
                });
            }

            const [ocupado] = await pool.execute(
                `SELECT id_usuario FROM USUARIO
                 WHERE rol = 'barbero' AND barbero_nombre = ? LIMIT 1`,
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

        // La cuenta queda ACTIVA de inmediato (sin verificación por correo).
        // Solo se insertan columnas que existen en la tabla.
        const camposInsertar = [
            ["nombre", nombreN],
            ["usuario", usuarioN],
            ["correo", correoN],
            ["telefono", telefonoN],
            ["nacimiento", nacimientoN],
            ["contraseña", passwordHash],
            ["estado", "activo"],
            ["rol", rol],
            ["barbero_nombre", quiereBarbero ? barberoN : null],
            ["bloqueado", 0],
            ["correo_verificado", 1]
        ].filter(([columna]) => columnas.has(columna));

        const [resultado] = await pool.execute(
            `INSERT INTO USUARIO
                (${camposInsertar.map(([c]) => `\`${c}\``).join(", ")})
             VALUES (${camposInsertar.map(() => "?").join(", ")})`,
            camposInsertar.map(([, v]) => v)
        );

        return res.status(201).json({
            mensaje: "Registro exitoso. Ya puedes iniciar sesión.",
            rol: rol,
            usuario: {
                id_usuario: resultado.insertId,
                nombre: nombreN,
                correo: correoN,
                rol: rol
            }
        });
    } catch (error) {
        console.error("Error al registrar usuario:", error.code || "", error.sqlMessage || error.message);

        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                error: "Ya existe una cuenta con ese correo, usuario o barbero"
            });
        }

        return res.status(500).json({
            error: "Error al registrar el usuario",
            detalle: process.env.NODE_ENV === "production"
                ? undefined
                : (error.sqlMessage || error.message)
        });
    }
});

// ==================================================
// INICIAR SESIÓN
// ==================================================

app.post("/login", limiteAutenticacion, async (req, res) => {
    try {
        const { correo, contraseña } = req.body;

        if (
            typeof correo !== "string" ||
            typeof contraseña !== "string" ||
            !correo.trim() ||
            !contraseña
        ) {
            return res.status(400).json({ error: "Debes ingresar el correo y la contraseña" });
        }

        const correoN = correo.trim().toLowerCase();

        if (correoN.length > 254 || !correoValido(correoN)) {
            return res.status(400).json({ error: "Debes ingresar un correo válido" });
        }

        const columnas = await obtenerColumnasUsuario();

        const opcionales = ["usuario", "barbero_nombre", "bloqueado"]
            .filter(c => columnas.has(c))
            .map(c => `\`${c}\``);

        const [usuarios] = await pool.execute(
            `SELECT id_usuario, nombre, correo, estado, rol,
                    \`contraseña\` AS password_hash${opcionales.length ? ", " + opcionales.join(", ") : ""}
             FROM USUARIO
             WHERE correo = ?
             LIMIT 1`,
            [correoN]
        );

        if (usuarios.length === 0) {
            await bcrypt.compare(contraseña, HASH_FALSO);
            return res.status(401).json({ error: "Correo o contraseña incorrectos" });
        }

        const usuario = usuarios[0];

        const ok = await bcrypt.compare(contraseña, usuario.password_hash);

        if (!ok) {
            return res.status(401).json({ error: "Correo o contraseña incorrectos" });
        }

        if (bandera(usuario.bloqueado)) {
            return res.status(403).json({
                error: "Tu cuenta está bloqueada. Contacta al administrador"
            });
        }

        const estado = String(usuario.estado || "").toLowerCase();

        if (estado !== "activo") {
            return res.status(403).json({ error: "La cuenta no está activa" });
        }

        if (!process.env.JWT_SECRET) {
            console.error("Falta configurar JWT_SECRET en el .env");
            return res.status(500).json({ error: "Error de configuración del servidor" });
        }

        const token = jwt.sign(
            {
                id_usuario: usuario.id_usuario,
                correo: usuario.correo,
                rol: usuario.rol
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "15m" }
        );

        return res.status(200).json({
            mensaje: "Inicio de sesión exitoso",
            token: token,
            tipo: "Bearer",
            usuario: {
                id_usuario: usuario.id_usuario,
                nombre: usuario.nombre,
                usuario: usuario.usuario || null,
                correo: usuario.correo,
                estado: usuario.estado,
                rol: usuario.rol,
                barberoNombre: usuario.barbero_nombre || null
            }
        });
    } catch (error) {
        console.error("Error al iniciar sesión:", error.message);
        return res.status(500).json({ error: "Error al iniciar sesión" });
    }
});

// ==================================================
// REGISTRAR CITA (requiere sesión)
// ==================================================

app.post("/citas", verificarToken, async (req, res) => {
    try {
        const { servicio, barbero, fecha, hora, precio } = req.body;

        if (
            servicio === undefined || servicio === null ||
            (typeof servicio === "string" && !servicio.trim()) ||
            barbero === undefined || barbero === null ||
            (typeof barbero === "string" && !barbero.trim()) ||
            typeof fecha !== "string" ||
            typeof hora !== "string" ||
            precio === undefined || precio === null
        ) {
            return res.status(400).json({ error: "Faltan datos obligatorios para registrar la cita" });
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
            return res.status(400).json({ error: "La fecha debe tener el formato AAAA-MM-DD" });
        }

        const f = new Date(`${fecha}T00:00:00Z`);

        if (Number.isNaN(f.getTime()) || f.toISOString().slice(0, 10) !== fecha) {
            return res.status(400).json({ error: "La fecha indicada no es válida" });
        }

        if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(hora)) {
            return res.status(400).json({ error: "La hora debe tener el formato HH:MM" });
        }

        const precioNumerico = Number(precio);

        if (!Number.isFinite(precioNumerico) || precioNumerico <= 0) {
            return res.status(400).json({ error: "El precio debe ser un número mayor que cero" });
        }

        const idUsuario = req.usuario.id_usuario;

        const [resultado] = await pool.execute(
            `INSERT INTO CITA (
                id_usuario, servicio, barbero, fecha, hora, estado,
                precio, metodo_pago, estado_pago, fecha_pago, transaccion_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [idUsuario, servicio, barbero, fecha, hora, "pendiente",
             precioNumerico, "efectivo", "pendiente", null, null]
        );

        const [citas] = await pool.execute(
            `SELECT * FROM CITA WHERE id_cita = ? AND id_usuario = ? LIMIT 1`,
            [resultado.insertId, idUsuario]
        );

        return res.status(201).json({
            mensaje: "Cita registrada correctamente",
            cita: citas[0]
        });
    } catch (error) {
        console.error("Error al registrar cita:", error.message);

        if (error.code === "ER_NO_REFERENCED_ROW_2" || error.code === "ER_NO_REFERENCED_ROW") {
            return res.status(400).json({
                error: "El usuario, servicio o barbero relacionado no existe"
            });
        }

        return res.status(500).json({ error: "Error al registrar la cita" });
    }
});



// ==================================================
// RUTAS EXCLUSIVAS DEL ADMINISTRADOR
// ==================================================

async function verificarAdministrador(req, res, next) {
    try {
        const [usuarios] = await pool.execute(
            `SELECT id_usuario, rol, estado
             FROM USUARIO
             WHERE id_usuario = ?
             LIMIT 1`,
            [req.usuario.id_usuario]
        );

        if (usuarios.length === 0) {
            return res.status(401).json({ error: "Usuario no encontrado" });
        }

        const usuario = usuarios[0];

        if (
            String(usuario.estado).toLowerCase() !== "activo" ||
            String(usuario.rol).toLowerCase() !== "administrador"
        ) {
            return res.status(403).json({
                error: "No tienes permisos de administrador"
            });
        }

        next();
    } catch (error) {
        console.error("Error verificando administrador:", error.message);
        return res.status(500).json({
            error: "No se pudieron verificar los permisos"
        });
    }
}

// Resumen para el dashboard
app.get("/admin/resumen", verificarToken, verificarAdministrador, async (req, res) => {
    try {
        const [[usuarios]] = await pool.query(
            `SELECT COUNT(*) AS total
             FROM USUARIO`
        );

        const [[citas]] = await pool.query(
            `SELECT COUNT(*) AS total
             FROM CITA`
        );

        const [[pendientes]] = await pool.query(
            `SELECT COUNT(*) AS total
             FROM CITA
             WHERE LOWER(estado) = 'pendiente'`
        );

        const [[ingresos]] = await pool.query(
            `SELECT COALESCE(SUM(precio), 0) AS total
             FROM CITA
             WHERE LOWER(estado_pago) = 'pagado'`
        );

        return res.json({
            totalUsuarios: usuarios.total,
            totalCitas: citas.total,
            citasPendientes: pendientes.total,
            ingresos: ingresos.total
        });
    } catch (error) {
        console.error("Error en resumen:", error.message);
        return res.status(500).json({
            error: "No se pudo cargar el resumen"
        });
    }
});

// Consultar todos los usuarios
app.get("/admin/usuarios", verificarToken, verificarAdministrador, async (req, res) => {
    try {
        const [usuarios] = await pool.execute(
            `SELECT id_usuario, nombre, correo, estado, rol,
                    correo_verificado
             FROM USUARIO
             ORDER BY id_usuario DESC`
        );

        return res.json(usuarios);
    } catch (error) {
        console.error("Error consultando usuarios:", error.message);
        return res.status(500).json({
            error: "No se pudieron consultar los usuarios"
        });
    }
});

// Cambiar el estado y/o el rol de un usuario
app.patch("/admin/usuarios/:id", verificarToken, verificarAdministrador, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { estado, rol } = req.body || {};

        const estadosUsuarioPermitidos = ["activo", "inactivo"];
        const rolesPermitidos = ["cliente", "barbero", "administrador"];

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: "Identificador de usuario inválido" });
        }

        if (estado === undefined && rol === undefined) {
            return res.status(400).json({ error: "Indica el estado o el rol que deseas cambiar" });
        }

        if (
            estado !== undefined &&
            (typeof estado !== "string" || !estadosUsuarioPermitidos.includes(estado.toLowerCase()))
        ) {
            return res.status(400).json({ error: "Estado de usuario no válido" });
        }

        if (
            rol !== undefined &&
            (typeof rol !== "string" || !rolesPermitidos.includes(rol.toLowerCase()))
        ) {
            return res.status(400).json({ error: "Rol no válido" });
        }

        // Evita que el administrador se quite a sí mismo el acceso al panel
        if (id === req.usuario.id_usuario) {
            return res.status(400).json({
                error: "No puedes cambiar tu propio estado o rol"
            });
        }

        const campos = [];
        const valores = [];

        if (estado !== undefined) {
            campos.push("estado = ?");
            valores.push(estado.toLowerCase());
        }

        if (rol !== undefined) {
            campos.push("rol = ?");
            valores.push(rol.toLowerCase());
        }

        valores.push(id);

        const [resultado] = await pool.execute(
            `UPDATE USUARIO
             SET ${campos.join(", ")}
             WHERE id_usuario = ?`,
            valores
        );

        if (resultado.affectedRows === 0) {
            return res.status(404).json({ error: "No se encontró el usuario" });
        }

        return res.json({
            mensaje: "Usuario actualizado correctamente"
        });
    } catch (error) {
        console.error("Error actualizando usuario:", error.code || "", error.sqlMessage || error.message);
        return res.status(500).json({
            error: "No se pudo actualizar el usuario"
        });
    }
});

// Consultar todas las citas con el nombre y correo del cliente
app.get("/admin/citas", verificarToken, verificarAdministrador, async (req, res) => {
    try {
        const [citas] = await pool.execute(
            `SELECT
                c.id_cita,
                c.id_usuario,
                u.nombre AS nombre_cliente,
                u.correo AS correo_cliente,
                c.servicio,
                c.barbero,
                c.fecha,
                c.hora,
                c.estado,
                c.precio,
                c.metodo_pago,
                c.estado_pago,
                c.fecha_pago,
                c.transaccion_id
             FROM CITA c
             INNER JOIN USUARIO u ON c.id_usuario = u.id_usuario
             ORDER BY c.fecha DESC, c.hora DESC`
        );

        return res.json(citas);
    } catch (error) {
        console.error("Error consultando citas:", error.message);
        return res.status(500).json({
            error: "No se pudieron consultar las citas"
        });
    }
});

// Cambiar el estado de una cita
app.patch("/admin/citas/:id/estado", verificarToken, verificarAdministrador, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { estado } = req.body;

        const estadosPermitidos = [
            "pendiente",
            "confirmada",
            "completada",
            "cancelada"
        ];

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: "Identificador de cita inválido" });
        }

        if (
            typeof estado !== "string" ||
            !estadosPermitidos.includes(estado.toLowerCase())
        ) {
            return res.status(400).json({ error: "Estado de cita no válido" });
        }

        const [resultado] = await pool.execute(
            `UPDATE CITA
             SET estado = ?
             WHERE id_cita = ?`,
            [estado.toLowerCase(), id]
        );

        if (resultado.affectedRows === 0) {
            return res.status(404).json({ error: "No se encontró la cita" });
        }

        return res.json({
            mensaje: "Estado de la cita actualizado correctamente"
        });
    } catch (error) {
        console.error("Error actualizando cita:", error.message);
        return res.status(500).json({
            error: "No se pudo actualizar el estado de la cita"
        });
    }
});

// Actualizar el estado del pago
app.patch("/admin/citas/:id/pago", verificarToken, verificarAdministrador, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { estado_pago } = req.body;

        const estadosPagoPermitidos = [
            "pendiente",
            "pagado",
            "rechazado"
        ];

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: "Identificador de cita inválido" });
        }

        if (
            typeof estado_pago !== "string" ||
            !estadosPagoPermitidos.includes(estado_pago.toLowerCase())
        ) {
            return res.status(400).json({ error: "Estado de pago no válido" });
        }

        const nuevoEstado = estado_pago.toLowerCase();

        const [resultado] = await pool.execute(
            `UPDATE CITA
             SET estado_pago = ?,
                 fecha_pago = CASE
                    WHEN ? = 'pagado' THEN COALESCE(fecha_pago, NOW())
                    ELSE NULL
                 END
             WHERE id_cita = ?`,
            [nuevoEstado, nuevoEstado, id]
        );

        if (resultado.affectedRows === 0) {
            return res.status(404).json({ error: "No se encontró la cita" });
        }

        return res.json({
            mensaje: "Estado del pago actualizado correctamente"
        });
    } catch (error) {
        console.error("Error actualizando pago:", error.message);
        return res.status(500).json({
            error: "No se pudo actualizar el pago"
        });
    }
});

// Reportes a partir de las citas y los pagos (rango de fechas opcional)
app.get("/admin/reportes", verificarToken, verificarAdministrador, async (req, res) => {
    try {
        const desde = req.query.desde === undefined ? "" : req.query.desde;
        const hasta = req.query.hasta === undefined ? "" : req.query.hasta;

        const fechaValida = f => {
            if (typeof f !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
            const d = new Date(`${f}T00:00:00Z`);
            return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
        };

        if (desde !== "" && !fechaValida(desde)) {
            return res.status(400).json({ error: "La fecha 'desde' no es válida (AAAA-MM-DD)" });
        }

        if (hasta !== "" && !fechaValida(hasta)) {
            return res.status(400).json({ error: "La fecha 'hasta' no es válida (AAAA-MM-DD)" });
        }

        if (desde && hasta && desde > hasta) {
            return res.status(400).json({ error: "La fecha 'desde' no puede ser posterior a 'hasta'" });
        }

        const condiciones = [];
        const parametros = [];

        if (desde) {
            condiciones.push("fecha >= ?");
            parametros.push(desde);
        }

        if (hasta) {
            condiciones.push("fecha <= ?");
            parametros.push(hasta);
        }

        const donde = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

        // Fragmentos SQL fijos (no contienen datos del usuario)
        const PAGADO = "COALESCE(LOWER(estado_pago), 'pendiente') = 'pagado'";
        const CANCELADA = "COALESCE(LOWER(estado), 'pendiente') = 'cancelada'";

        const [[r]] = await pool.execute(
            `SELECT
                COUNT(*) AS total_citas,
                COALESCE(SUM(CASE WHEN COALESCE(LOWER(estado), 'pendiente') = 'pendiente' THEN 1 ELSE 0 END), 0) AS pendientes,
                COALESCE(SUM(CASE WHEN LOWER(estado) = 'confirmada' THEN 1 ELSE 0 END), 0) AS confirmadas,
                COALESCE(SUM(CASE WHEN LOWER(estado) = 'completada' THEN 1 ELSE 0 END), 0) AS completadas,
                COALESCE(SUM(CASE WHEN ${CANCELADA} THEN 1 ELSE 0 END), 0) AS canceladas,
                COALESCE(SUM(CASE WHEN ${PAGADO} THEN 1 ELSE 0 END), 0) AS citas_pagadas,
                COALESCE(SUM(CASE WHEN ${PAGADO} THEN COALESCE(precio, 0) ELSE 0 END), 0) AS ingresos_cobrados,
                COALESCE(SUM(CASE WHEN NOT (${PAGADO}) AND NOT (${CANCELADA}) THEN COALESCE(precio, 0) ELSE 0 END), 0) AS por_cobrar
             FROM CITA
             ${donde}`,
            parametros
        );

        const agrupar = async (expresion) => {
            const [filas] = await pool.execute(
                `SELECT
                    ${expresion} AS etiqueta,
                    COUNT(*) AS citas,
                    SUM(CASE WHEN ${PAGADO} THEN 1 ELSE 0 END) AS pagadas,
                    SUM(CASE WHEN ${PAGADO} THEN COALESCE(precio, 0) ELSE 0 END) AS cobrado
                 FROM CITA
                 ${donde}
                 GROUP BY etiqueta
                 ORDER BY cobrado DESC, citas DESC`,
                parametros
            );

            return filas.map(f => ({
                etiqueta: String(f.etiqueta),
                citas: Number(f.citas),
                pagadas: Number(f.pagadas),
                cobrado: Number(f.cobrado)
            }));
        };

        const [porMetodoPago, porBarbero, porServicio] = await Promise.all([
            agrupar("COALESCE(NULLIF(TRIM(metodo_pago), ''), 'sin definir')"),
            agrupar("COALESCE(NULLIF(TRIM(barbero), ''), 'Sin asignar')"),
            agrupar("COALESCE(NULLIF(TRIM(SUBSTRING_INDEX(servicio, ' - ', 1)), ''), 'Sin definir')")
        ]);

        return res.json({
            rango: { desde: desde || null, hasta: hasta || null },
            resumen: {
                totalCitas: Number(r.total_citas),
                pendientes: Number(r.pendientes),
                confirmadas: Number(r.confirmadas),
                completadas: Number(r.completadas),
                canceladas: Number(r.canceladas),
                citasPagadas: Number(r.citas_pagadas),
                ingresosCobrados: Number(r.ingresos_cobrados),
                porCobrar: Number(r.por_cobrar)
            },
            porMetodoPago,
            porBarbero,
            porServicio
        });
    } catch (error) {
        console.error("Error generando reporte:", error.code || "", error.sqlMessage || error.message);
        return res.status(500).json({
            error: "No se pudo generar el reporte"
        });
    }
});


// ==================================================
// MANEJO DE ERRORES
// ==================================================

app.use((error, req, res, next) => {
    if (error && error.message === "Origen no permitido por CORS") {
        return res.status(403).json({ error: "Origen no permitido" });
    }

    if (error && error.type === "entity.too.large") {
        return res.status(413).json({ error: "La solicitud es demasiado grande" });
    }

    if (error instanceof SyntaxError && error.status === 400) {
        return res.status(400).json({ error: "El cuerpo de la solicitud no es un JSON válido" });
    }

    console.error("Error no controlado:", error && error.message);
    return res.status(500).json({ error: "Error interno del servidor" });
});

// ==================================================
// INICIAR SERVIDOR
// ==================================================

pool.getConnection()
    .then(c => { console.log("MySQL conectado correctamente"); c.release(); })
    .catch(e => console.error("Error al conectar con MySQL:", e.message));

app.listen(PUERTO, () => {
    console.log(`Servidor funcionando en http://localhost:${PUERTO}`);
});