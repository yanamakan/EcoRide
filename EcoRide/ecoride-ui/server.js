const express = require('express');
const bodyParser = require('body-parser');
const { poolPromise, sql } = require('./dbConfig');
const { dwPoolPromise } = require('./dwConfig');
const locationCoords = require('./locationCoords');
const { askEcoRide, makeRateLimiter } = require('./aiAssistant');
const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get('/assistant', (req, res) => {
    res.render('assistant', { page: 'assistant' });
});

// ─── HOME ───────────────────────────────────────────────────────────────────
app.get('/', async (req, res) => {
    try {
        const pool = await poolPromise;
        const stats = await pool.request().query(`
            SELECT
                (SELECT COUNT(*) FROM CUSTOMER)       AS customers,
                (SELECT COUNT(*) FROM RIDE)           AS rides,
                (SELECT COUNT(*) FROM VEHICLE)        AS vehicles,
                (SELECT COUNT(*) FROM SUPPORT_TICKET) AS tickets
        `);
        res.render('index', { stats: stats.recordset[0] });
    } catch (err) {
        res.render('index', { stats: { customers: 0, rides: 0, vehicles: 0, tickets: 0 } });
    }
});

// ─── CUSTOMERS CRUD ──────────────────────────────────────────────────────────
app.get('/customers', async (req, res) => {
    try {
        const pool = await poolPromise;
        const search = req.query.search || '';
        const query = search
            ? `SELECT * FROM CUSTOMER WHERE CUSTOMERNAME LIKE @search OR CUSTOMEREMAIL LIKE @search`
            : `SELECT * FROM CUSTOMER`;
        const request = pool.request();
        if (search) request.input('search', sql.VarChar, `%${search}%`);
        const result = await request.query(query);
        res.render('customers', { data: result.recordset, search });
    } catch (err) {
        res.status(500).render('error', { message: err.message });
    }
});

app.post('/customers/add', async (req, res) => {
    try {
        const pool = await poolPromise;
        const { customerid, customername, customerphone, customeremail } = req.body;
        await pool.request()
            .input('customerid', sql.VarChar, customerid)
            .input('customername', sql.VarChar, customername)
            .input('customerphone', sql.VarChar, customerphone)
            .input('customeremail', sql.VarChar, customeremail)
            .query(`INSERT INTO CUSTOMER (CUSTOMERID, CUSTOMERNAME, CUSTOMERPHONE, CUSTOMEREMAIL)
                    VALUES (@customerid, @customername, @customerphone, @customeremail)`);
        res.redirect('/customers');
    } catch (err) {
        res.status(500).render('error', { message: err.message });
    }
});

app.post('/customers/delete/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        await pool.request()
            .input('id', sql.VarChar, req.params.id)
            .query(`DELETE FROM CUSTOMER WHERE CUSTOMERID = @id`);
        res.redirect('/customers');
    } catch (err) {
        res.status(500).render('error', { message: err.message });
    }
});

// ─── REPORTS ─────────────────────────────────────────────────────────────────
app.get('/reports', async (req, res) => {
    try {
        const pool = await poolPromise;

        const revenueByType = await pool.request().query(`
            SELECT
                VT.TYPENAME       AS TypeName,
                COUNT(R.RIDEID)   AS TotalRides,
                SUM(R.FAREAMOUNT) AS Revenue
            FROM VEHICLE_TYPE VT
            JOIN VEHICLE V ON VT.VEHICLETYPEID = V.VEHICLETYPEID
            JOIN RIDE R    ON V.VEHICLEID      = R.VEHICLEID
            GROUP BY VT.TYPENAME
            HAVING COUNT(R.RIDEID) > 0
            ORDER BY Revenue DESC
        `);

        const recentRides = await pool.request().query(`
            SELECT TOP 10
                R.RIDEID,
                C.CUSTOMERNAME,
                V.MODEL       AS Vehicle,
                R.ROUTE,
                R.FAREAMOUNT,
                R.STATUS,
                R.STARTTIME
            FROM RIDE R
            JOIN CUSTOMER C ON R.CUSTOMERID = C.CUSTOMERID
            JOIN VEHICLE  V ON R.VEHICLEID  = V.VEHICLEID
            ORDER BY R.STARTTIME DESC
        `);

        res.render('reports', {
            salesByDept: revenueByType.recordset.map(r => ({
                DepartmentName: r.TypeName,
                TotalSales: r.TotalRides,
                Revenue: r.Revenue
            })),
            recentTx: recentRides.recordset.map(r => ({
                TransactionID: r.RIDEID,
                Stakeholder: r.CUSTOMERNAME,
                DepartmentName: r.Vehicle,
                Amount: r.FAREAMOUNT,
                TransactionDate: r.STARTTIME
            }))
        });
    } catch (err) {
        res.status(500).render('error', { message: err.message });
    }
});

