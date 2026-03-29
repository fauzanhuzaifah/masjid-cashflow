const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const query = async (text, params) => {
    const result = await pool.query(text, params);
    return [result.rows, result.fields];
};

module.exports = { query, pool };