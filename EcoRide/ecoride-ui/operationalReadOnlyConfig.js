require('dotenv').config();
const sql = require('mssql');

// A SEPARATE pool for the OPERATIONAL database (ECORIDEDB), authenticated as
// the SELECT-only login created by operational_readonly_login_setup.sql.
// That login cannot read dbo.ACCOUNT (password hashes) and is denied the
// customer/employee contact columns and the payment account number/expiry
// date, so even if a generated query slipped past the application-level
// checks in aiAssistant.js, the database itself would refuse it.
const readOnlyConfig = {
    user: process.env.OP_DB_USER || 'ecoride_ai_readonly',
    password: process.env.OP_DB_PASSWORD,
    server: process.env.OP_DB_SERVER || process.env.DB_SERVER || 'localhost',
    port: parseInt(process.env.OP_DB_PORT || process.env.DB_PORT, 10) || 1433,
    database: process.env.OP_DB_NAME || process.env.DB_NAME || 'ECORIDEDB',
    options: {
        encrypt: String(process.env.OP_DB_ENCRYPT).toLowerCase() === 'true',
        trustServerCertificate: true,
        enableArithAbort: true
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
    requestTimeout: 8000  // 8s cap so a slow/bad query can't hang the chat
};

let operationalPoolPromise = null;

function getOperationalReadOnlyPool() {
    if (!process.env.OP_DB_PASSWORD) {
        return Promise.reject(new Error(
            'OP_DB_PASSWORD is not set in .env -- run operational_readonly_login_setup.sql ' +
            'and add the OP_DB_* credentials before the chatbot can query ECORIDEDB.'
        ));
    }
    if (!operationalPoolPromise) {
        operationalPoolPromise = new sql.ConnectionPool(readOnlyConfig)
            .connect()
            .then(pool => {
                console.log('Connected to ECORIDEDB as read-only (AI assistant)');
                return pool;
            })
            .catch(err => {
                operationalPoolPromise = null; // allow retry on next call
                throw err;
            });
    }
    return operationalPoolPromise;
}

module.exports = { sql, getOperationalReadOnlyPool };
