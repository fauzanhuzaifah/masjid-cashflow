router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        console.log('Login attempt for username:', username);
        const [rows] = await db.query("SELECT * FROM users WHERE username = $1", [username]);
        console.log('Rows found:', rows.length);
        
        if (rows.length === 0) {
            console.log('User not found');
            return res.render('login', { error: 'Username atau Password salah!' });
        }
        
        const user = rows[0];
        console.log('User found:', user.username, 'is_active:', user.is_active);
        
        const isMatch = await bcrypt.compare(password, user.password);
        console.log('Password match:', isMatch);
        
        if (!isMatch) {
            return res.render('login', { error: 'Username atau Password salah!' });
        }
        
        if (!user.is_active) {
            return res.render('login', { error: 'Akun Anda telah dinonaktifkan.' });
        }
        
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.role = user.role;
        console.log('Login successful, redirecting to dashboard');
        res.redirect('/dashboard');
    } catch (err) {
        console.error('Login error:', err);
        // Kirim error detail ke browser
        res.status(500).send(`Login error: ${err.message}<br><br>Stack: ${err.stack}`);
    }
});