// ─── BI DASHBOARD (from ECORIDE_DW data warehouse) ───────────────────────────
app.get('/insights', async (req, res) => {
    try {
        const pool = await dwPoolPromise;

        // Build the optional filter clause + parameters shared by every query.
        // Every aggregate below joins all 5 dimensions so any combination of
        // filters is always valid, regardless of which chart is being grouped.
        function buildFilteredRequest() {
            const r = pool.request();
            const clauses = [];
            if (req.query.month) {
                r.input('month', sql.Int, parseInt(req.query.month, 10));
                clauses.push('d.MONTH = @month');
            }
            if (req.query.location) {
                r.input('location', sql.VarChar, req.query.location);
                clauses.push('loc.NAME = @location');
            }
            if (req.query.vehicletype) {
                r.input('vehicletype', sql.VarChar, req.query.vehicletype);
                clauses.push('v.TYPENAME = @vehicletype');
            }
            if (req.query.paymentmethod) {
                r.input('paymentmethod', sql.VarChar, req.query.paymentmethod);
                clauses.push('pm.METHODTYPE = @paymentmethod');
            }
            const extra = clauses.length ? ' AND ' + clauses.join(' AND ') : '';
            return { r, extra };
        }

        const BASE_FROM = `
            FROM FACT_RIDE f
            JOIN DIM_DATE           d   ON f.DATEKEY          = d.DATEKEY
            JOIN DIM_ROUTE          rt  ON f.ROUTEKEY         = rt.ROUTEKEY
            JOIN DIM_LOCATION       loc ON f.LOCATIONKEY      = loc.LOCATIONKEY
            JOIN DIM_VEHICLE        v   ON f.VEHICLEKEY       = v.VEHICLEKEY
            JOIN DIM_PAYMENT_METHOD pm  ON f.PAYMENTMETHODKEY = pm.PAYMENTMETHODKEY
            WHERE d.YEAR = 2024`;

        // ── KPIs ──
        const kpiReq = buildFilteredRequest();
        const kpiResult = await kpiReq.r.query(`
            SELECT
                ISNULL(SUM(f.FAREAMOUNT), 0)              AS TotalRevenue,
                ISNULL(SUM(f.RIDECOUNT), 0)                AS TotalRides,
                ISNULL(AVG(f.RIDEDURATIONMINUTES), 0)      AS AvgDuration
            ${BASE_FROM}${kpiReq.extra}`);
        const kpiRow = kpiResult.recordset[0];
        const totalRevenue = kpiRow.TotalRevenue || 0;
        const totalRides = kpiRow.TotalRides || 0;
        const avgFare = totalRides > 0 ? totalRevenue / totalRides : 0;

        // ── Revenue by month ──
        const monthReq = buildFilteredRequest();
        const revenueByMonth = await monthReq.r.query(`
            SELECT d.MONTH, d.MONTHNAME, SUM(f.FAREAMOUNT) AS Revenue
            ${BASE_FROM}${monthReq.extra}
            GROUP BY d.MONTH, d.MONTHNAME
            ORDER BY d.MONTH`);

        // ── Top 10 routes by revenue ──
        const routeReq = buildFilteredRequest();
        const topRoutes = await routeReq.r.query(`
            SELECT TOP 10 rt.ROUTEID, rt.STARTLOCATION, rt.ENDLOCATION,
                   SUM(f.FAREAMOUNT) AS Revenue, SUM(f.RIDECOUNT) AS Rides
            ${BASE_FROM}${routeReq.extra}
            GROUP BY rt.ROUTEID, rt.STARTLOCATION, rt.ENDLOCATION
            ORDER BY Revenue DESC`);

        // ── Top 10 vehicle types by rides ──
        const vehicleReq = buildFilteredRequest();
        const topVehicleTypes = await vehicleReq.r.query(`
            SELECT TOP 10 v.TYPENAME, SUM(f.RIDECOUNT) AS Rides, SUM(f.FAREAMOUNT) AS Revenue
            ${BASE_FROM}${vehicleReq.extra}
            GROUP BY v.TYPENAME
            ORDER BY Rides DESC`);

        // ── Top 10 locations by revenue ──
        const locationReq = buildFilteredRequest();
        const topLocations = await locationReq.r.query(`
            SELECT TOP 10 loc.NAME, SUM(f.FAREAMOUNT) AS Revenue, SUM(f.RIDECOUNT) AS Rides
            ${BASE_FROM}${locationReq.extra}
            GROUP BY loc.NAME
            ORDER BY Revenue DESC`);

        // ── Revenue by payment method ──
        const paymentReq = buildFilteredRequest();
        const revenueByPayment = await paymentReq.r.query(`
            SELECT pm.METHODTYPE, SUM(f.FAREAMOUNT) AS Revenue
            ${BASE_FROM}${paymentReq.extra}
            GROUP BY pm.METHODTYPE
            ORDER BY Revenue DESC`);

        // ── All-location stats (for the map + the what-if simulator) ──
        // Starts from DIM_LOCATION (not FACT_RIDE) with LEFT JOINs, so every
        // hub is returned even if it has zero rides under the current
        // filters -- those just come back as 0s instead of disappearing.
        // Filters are applied inside CASE expressions rather than a WHERE
        // clause, since a WHERE here would drop the very rows (hubs with no
        // matching rides) we want to keep.
        const allLocReq = pool.request();
        allLocReq.input('month', sql.Int, req.query.month ? parseInt(req.query.month, 10) : null);
        allLocReq.input('location', sql.VarChar, req.query.location || null);
        allLocReq.input('vehicletype', sql.VarChar, req.query.vehicletype || null);
        allLocReq.input('paymentmethod', sql.VarChar, req.query.paymentmethod || null);
        const allLocationStats = await allLocReq.query(`
            SELECT
                loc.NAME,
                ISNULL(SUM(CASE WHEN cond.ok = 1 THEN f.FAREAMOUNT END), 0) AS Revenue,
                ISNULL(SUM(CASE WHEN cond.ok = 1 THEN f.RIDECOUNT  END), 0) AS Rides,
                COUNT(DISTINCT CASE WHEN cond.ok = 1 THEN f.VEHICLEKEY END) AS Vehicles
            FROM DIM_LOCATION loc
            LEFT JOIN FACT_RIDE           f  ON f.LOCATIONKEY = loc.LOCATIONKEY
            LEFT JOIN DIM_DATE            d  ON f.DATEKEY = d.DATEKEY
            LEFT JOIN DIM_VEHICLE         v  ON f.VEHICLEKEY = v.VEHICLEKEY
            LEFT JOIN DIM_PAYMENT_METHOD  pm ON f.PAYMENTMETHODKEY = pm.PAYMENTMETHODKEY
            CROSS APPLY (
                SELECT CASE WHEN
                        (f.RIDEKEY IS NOT NULL)
                        AND (d.YEAR = 2024)
                        AND (@month IS NULL OR d.MONTH = @month)
                        AND (@location IS NULL OR loc.NAME = @location)
                        AND (@vehicletype IS NULL OR v.TYPENAME = @vehicletype)
                        AND (@paymentmethod IS NULL OR pm.METHODTYPE = @paymentmethod)
                    THEN 1 ELSE 0 END AS ok
            ) cond
            GROUP BY loc.NAME`);

        // Merge in real-world coordinates; skip any hub we don't have a
        // coordinate for rather than plotting it at (0,0).
        const locationStats = allLocationStats.recordset
            .map(row => {
                const coord = locationCoords[row.NAME];
                if (!coord) return null;
                const revenue = row.Revenue || 0;
                const vehicles = row.Vehicles || 0;
                return {
                    name: row.NAME,
                    revenue,
                    rides: row.Rides || 0,
                    vehicles,
                    revenuePerVehicle: vehicles > 0 ? revenue / vehicles : 0,
                    lat: coord.lat,
                    lng: coord.lng
                };
            })
            .filter(Boolean);

        // ── Filter dropdown options (unfiltered, so lists never shrink) ──
        const months = await pool.request().query(
            `SELECT DISTINCT MONTH, MONTHNAME FROM DIM_DATE WHERE YEAR = 2024 ORDER BY MONTH`);
        const locations = await pool.request().query(
            `SELECT DISTINCT loc.NAME FROM DIM_LOCATION loc
             JOIN FACT_RIDE f ON f.LOCATIONKEY = loc.LOCATIONKEY ORDER BY loc.NAME`);
        const vehicleTypes = await pool.request().query(
            `SELECT DISTINCT v.TYPENAME FROM DIM_VEHICLE v
             JOIN FACT_RIDE f ON f.VEHICLEKEY = v.VEHICLEKEY ORDER BY v.TYPENAME`);
        const paymentMethods = await pool.request().query(
            `SELECT DISTINCT pm.METHODTYPE FROM DIM_PAYMENT_METHOD pm
             JOIN FACT_RIDE f ON f.PAYMENTMETHODKEY = pm.PAYMENTMETHODKEY ORDER BY pm.METHODTYPE`);

        res.render('insights', {
            kpi: { totalRevenue, totalRides, avgFare },
            revenueByMonth: revenueByMonth.recordset,
            topRoutes: topRoutes.recordset,
            topVehicleTypes: topVehicleTypes.recordset,
            topLocations: topLocations.recordset,
            revenueByPayment: revenueByPayment.recordset,
            locationStats: locationStats,
            filterOptions: {
                months: months.recordset,
                locations: locations.recordset,
                vehicleTypes: vehicleTypes.recordset,
                paymentMethods: paymentMethods.recordset
            },
            selected: {
                month: req.query.month || '',
                location: req.query.location || '',
                vehicletype: req.query.vehicletype || '',
                paymentmethod: req.query.paymentmethod || ''
            }
        });
    } catch (err) {
        res.status(500).render('error', { message: err.message });
    }
});

