const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-jwt-key';

let prisma;
try {
  prisma = new PrismaClient();
} catch (err) {
  console.error("Prisma Client initialization failed. DB connections will be unavailable.", err);
}

// Security Middlewares
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://code.jquery.com", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "*"],
      connectSrc: ["'self'", "*"]
    }
  }
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiter to prevent DDoS / spamming
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes.' }
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 contact submissions per hour
  message: { error: 'Too many contact submissions from this IP. Please try again later.' }
});

// Middleware for JWT authorization
const authenticateToken = (req, res, next) => {
  const token = req.cookies.admin_token || req.headers['authorization']?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied. Sign in required.' });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.admin = verified;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid or expired session token.' });
  }
};

// ----------------- API ENDPOINTS -----------------

// 1. Submit Contact Form
app.post('/api/contact', contactLimiter, async (req, res) => {
  const { name, email, phone, subject, message } = req.body;

  // Serverside validation
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, Email, and Message are required fields.' });
  }

  // Simple email regex validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  try {
    if (prisma) {
      const savedMessage = await prisma.contactMessage.create({
        data: {
          name: name.trim(),
          email: email.trim(),
          phone: phone ? phone.trim() : null,
          subject: subject ? subject.trim() : 'No Subject',
          message: message.trim()
        }
      });
      return res.status(201).json({ success: true, message: 'Message sent and stored successfully!', data: savedMessage });
    } else {
      // In case database is not migrated yet, return success but log
      console.warn("Prisma client not connected. Form submitted but not saved:", { name, email, message });
      return res.status(200).json({ success: true, message: 'Message received (Development Mode)' });
    }
  } catch (err) {
    console.error('Contact submission error:', err);
    return res.status(500).json({ error: 'Server error. Failed to save your message.' });
  }
});

// 2. Admin Secure Login
app.post('/api/admin/login', apiLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and Password are required.' });
  }

  try {
    let adminUser = null;
    
    if (prisma) {
      adminUser = await prisma.admin.findUnique({
        where: { email: email.trim() }
      });
    } else {
      // Fallback fallback credentials if database is offline for local testing
      if (email === (process.env.ADMIN_EMAIL || 'admin@agency.com') && password === (process.env.ADMIN_PASSWORD || 'admin123')) {
        adminUser = { email, name: 'Admin (Dev Mode)', passwordHash: await bcrypt.hash(password, 10) };
      }
    }

    if (!adminUser) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const validPassword = await bcrypt.compare(password, adminUser.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Generate JWT
    const token = jwt.sign({ id: adminUser.id || 0, email: adminUser.email }, JWT_SECRET, { expiresIn: '12h' });

    // Set token in HTTP-only Cookie for security
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 12 * 60 * 60 * 1000 // 12 hours
    });

    return res.status(200).json({ success: true, token, admin: { email: adminUser.email, name: adminUser.name } });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error during login.' });
  }
});

// 3. Admin Logout
app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin_token');
  return res.status(200).json({ success: true, message: 'Logged out successfully.' });
});

// 4. Check Session status
app.get('/api/admin/session', (req, res) => {
  const token = req.cookies.admin_token;
  if (!token) return res.status(401).json({ isAuthenticated: false });
  
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    return res.status(200).json({ isAuthenticated: true, email: verified.email });
  } catch {
    return res.status(401).json({ isAuthenticated: false });
  }
});

// 5. Get Contact Messages (Search, Filter, Paginated)
app.get('/api/admin/messages', authenticateToken, async (req, res) => {
  if (!prisma) {
    return res.status(500).json({ error: 'Database connection offline.' });
  }

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search ? String(req.query.search).trim() : '';
    const filter = req.query.filter || 'all'; // 'all', 'read', 'unread'
    
    const offset = (page - 1) * limit;

    let whereClause = {};
    
    // Search logic
    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
        { message: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Filter status logic
    if (filter === 'read') {
      whereClause.isRead = true;
    } else if (filter === 'unread') {
      whereClause.isRead = false;
    }

    const messages = await prisma.contactMessage.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit
    });

    const totalMessages = await prisma.contactMessage.count({ where: whereClause });
    const totalPages = Math.ceil(totalMessages / limit);

    return res.status(200).json({
      messages,
      pagination: {
        page,
        limit,
        totalMessages,
        totalPages
      }
    });
  } catch (err) {
    console.error('Fetch messages error:', err);
    return res.status(500).json({ error: 'Failed to retrieve messages.' });
  }
});

