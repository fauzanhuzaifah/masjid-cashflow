// Cek apakah user sudah login
const requireLogin = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    } else {
        res.redirect('/login');
    }
};

// Cek apakah user adalah Super Admin
const requireSuperAdmin = (req, res, next) => {
    if (req.session.role === 'super_admin') {
        return next();
    } else {
        res.status(403).send('Akses Ditolak. Halaman ini hanya untuk Super Admin.');
    }
};

module.exports = { requireLogin, requireSuperAdmin };