require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express(); // <-- Deklarasi app (ini yang kurang)

// Middleware dasar
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'rahasia123', // Ganti dengan secret yang lebih aman
    resave: false,
    saveUninitialized: true
}));

// Set view engine (sesuaikan dengan yang Anda pakai, misal ejs atau pug)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files (jika ada folder public)
app.use(express.static(path.join(__dirname, 'public')));

// Routes
const authRoutes = require('./routes/authRoutes');
const transactionRoutes = require('./routes/transactionRoutes');

app.use('/', authRoutes);
app.use('/', transactionRoutes);

// Jalankan server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});