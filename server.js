const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// DATABASE CONFIGURATION
// >>> PUT YOUR MYSQL PASSWORD IN THE LINE BELOW <<<
// ============================================================================
const DB_PASSWORD = process.env.DB_PASSWORD || 'Aarish@8788'; // <--- MYSQL ROOT PASSWORD
// ============================================================================

let dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: DB_PASSWORD,
  database: process.env.DB_NAME || 'hospital_db',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
  multipleStatements: true
};

// Create MySQL2 Promise Pool
let pool = mysql.createPool(dbConfig);
let dbConnected = false;
let dbErrorMessage = '';

// Test DB Connection
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    await conn.query('SELECT 1');
    conn.release();
    dbConnected = true;
    dbErrorMessage = '';
    console.log(`[DATABASE] Connected to MySQL 8 (${dbConfig.database}) at ${dbConfig.host}:${dbConfig.port}`);
  } catch (err) {
    dbConnected = false;
    dbErrorMessage = err.message;
    console.warn(`[DATABASE WARNING] Could not connect to MySQL: ${err.message}`);
    console.warn(`>> Set your MySQL root password in server.js (line 12) or via DB_PASSWORD env var.`);
  }
}
testConnection();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Database error handler helper
function handleDbError(res, err, customMsg) {
  console.error('[Database Error]', err);
  const msg = err.sqlMessage || err.message || customMsg || 'Database operation failed.';
  return res.status(400).json({ error: msg, code: err.code, errno: err.errno, sqlState: err.sqlState });
}

// ============================================================================
// 1. SYSTEM & DATABASE CONNECTION ROUTES
// ============================================================================

// Check database connection status
app.get('/api/db/status', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    const [tables] = await conn.query('SHOW TABLES');
    conn.release();
    dbConnected = true;
    dbErrorMessage = '';
    res.json({
      connected: true,
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      database: dbConfig.database,
      tablesCount: tables.length,
      tables: tables.map(t => Object.values(t)[0])
    });
  } catch (err) {
    dbConnected = false;
    dbErrorMessage = err.message;
    res.json({
      connected: false,
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      database: dbConfig.database,
      error: err.message
    });
  }
});

// Update connection / credentials dynamically
app.post('/api/db/connect', async (req, res) => {
  const { password, host, user, port, database } = req.body;
  if (password !== undefined) dbConfig.password = password;
  if (host) dbConfig.host = host;
  if (user) dbConfig.user = user;
  if (port) dbConfig.port = parseInt(port, 10);
  if (database) dbConfig.database = database;

  try {
    await pool.end();
  } catch (e) {}

  pool = mysql.createPool(dbConfig);
  try {
    const conn = await pool.getConnection();
    await conn.query('SELECT 1');
    conn.release();
    dbConnected = true;
    dbErrorMessage = '';
    res.json({ success: true, message: 'Connected to MySQL successfully!' });
  } catch (err) {
    dbConnected = false;
    dbErrorMessage = err.message;
    res.status(400).json({ success: false, error: err.message });
  }
});

// Re-seed demo database
app.post('/api/db/reset', async (req, res) => {
  try {
    const sqlFilePath = path.join(__dirname, 'database.sql');
    if (!fs.existsSync(sqlFilePath)) {
      return res.status(404).json({ error: 'database.sql file not found' });
    }
    const sqlScript = fs.readFileSync(sqlFilePath, 'utf8');

    // Remove DELIMITER commands for mysql2 driver compatibility
    const cleanedSql = sqlScript
      .replace(/DELIMITER\s+\$\$/gi, '')
      .replace(/DELIMITER\s+;/gi, '')
      .replace(/\$\$/g, ';');

    const conn = await pool.getConnection();
    await conn.query(cleanedSql);
    conn.release();

    res.json({ success: true, message: 'Database reset and re-seeded successfully from database.sql!' });
  } catch (err) {
    handleDbError(res, err, 'Failed to reset database.');
  }
});

// ============================================================================
// 2. DASHBOARD ROUTES
// ============================================================================

app.get('/api/stats', async (req, res) => {
  try {
    const [patients] = await pool.query('SELECT COUNT(*) AS total FROM patients');
    const [doctors] = await pool.query('SELECT COUNT(*) AS total FROM doctors');
    const [appointments] = await pool.query('SELECT COUNT(*) AS total FROM appointments');
    const [revenue] = await pool.query("SELECT IFNULL(SUM(amount), 0.00) AS total FROM billing WHERE paid = TRUE");
    const [unpaid] = await pool.query("SELECT IFNULL(SUM(amount), 0.00) AS total FROM billing WHERE paid = FALSE");
    const [todayAppts] = await pool.query("SELECT COUNT(*) AS total FROM appointments WHERE appt_date = CURDATE()");

    res.json({
      totalPatients: patients[0].total,
      totalDoctors: doctors[0].total,
      totalAppointments: appointments[0].total,
      totalRevenue: revenue[0].total,
      totalUnpaid: unpaid[0].total,
      todayAppointments: todayAppts[0].total
    });
  } catch (err) {
    handleDbError(res, err);
  }
});

