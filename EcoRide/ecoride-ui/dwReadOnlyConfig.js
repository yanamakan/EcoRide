require('dotenv').config();
const sql = require('mssql');

// A SEPARATE pool from dwConfig.js, authenticated as a login that only has
// db_datareader on ECORIDE_DW (see readonly_login_setup.sql). This is the
// real safety net for the AI assistant's free-form query fallback: even if
// a generated query somehow got past the application-level checks, this
// login has no permission to write or change anything.
const readOnlyConfig = {
    user: process.env.DW_READONLY_USER || 'ecoride_readonly',
    password: process.env.DW_READONLY_PASSWORD,
    server: process.env.DW_SERVER || process.env.DB_SERVER || 'localhost',
    port: parseInt(process.env.DW_PORT || process.env.DB_PORT, 10) || 1433,
    database: process.env.DW_NAME || 'ECORIDE_DW',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
    requestTimeout: 8000  // 8s cap so a slow/bad query can't hang the chat
};

let dwReadOnlyPoolPromise = null;

function getDwReadOnlyPool() {
    if (!process.env.DW_READONLY_PASSWORD) {
        return Promise.reject(new Error(
            'DW_READONLY_PASSWORD is not set in .env -- run readonly_login_setup.sql ' +
            'and add the credentials before the free-form AI fallback will work.'
        ));
    }
    if (!dwReadOnlyPoolPromise) {
        dwReadOnlyPoolPromise = new sql.ConnectionPool(readOnlyConfig)
            .connect()
            .then(pool => {
                console.log('Connected to ECORIDE_DW as read-only (AI fallback)');
                return pool;
            })
            .catch(err => {
                dwReadOnlyPoolPromise = null; // allow retry on next call
                throw err;
            });
    }
    return dwReadOnlyPoolPromise;
}

module.exports = { sql, getDwReadOnlyPool };
