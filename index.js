require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');

// Import route
const authRoutes = require('./routes/authRoutes');
const transactionRoutes = require('./routes/transactionRoutes');

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'rahasia_default',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Route root - arahkan ke login
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Routes
app.use('/', authRoutes);
app.use('/', transactionRoutes);

// Hanya listen di lokal
if (process.env.NODE_ENV !== 'production') {
    app.listen(process.env.PORT || 3000, () => {
        console.log('Server berjalan di port', process.env.PORT || 3000);
    });
}

module.exports = app;