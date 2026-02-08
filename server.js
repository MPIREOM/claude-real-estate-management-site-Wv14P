const express = require('express');
const session = require('express-session');
const path = require('path');
const { initialize } = require('./db/database');

const app = express();

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'realestate-management-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Make session user available to all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.currentPath = req.path;
  next();
});

// Flash messages middleware
app.use((req, res, next) => {
  res.locals.success = req.session.success || null;
  res.locals.error = req.session.error || null;
  delete req.session.success;
  delete req.session.error;
  next();
});

// Ensure DB is initialized before handling requests
let dbReady = false;
app.use(async (req, res, next) => {
  if (!dbReady) {
    await initialize();
    dbReady = true;
  }
  next();
});

// Routes
app.use('/', require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/properties', require('./routes/properties'));
app.use('/tenants', require('./routes/tenants'));
app.use('/leases', require('./routes/leases'));
app.use('/payments', require('./routes/payments'));
app.use('/maintenance', require('./routes/maintenance'));
app.use('/reports', require('./routes/reports'));

// Root redirect
app.get('/', (req, res) => {
  if (req.session.userId) {
    res.redirect('/dashboard');
  } else {
    res.redirect('/login');
  }
});

// Local development: start listening on a port
// On Vercel: the app is exported as a module for the serverless handler
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Real Estate Management running at http://localhost:${PORT}`);
    console.log(`Default login: admin / admin123`);
  });
}

module.exports = app;
