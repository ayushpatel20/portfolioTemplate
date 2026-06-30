const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-jwt-key';

let prisma;
// Only initialize Prisma locally — on Vercel (production) SQLite is unavailable.
// Auth uses ENV vars; content is served from static JSON files.
if (!process.env.VERCEL) {
  try {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
  } catch (err) {
    console.error("Prisma Client initialization failed. DB connections will be unavailable.", err);
  }
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

// 2. Admin Secure Login (Support both Username and Email)
app.post('/api/admin/login', apiLimiter, async (req, res) => {
  const { email, password } = req.body; // 'email' stores the username or email

  if (!email || !password) {
    return res.status(400).json({ error: 'Username and Password are required.' });
  }

  try {
    let adminUser = null;
    
    if (prisma) {
      try {
        adminUser = await prisma.admin.findUnique({
          where: { email: email.trim() }
        });
      } catch (dbErr) {
        console.warn('DB lookup failed, falling back to ENV credentials:', dbErr.message);
      }
    }

    // ENV-based fallback — used on Vercel (no persistent SQLite)
    if (!adminUser) {
      const envUser = process.env.ADMIN_EMAIL || 'admin';
      const envPass = process.env.ADMIN_PASSWORD || 'admin123';
      if (email.trim() === envUser && password === envPass) {
        adminUser = { id: 0, email: envUser, name: 'Super Admin', role: 'Admin', passwordHash: null };
      }
    }

    if (!adminUser) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Only bcrypt-compare if passwordHash exists (DB user); ENV fallback already passed plain check above
    if (adminUser.passwordHash) {
      const validPassword = await bcrypt.compare(password, adminUser.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }
    }

    // Generate random CSRF double-submit token
    const crypto = require('crypto');
    const csrfToken = crypto.randomBytes(24).toString('hex');

    // Generate JWT including role and csrfToken
    const token = jwt.sign({ 
      id: adminUser.id || 0, 
      email: adminUser.email,
      role: adminUser.role || 'Admin',
      csrfToken
    }, JWT_SECRET, { expiresIn: '12h' });

    // Set token in HTTP-only Cookie for security
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 12 * 60 * 60 * 1000 // 12 hours
    });

    return res.status(200).json({ 
      success: true, 
      csrfToken, 
      admin: { 
        email: adminUser.email, 
        name: adminUser.name || 'Administrator',
        role: adminUser.role || 'Admin'
      } 
    });
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

// 4. Check Session status (including CSRF regeneration)
app.get('/api/admin/session', (req, res) => {
  const token = req.cookies.admin_token;
  if (!token) return res.status(401).json({ isAuthenticated: false });
  
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    return res.status(200).json({ 
      isAuthenticated: true, 
      email: verified.email, 
      role: verified.role || 'Admin',
      csrfToken: verified.csrfToken
    });
  } catch {
    return res.status(401).json({ isAuthenticated: false });
  }
});

// Middleware for CSRF and Role Verification
const checkCsrf = (req, res, next) => {
  const token = req.cookies.admin_token;
  if (!token) return res.status(401).json({ error: 'Access denied. Sign in required.' });

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.admin = verified;
    
    // Validate CSRF token header against cookie payload
    const clientCsrf = req.headers['x-csrf-token'];
    if (!clientCsrf || clientCsrf !== verified.csrfToken) {
      return res.status(403).json({ error: 'CSRF token verification failed.' });
    }
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Session expired. Please sign in again.' });
  }
};

const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.admin || !allowedRoles.includes(req.admin.role)) {
      return res.status(403).json({ error: 'Forbidden. You do not have permissions for this action.' });
    }
    next();
  };
};

