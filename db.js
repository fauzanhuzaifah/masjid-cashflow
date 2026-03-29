const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Neon memerlukan SSL
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool // jika perlu akses pool langsung
};