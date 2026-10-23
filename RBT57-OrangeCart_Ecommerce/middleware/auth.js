const Cart = require('../models/Cart');

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
    return res.status(401).json({ success: false, message: 'Please log in to continue' });
  }
  req.session.returnTo = req.originalUrl;
  req.session.error = 'Please log in to access this page';
  res.redirect('/auth/login');
};

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  req.session.error = 'Access denied. Administrator privileges required.';
  res.redirect('/auth/login');
};

// Middleware to attach global variables to all views
const attachViewGlobals = async (req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.currentPath = req.path;
  res.locals.success = req.session.success || null;
  res.locals.error = req.session.error || null;
  delete req.session.success;
  delete req.session.error;

  // Currency formatter helper
  res.locals.formatMoney = (amount) => {
    return '₹' + Number(amount || 0).toLocaleString('en-IN');
  };

  // Date formatter helper
  res.locals.formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Compute Cart Count
  try {
    let count = 0;
    if (req.session.user) {
      const cart = await Cart.findOne({ customer: req.session.user.id });
      if (cart && cart.items) {
        count = cart.items.reduce((acc, item) => acc + item.quantity, 0);
      }
    } else if (req.session.cart) {
      count = Object.values(req.session.cart).reduce((acc, qty) => acc + qty, 0);
    }
    res.locals.cartCount = count;
  } catch (err) {
    res.locals.cartCount = 0;
  }

  next();
};

module.exports = {
  isAuthenticated,
  isAdmin,
  attachViewGlobals
};