// 5. Get Contact Messages (Search, Filter, Paginated) - Admin only
app.get('/api/admin/messages', authenticateToken, requireRole(['Admin']), async (req, res) => {
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
        { name: { contains: search } },
        { email: { contains: search } },
        { subject: { contains: search } },
        { message: { contains: search } }
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

// 6. Mark Contact Message as Read - Admin only
app.patch('/api/admin/messages/:id/read', checkCsrf, requireRole(['Admin']), async (req, res) => {
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

// 7. Delete Contact Message - Admin only
app.delete('/api/admin/messages/:id', checkCsrf, requireRole(['Admin']), async (req, res) => {
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

// 8. Admin Dashboard Statistics - Admin and Editor (Dashboard Overview)
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

// 9. Read site configurations (from DB with fallback to JSON)
app.get('/api/admin/data/:key', authenticateToken, async (req, res) => {
  const key = req.params.key;
  const allowedKeys = ['profile', 'about', 'services', 'projects', 'blogs', 'team', 'testimonials', 'seo', 'settings'];
  
  if (!allowedKeys.includes(key)) {
    return res.status(400).json({ error: 'Invalid data key requested.' });
  }

  // Attempt database retrieval
  try {
    if (prisma) {
      const dbConfig = await prisma.config.findUnique({ where: { key } });
      if (dbConfig) {
        return res.status(200).json(JSON.parse(dbConfig.value));
      }
    }
  } catch (e) {
    console.warn("DB config fetch failed, falling back to disk files:", e);
  }

  // Fallback to JSON file read
  const filePath = path.join(process.cwd(), 'data', `${key}.json`);
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error(`Error reading data/${key}.json:`, err);
      return res.status(500).json({ error: 'Failed to read dataset.' });
    }
    return res.status(200).json(JSON.parse(data));
  });
});

// 10. Write site configurations (to both DB and JSON files)
app.post('/api/admin/data/:key', checkCsrf, async (req, res) => {
  const key = req.params.key;
  const allowedKeys = ['profile', 'about', 'services', 'projects', 'blogs', 'team', 'testimonials', 'seo', 'settings'];
  
  if (!allowedKeys.includes(key)) {
    return res.status(400).json({ error: 'Invalid data key.' });
  }

  // Role permissions gate: only Admins can save settings, SEO, footer (profile)
  if (['settings', 'seo', 'profile'].includes(key)) {
    if (req.admin.role !== 'Admin') {
      return res.status(403).json({ error: 'Forbidden. Editors cannot modify system configurations or SEO settings.' });
    }
  }

  const valueStr = JSON.stringify(req.body, null, 2);

  // Write to SQLite database
  try {
    if (prisma) {
      await prisma.config.upsert({
        where: { key },
        update: { value: valueStr },
        create: { key, value: valueStr }
      });
    }
  } catch (e) {
    console.error("DB config save failed:", e);
  }

  // Write to JSON file on disk
  const filePath = path.join(process.cwd(), 'data', `${key}.json`);
  fs.writeFile(filePath, valueStr, 'utf8', (err) => {
    if (err) {
      console.error(`Error writing data/${key}.json:`, err);
      return res.status(500).json({ error: 'Failed to write config to file.' });
    }
    return res.status(200).json({ success: true, message: `Updated config ${key} successfully.` });
  });
});

// 11. User Management (Admin Only)
app.get('/api/admin/users', authenticateToken, requireRole(['Admin']), async (req, res) => {
  if (!prisma) return res.status(500).json({ error: 'Database offline.' });
  try {
    const users = await prisma.admin.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    });
    return res.status(200).json(users);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve accounts.' });
  }
});

app.post('/api/admin/users', checkCsrf, requireRole(['Admin']), async (req, res) => {
  const { email, password, name, role } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Username and Password are required.' });
  }
  try {
    const existing = await prisma.admin.findUnique({ where: { email: email.trim() } });
    if (existing) return res.status(400).json({ error: 'User already exists.' });

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await prisma.admin.create({
      data: {
        email: email.trim(),
        passwordHash,
        name: name ? name.trim() : null,
        role: role || 'Editor'
      }
    });
    return res.status(201).json({ success: true, user: { id: newUser.id, email: newUser.email, role: newUser.role } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create account.' });
  }
});

app.put('/api/admin/users/:id', checkCsrf, requireRole(['Admin']), async (req, res) => {
  const userId = parseInt(req.params.id);
  const { name, role, password } = req.body;
  if (isNaN(userId)) return res.status(400).json({ error: 'Invalid User ID.' });

  try {
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }
    const updated = await prisma.admin.update({
      where: { id: userId },
      data: updateData
    });
    return res.status(200).json({ success: true, user: { id: updated.id, email: updated.email, role: updated.role } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update user.' });
  }
});

app.delete('/api/admin/users/:id', checkCsrf, requireRole(['Admin']), async (req, res) => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) return res.status(400).json({ error: 'Invalid User ID.' });

  // Prevent admin from deleting themselves
  if (req.admin.id === userId) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }

  try {
    await prisma.admin.delete({ where: { id: userId } });
    return res.status(200).json({ success: true, message: 'Account removed.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete user.' });
  }
});

// 12. Media Library Management
const uploadsDir = path.join(process.cwd(), 'images', 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (e) {
  console.warn("Could not create uploads directory (might be read-only filesystem):", e.message);
}

app.get('/api/admin/media', authenticateToken, (req, res) => {
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read media storage.' });
    }
    const media = files.map(file => {
      const stats = fs.statSync(path.join(uploadsDir, file));
      return {
        name: file,
        url: `images/uploads/${file}`,
        size: stats.size,
        createdAt: stats.birthtime
      };
    });
    media.sort((a, b) => b.createdAt - a.createdAt);
    return res.status(200).json(media);
  });
});

app.post('/api/admin/media', checkCsrf, (req, res) => {
  const { filename, base64Data } = req.body;
  if (!filename || !base64Data) {
    return res.status(400).json({ error: 'Filename and base64 data are required.' });
  }
  const cleanName = path.basename(filename).replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const filePath = path.join(uploadsDir, cleanName);

  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  const buffer = Buffer.from(matches ? matches[2] : base64Data, 'base64');

  fs.writeFile(filePath, buffer, (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to save media upload.' });
    }
    return res.status(201).json({ success: true, url: `images/uploads/${cleanName}` });
  });
});

app.delete('/api/admin/media/:filename', checkCsrf, requireRole(['Admin']), (req, res) => {
  const cleanName = path.basename(req.params.filename);
  const filePath = path.join(uploadsDir, cleanName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Media file not found.' });
  }

  fs.unlink(filePath, (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete media.' });
    }
    return res.status(200).json({ success: true, message: 'File deleted.' });
  });
});

// On local dev: serve static assets and HTML pages through Express.
// On Vercel (production): static files are served directly by the CDN — only /api/* hits this function.
if (process.env.NODE_ENV !== 'production') {
  app.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
  });
  app.get('/admin', (req, res) => {
    res.redirect('/admin/dashboard');
  });
  app.use(express.static(path.join(__dirname, '.')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });
}

// Start Server — only when run directly (not as Vercel serverless)
if (require.main === module) {
  // In local dev, reinstate static serving on top of API routes
  app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
  app.get('/admin', (req, res) => res.redirect('/admin/dashboard'));
  app.use(express.static(path.join(__dirname, '.')));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

  app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`  Uifolio Portfolio App running on port ${PORT} `);
    console.log(`===============================================`);
  });
}

// Export for Vercel serverless runtime
module.exports = app;