// ─── AI CHAT ASSISTANT (Groq) ────────────────────────────────────────────────
// All the logic lives in aiAssistant.js. The limiter protects the shared
// free-tier quota (Groq limits are per organisation, not per user).
const askLimiter = makeRateLimiter(15, 60 * 1000);

app.post('/api/ask', askLimiter, async (req, res) => {
    try {
        const { question, history } = req.body || {};
        res.json(await askEcoRide(question, history));
    } catch (err) {
        console.error('Unexpected /api/ask error:', err);
        res.json({ answer: 'Something went wrong on my side. Please try again.', link: null, sql: null });
    }
});

// ─── VEHICLES ────────────────────────────────────────────────────────────────
app.get('/vehicles', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT
                V.VEHICLEID,
                V.MODEL,
                V.VEHICLETYPE,
                V.STATUS,
                V.BATTERYLEVEL,
                V.CURRENTLOCATION,
                V.ISAVAILABLE,
                VT.TYPENAME,
                VT.COSTPERMIN
            FROM VEHICLE V
            LEFT JOIN VEHICLE_TYPE VT ON V.VEHICLETYPEID = VT.VEHICLETYPEID
            ORDER BY V.VEHICLEID
        `);
        res.render('vehicles', { data: result.recordset });
    } catch (err) {
        res.status(500).render('error', { message: err.message });
    }
});

// ─── SUPPORT TICKETS ─────────────────────────────────────────────────────────
app.get('/tickets', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT
                ST.TICKETID,
                ST.DESCRIPTION,
                ST.STATUS,
                ST.CREATEDAT,
                C.CUSTOMERNAME,
                IT.NAME  AS IssueName,
                E.NAME   AS AssignedEmployee
            FROM SUPPORT_TICKET ST
            LEFT JOIN CUSTOMER   C  ON ST.CUSTOMERID = C.CUSTOMERID
            LEFT JOIN ISSUE_TYPE IT ON ST.ISSUEID    = IT.ISSUEID
            LEFT JOIN EMPLOYEE   E  ON ST.EMPLOYEEID = E.EMPLOYEEID
            ORDER BY ST.CREATEDAT DESC
        `);
        res.render('tickets', { data: result.recordset });
    } catch (err) {
        res.status(500).render('error', { message: err.message });
    }
});

