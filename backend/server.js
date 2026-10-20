const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.json());

// Conexión con PostgreSQL
const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "Barbería elite del estilo",
    password: "root",
    port: 5432
});

// Probar conexión
pool.query("SELECT NOW()", (error, resultado) => {
    if (error) {
        console.error("Error al conectar con PostgreSQL:", error);
    } else {
        console.log("PostgreSQL conectado correctamente");
    }
});

app.get("/usuarios", async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM "USUARIO"');
        res.json(resultado.rows);
    } catch (error) {
        console.error("Error al consultar usuarios:", error);
        res.status(500).json({ error: "Error al consultar usuarios" });
    }
});

app.post("/usuarios", async (req, res) => {
    try {
        const { nombre, correo, contraseña, estado } = req.body;

        const resultado = await pool.query(
            'INSERT INTO "USUARIO" (nombre, correo, contraseña, estado) VALUES ($1, $2, $3, $4) RETURNING *',
            [nombre, correo, contraseña, estado]
        );

        res.json(resultado.rows[0]);

    } catch (error) {
        console.error("Error al registrar usuario:", error);
        res.status(500).json({ error: "Error al registrar usuario" });
    }
});

// Iniciar sesión
app.post("/login", async (req, res) => {
    try {
        const { correo, contraseña } = req.body;

        const resultado = await pool.query(
            'SELECT * FROM "USUARIO" WHERE correo = $1 AND contraseña = $2',
            [correo, contraseña]
        );

        if (resultado.rows.length === 0) {
            return res.status(401).json({
                error: "Correo o contraseña incorrectos"
            });
        }

        const usuario = resultado.rows[0];

        res.json({
            id_usuario: usuario.id_usuario,
            nombre: usuario.nombre,
            correo: usuario.correo,
            estado: usuario.estado
        });

    } catch (error) {
        console.error("Error al iniciar sesión:", error);

        res.status(500).json({
            error: "Error al iniciar sesión"
        });
    }
});


// ================================
// REGISTRAR CITA
// ================================
app.post("/citas", async (req, res) => {
    try {
        const {
            id_usuario,
            servicio,
            barbero,
            fecha,
            hora,
            estado,
            precio,
            metodo_pago,
            estado_pago,
            fecha_pago,
            transaccion_id
        } = req.body;

        const resultado = await pool.query(
            `INSERT INTO "CITA"
            (
                id_usuario,
                servicio,
                barbero,
                fecha,
                hora,
                estado,
                precio,
                metodo_pago,
                estado_pago,
                fecha_pago,
                transaccion_id
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            RETURNING *`,
            [
                id_usuario,
                servicio,
                barbero,
                fecha,
                hora,
                estado || "pendiente",
                precio,
                metodo_pago || "efectivo",
                estado_pago || "pendiente",
                fecha_pago || null,
                transaccion_id || null
            ]
        );

        res.json(resultado.rows[0]);

    } catch (error) {
        console.error("Error al registrar cita:", error);

        res.status(500).json({
            error: "Error al registrar la cita"
        });
    }
});

// Servidor
app.listen(3000, () => {
    console.log("Servidor funcionando en http://localhost:3000");
});