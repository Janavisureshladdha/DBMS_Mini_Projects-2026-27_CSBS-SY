const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const Customer = require('../models/Customer');
const { getCartDataHelper } = require('./cartController');

// Show checkout page
exports.getCheckout = async (req, res) => {
  try {
    const cartData = await getCartDataHelper(req);

    if (cartData.items.length === 0) {
      req.session.error = 'Your cart is empty. Please add items before checking out.';
      return res.redirect('/cart');
    }

    const customer = req.session.user ? await Customer.findById(req.session.user.id) : null;

    res.render('checkout', {
      title: 'Checkout - OrangeCart',
      page: 'cart',
      cart: cartData,
      customer: customer || {}
    });
  } catch (error) {
    console.error('Checkout error:', error);
    req.session.error = 'Could not load checkout page';
    res.redirect('/cart');
  }
};

// Place order
exports.placeOrder = async (req, res) => {
  const {
    fullName,
    email,
    phone,
    street,
    city,
    state,
    postalCode,
    paymentMode
  } = req.body;

  try {
    const cartData = await getCartDataHelper(req);

    if (cartData.items.length === 0) {
      req.session.error = 'Your cart is empty.';
      return res.redirect('/cart');
    }

    // Basic validation
    if (!fullName || !email || !phone || !street || !city || !postalCode) {
      req.session.error = 'Please fill out all required shipping fields';
      return res.redirect('/orders/checkout');
    }

    // Verify stock and prepare order items
    const orderItems = [];
    let calculatedSubtotal = 0;

    for (const item of cartData.items) {
      const product = await Product.findById(item.product._id);
      if (!product) {
        req.session.error = `Product "${item.product.name}" is no longer available.`;
        return res.redirect('/cart');
      }

      if (product.stock < item.quantity) {
        req.session.error = `Insufficient stock for "${product.name}". Only ${product.stock} available.`;
        return res.redirect('/cart');
      }

      orderItems.push({
        product: product._id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        emoji: product.emoji,
        brand: product.brand,
        color: product.color
      });

      calculatedSubtotal += product.price * item.quantity;
    }

    // Shipping calculations
    const shippingFee = calculatedSubtotal >= 1999 ? 0 : 79;
    const totalAmount = calculatedSubtotal + shippingFee;

    // Generate readable unique orderId
    const orderCount = await Order.countDocuments();
    const orderId = `ORD-${2409 + orderCount}`;

    // Determine customer id (if logged in, use account; if guest, look up or create customer)
    let customerId;
    if (req.session.user) {
      customerId = req.session.user.id;
    } else {
      let guestUser = await Customer.findOne({ email: email.toLowerCase().trim() });
      if (!guestUser) {
        guestUser = await Customer.create({
          name: fullName.trim(),
          email: email.toLowerCase().trim(),
          password: 'guest_' + Math.random().toString(36).slice(2, 8),
          phone: phone.trim(),
          address: { street, city, state, postalCode, country: 'India' }
        });
      }
      customerId = guestUser._id;
    }

    // Deduct stock safely from MongoDB
    for (const item of orderItems) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: -item.quantity }
      });
    }

    // Create Payment details
    const paymentStatus = paymentMode === 'Cash on Delivery' ? 'Cash on Delivery' : 'Paid';

    // Create Order document
    const order = await Order.create({
      orderId,
      customer: customerId,
      items: orderItems,
      shippingAddress: {
        fullName: fullName.trim(),
        email: email.toLowerCase().trim(),
        phone: phone.trim(),
        street: street.trim(),
        city: city.trim(),
        state: state ? state.trim() : 'Maharashtra',
        postalCode: postalCode.trim(),
        country: 'India'
      },
      subtotal: calculatedSubtotal,
      shippingFee,
      tax: 0,
      totalAmount,
      payment: {
        transactionId: 'TXN-' + Math.floor(100000 + Math.random() * 900000),
        paymentMode: paymentMode || 'Cash on Delivery',
        status: paymentStatus,
        date: new Date(),
        amount: totalAmount
      },
      orderStatus: 'Processing'
    });

    // Clear cart in DB and session
    if (req.session.user) {
      await Cart.findOneAndDelete({ customer: req.session.user.id });
    }
    delete req.session.cart;

    req.session.success = `Order #${order.orderId} placed successfully!`;
    res.redirect(`/orders/success/${order._id}`);
  } catch (error) {
    console.error('Place order error:', error);
    req.session.error = 'An error occurred while placing your order. Please try again.';
    res.redirect('/orders/checkout');
  }
};

// Order Success page
exports.getOrderSuccess = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      req.session.error = 'Order not found';
      return res.redirect('/orders');
    }

    res.render('order-success', {
      title: 'Order Confirmed - OrangeCart',
      page: 'orders',
      order
    });
  } catch (error) {
    console.error('Order success error:', error);
    res.redirect('/orders');
  }
};

// Customer's Orders list
exports.getMyOrders = async (req, res) => {
  try {
    if (!req.session.user) {
      req.session.error = 'Please log in to view your orders';
      return res.redirect('/auth/login');
    }

    const orders = await Order.find({ customer: req.session.user.id }).sort({ createdAt: -1 });

    res.render('orders', {
      title: 'My Orders - OrangeCart',
      page: 'orders',
      orders
    });
  } catch (error) {
    console.error('My orders error:', error);
    req.session.error = 'Could not load orders';
    res.redirect('/');
  }
};

// Order Detail page
exports.getOrderDetail = async (req, res) => {
  try {
    const { id } = req.params;

    const isObjectId = id.match(/^[0-9a-fA-F]{24}$/);
    const order = isObjectId
      ? await Order.findById(id).populate('customer', 'name email phone')
      : await Order.findOne({ orderId: id }).populate('customer', 'name email phone');

    if (!order) {
      req.session.error = 'Order not found';
      return res.redirect('/orders');
    }

    // Security check: Only allow customer who owns the order OR an admin to view it!
    const isOwner = req.session.user && order.customer && order.customer._id.toString() === req.session.user.id;
    const isAdminUser = req.session.user && req.session.user.role === 'admin';

    if (!isOwner && !isAdminUser) {
      req.session.error = 'Access denied. You cannot view this order.';
      return res.redirect('/orders');
    }

    res.render('order-detail', {
      title: `Order ${order.orderId} - OrangeCart`,
      page: 'orders',
      order
    });
  } catch (error) {
    console.error('Order detail error:', error);
    req.session.error = 'Failed to load order details';
    res.redirect('/orders');
  }
};
