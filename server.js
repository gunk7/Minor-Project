const express = require('express');
const http = require('http');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const socketIO = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: '*',
    }
});

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

const JWT_SECRET = process.env.JWT_SECRET || "service_ease";

const connectedProviders = {};

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('registerProvider', (providerId) => {
        connectedProviders[providerId] = socket.id;
        console.log(`Provider ${providerId} registered with socket ${socket.id}`);
    });

    socket.on('disconnect', () => {
        for (const [key, value] of Object.entries(connectedProviders)) {
            if (value === socket.id) {
                delete connectedProviders[key];
                console.log(`Provider ${key} disconnected`);
                break;
            }
        }
    });
});

const authenticateToken = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ message: 'Access Denied' });

    jwt.verify(token.split(" ")[1], JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid Token' });
        req.user = user;
        next();
    });
};

const authorizeRole = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Access Denied: Insufficient permissions' });
        }
        next();
    };
};

app.get('/api/test', async (req, res) => {
    try {
        const result = await pool.query('SELECT current_database();');
        res.json({ success: true, database: result.rows[0].current_database });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Database connection failed', error });
    }
});

app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, password, contact_number, role } = req.body;
        if (!name || !email || !password || !contact_number) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }
        if (typeof password !== 'string' || password.trim() === '') {
            return res.status(400).json({ success: false, message: "Invalid password format" });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO users (name, email, password, contact_number, role) 
             VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role`,
            [name, email, hashedPassword, contact_number, role]
        );
        res.json({ success: true, user: result.rows[0] });
    } catch (error) {
        console.error(" Signup Error:", error);
        res.status(500).json({ success: false, message: "Server error during signup", error: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
        if (result.rows.length === 0) return res.status(401).json({ success: false, message: 'Invalid credentials' });
        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ success: false, message: 'Invalid credentials' });
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ success: true, token, role: user.role });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error during login' });
    }
});

app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`SELECT id, name, email, role FROM users WHERE id = $1`, [req.user.id]);
        res.json({ success: true, user: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching user profile' });
    }
});

app.get('/api/services', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM services");
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching services:", error);
        res.status(500).json({ success: false, message: "Error fetching services" });
    }
});

app.post('/api/book-service', authenticateToken, async (req, res) => {
    const { service_id, date, timeSlot, address, description } = req.body;
    const userId = req.user.id;

    if (!service_id || !date || !timeSlot || !address || !description) {
        return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    try {
        const serviceResult = await pool.query(
            `SELECT provider_id FROM services WHERE id = $1`,
            [service_id]
        );
        if (serviceResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Service not found' });
        }
        const providerId = serviceResult.rows[0].provider_id;
        const result = await pool.query(
            `INSERT INTO bookings (user_id, service_id, provider_id, date, time_slot, address, description, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING *`,
            [userId, service_id, providerId, date, timeSlot, address, description]
        );
        const booking = result.rows[0];
        const socketId = connectedProviders[providerId];
        if (socketId) {
            io.to(socketId).emit('newBooking', booking);
            console.log(`Sent real-time booking to provider ${providerId}`);
        }
        res.json({ success: true, message: 'Service booked successfully!', booking });
    } catch (error) {
        console.error('Error booking service:', error);
        res.status(500).json({ success: false, message: 'Server error while booking service' });
    }
});

app.get('/api/provider/bookings', authenticateToken, authorizeRole(['provider']), async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM bookings WHERE provider_id = $1`, [req.user.id]);
        res.json({ success: true, bookings: result.rows });
    } catch (error) {
        console.error('Error fetching provider bookings:', error);
        res.status(500).json({ success: false, message: 'Error fetching provider bookings' });
    }
});

app.get('/api/admin/users', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try {
        const result = await pool.query(`SELECT id, name, email, role FROM users`);
        res.json({ success: true, users: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching users' });
    }
});

server.listen(port, () => {
    console.log(`Server with Socket.IO running at http://localhost:${port}`);
});