app.get('/api/charts', async (req, res) => {
  try {
    const filter = req.query.filter || 'all'; // week, month, all
    let dateFilter = '';
    if (filter === 'week') {
      dateFilter = 'WHERE a.appt_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
    } else if (filter === 'month') {
      dateFilter = 'WHERE a.appt_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    }

    // 1. Revenue per doctor
    const doctorRevenueSql = `
      SELECT d.doctor_id, d.name, 
             IFNULL(SUM(CASE WHEN b.paid = TRUE THEN b.amount ELSE 0 END), 0.00) AS revenue,
             COUNT(a.appt_id) AS total_appts
      FROM doctors d
      LEFT JOIN appointments a ON d.doctor_id = a.doctor_id ${dateFilter ? 'AND ' + dateFilter.replace('WHERE ', '') : ''}
      LEFT JOIN billing b ON a.appt_id = b.appt_id
      GROUP BY d.doctor_id, d.name
      ORDER BY revenue DESC, total_appts DESC;
    `;
    const [doctorRevenue] = await pool.query(doctorRevenueSql);

    // 2. Appointments by status
    const apptStatusSql = `
      SELECT status, COUNT(*) AS count
      FROM appointments a
      ${dateFilter}
      GROUP BY status;
    `;
    const [statusRows] = await pool.query(apptStatusSql);
    const statusCounts = { Scheduled: 0, Completed: 0, Cancelled: 0 };
    statusRows.forEach(r => { statusCounts[r.status] = r.count; });

    res.json({
      filter,
      doctorRevenue: {
        labels: doctorRevenue.map(d => d.name),
        data: doctorRevenue.map(d => Number(d.revenue)),
        appts: doctorRevenue.map(d => d.total_appts)
      },
      appointmentStatus: {
        labels: ['Scheduled', 'Completed', 'Cancelled'],
        data: [statusCounts.Scheduled, statusCounts.Completed, statusCounts.Cancelled]
      }
    });
  } catch (err) {
    handleDbError(res, err);
  }
});

app.get('/api/appointments/today', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT * FROM v_appointment_details
      WHERE appt_date = CURDATE()
      ORDER BY appt_time ASC;
    `);
    res.json(rows);
  } catch (err) {
    handleDbError(res, err);
  }
});

// ============================================================================
// 3. PATIENTS CRUD & HISTORY
// ============================================================================

app.get('/api/patients', async (req, res) => {
  try {
    const search = req.query.search || '';
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    const offset = (page - 1) * limit;

    let whereClause = '';
    const params = [];
    if (search) {
      whereClause = 'WHERE p.name LIKE ? OR p.phone LIKE ? OR p.address LIKE ?';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    const countSql = `SELECT COUNT(*) AS total FROM patients p ${whereClause}`;
    const [countResult] = await pool.query(countSql, params);
    const total = countResult[0].total;

    // Use stored function patient_due(p.patient_id)
    const sql = `
      SELECT 
        p.patient_id, 
        p.name, 
        p.age, 
        p.gender, 
        p.phone, 
        p.address,
        patient_due(p.patient_id) AS unpaid_due,
        COUNT(a.appt_id) AS total_appointments
      FROM patients p
      LEFT JOIN appointments a ON p.patient_id = a.patient_id
      ${whereClause}
      GROUP BY p.patient_id, p.name, p.age, p.gender, p.phone, p.address
      ORDER BY p.patient_id DESC
      LIMIT ? OFFSET ?;
    `;
    const [rows] = await pool.query(sql, [...params, limit, offset]);

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1
      }
    });
  } catch (err) {
    handleDbError(res, err);
  }
});

app.get('/api/patients/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT *, patient_due(patient_id) AS unpaid_due FROM patients WHERE patient_id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
    res.json(rows[0]);
  } catch (err) {
    handleDbError(res, err);
  }
});

app.post('/api/patients', async (req, res) => {
  try {
    const { name, age, gender, phone, address } = req.body;
    if (!name || age === undefined || !gender || !phone) {
      return res.status(400).json({ error: 'Name, age, gender, and phone are required.' });
    }
    const [result] = await pool.query(
      'INSERT INTO patients (name, age, gender, phone, address) VALUES (?, ?, ?, ?, ?)',
      [name, parseInt(age, 10), gender, phone, address || '']
    );
    res.status(201).json({ success: true, patient_id: result.insertId, message: 'Patient registered successfully.' });
  } catch (err) {
    handleDbError(res, err);
  }
});

app.put('/api/patients/:id', async (req, res) => {
  try {
    const { name, age, gender, phone, address } = req.body;
    if (!name || age === undefined || !gender || !phone) {
      return res.status(400).json({ error: 'Name, age, gender, and phone are required.' });
    }
    await pool.query(
      'UPDATE patients SET name = ?, age = ?, gender = ?, phone = ?, address = ? WHERE patient_id = ?',
      [name, parseInt(age, 10), gender, phone, address || '', req.params.id]
    );
    res.json({ success: true, message: 'Patient updated successfully.' });
  } catch (err) {
    handleDbError(res, err);
  }
});

app.delete('/api/patients/:id', async (req, res) => {
  try {
    // Before delete trigger trg_patient_delete_audit will write to audit_log
    const [result] = await pool.query('DELETE FROM patients WHERE patient_id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    res.json({ success: true, message: 'Patient deleted successfully. Trigger logged event to audit_log.' });
  } catch (err) {
    handleDbError(res, err);
  }
});

app.get('/api/patients/:id/history', async (req, res) => {
  try {
    const patientId = req.params.id;
    const [patientRows] = await pool.query('SELECT *, patient_due(patient_id) AS unpaid_due FROM patients WHERE patient_id = ?', [patientId]);
    if (patientRows.length === 0) return res.status(404).json({ error: 'Patient not found' });

    // Appointments and bills via JOIN with v_appointment_details
    const [historyRows] = await pool.query(`
      SELECT * FROM v_appointment_details
      WHERE patient_id = ?
      ORDER BY appt_date DESC, appt_time DESC;
    `, [patientId]);

    res.json({
      patient: patientRows[0],
      history: historyRows
    });
  } catch (err) {
    handleDbError(res, err);
  }
});

// ============================================================================
// 4. DOCTORS CRUD & SCHEDULE
// ============================================================================

app.get('/api/doctors', async (req, res) => {
  try {
    const deptId = req.query.dept_id;
    let sql = `
      SELECT d.doctor_id, d.name, d.specialization, d.fee, d.dept_id,
             dept.dept_name,
             COUNT(a.appt_id) AS total_appointments
      FROM doctors d
      LEFT JOIN departments dept ON d.dept_id = dept.dept_id
      LEFT JOIN appointments a ON d.doctor_id = a.doctor_id
    `;
    const params = [];
    if (deptId) {
      sql += ' WHERE d.dept_id = ?';
      params.push(deptId);
    }
    sql += ' GROUP BY d.doctor_id, d.name, d.specialization, d.fee, d.dept_id, dept.dept_name ORDER BY d.doctor_id ASC';

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    handleDbError(res, err);
  }
});

app.get('/api/doctors/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.*, dept.dept_name 
      FROM doctors d 
      LEFT JOIN departments dept ON d.dept_id = dept.dept_id 
      WHERE d.doctor_id = ?
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Doctor not found' });
    res.json(rows[0]);
  } catch (err) {
    handleDbError(res, err);
  }
});

app.post('/api/doctors', async (req, res) => {
  try {
    const { name, specialization, fee, dept_id } = req.body;
    if (!name || !specialization || fee === undefined) {
      return res.status(400).json({ error: 'Name, specialization, and fee are required.' });
    }
    const [result] = await pool.query(
      'INSERT INTO doctors (name, specialization, fee, dept_id) VALUES (?, ?, ?, ?)',
      [name, specialization, parseFloat(fee), dept_id ? parseInt(dept_id, 10) : null]
    );
    res.status(201).json({ success: true, doctor_id: result.insertId, message: 'Doctor added successfully.' });
  } catch (err) {
    handleDbError(res, err);
  }
});

app.put('/api/doctors/:id', async (req, res) => {
  try {
    const { name, specialization, fee, dept_id } = req.body;
    if (!name || !specialization || fee === undefined) {
      return res.status(400).json({ error: 'Name, specialization, and fee are required.' });
    }
    await pool.query(
      'UPDATE doctors SET name = ?, specialization = ?, fee = ?, dept_id = ? WHERE doctor_id = ?',
      [name, specialization, parseFloat(fee), dept_id ? parseInt(dept_id, 10) : null, req.params.id]
    );
    res.json({ success: true, message: 'Doctor updated successfully.' });
  } catch (err) {
    handleDbError(res, err);
  }
});

app.delete('/api/doctors/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM doctors WHERE doctor_id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Doctor not found' });
    res.json({ success: true, message: 'Doctor removed successfully.' });
  } catch (err) {
    handleDbError(res, err);
  }
});

app.get('/api/doctors/:id/schedule', async (req, res) => {
  try {
    const doctorId = req.params.id;
    const [doctorRows] = await pool.query('SELECT * FROM doctors WHERE doctor_id = ?', [doctorId]);
    if (doctorRows.length === 0) return res.status(404).json({ error: 'Doctor not found' });

    const [appointments] = await pool.query(`
      SELECT * FROM v_appointment_details
      WHERE doctor_id = ?
      ORDER BY appt_date ASC, appt_time ASC;
    `, [doctorId]);

    res.json({
      doctor: doctorRows[0],
      appointments
    });
  } catch (err) {
    handleDbError(res, err);
  }
});

// ============================================================================
// 5. DEPARTMENTS CRUD
// ============================================================================

app.get('/api/departments', async (req, res) => {
  try {
    const sql = `
      SELECT dept.dept_id, dept.dept_name, COUNT(d.doctor_id) AS total_doctors
      FROM departments dept
      LEFT JOIN doctors d ON dept.dept_id = d.dept_id
      GROUP BY dept.dept_id, dept.dept_name
      ORDER BY dept.dept_id ASC;
    `;
    const [rows] = await pool.query(sql);
    res.json(rows);
  } catch (err) {
    handleDbError(res, err);
  }
});

app.post('/api/departments', async (req, res) => {
  try {
    const { dept_name } = req.body;
    if (!dept_name || !dept_name.trim()) {
      return res.status(400).json({ error: 'Department name is required.' });
    }
    const [result] = await pool.query('INSERT INTO departments (dept_name) VALUES (?)', [dept_name.trim()]);
    res.status(201).json({ success: true, dept_id: result.insertId, message: 'Department created successfully.' });
  } catch (err) {
    handleDbError(res, err);
  }
});

app.put('/api/departments/:id', async (req, res) => {
  try {
    const { dept_name } = req.body;
    if (!dept_name || !dept_name.trim()) {
      return res.status(400).json({ error: 'Department name is required.' });
    }
    await pool.query('UPDATE departments SET dept_name = ? WHERE dept_id = ?', [dept_name.trim(), req.params.id]);
    res.json({ success: true, message: 'Department renamed successfully.' });
  } catch (err) {
    handleDbError(res, err);
  }
});

app.delete('/api/departments/:id', async (req, res) => {
  try {
    // Note: doctors table has ON DELETE SET NULL, but if strict check is requested:
    const [result] = await pool.query('DELETE FROM departments WHERE dept_id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Department not found.' });
    res.json({ success: true, message: 'Department deleted successfully.' });
  } catch (err) {
    handleDbError(res, err);
  }
});

// ============================================================================
// 6. APPOINTMENTS & STORED PROCEDURE BOOKING
// ============================================================================

app.get('/api/appointments', async (req, res) => {
  try {
    const { status, search } = req.query;
    let sql = 'SELECT * FROM v_appointment_details WHERE 1=1';
    const params = [];

    if (status && status !== 'All') {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (patient_name LIKE ? OR doctor_name LIKE ? OR specialization LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY appt_date DESC, appt_time DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    handleDbError(res, err);
  }
});

// Book appointment: Calls stored procedure book_appointment
app.post('/api/appointments', async (req, res) => {
  try {
    const { patient_id, doctor_id, appt_date, appt_time } = req.body;
    if (!patient_id || !doctor_id || !appt_date || !appt_time) {
      return res.status(400).json({ error: 'Patient, Doctor, Date, and Time are all required.' });
    }

    // Call book_appointment procedure with OUT parameter
    const callSql = 'CALL book_appointment(?, ?, ?, ?, @out_msg); SELECT @out_msg AS message;';
    const [results] = await pool.query(callSql, [
      parseInt(patient_id, 10),
      parseInt(doctor_id, 10),
      appt_date,
      appt_time
    ]);

    // results[1] is the result of SELECT @out_msg AS message
    const outMessage = results[1][0].message || '';

    if (outMessage.startsWith('FAILED:')) {
      return res.status(400).json({ error: outMessage });
    }

    res.status(201).json({ success: true, message: outMessage });
  } catch (err) {
    handleDbError(res, err);
  }
});

// Complete Appointment
app.patch('/api/appointments/:id/complete', async (req, res) => {
  try {
    const [result] = await pool.query(
      "UPDATE appointments SET status = 'Completed' WHERE appt_id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Appointment not found' });
    res.json({ success: true, message: 'Appointment marked as Completed.' });
  } catch (err) {
    handleDbError(res, err);
  }
});

// Cancel Appointment: triggers trg_handle_cancellation which zeroes bill and logs to audit_log
app.patch('/api/appointments/:id/cancel', async (req, res) => {
  try {
    const [result] = await pool.query(
      "UPDATE appointments SET status = 'Cancelled' WHERE appt_id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Appointment not found' });
    res.json({ success: true, message: 'Appointment cancelled. Trigger set bill amount to $0.00 and logged to audit_log.' });
  } catch (err) {
    handleDbError(res, err);
  }
});

// Reschedule Appointment
app.patch('/api/appointments/:id/reschedule', async (req, res) => {
  try {
    const { appt_date, appt_time } = req.body;
    if (!appt_date || !appt_time) {
      return res.status(400).json({ error: 'Both new Date and new Time are required.' });
    }

    // Verify date is not in the past
    const today = new Date().toISOString().split('T')[0];
    if (appt_date < today) {
      return res.status(400).json({ error: 'Cannot reschedule to a past date.' });
    }

    // Check double-booking
    const [appt] = await pool.query('SELECT doctor_id FROM appointments WHERE appt_id = ?', [req.params.id]);
    if (appt.length === 0) return res.status(404).json({ error: 'Appointment not found.' });

    const doctorId = appt[0].doctor_id;
    const [conflict] = await pool.query(
      "SELECT 1 FROM appointments WHERE doctor_id = ? AND appt_date = ? AND appt_time = ? AND appt_id != ? AND status != 'Cancelled'",
      [doctorId, appt_date, appt_time, req.params.id]
    );
    if (conflict.length > 0) {
      return res.status(400).json({ error: 'Doctor already has an active appointment at that date and time.' });
    }

    await pool.query(
      "UPDATE appointments SET appt_date = ?, appt_time = ?, status = 'Scheduled' WHERE appt_id = ?",
      [appt_date, appt_time, req.params.id]
    );

    res.json({ success: true, message: 'Appointment rescheduled successfully.' });
  } catch (err) {
    handleDbError(res, err);
  }
});

// ============================================================================
// 7. BILLING & INVOICE
// ============================================================================

app.get('/api/billing', async (req, res) => {
  try {
    const filter = req.query.filter || 'all'; // all, paid, unpaid
    let sql = `
      SELECT b.bill_id, b.appt_id, b.amount, b.paid,
             a.appt_date, a.appt_time, a.status AS appt_status,
             p.patient_id, p.name AS patient_name, p.phone AS patient_phone,
             d.doctor_id, d.name AS doctor_name, d.specialization
      FROM billing b
      INNER JOIN appointments a ON b.appt_id = a.appt_id
      INNER JOIN patients p ON a.patient_id = p.patient_id
      INNER JOIN doctors d ON a.doctor_id = d.doctor_id
    `;
    const params = [];
    if (filter === 'paid') {
      sql += ' WHERE b.paid = TRUE';
    } else if (filter === 'unpaid') {
      sql += ' WHERE b.paid = FALSE';
    }
    sql += ' ORDER BY b.bill_id DESC';

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    handleDbError(res, err);
  }
});

app.patch('/api/billing/:id/pay', async (req, res) => {
  try {
    const [result] = await pool.query('UPDATE billing SET paid = TRUE WHERE bill_id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Bill not found' });
    
    // Log payment in audit log
    await pool.query('INSERT INTO audit_log (action) VALUES (?)', [`Bill #${req.params.id} marked as Paid.`]);
    
    res.json({ success: true, message: 'Bill marked as Paid successfully.' });
  } catch (err) {
    handleDbError(res, err);
  }
});

