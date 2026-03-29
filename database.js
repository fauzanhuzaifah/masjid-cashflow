const { Pool } = require('pg');
const pool = new Pool({
    connectionString: 'postgresql://neondb_owner:npg_nYofk8bzh6iN@ep-proud-resonance-a17cc61l-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
    ssl: { rejectUnauthorized: false }
});
const query = async (text, params) => {
    const result = await pool.query(text, params);
    return [result.rows, result.fields];
};
module.exports = { query, pool };