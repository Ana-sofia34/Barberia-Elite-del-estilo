
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "",
    database: "barberia_elite_del_estilo",
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10
});

async function probarConexion() {
    try {
        const conexion = await pool.getConnection();

        console.log("Conexión con MySQL exitosa");

        conexion.release();
    } catch (error) {
        console.error("Error al conectar con MySQL:", error.message);
    }
}

probarConexion();

module.exports = pool;