app.get('/api/billing/:id/invoice', async (req, res) => {
  try {
    const sql = `
      SELECT b.bill_id, b.amount, b.paid,
             a.appt_id, a.appt_date, a.appt_time, a.status AS appt_status,
             p.patient_id, p.name AS patient_name, p.phone AS patient_phone, p.age, p.gender, p.address,
             d.doctor_id, d.name AS doctor_name, d.specialization, d.fee,
             dept.dept_name
      FROM billing b
      INNER JOIN appointments a ON b.appt_id = a.appt_id
      INNER JOIN patients p ON a.patient_id = p.patient_id
      INNER JOIN doctors d ON a.doctor_id = d.doctor_id
      LEFT JOIN departments dept ON d.dept_id = dept.dept_id
      WHERE b.bill_id = ?;
    `;
    const [rows] = await pool.query(sql, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    res.json(rows[0]);
  } catch (err) {
    handleDbError(res, err);
  }
});

// ============================================================================
// 8. REVENUE REPORT (CURSOR PROCEDURE) & CSV EXPORT
// ============================================================================

// Generate Doctor Report using Stored Procedure with CURSOR
app.post('/api/reports/generate', async (req, res) => {
  try {
    const [results] = await pool.query('CALL generate_doctor_report()');
    // results[0] contains the SELECT output from the procedure
    res.json({
      success: true,
      message: 'Doctor revenue report generated successfully via MySQL Cursor!',
      data: results[0]
    });
  } catch (err) {
    handleDbError(res, err);
  }
});

app.get('/api/reports', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM doctor_report ORDER BY revenue DESC, total_appts DESC');
    res.json(rows);
  } catch (err) {
    handleDbError(res, err);
  }
});

