const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const nodemailer = require('nodemailer')
require('dotenv').config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'service_db',
    password: 'root',
    port: 5432,
});

pool.connect()
    .then(() => console.log('Connected to PostgreSQL'))
    .catch(err => console.error('Database connection error:', err));
//test testing done

app.get('/api/test', async (req, res) => {
    try {
        const result = await pool.query('SELECT current_database();');
        res.json({ success: true, database: result.rows[0].current_database });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Database connection failed', error });
    }
});
const PORT = process.env.PORT|| 3000;
const JWT_SECRET = process.env.JWT_SECRET || "service_ease";

// Middleware: Authenticate JWT Token
const authenticateToken = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ message: 'Access Denied' });

    jwt.verify(token.split(" ")[1], JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid Token' });
        req.user = user;
        next();
    });
};

// Middleware: Role-Based Access Control
const authorizeRole = (roles) => {
    return (req, res, next) => {
        if (!['admin', 'provider', 'user'].includes(req.user.role)) {
            return res.status(403).json({ message: "Access denied" });
        }
        next();
    };
};
// backend testing done
// **USER REGISTRATION API**
app.post('/api/signup', async (req, res) => {
    try {
        let { name, email, password, contact_number, role } = req.body;

        // Ensure role is one of the allowed values or default to 'user'
        const allowedRoles = ['user', 'admin', 'provider'];
        if (!allowedRoles.includes(role)) {
            role = 'user';
        }

        // ✅ Check if all required fields are provided
        if (!name || !email || !password || !contact_number) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }

        // ✅ Ensure password is a valid string before hashing
        if (typeof password !== 'string' || password.trim() === '') {
            return res.status(400).json({ success: false, message: "Invalid password format" });
        }

        // ✅ Hash the password securely
        const hashedPassword = await bcrypt.hash(password, 10);

        // ✅ Insert user into database
        const result = await pool.query(
            `INSERT INTO users (name, email, password, contact_number, role) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING id, name, email, role`, 
            [name, email, hashedPassword, contact_number, role]
        );
;
        // 🔐 Generate JWT token
        sendConfirmationEmail(email, name);

        // ✅ Extract user from result
        const newUser = result.rows[0];

        // 🔐 Generate JWT token
        const token = jwt.sign(
            { id: newUser.id, email: newUser.email, role: newUser.role },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        // ✅ Respond with user and token
        res.json({ success: true, user: newUser, token: token })
;
    } catch (error) {
        console.error("❌ Signup Error:", error);
        res.status(500).json({ success: false, message: "Server error during signup", error: error.message });
    }
});



// **USER LOGIN API**
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
      // select only the columns you need
      const result = await pool.query(
        `SELECT id, name, email, role, password FROM users WHERE email = $1`,
        [email]
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }
  
      const user = result.rows[0];
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }
  
      // build a token
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '1h' }
      );
  
      // remove password before sending back
      const { password: pw, ...userWithoutPassword } = user;
  
      // now return user object AND token
      res.json({
        success: true,
        token : token,
        user: userWithoutPassword
      });
    } catch (error) {
      console.error("Login Error", error.message);
      res.status(500).json({ success: false, message: 'Server error during login' });
    }
  });
  /*
const sendConfirmationEmail = (userEmail, userName) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: userEmail,
        subject: 'Welcome to ServiceEase!',
        text: `Hello ${userName},\n\nThank you for signing up at ServiceEase.\n\nBest Regards,\nServiceEase Team`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log('Error sending email: ', error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    })
};*/
// ✅ Get user profile by ID (used in user dashboard)
app.get('/api/user/:id', authenticateToken, async (req, res) => {
    const userId = parseInt(req.params.id);
    try {
        const result = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [userId]);
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error fetching user", error: err.message });
    }
});

// ✅ Get user profile by email (used in admin dashboard)
app.get('/api/user/email/:email', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    const email = req.params.email;
    try {
        const result = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [email]);
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error fetching user by email", error: err.message });
    }
});

// **PROTECTED USER PROFILE API**
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`SELECT id, name, email, role FROM users WHERE id = $1`, [req.user.id]);
        res.json({ success: true, user: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching user profile' });
    }
});



// **SERVICE BOOKING API**
app.post('/api/book-service', authenticateToken, async (req, res) => {
    const { service_id, date, timeSlot, address, description } = req.body;
    const userId = req.user.id;

    if (!service_id || !date || !timeSlot || !address || !description) {
        return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    try {
        // Get the provider_id from the services table
        const serviceResult = await pool.query(
            `SELECT provider_id FROM services WHERE id = $1`,
            [service_id]
        );

        if (serviceResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Service not found' });
        }

        const providerId = serviceResult.rows[0].provider_id;

        // Insert booking with provider_id
        const result = await pool.query(
            `INSERT INTO bookings (user_id, service_id, provider_id, date, time_slot, address, description, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING *`,
            [userId, service_id, providerId, date, timeSlot, address, description]
        );

        res.json({ success: true, message: 'Service booked successfully!', booking: result.rows[0] });
    } catch (error) {
        console.error('Error booking service:', error);
        res.status(500).json({ success: false, message: 'Server error while booking service' });
    }
});


// **FETCH BOOKINGS FOR A PROVIDER**
app.get('/api/provider/bookings', authenticateToken, authorizeRole(['provider']), async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM bookings WHERE provider_id = $1`, [req.user.id]);
        res.json({ success: true, bookings: result.rows });
    } catch (error) {
        console.error('Error fetching provider bookings:', error);
        res.status(500).json({ success: false, message: 'Error fetching provider bookings' });
    }
});


// **ADMIN: GET ALL USERS**
app.get('/api/admin/users', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try {
        const result = await pool.query(`SELECT id, name, email, role FROM users`);
        res.json({ success: true, users: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching users' });
    }
});

app.post('/api/services', authenticateToken, authorizeRole(['provider']), async (req, res) => {
    const { name, description, category, price } = req.body;
    const provider_id = req.user.id;

    if (!name || !category || price === undefined || price === null || isNaN(price)) {
        return res.status(400).json({ success: false, message: "Missing or invalid required fields" });
    }

    try {
        const userResult = await pool.query(
            'SELECT contact_number FROM users WHERE id = $1',
            [provider_id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const contact_number = userResult.rows[0].contact_number;

        const result = await pool.query(
            `INSERT INTO services 
             (provider_id, name, description, category, price, ratings, contact_number)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [provider_id, name, description || '', category, price, null, contact_number]
        );

        res.json({ success: true, service: result.rows[0] });

    } catch (error) {
        console.error("❌ Error submitting service:", error);
        res.status(500).json({ success: false, message: "Failed to submit service" });
    }
});


// **GET ALL SERVICES API**
app.get('/api/services', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM services');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching services:', error);
        res.status(500).json({ success: false, message: 'Error fetching services' });
    }
});

// **START SERVER**
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${port}`);
});