// ─── QUERY RUNNER ────────────────────────────────────────────────────────────
app.get('/query', (req, res) => res.render('query', { results: null, error: null, queryText: '' }));

app.post('/query', async (req, res) => {
    const queryText = req.body.queryText || '';
    const forbidden = /^\s*(drop|truncate|alter|create|exec|xp_)/i;
    if (forbidden.test(queryText)) {
        return res.render('query', {
            results: null,
            error: 'Query blocked: DDL and system commands are disabled.',
            queryText
        });
    }
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(queryText);
        res.render('query', { results: result.recordset, error: null, queryText });
    } catch (err) {
        res.render('query', { results: null, error: err.message, queryText });
    }
});

// ─── API: table list for sidebar ─────────────────────────────────────────────
app.get('/api/tables', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(
            `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME`
        );
        res.json(result.recordset);
    } catch (err) {
        res.json([]);
    }
});


// ─── PRESENTATION MODE (Sections A–C, then /insights = Section D) ─────────────
const OLAP = [
    {
        op: 'Slice', q: 'What was EcoRide\'s total revenue for each month of 2024, and which month was highest and lowest?',
        why: 'One value of the Time dimension (Year = 2024) is selected, and revenue is then viewed month by month.',
        sql: `SELECT d.MONTH, d.MONTHNAME, SUM(f.FAREAMOUNT) AS TOTAL_REVENUE
FROM FACT_RIDE f
JOIN DIM_DATE d ON f.DATEKEY = d.DATEKEY
WHERE d.YEAR = 2024
GROUP BY d.MONTH, d.MONTHNAME
ORDER BY d.MONTH;` },
    {
        op: 'Drill-down', q: 'Which routes generated the most rides and revenue in 2024, and how did they perform month by month?',
        why: 'We move from year-level totals down to month and route detail: a more granular level of the hierarchy.',
        sql: `SELECT d.YEAR, d.MONTHNAME, r.ROUTEID, r.STARTLOCATION, r.ENDLOCATION,
       SUM(f.RIDECOUNT) AS TOTAL_RIDES, SUM(f.FAREAMOUNT) AS TOTAL_REVENUE
FROM FACT_RIDE f
JOIN DIM_DATE d  ON f.DATEKEY  = d.DATEKEY
JOIN DIM_ROUTE r ON f.ROUTEKEY = r.ROUTEKEY
WHERE d.YEAR = 2024
GROUP BY d.YEAR, d.MONTH, d.MONTHNAME, r.ROUTEID, r.STARTLOCATION, r.ENDLOCATION
ORDER BY r.ROUTEID, d.MONTH;` },
    {
        op: 'Dice', q: 'How did Electric Kick Scooters and E-Bikes perform at Sandton, Rosebank and Soweto?',
        why: 'Conditions on TWO dimensions (Vehicle and Location) carve out a smaller sub-cube of the warehouse.',
        sql: `SELECT v.TYPENAME AS VEHICLE_TYPE, loc.NAME AS LOCATION,
       SUM(f.RIDECOUNT) AS TOTAL_RIDES, SUM(f.FAREAMOUNT) AS TOTAL_REVENUE
FROM FACT_RIDE f
JOIN DIM_DATE d       ON f.DATEKEY     = d.DATEKEY
JOIN DIM_VEHICLE v    ON f.VEHICLEKEY  = v.VEHICLEKEY
JOIN DIM_LOCATION loc ON f.LOCATIONKEY = loc.LOCATIONKEY
WHERE d.YEAR = 2024
  AND v.TYPENAME IN ('Electric Kick Scooter','E-Bike')
  AND loc.NAME   IN ('Sandton Hub','Rosebank Station','Soweto Depot')
GROUP BY v.TYPENAME, loc.NAME
ORDER BY v.TYPENAME, TOTAL_RIDES DESC;` },
    {
        op: 'Roll-up', q: 'How do monthly rides and revenue aggregate into quarterly and yearly performance?',
        why: 'ROLLUP aggregates upward through the hierarchy: Month → Quarter → Year → Grand total (NULL rows).',
        sql: `SELECT d.YEAR, d.QUARTER, d.MONTH,
       SUM(f.RIDECOUNT) AS TOTAL_RIDES, SUM(f.FAREAMOUNT) AS TOTAL_REVENUE
FROM FACT_RIDE f
JOIN DIM_DATE d ON f.DATEKEY = d.DATEKEY
WHERE d.YEAR = 2024
GROUP BY ROLLUP (d.YEAR, d.QUARTER, d.MONTH)
ORDER BY d.YEAR, d.QUARTER, d.MONTH;` },
    {
        op: 'Pivot', q: 'How does revenue by payment method compare across the months of 2024?',
        why: 'Payment-method values are rotated from rows into columns, giving a cross-tab of month × method.',
        sql: `SELECT MONTH, MONTHNAME,
       ISNULL([Credit Card],0) AS CreditCard,
       ISNULL([Debit Card],0)  AS DebitCard,
       ISNULL([EFT],0)         AS EFT
FROM (
    SELECT d.MONTH, d.MONTHNAME, pm.METHODTYPE, f.FAREAMOUNT
    FROM FACT_RIDE f
    JOIN DIM_DATE d ON f.DATEKEY = d.DATEKEY
    JOIN DIM_PAYMENT_METHOD pm ON f.PAYMENTMETHODKEY = pm.PAYMENTMETHODKEY
    WHERE d.YEAR = 2024
) AS SourceTable
PIVOT (SUM(FAREAMOUNT) FOR METHODTYPE IN ([Credit Card],[Debit Card],[EFT])) AS PivotTable
ORDER BY MONTH;` }
];

