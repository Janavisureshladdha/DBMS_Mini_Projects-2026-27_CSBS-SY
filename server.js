const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const methodOverride = require('method-override');

// Load environment variables
dotenv.config();

// Connect to Database
const connectDB = require('./config/db');
connectDB();

const app = express();

// View Engine Setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Body Parsers & Static Files
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

// Session Configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'orangecart_secret_session_2026',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/orangecart',
    collectionName: 'sessions',
    ttl: 14 * 24 * 60 * 60 // 14 days
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 14, // 14 days
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
};

app.use(session(sessionConfig));

// Global View Variables Middleware
const { attachViewGlobals } = require('./middleware/auth');
app.use(attachViewGlobals);

// Route Handlers
const indexRoutes = require('./routes/indexRoutes');
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const adminRoutes = require('./routes/adminRoutes');

app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/cart', cartRoutes);
app.use('/orders', orderRoutes);
app.use('/reviews', reviewRoutes);
app.use('/admin', adminRoutes);

// 404 Handler
app.use((req, res, next) => {
  res.status(404).render('error', {
    title: '404 - Page Not Found',
    page: 'error',
    message: 'The page you requested could not be found.',
    statusCode: 404
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).render('error', {
    title: '500 - Server Error',
    page: 'error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : err.message,
    statusCode: 500
  });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🍊 OrangeCart Server running in ${process.env.NODE_ENV || 'development'} mode on http://localhost:${PORT}`);
});

module.exports = app;
