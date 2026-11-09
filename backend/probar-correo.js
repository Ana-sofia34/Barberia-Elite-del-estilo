
require("dotenv").config();

const nodemailer = require("nodemailer");

// Verificar que las variables estén configuradas
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error("Error: faltan las credenciales del archivo .env");
    process.exit(1);
}

// Configuración del servidor de correo Gmail
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,

    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },

    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000
});

// Función para probar el envío del correo
async function probarCorreo() {
    try {
        console.log("Conectando con el servidor de Gmail...");

        // Comprobar conexión y autenticación
        await transporter.verify();

        console.log("Conexión con Gmail exitosa.");

        // Enviar correo de prueba
        const resultado = await transporter.sendMail({
            from: {
                name: "Barbería Élite del Estilo",
                address: process.env.EMAIL_USER
            },

            to: process.env.EMAIL_USER,

            subject: "Prueba de correo - Barbería Élite",

            text: `
¡Hola!

Este es un correo de prueba de Barbería Élite del Estilo.

La configuración del sistema de correo funciona correctamente.

Ya podemos avanzar con la recuperación de contraseñas.

Saludos,
Barbería Élite del Estilo.
            `,

            html: `
                <div style="font-family: Arial, sans-serif; 
                            background-color: #f5f5f5; 
                            padding: 30px;">
                    <div style="max-width: 500px; margin: auto; 
                                background: #ffffff; 
                                padding: 30px; 
                                border-radius: 12px;
                                text-align: center;">

                        <h1 style="color: #b38b35;">
                            Barbería Élite
                        </h1>

                        <h2>¡Correo configurado correctamente!</h2>

                        <p>
                            Este es un mensaje de prueba de nuestro
                            sistema de correo electrónico.
                        </p>

                        <p>
                            Ya podemos avanzar con la recuperación
                            de contraseñas.
                        </p>

                        <hr>

                        <p style="color: #777;">
                            Barbería Élite del Estilo
                        </p>
                    </div>
                </div>
            `
        });

        console.log("--------------------------------");
        console.log("¡CORREO ENVIADO EXITOSAMENTE!");
        console.log("Identificador:", resultado.messageId);
        console.log("Destinatario:", process.env.EMAIL_USER);
        console.log("--------------------------------");

    } catch (error) {
        console.error("--------------------------------");
        console.error("ERROR AL ENVIAR EL CORREO");
        console.error("Código:", error.code || "No disponible");
        console.error("Mensaje:", error.message);
        console.error("--------------------------------");

    } finally {
        transporter.close();
    }
}

// Ejecutar la prueba
probarCorreo();