app.get('/api/reports/export-csv', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM doctor_report ORDER BY revenue DESC, total_appts DESC');
    let csv = 'Doctor ID,Doctor Name,Total Appointments,Revenue ($)\n';
    rows.forEach(r => {
      csv += `${r.doctor_id},"${r.doctor_name.replace(/"/g, '""')}",${r.total_appts},${Number(r.revenue).toFixed(2)}\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="doctor_revenue_report.csv"');
    res.send(csv);
  } catch (err) {
    handleDbError(res, err);
  }
});

// ============================================================================
// 9. AUDIT LOG
// ============================================================================

app.get('/api/audit', async (req, res) => {
  try {
    const filter = req.query.filter || '';
    let sql = 'SELECT * FROM audit_log';
    const params = [];
    if (filter) {
      sql += ' WHERE action LIKE ?';
      params.push(`%${filter}%`);
    }
    sql += ' ORDER BY log_id DESC LIMIT 100';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    handleDbError(res, err);
  }
});

// ============================================================================
// 10. SQL LAB (WHITELISTED QUERY ENGINE)
// ============================================================================

const SQL_LAB_QUERIES = [
  // 1. DDL
  {
    id: 'ddl-1',
    category: '1. DDL',
    title: 'CREATE TABLE (Demo Table)',
    description: 'Creates a demo table for patient vitals with AUTO_INCREMENT and TIMESTAMP default',
    badge: 'CREATE TABLE',
    sql: 'CREATE TABLE IF NOT EXISTS demo_vitals (\n  record_id INT AUTO_INCREMENT PRIMARY KEY,\n  patient_id INT,\n  systolic_bp INT,\n  diastolic_bp INT,\n  pulse INT,\n  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);'
  },
  {
    id: 'ddl-2',
    category: '1. DDL',
    title: 'ALTER TABLE ADD COLUMN',
    description: 'Adds a temperature column to the vitals demo table',
    badge: 'ALTER TABLE',
    sql: 'ALTER TABLE demo_vitals ADD COLUMN temperature DECIMAL(4,1) NULL;'
  },
  {
    id: 'ddl-3',
    category: '1. DDL',
    title: 'ALTER TABLE MODIFY COLUMN',
    description: 'Modifies the temperature column precision to DECIMAL(5,2)',
    badge: 'ALTER TABLE',
    sql: 'ALTER TABLE demo_vitals MODIFY COLUMN temperature DECIMAL(5,2) NULL;'
  },
  {
    id: 'ddl-4',
    category: '1. DDL',
    title: 'CREATE INDEX & SHOW INDEX',
    description: 'Creates an index on patients(phone) and inspects table index structure',
    badge: 'INDEXES',
    sql: 'CREATE INDEX idx_patient_phone ON patients(phone);\nSHOW INDEX FROM patients;'
  },
  {
    id: 'ddl-5',
    category: '1. DDL',
    title: 'TRUNCATE & DROP TABLE',
    description: 'Demonstrates TRUNCATE and DROP operations on a temporary demo table',
    badge: 'DROP & TRUNCATE',
    sql: 'CREATE TABLE IF NOT EXISTS demo_temp_drop (id INT);\nINSERT INTO demo_temp_drop VALUES (1), (2);\nTRUNCATE TABLE demo_temp_drop;\nDROP TABLE demo_temp_drop;\nSELECT "Demo table truncated and dropped successfully" AS status;'
  },

  // 2. DML
  {
    id: 'dml-1',
    category: '2. DML',
    title: 'INSERT Single Row',
    description: 'Inserts a new patient row and displays inserted record inside a safe rolled-back transaction',
    badge: 'INSERT',
    isTransaction: true,
    sql: 'INSERT INTO patients (name, age, gender, phone, address)\nVALUES ("Robert Taylor", 52, "M", "555-0999", "101 Elm Street");\nSELECT * FROM patients WHERE phone = "555-0999";'
  },
  {
    id: 'dml-2',
    category: '2. DML',
    title: 'INSERT Multiple Rows',
    description: 'Batch inserts multiple department rows in a single DML statement',
    badge: 'BATCH INSERT',
    isTransaction: true,
    sql: 'INSERT INTO departments (dept_name) VALUES ("Dermatology"), ("Oncology"), ("Psychiatry");\nSELECT * FROM departments WHERE dept_name IN ("Dermatology", "Oncology", "Psychiatry");'
  },
  {
    id: 'dml-3',
    category: '2. DML',
    title: 'UPDATE Data',
    description: 'Updates doctor consultation fees by 10% for cardiology specialization',
    badge: 'UPDATE',
    isTransaction: true,
    sql: 'UPDATE doctors SET fee = fee * 1.10 WHERE specialization = "Cardiologist";\nSELECT doctor_id, name, specialization, fee FROM doctors WHERE specialization = "Cardiologist";'
  },
  {
    id: 'dml-4',
    category: '2. DML',
    title: 'DELETE Data',
    description: 'Deletes appointments with Cancelled status within a safe rollback transaction',
    badge: 'DELETE',
    isTransaction: true,
    sql: 'DELETE FROM appointments WHERE status = "Cancelled";\nSELECT COUNT(*) AS remaining_cancelled FROM appointments WHERE status = "Cancelled";'
  },

  // 3. SELECT BASICS
  {
    id: 'sel-1',
    category: '3. SELECT Basics',
    title: 'WHERE Filtering with AND / OR / NOT',
    description: 'Filters patients older than 30 who are not female, or have phone starting with 555',
    badge: 'WHERE & LOGIC',
    sql: 'SELECT patient_id, name, age, gender, phone\nFROM patients\nWHERE (age >= 30 AND NOT gender = "F") OR phone LIKE "555-01%";'
  },
  {
    id: 'sel-2',
    category: '3. SELECT Basics',
    title: 'IN and BETWEEN Operators',
    description: 'Selects doctors with fees BETWEEN $130 and $200 in specific departments',
    badge: 'IN & BETWEEN',
    sql: 'SELECT doctor_id, name, specialization, fee, dept_id\nFROM doctors\nWHERE fee BETWEEN 130.00 AND 200.00\n  AND dept_id IN (1, 2, 4);'
  },
  {
    id: 'sel-3',
    category: '3. SELECT Basics',
    title: 'LIKE, IS NULL and DISTINCT',
    description: 'Matches patterns with LIKE, checks NULL values, and retrieves DISTINCT specializations',
    badge: 'PATTERN & DISTINCT',
    sql: 'SELECT DISTINCT specialization FROM doctors WHERE specialization LIKE "%logist%";\nSELECT * FROM doctors WHERE dept_id IS NULL;'
  },
  {
    id: 'sel-4',
    category: '3. SELECT Basics',
    title: 'ORDER BY and LIMIT Pagination',
    description: 'Sorts patients by age descending and retrieves top 2 records',
    badge: 'ORDER & LIMIT',
    sql: 'SELECT patient_id, name, age, gender, phone\nFROM patients\nORDER BY age DESC, name ASC\nLIMIT 2;'
  },

  // 4. AGGREGATES
  {
    id: 'agg-1',
    category: '4. Aggregates',
    title: 'COUNT, SUM, AVG, MIN, MAX',
    description: 'Calculates complete statistical metrics across doctors consulting fees',
    badge: 'AGGREGATES',
    sql: 'SELECT \n    COUNT(*) AS total_doctors,\n    SUM(fee) AS sum_all_fees,\n    ROUND(AVG(fee), 2) AS average_fee,\n    MIN(fee) AS minimum_fee,\n    MAX(fee) AS maximum_fee\nFROM doctors;'
  },

  // 5. GROUP BY AND HAVING
  {
    id: 'grp-1',
    category: '5. GROUP BY & HAVING',
    title: 'Appointments per Doctor',
    description: 'Groups appointment count by doctor and specialization',
    badge: 'GROUP BY',
    sql: 'SELECT \n    d.doctor_id,\n    d.name AS doctor_name,\n    d.specialization,\n    COUNT(a.appt_id) AS total_appointments\nFROM doctors d\nLEFT JOIN appointments a ON d.doctor_id = a.doctor_id\nGROUP BY d.doctor_id, d.name, d.specialization\nORDER BY total_appointments DESC;'
  },
  {
    id: 'grp-2',
    category: '5. GROUP BY & HAVING',
    title: 'Doctors with Active Appointments (HAVING)',
    description: 'Filters grouped doctor records using HAVING clause (appts >= 1)',
    badge: 'HAVING CLAUSE',
    sql: 'SELECT \n    d.doctor_id,\n    d.name,\n    COUNT(a.appt_id) AS scheduled_count\nFROM doctors d\nINNER JOIN appointments a ON d.doctor_id = a.doctor_id\nGROUP BY d.doctor_id, d.name\nHAVING COUNT(a.appt_id) >= 1;'
  },

  // 6. JOINS
  {
    id: 'join-1',
    category: '6. Joins',
    title: 'INNER JOIN',
    description: 'Matches patients directly with their booked appointments',
    badge: 'INNER JOIN',
    sql: 'SELECT \n    a.appt_id, a.appt_date, a.appt_time, a.status,\n    p.name AS patient_name, p.phone\nFROM appointments a\nINNER JOIN patients p ON a.patient_id = p.patient_id;'
  },
  {
    id: 'join-2',
    category: '6. Joins',
    title: 'LEFT JOIN & RIGHT JOIN',
    description: 'Shows all departments including those without doctors, and reverse matching',
    badge: 'OUTER JOINS',
    sql: 'SELECT dept.dept_name, d.name AS doctor_name, d.specialization\nFROM departments dept\nLEFT JOIN doctors d ON dept.dept_id = d.dept_id;'
  },
  {
    id: 'join-3',
    category: '6. Joins',
    title: 'FULL OUTER JOIN (Emulated)',
    description: 'Emulates FULL OUTER JOIN in MySQL using UNION of LEFT and RIGHT JOIN',
    badge: 'FULL OUTER JOIN',
    sql: 'SELECT dept.dept_name, d.name AS doctor_name\nFROM departments dept\nLEFT JOIN doctors d ON dept.dept_id = d.dept_id\nUNION\nSELECT dept.dept_name, d.name AS doctor_name\nFROM departments dept\nRIGHT JOIN doctors d ON dept.dept_id = d.dept_id;'
  },
  {
    id: 'join-4',
    category: '6. Joins',
    title: 'SELF JOIN & CROSS JOIN',
    description: 'Self-joins doctors sharing the same department, and Cartesian product',
    badge: 'SELF & CROSS JOIN',
    sql: 'SELECT \n    d1.name AS doctor_1,\n    d2.name AS doctor_2,\n    d1.dept_id\nFROM doctors d1\nINNER JOIN doctors d2 ON d1.dept_id = d2.dept_id AND d1.doctor_id < d2.doctor_id;\n\nSELECT dept.dept_name, d.name AS doctor_name\nFROM departments dept\nCROSS JOIN doctors d\nLIMIT 6;'
  },
  {
    id: 'join-5',
    category: '6. Joins',
    title: '4-Table Complex JOIN',
    description: 'Joins appointments, patients, doctors, departments, and billing tables simultaneously',
    badge: '4-TABLE JOIN',
    sql: 'SELECT \n    a.appt_id,\n    p.name AS patient_name,\n    d.name AS doctor_name,\n    dept.dept_name,\n    b.amount AS bill_amount,\n    b.paid AS is_paid\nFROM appointments a\nINNER JOIN patients p ON a.patient_id = p.patient_id\nINNER JOIN doctors d ON a.doctor_id = d.doctor_id\nLEFT JOIN departments dept ON d.dept_id = dept.dept_id\nLEFT JOIN billing b ON a.appt_id = b.appt_id;'
  },

  // 7. SUBQUERIES
  {
    id: 'sub-1',
    category: '7. Subqueries',
    title: 'Scalar Subquery',
    description: 'Finds the doctor whose fee equals the maximum fee in the hospital',
    badge: 'SCALAR SUBQUERY',
    sql: 'SELECT doctor_id, name, specialization, fee\nFROM doctors\nWHERE fee = (SELECT MAX(fee) FROM doctors);'
  },
  {
    id: 'sub-2',
    category: '7. Subqueries',
    title: 'IN and NOT IN Subqueries',
    description: 'Finds patients who currently have appointments vs patients with none',
    badge: 'IN / NOT IN',
    sql: 'SELECT patient_id, name, phone FROM patients\nWHERE patient_id IN (SELECT DISTINCT patient_id FROM appointments);'
  },
  {
    id: 'sub-3',
    category: '7. Subqueries',
    title: 'EXISTS Subquery',
    description: 'Lists all departments that have at least one doctor assigned',
    badge: 'EXISTS',
    sql: 'SELECT dept_id, dept_name\nFROM departments d\nWHERE EXISTS (\n    SELECT 1 FROM doctors doc WHERE doc.dept_id = d.dept_id\n);'
  },
  {
    id: 'sub-4',
    category: '7. Subqueries',
    title: 'Correlated Subquery',
    description: 'Finds doctors whose fee is strictly greater than the average fee of their department',
    badge: 'CORRELATED',
    sql: 'SELECT d.doctor_id, d.name, d.fee, d.dept_id\nFROM doctors d\nWHERE d.fee >= (\n    SELECT AVG(d2.fee) FROM doctors d2 WHERE d2.dept_id = d.dept_id\n);'
  },
  {
    id: 'sub-5',
    category: '7. Subqueries',
    title: 'Subquery in FROM (Derived Table)',
    description: 'Aggregates patient billing totals within an aliased derived table',
    badge: 'DERIVED TABLE',
    sql: 'SELECT summary.patient_id, summary.patient_name, summary.total_billed\nFROM (\n    SELECT p.patient_id, p.name AS patient_name, SUM(b.amount) AS total_billed\n    FROM patients p\n    JOIN appointments a ON p.patient_id = a.patient_id\n    JOIN billing b ON a.appt_id = b.appt_id\n    GROUP BY p.patient_id, p.name\n) AS summary\nORDER BY summary.total_billed DESC;'
  },

  // 8. SET OPERATIONS
  {
    id: 'set-1',
    category: '8. Set Operations',
    title: 'UNION and UNION ALL',
    description: 'Combines doctor names and patient names into a unified directory',
    badge: 'UNION / UNION ALL',
    sql: 'SELECT "Doctor" AS role, name, specialization AS detail FROM doctors\nUNION\nSELECT "Patient" AS role, name, phone AS detail FROM patients;\n\nSELECT name FROM doctors\nUNION ALL\nSELECT name FROM patients;'
  },
  {
    id: 'set-2',
    category: '8. Set Operations',
    title: 'INTERSECT & EXCEPT (Emulated)',
    description: 'Emulates INTERSECT and EXCEPT in MySQL using IN and NOT IN',
    badge: 'INTERSECT & EXCEPT',
    sql: '-- Emulate INTERSECT: Patients who also exist as doctors (matching names)\nSELECT name FROM patients WHERE name IN (SELECT name FROM doctors);\n\n-- Emulate EXCEPT: Patients who are NOT doctors\nSELECT name FROM patients WHERE name NOT IN (SELECT name FROM doctors);'
  },

  // 9. BUILT-IN FUNCTIONS
  {
    id: 'func-1',
    category: '9. Functions',
    title: 'String Functions: CONCAT, UPPER, LENGTH, SUBSTRING',
    description: 'Transforms patient text with standard string manipulation functions',
    badge: 'STRING FUNCTIONS',
    sql: 'SELECT \n    name,\n    CONCAT(UPPER(name), " (Age: ", age, ")") AS formatted_profile,\n    LENGTH(phone) AS phone_char_length,\n    SUBSTRING(phone, 1, 3) AS phone_area_code\nFROM patients;'
  },
  {
    id: 'func-2',
    category: '9. Functions',
    title: 'Date Functions: DATE_FORMAT, DATEDIFF, CURDATE',
    description: 'Formats appointment dates and calculates days until consultation',
    badge: 'DATE FUNCTIONS',
    sql: 'SELECT \n    appt_id,\n    appt_date,\n    DATE_FORMAT(appt_date, "%W, %M %e, %Y") AS readable_date,\n    CURDATE() AS today,\n    DATEDIFF(appt_date, CURDATE()) AS days_until_appt\nFROM appointments;'
  },
  {
    id: 'func-3',
    category: '9. Functions',
    title: 'Logical Functions: ROUND, IFNULL, CASE WHEN',
    description: 'Calculates tax and categorizes consultation fee levels dynamically',
    badge: 'LOGIC & MATH',
    sql: 'SELECT \n    name,\n    fee,\n    ROUND(fee * 1.08, 2) AS fee_with_tax,\n    IFNULL(dept_id, 0) AS safe_dept_id,\n    CASE \n        WHEN fee >= 180 THEN "Premium Specialist"\n        WHEN fee >= 140 THEN "Standard Specialist"\n        ELSE "General Practitioner"\n    END AS fee_tier\nFROM doctors;'
  },

  // 10. WINDOW FUNCTIONS
  {
    id: 'win-1',
    category: '10. Window Functions',
    title: 'ROW_NUMBER, RANK & SUM() OVER',
    description: 'Ranks doctors by fee and calculates cumulative billing revenue',
    badge: 'WINDOW FUNCTIONS',
    sql: 'SELECT \n    doctor_id,\n    name,\n    fee,\n    ROW_NUMBER() OVER (ORDER BY fee DESC) AS fee_row_num,\n    RANK() OVER (ORDER BY fee DESC) AS fee_rank,\n    SUM(fee) OVER (ORDER BY doctor_id) AS running_fee_total\nFROM doctors;'
  },

  // 11. CONSTRAINTS DEMO
  {
    id: 'const-1',
    category: '11. Constraints Demo',
    title: 'PRIMARY KEY Violation',
    description: 'Attempts to insert an existing department ID, showing real MySQL error 1062',
    badge: 'PRIMARY KEY ERROR',
    sql: 'INSERT INTO departments (dept_id, dept_name) VALUES (1, "Duplicate Dept");'
  },
  {
    id: 'const-2',
    category: '11. Constraints Demo',
    title: 'FOREIGN KEY Violation',
    description: 'Attempts to insert a doctor with non-existent dept_id 9999, showing error 1452',
    badge: 'FOREIGN KEY ERROR',
    sql: 'INSERT INTO doctors (name, specialization, fee, dept_id) VALUES ("Dr. Ghost", "Hauntology", 100.00, 9999);'
  },
  {
    id: 'const-3',
    category: '11. Constraints Demo',
    title: 'UNIQUE Constraint Violation',
    description: 'Attempts to register duplicate phone number for a patient, showing error 1062',
    badge: 'UNIQUE ERROR',
    sql: 'INSERT INTO patients (name, age, gender, phone, address) VALUES ("Clone", 30, "M", "555-0101", "Copycat St");'
  },
  {
    id: 'const-4',
    category: '11. Constraints Demo',
    title: 'CHECK Constraint Violation',
    description: 'Attempts to insert patient age 150 (violates CHECK 0-120) or negative fee, showing error 3819',
    badge: 'CHECK CONSTRAINT',
    sql: 'INSERT INTO patients (name, age, gender, phone, address) VALUES ("Ancient One", 150, "O", "555-8888", "Time Void");'
  },
  {
    id: 'const-5',
    category: '11. Constraints Demo',
    title: 'NOT NULL Violation',
    description: 'Attempts to insert doctor without a name, showing error 1048',
    badge: 'NOT NULL ERROR',
    sql: 'INSERT INTO doctors (name, specialization, fee, dept_id) VALUES (NULL, "Ghost Specialist", 100.00, 1);'
  },

  // 12. VIEWS
  {
    id: 'view-1',
    category: '12. Views',
    title: 'SHOW CREATE VIEW & SELECT from v_appointment_details',
    description: 'Inspects definition and queries data from the 4-table appointment view',
    badge: 'VIEW',
    sql: 'SHOW CREATE VIEW v_appointment_details;\nSELECT * FROM v_appointment_details LIMIT 5;'
  },

  // 13. STORED PROCEDURES
  {
    id: 'proc-1',
    category: '13. Stored Procedures',
    title: 'CALL book_appointment (Valid Future Date)',
    description: 'Calls stored procedure inside transaction to book a valid appointment',
    badge: 'STORED PROCEDURE',
    isTransaction: true,
    sql: 'CALL book_appointment(1, 4, "2026-11-20", "15:00:00", @msg);\nSELECT @msg AS procedure_result;'
  },
  {
    id: 'proc-2',
    category: '13. Stored Procedures',
    title: 'CALL book_appointment (Double-Booking Rejection)',
    description: 'Attempts to book doctor at already occupied slot, trapped by SQLSTATE 45000 handler',
    badge: 'PROCEDURE HANDLER',
    sql: 'CALL book_appointment(2, 1, "2026-10-15", "09:30:00", @msg);\nSELECT @msg AS procedure_result;'
  },
  {
    id: 'proc-3',
    category: '13. Stored Procedures',
    title: 'CALL book_appointment (Past Date Rejection)',
    description: 'Attempts to book appointment for a past date, rejected with custom message',
    badge: 'SIGNAL HANDLER',
    sql: 'CALL book_appointment(1, 1, "2020-01-01", "10:00:00", @msg);\nSELECT @msg AS procedure_result;'
  },

  // 14. CURSOR
  {
    id: 'cur-1',
    category: '14. Cursor',
    title: 'Doctor Report via CURSOR Execution',
    description: 'Executes generate_doctor_report() which iterates through doctors with a CURSOR and accumulates revenue',
    badge: 'CURSOR & HANDLER',
    sql: 'CALL generate_doctor_report();\nSELECT * FROM doctor_report ORDER BY revenue DESC;'
  },

  // 15. STORED FUNCTION
  {
    id: 'func-store-1',
    category: '15. Stored Function',
    title: 'Execute patient_due(patient_id)',
    description: 'Invokes user-defined stored function to calculate unpaid debt for every patient',
    badge: 'STORED FUNCTION',
    sql: 'SELECT \n    p.patient_id,\n    p.name,\n    p.phone,\n    patient_due(p.patient_id) AS total_unpaid_amount\nFROM patients p;'
  },

  // 16. TRIGGERS
  {
    id: 'trg-1',
    category: '16. Triggers',
    title: 'Inspect Trigger Definitions (SHOW TRIGGERS)',
    description: 'Displays metadata and event hooks for all active database triggers',
    badge: 'TRIGGER METADATA',
    sql: 'SHOW TRIGGERS FROM hospital_db;'
  },
  {
    id: 'trg-2',
    category: '16. Triggers',
    title: 'Live Demo: Auto-Bill & Audit Log on Insert',
    description: 'Inserts appointment, triggering automatic bill generation and audit log entry',
    badge: 'AFTER INSERT TRIGGER',
    isTransaction: true,
    sql: 'INSERT INTO appointments (patient_id, doctor_id, appt_date, appt_time, status)\nVALUES (1, 2, "2026-12-01", "16:00:00", "Scheduled");\n\nSELECT * FROM billing ORDER BY bill_id DESC LIMIT 1;\nSELECT * FROM audit_log ORDER BY log_id DESC LIMIT 1;'
  },
  {
    id: 'trg-3',
    category: '16. Triggers',
    title: 'Live Demo: Cancellation Trigger Zeroes Bill',
    description: 'Updates appointment to Cancelled, firing trigger that resets bill amount to $0.00',
    badge: 'AFTER UPDATE TRIGGER',
    isTransaction: true,
    sql: 'UPDATE appointments SET status = "Cancelled" WHERE appt_id = 1;\nSELECT bill_id, appt_id, amount, paid FROM billing WHERE appt_id = 1;\nSELECT * FROM audit_log ORDER BY log_id DESC LIMIT 1;'
  },

  // 17. EXCEPTION HANDLING
  {
    id: 'exc-1',
    category: '17. Exception Handling',
    title: 'Trapped Foreign Key Exception (1452 Handler)',
    description: 'Attempts appointment booking with invalid doctor ID, handled safely with ROLLBACK',
    badge: '1452 HANDLER',
    sql: 'CALL book_appointment(1, 9999, "2026-11-25", "10:00:00", @msg);\nSELECT @msg AS trapped_error_result;'
  },
  {
    id: 'exc-2',
    category: '17. Exception Handling',
    title: 'Explicit SIGNAL Demonstration',
    description: 'Demonstrates SIGNAL SQLSTATE 45000 raising custom error with message text',
    badge: 'SIGNAL 45000',
    sql: 'SIGNAL SQLSTATE "45000" SET MESSAGE_TEXT = "Custom Signal: Immediate validation failure test.";'
  },

  // 18. TRANSACTIONS
  {
    id: 'tx-1',
    category: '18. Transactions',
    title: 'START TRANSACTION + COMMIT',
    description: 'Demonstrates atomic commit: registers patient and commits permanently',
    badge: 'ACID COMMIT',
    isTransaction: true,
    sql: 'START TRANSACTION;\nINSERT INTO patients (name, age, gender, phone, address) VALUES ("Tx Commit User", 25, "F", "555-7777", "Tx Suite 1");\nSELECT COUNT(*) AS count_inside_tx FROM patients;\nCOMMIT;\nSELECT COUNT(*) AS count_after_commit FROM patients;'
  },
  {
    id: 'tx-2',
    category: '18. Transactions',
    title: 'START TRANSACTION + ROLLBACK',
    description: 'Demonstrates rollback: inserts row, checks count, then rolls back to original state',
    badge: 'ACID ROLLBACK',
    isTransaction: true,
    sql: 'START TRANSACTION;\nINSERT INTO patients (name, age, gender, phone, address) VALUES ("Ghost Patient", 99, "M", "555-0000", "Nowhere");\nSELECT COUNT(*) AS count_before_rollback FROM patients;\nROLLBACK;\nSELECT COUNT(*) AS count_after_rollback FROM patients;'
  },
  {
    id: 'tx-3',
    category: '18. Transactions',
    title: 'SAVEPOINT & ROLLBACK TO SAVEPOINT',
    description: 'Sets savepoint, performs second operation, and rolls back partially',
    badge: 'SAVEPOINTS',
    isTransaction: true,
    sql: 'START TRANSACTION;\nINSERT INTO departments (dept_name) VALUES ("Perm Dept");\nSAVEPOINT sp1;\nINSERT INTO departments (dept_name) VALUES ("Temporary Dept");\nROLLBACK TO SAVEPOINT sp1;\nCOMMIT;\nSELECT * FROM departments WHERE dept_name IN ("Perm Dept", "Temporary Dept");'
  },

  // 19. DCL AND ADMIN
  {
    id: 'dcl-1',
    category: '19. DCL & Admin',
    title: 'CREATE USER, GRANT, SHOW GRANTS & REVOKE',
    description: 'Demonstrates Data Control Language commands with a temporary demo user',
    badge: 'DCL (GRANT/REVOKE)',
    sql: 'DROP USER IF EXISTS "demo_intern"@"localhost";\nCREATE USER "demo_intern"@"localhost" IDENTIFIED BY "InternPass#2026";\nGRANT SELECT ON hospital_db.patients TO "demo_intern"@"localhost";\nSHOW GRANTS FOR "demo_intern"@"localhost";\nREVOKE SELECT ON hospital_db.patients FROM "demo_intern"@"localhost";\nDROP USER "demo_intern"@"localhost";\nSELECT "DCL user created, granted, inspected, revoked and dropped successfully" AS result;'
  },

  // 20. METADATA
  {
    id: 'meta-1',
    category: '20. Metadata',
    title: 'SHOW TABLES & DESCRIBE Schema',
    description: 'Inspects hospital_db tables and describes appointments table structure',
    badge: 'DESCRIBE & TABLES',
    sql: 'SHOW TABLES;\nDESCRIBE appointments;'
  },
  {
    id: 'meta-2',
    category: '20. Metadata',
    title: 'SHOW PROCEDURE STATUS & EXPLAIN Execution Plan',
    description: 'Shows stored procedures in hospital_db and explains query optimization plan',
    badge: 'EXPLAIN & METADATA',
    sql: 'SHOW PROCEDURE STATUS WHERE Db = "hospital_db";\nEXPLAIN SELECT * FROM v_appointment_details WHERE status = "Scheduled";'
  }
];

// Return list of whitelisted queries
app.get('/api/lab/queries', (req, res) => {
  res.json(SQL_LAB_QUERIES);
});

// Run a single query by ID
app.post('/api/lab/run/:id', async (req, res) => {
  const queryObj = SQL_LAB_QUERIES.find(q => q.id === req.params.id);
  if (!queryObj) {
    return res.status(404).json({ error: 'Query not found in whitelist.' });
  }

  const startTime = process.hrtime();
  let conn;
  let rolledBack = false;

  try {
    conn = await pool.getConnection();

    if (queryObj.isTransaction) {
      // Run demo inside transaction and roll back to protect state
      await conn.query('START TRANSACTION');
      let result;
      try {
        const [queryResults] = await conn.query(queryObj.sql);
        result = queryResults;
      } finally {
        await conn.query('ROLLBACK');
        rolledBack = true;
      }

      const diff = process.hrtime(startTime);
      const executionTimeMs = (diff[0] * 1000 + diff[1] / 1e6).toFixed(2);

      return res.json({
        success: true,
        queryId: queryObj.id,
        title: queryObj.title,
        sql: queryObj.sql,
        executionTimeMs,
        rolledBack: true,
        notice: 'Execution completed safely inside a transaction and changes were rolled back.',
        result: formatQueryResult(result)
      });
    } else {
      // Normal execution
      const [result] = await conn.query(queryObj.sql);
      const diff = process.hrtime(startTime);
      const executionTimeMs = (diff[0] * 1000 + diff[1] / 1e6).toFixed(2);

      return res.json({
        success: true,
        queryId: queryObj.id,
        title: queryObj.title,
        sql: queryObj.sql,
        executionTimeMs,
        rolledBack: false,
        result: formatQueryResult(result)
      });
    }
  } catch (err) {
    const diff = process.hrtime(startTime);
    const executionTimeMs = (diff[0] * 1000 + diff[1] / 1e6).toFixed(2);

    return res.status(200).json({
      success: false,
      queryId: queryObj.id,
      title: queryObj.title,
      sql: queryObj.sql,
      executionTimeMs,
      error: err.sqlMessage || err.message,
      code: err.code,
      sqlState: err.sqlState
    });
  } finally {
    if (conn) conn.release();
  }
});

// Run all queries in a category
app.post('/api/lab/run-category/:category', async (req, res) => {
  const categoryName = decodeURIComponent(req.params.category);
  const queries = SQL_LAB_QUERIES.filter(q => q.category.toLowerCase() === categoryName.toLowerCase());

  if (queries.length === 0) {
    return res.status(404).json({ error: 'No queries found in this category.' });
  }

  const results = [];
  let conn;
  try {
    conn = await pool.getConnection();
    for (const q of queries) {
      const startTime = process.hrtime();
      try {
        if (q.isTransaction) {
          await conn.query('START TRANSACTION');
          let r;
          try {
            const [qr] = await conn.query(q.sql);
            r = qr;
          } finally {
            await conn.query('ROLLBACK');
          }
          const diff = process.hrtime(startTime);
          results.push({
            id: q.id,
            title: q.title,
            badge: q.badge,
            success: true,
            executionTimeMs: (diff[0] * 1000 + diff[1] / 1e6).toFixed(2),
            rolledBack: true,
            result: formatQueryResult(r)
          });
        } else {
          const [r] = await conn.query(q.sql);
          const diff = process.hrtime(startTime);
          results.push({
            id: q.id,
            title: q.title,
            badge: q.badge,
            success: true,
            executionTimeMs: (diff[0] * 1000 + diff[1] / 1e6).toFixed(2),
            result: formatQueryResult(r)
          });
        }
      } catch (err) {
        const diff = process.hrtime(startTime);
        results.push({
          id: q.id,
          title: q.title,
          badge: q.badge,
          success: false,
          executionTimeMs: (diff[0] * 1000 + diff[1] / 1e6).toFixed(2),
          error: err.sqlMessage || err.message
        });
      }
    }
    res.json({ category: categoryName, results });
  } catch (err) {
    handleDbError(res, err);
  } finally {
    if (conn) conn.release();
  }
});

// Export all queries as a commented .sql file
app.get('/api/lab/export-sql', (req, res) => {
  let fileContent = `-- ============================================================================\n`;
  fileContent += `-- HOSPITAL MANAGEMENT SYSTEM - SQL LAB COMPLETE QUERY REPOSITORY\n`;
  fileContent += `-- 20 Categories of Comprehensive MySQL 8 Queries\n`;
  fileContent += `-- ============================================================================\n\n`;

  let currentCategory = '';
  SQL_LAB_QUERIES.forEach((q, idx) => {
    if (q.category !== currentCategory) {
      currentCategory = q.category;
      fileContent += `\n-- ----------------------------------------------------------------------------\n`;
      fileContent += `-- CATEGORY: ${currentCategory}\n`;
      fileContent += `-- ----------------------------------------------------------------------------\n\n`;
    }
    fileContent += `-- [Query ${idx + 1}] ${q.title} (${q.badge})\n`;
    fileContent += `-- Description: ${q.description}\n`;
    fileContent += `${q.sql}\n\n`;
  });

  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', 'attachment; filename="hospital_dbms_all_queries.sql"');
  res.send(fileContent);
});

// Helper function to format query results consistently
function formatQueryResult(result) {
  if (!result) return { type: 'empty', rows: [], rowCount: 0, columns: [] };

  // If multiple statements produced an array of result sets
  if (Array.isArray(result) && result.length > 0 && Array.isArray(result[0])) {
    const lastSelect = result.slice().reverse().find(r => Array.isArray(r) && r.length > 0);
    if (lastSelect) {
      const columns = Object.keys(lastSelect[0]);
      return { type: 'table', columns, rows: lastSelect, rowCount: lastSelect.length };
    }
  }

  // Single SELECT result set
  if (Array.isArray(result)) {
    if (result.length === 0) {
      return { type: 'table', columns: [], rows: [], rowCount: 0 };
    }
    const columns = Object.keys(result[0]);
    return { type: 'table', columns, rows: result, rowCount: result.length };
  }

  // DML / DDL ResultSetHeader (affectedRows, insertId, etc.)
  return {
    type: 'header',
    affectedRows: result.affectedRows || 0,
    insertId: result.insertId || 0,
    warningStatus: result.warningStatus || 0,
    message: result.message || 'Command executed successfully.'
  };
}

// Fallback to index.html for SPA hash routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(` Hospital Management System Server Running on Port ${PORT}`);
  console.log(` Web Application: http://localhost:${PORT}`);
  console.log(` MySQL 8 Host: ${dbConfig.host}:${dbConfig.port} | Database: ${dbConfig.database}`);
  console.log(`================================================================`);
});

module.exports = app;