app.get('/present', (req, res) =>
    res.render('present', { olapJson: JSON.stringify(OLAP).replace(/</g, '\\u003c') }));

app.get('/api/olap/:n', async (req, res) => {
    const item = OLAP[parseInt(req.params.n, 10)];
    if (!item) return res.status(404).json({ error: 'Unknown query' });
    try {
        const pool = await dwPoolPromise;
        const r = await pool.request().query(item.sql);
        res.json({ rows: r.recordset });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/rowcounts', async (req, res) => {
    try {
        const pool = await dwPoolPromise;
        const names = ['DIM_CUSTOMER', 'DIM_VEHICLE', 'DIM_ROUTE', 'DIM_LOCATION', 'DIM_PAYMENT_METHOD', 'DIM_DATE', 'FACT_RIDE'];
        const r = await pool.request().query(names.map(n => `SELECT '${n}' AS t, COUNT(*) AS n FROM ${n}`).join(' UNION ALL '));
        const nulls = await pool.request().query('SELECT COUNT(*) AS n FROM FACT_RIDE WHERE PAYMENTMETHODKEY IS NULL OR LOCATIONKEY IS NULL');
        res.json({ counts: names.map(n => ({ t: n, n: (r.recordset.find(x => x.t === n) || {}).n })), nullKeys: nulls.recordset[0].n });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(3000, () => console.log('EcoRide UI → http://localhost:3000'));