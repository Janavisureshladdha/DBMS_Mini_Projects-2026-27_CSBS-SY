const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');

// Show login page
exports.getLogin = (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.render('login', {
    title: 'Login - OrangeCart',
    page: 'login'
  });
};

// Process login
exports.postLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      req.session.error = 'Please provide both email and password';
      return res.redirect('/auth/login');
    }

    const customer = await Customer.findOne({ email: email.toLowerCase().trim() });
    if (!customer) {
      req.session.error = 'Invalid email or password';
      return res.redirect('/auth/login');
    }

    const isMatch = await customer.comparePassword(password);
    if (!isMatch) {
      req.session.error = 'Invalid email or password';
      return res.redirect('/auth/login');
    }

    // Set user session
    req.session.user = {
      id: customer._id.toString(),
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      role: customer.role
    };

    // Merge session cart into MongoDB cart if guest added items before logging in
    if (req.session.cart && Object.keys(req.session.cart).length > 0) {
      let dbCart = await Cart.findOne({ customer: customer._id });
      if (!dbCart) {
        dbCart = new Cart({ customer: customer._id, items: [] });
      }

      for (const [prodId, qty] of Object.entries(req.session.cart)) {
        const product = await Product.findById(prodId);
        if (product && product.stock > 0) {
          const existingItem = dbCart.items.find(item => item.product.toString() === prodId);
          if (existingItem) {
            existingItem.quantity = Math.min(existingItem.quantity + qty, product.stock);
          } else {
            dbCart.items.push({
              product: product._id,
              quantity: Math.min(qty, product.stock),
              price: product.price
            });
          }
        }
      }
      await dbCart.save();
      delete req.session.cart;
    }

    req.session.success = `Welcome back, ${customer.name}!`;

    const returnTo = req.session.returnTo || (customer.role === 'admin' ? '/admin' : '/');
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (error) {
    console.error('Login error:', error);
    req.session.error = 'An error occurred during login. Please try again.';
    res.redirect('/auth/login');
  }
};

// Show registration page
exports.getRegister = (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.render('register', {
    title: 'Register - OrangeCart',
    page: 'register'
  });
};

// Process registration
exports.postRegister = async (req, res) => {
  const { name, email, password, confirmPassword, phone, street, city, state, postalCode } = req.body;

  try {
    if (!name || !email || !password) {
      req.session.error = 'Name, email, and password are required';
      return res.redirect('/auth/register');
    }

    if (password !== confirmPassword) {
      req.session.error = 'Passwords do not match';
      return res.redirect('/auth/register');
    }

    if (password.length < 6) {
      req.session.error = 'Password must be at least 6 characters';
      return res.redirect('/auth/register');
    }

    const existingCustomer = await Customer.findOne({ email: email.toLowerCase().trim() });
    if (existingCustomer) {
      req.session.error = 'An account with this email already exists';
      return res.redirect('/auth/register');
    }

    const customer = await Customer.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      phone: phone ? phone.trim() : '',
      address: {
        street: street ? street.trim() : '',
        city: city ? city.trim() : '',
        state: state ? state.trim() : '',
        postalCode: postalCode ? postalCode.trim() : '',
        country: 'India'
      },
      role: 'customer'
    });

    req.session.user = {
      id: customer._id.toString(),
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      role: customer.role
    };

    req.session.success = `Welcome to OrangeCart, ${customer.name}!`;
    res.redirect('/');
  } catch (error) {
    console.error('Registration error:', error);
    req.session.error = error.message || 'Registration failed. Please check your inputs.';
    res.redirect('/auth/register');
  }
};

// Logout
exports.logout = (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
};

// Show profile
exports.getProfile = async (req, res) => {
  try {
    const customer = await Customer.findById(req.session.user.id);
    if (!customer) {
      req.session.error = 'Customer not found';
      return res.redirect('/auth/login');
    }

    const orders = await Order.find({ customer: customer._id }).sort({ createdAt: -1 });

    res.render('profile', {
      title: 'My Profile - OrangeCart',
      page: 'profile',
      customer,
      orders
    });
  } catch (error) {
    console.error('Profile error:', error);
    req.session.error = 'Unable to load profile';
    res.redirect('/');
  }
};

// Update profile
exports.updateProfile = async (req, res) => {
  const { name, phone, street, city, state, postalCode } = req.body;

  try {
    const customer = await Customer.findById(req.session.user.id);
    if (!customer) {
      req.session.error = 'Customer not found';
      return res.redirect('/auth/login');
    }

    if (name) customer.name = name.trim();
    if (phone !== undefined) customer.phone = phone.trim();
    if (!customer.address) customer.address = {};
    if (street !== undefined) customer.address.street = street.trim();
    if (city !== undefined) customer.address.city = city.trim();
    if (state !== undefined) customer.address.state = state.trim();
    if (postalCode !== undefined) customer.address.postalCode = postalCode.trim();

    await customer.save();

    // Update session
    req.session.user.name = customer.name;
    req.session.user.phone = customer.phone;
    req.session.user.address = customer.address;

    req.session.success = 'Profile updated successfully!';
    res.redirect('/auth/profile');
  } catch (error) {
    console.error('Update profile error:', error);
    req.session.error = 'Failed to update profile';
    res.redirect('/auth/profile');
  }
};
