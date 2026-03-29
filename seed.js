const pool = require('./config/db');
const bcrypt = require('bcryptjs');

async function createSuperAdmin() {
    const username = 'superadmin';
    const plainPassword = 'admin123'; // Password yang Anda inginkan
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    try {
        const conn = await pool.getConnection();
        // Cek dulu apakah sudah ada
        const rows = await conn.query("SELECT * FROM users WHERE username = ?", [username]);
        if (rows.length === 0) {
            await conn.query(
                "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
                [username, hashedPassword, 'super_admin']
            );
            console.log('Super Admin berhasil dibuat!');
        } else {
            console.log('Super Admin sudah ada.');
        }
        conn.release();
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit();
    }
}

createSuperAdmin();