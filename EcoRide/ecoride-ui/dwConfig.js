require('dotenv').config();
const sql = require('mssql');

// Separate connection pool for the DATA WAREHOUSE (ECORIDE_DW), kept apart
// from dbConfig.js which points at the operational database (ECORIDEDB).
const dwConfigObj = {
    user: process.env.DW_USER || process.env.DB_USER || 'sa',
    password: process.env.DW_PASSWORD || process.env.DB_PASSWORD || '',
    server: process.env.DW_SERVER || process.env.DB_SERVER || 'localhost',
    database: process.env.DW_NAME || 'ECORIDE_DW',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

if (!process.env.DW_USER && !process.env.DB_USER) {
    console.error('Missing data warehouse credentials. Set DW_USER/ DW_PASSWORD or DB_USER/ DB_PASSWORD in your environment or .env file.');
}

const dwPoolPromise = new sql.ConnectionPool(dwConfigObj)
    .connect()
    .then(pool => {
        console.log('Connected to ECORIDE_DW (data warehouse)');
        return pool;
    })
    .catch(err => {
        console.error('Data warehouse connection failed:', err.message);
        throw err;
    });

module.exports = { sql, dwPoolPromise };