// 6. Mark Contact Message as Read
app.patch('/api/admin/messages/:id/read', authenticateToken, async (req, res) => {
  const msgId = parseInt(req.params.id);
  if (isNaN(msgId) || !prisma) {
    return res.status(400).json({ error: 'Invalid request parameters or database offline.' });
  }

  try {
    const updated = await prisma.contactMessage.update({
      where: { id: msgId },
      data: { isRead: true }
    });
    return res.status(200).json({ success: true, message: 'Message marked as read.', data: updated });
  } catch (err) {
    console.error('Update read state error:', err);
    return res.status(500).json({ error: 'Failed to update message.' });
  }
});

// 7. Delete Contact Message
app.delete('/api/admin/messages/:id', authenticateToken, async (req, res) => {
  const msgId = parseInt(req.params.id);
  if (isNaN(msgId) || !prisma) {
    return res.status(400).json({ error: 'Invalid request parameters or database offline.' });
  }

  try {
    await prisma.contactMessage.delete({
      where: { id: msgId }
    });
    return res.status(200).json({ success: true, message: 'Message deleted successfully.' });
  } catch (err) {
    console.error('Delete message error:', err);
    return res.status(500).json({ error: 'Failed to delete message.' });
  }
});

// 8. Admin Dashboard Statistics
app.get('/api/admin/stats', authenticateToken, async (req, res) => {
  if (!prisma) {
    return res.status(200).json({
      totalMessages: 0,
      unreadMessages: 0,
      recentActivity: []
    });
  }

  try {
    const totalMessages = await prisma.contactMessage.count();
    const unreadMessages = await prisma.contactMessage.count({ where: { isRead: false } });
    
    // Get last 5 messages as recent activity
    const recentActivity = await prisma.contactMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        name: true,
        subject: true,
        createdAt: true
      }
    });

    return res.status(200).json({
      totalMessages,
      unreadMessages,
      recentActivity
    });
  } catch (err) {
    console.error('Get stats error:', err);
    return res.status(500).json({ error: 'Failed to fetch statistics.' });
  }
});

// 9. Read site configurations from file storage
app.get('/api/admin/data/:key', authenticateToken, (req, res) => {
  const key = req.params.key;
  const allowedKeys = ['profile', 'about', 'services', 'projects', 'blogs', 'team', 'testimonials'];
  
  if (!allowedKeys.includes(key)) {
    return res.status(400).json({ error: 'Invalid data key requested.' });
  }

  const filePath = path.join(__dirname, `data/${key}.json`);
  
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error(`Error reading data/${key}.json:`, err);
      return res.status(500).json({ error: 'Failed to read dataset from disk.' });
    }
    return res.status(200).json(JSON.parse(data));
  });
});

// 10. Write updated configurations to JSON file storage (Real-time CMS)
app.post('/api/admin/data/:key', authenticateToken, (req, res) => {
  const key = req.params.key;
  const allowedKeys = ['profile', 'about', 'services', 'projects', 'blogs', 'team', 'testimonials'];
  
  if (!allowedKeys.includes(key)) {
    return res.status(400).json({ error: 'Invalid data key.' });
  }

  const filePath = path.join(__dirname, `data/${key}.json`);
  const content = JSON.stringify(req.body, null, 2);

  fs.writeFile(filePath, content, 'utf8', (err) => {
    if (err) {
      console.error(`Error writing data/${key}.json:`, err);
      return res.status(500).json({ error: 'Failed to write dataset to disk.' });
    }
    return res.status(200).json({ success: true, message: `Updated config data/${key}.json successfully.` });
  });
});

// Serve frontend static assets
app.use(express.static(path.join(__dirname, '.')));

// SPA routing fallback: send index.html for all unrecognized frontend routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`  Uifolio Portfolio App running on port ${PORT} `);
  console.log(`===============================================`);
});
