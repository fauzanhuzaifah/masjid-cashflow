const express = require('express');
const router = express.Router();
const db = require('../database'); // <- gunakan database.js yang sudah dibuat
const bcrypt = require('bcryptjs');
const { requireLogin, requireSuperAdmin } = require('../middleware/auth');
const { exec } = require('child_process');

// Halaman Login
router.get('/login', (req, res) => {
    res.render('login', { error: null });
});

// Proses Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        // Langsung pakai db.query (wrapper sudah mengembalikan [rows, fields])
        const [rows] = await db.query("SELECT * FROM users WHERE username = $1", [username]);

        if (rows.length > 0) {
            const user = rows[0];
            const isMatch = await bcrypt.compare(password, user.password);
            
            if (isMatch) {
                // Cek status aktif (boolean di PostgreSQL)
                if (!user.is_active) {
                    return res.render('login', { error: 'Akun Anda telah dinonaktifkan.' });
                }

                req.session.userId = user.id;
                req.session.username = user.username;
                req.session.role = user.role;
                return res.redirect('/dashboard');
            }
        }
        res.render('login', { error: 'Username atau Password salah!' });
    } catch (err) {
        console.error(err);
        res.send('Terjadi kesalahan server');
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// --- Manajemen Admin (Hanya Super Admin) ---

// Halaman Daftar Admin
router.get('/admin/manage', requireLogin, requireSuperAdmin, async (req, res) => {
    const [users] = await db.query("SELECT id, username, role, is_active FROM users");
    res.render('manageAdmin', { users, user: req.session });
});

// Halaman Tambah Admin
router.post('/admin/add', requireLogin, requireSuperAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    try {
        await db.query("INSERT INTO users (username, password, role) VALUES ($1, $2, $3)", [username, hashedPassword, role]);
        res.redirect('/admin/manage');
    } catch (err) {
        res.send('Error: Username mungkin sudah digunakan.');
    }
});

// --- FITUR BACKUP DATABASE ---
// PERHATIAN: Backup dengan mysqldump TIDAK BISA digunakan untuk PostgreSQL.
// Anda harus mengganti dengan pg_dump. Saya akan berikan contoh menggunakan pg_dump.
// Namun karena Anda deploy ke Vercel, backup via server lokal tidak relevan.
// Saya sarankan backup via dashboard Neon atau gunakan pg_dump di lingkungan lokal.
// Di bawah adalah contoh modifikasi jika Anda tetap ingin backup via command line (hanya untuk pengembangan lokal):
router.get('/admin/backup', requireLogin, requireSuperAdmin, (req, res) => {
    // Gunakan pg_dump (pastikan terinstal dan PATH sudah sesuai)
    const pgDumpPath = 'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe'; // Sesuaikan path
    const connectionString = process.env.DATABASE_URL; // dari .env
    
    const date = new Date();
    const fileName = `Backup_KasMasjid_${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}.sql`;

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Perintah pg_dump
    const command = `"${pgDumpPath}" "${connectionString}"`;
    
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error Backup: ${error.message}`);
            console.error(`Stderr: ${stderr}`);
            return res.status(500).send(`Gagal backup. Pastikan pg_dump tersedia dan DATABASE_URL benar. Error: ${error.message}`);
        }
        res.send(stdout);
    });
});

// --- FORM GANTI PASSWORD ---
router.get('/change-password', requireLogin, (req, res) => {
    res.render('changePassword', { 
        user: req.session, 
        error: null, 
        success: null 
    });
});

// --- PROSES GANTI PASSWORD ---
router.post('/change-password', requireLogin, async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.session.userId;

    if (!currentPassword || !newPassword || !confirmPassword) {
        return res.render('changePassword', { 
            user: req.session, 
            error: 'Semua field wajib diisi.', 
            success: null 
        });
    }

    if (newPassword !== confirmPassword) {
        return res.render('changePassword', { 
            user: req.session, 
            error: 'Password baru dan konfirmasi tidak cocok.', 
            success: null 
        });
    }

    try {
        const [rows] = await db.query("SELECT * FROM users WHERE id = $1", [userId]);
        if (rows.length === 0) {
            return res.redirect('/logout');
        }
        const user = rows[0];

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.render('changePassword', { 
                user: req.session, 
                error: 'Password lama yang Anda masukkan salah.', 
                success: null 
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.query("UPDATE users SET password = $1 WHERE id = $2", [hashedPassword, userId]);

        res.render('changePassword', { 
            user: req.session, 
            error: null, 
            success: 'Password berhasil diubah! Silakan login ulang jika perlu.' 
        });
    } catch (err) {
        console.error(err);
        res.send("Error server");
    }
});

// --- RESET PASSWORD ADMIN (Oleh Super Admin) ---
router.post('/admin/reset-password/:id', requireLogin, requireSuperAdmin, async (req, res) => {
    const { newPassword } = req.body;
    const userId = req.params.id;

    if (!newPassword) {
        return res.send("Password baru tidak boleh kosong.");
    }

    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.query("UPDATE users SET password = $1 WHERE id = $2", [hashedPassword, userId]);
        res.redirect('/admin/manage');
    } catch (err) {
        console.error(err);
        res.send("Gagal reset password");
    }
});

// --- NONAKTIFKAN ADMIN (Soft Delete) ---
router.post('/admin/deactivate/:id', requireLogin, requireSuperAdmin, async (req, res) => {
    const userId = req.params.id;
    
    if (userId == req.session.userId) {
        return res.send("Error: Anda tidak dapat menonaktifkan akun Anda sendiri.");
    }

    try {
        await db.query("UPDATE users SET is_active = FALSE WHERE id = $1", [userId]);
        res.redirect('/admin/manage');
    } catch (err) {
        console.error(err);
        res.send("Gagal menonaktifkan admin");
    }
});

// --- AKTIFKAN KEMBALI ADMIN ---
router.post('/admin/activate/:id', requireLogin, requireSuperAdmin, async (req, res) => {
    const userId = req.params.id;
    try {
        await db.query("UPDATE users SET is_active = TRUE WHERE id = $1", [userId]);
        res.redirect('/admin/manage');
    } catch (err) {
        console.error(err);
        res.send("Gagal mengaktifkan admin");
    }
});

// --- HAPUS PERMANEN ADMIN + DATA TRANSAKSI (Hard Delete) ---
router.post('/admin/hard-delete/:id', requireLogin, requireSuperAdmin, async (req, res) => {
    const userId = req.params.id;
    const { confirmation } = req.body;

    if (userId == req.session.userId) {
        return res.send("Error: Tidak dapat menghapus akun sendiri.");
    }

    if (confirmation !== "HAPUS") {
        return res.send("Konfirmasi gagal. Ketik 'HAPUS' (huruf besar) untuk melanjutkan.");
    }

    try {
        // Hapus transaksi terkait user
        await db.query("DELETE FROM transactions WHERE user_id = $1", [userId]);
        // Hapus user
        await db.query("DELETE FROM users WHERE id = $1", [userId]);
        res.redirect('/admin/manage');
    } catch (err) {
        console.error(err);
        res.send("Gagal menghapus permanen.");
    }
});

// Catatan: Satu duplikat route /admin/activate/:id sudah dihapus (hanya satu).
module.exports = router;