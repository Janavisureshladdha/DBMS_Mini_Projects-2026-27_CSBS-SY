const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');
const Customer = require('../models/Customer');

// Admin Dashboard Overview
exports.getDashboard = async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    const totalCustomers = await Customer.countDocuments({ role: 'customer' });
    const totalOrders = await Order.countDocuments();

    // Calculate revenue using MongoDB aggregate
    const revenueStats = await Order.aggregate([
      { $match: { orderStatus: { $ne: 'Cancelled' } } },
      { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } }
    ]);
    const totalRevenue = revenueStats.length > 0 ? revenueStats[0].totalRevenue : 0;

    // Low stock products (< 10)
    const lowStockProducts = await Product.find({ stock: { $lt: 10 } })
      .populate('category')
      .sort({ stock: 1 });

    // Recent orders
    const recentOrders = await Order.find()
      .populate('customer', 'name email')
      .sort({ createdAt: -1 })
      .limit(6);

    res.render('admin/dashboard', {
      title: 'Admin Dashboard - OrangeCart',
      page: 'admin',
      stats: {
        totalProducts,
        totalCustomers,
        totalOrders,
        totalRevenue,
        lowStockCount: lowStockProducts.length
      },
      lowStockProducts,
      recentOrders
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).render('error', { message: 'Failed to load admin dashboard' });
  }
};

// Manage Products List
exports.getProducts = async (req, res) => {
  try {
    const products = await Product.find().populate('category').sort({ createdAt: -1 });
    const categories = await Category.find().sort({ name: 1 });

    res.render('admin/products', {
      title: 'Manage Products - OrangeCart Admin',
      page: 'admin-products',
      products,
      categories
    });
  } catch (error) {
    console.error('Admin products error:', error);
    req.session.error = 'Failed to load products';
    res.redirect('/admin');
  }
};

// Show Add Product Form
exports.getAddProduct = async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.render('admin/product-form', {
      title: 'Add New Product - OrangeCart Admin',
      page: 'admin-products',
      categories,
      product: null
    });
  } catch (error) {
    console.error('Add product page error:', error);
    res.redirect('/admin/products');
  }
};

// Create Product
exports.postAddProduct = async (req, res) => {
  const {
    name,
    category,
    brand,
    type,
    year,
    color,
    price,
    stock,
    emoji,
    tag,
    description,
    featured
  } = req.body;

  try {
    if (!name || !category || !price) {
      req.session.error = 'Product name, category, and price are required';
      return res.redirect('/admin/products/add');
    }

    const catDoc = await Category.findById(category);
    if (!catDoc) {
      req.session.error = 'Invalid category selected';
      return res.redirect('/admin/products/add');
    }

    // Generate numeric productId
    const maxProduct = await Product.findOne().sort({ productId: -1 });
    const nextId = maxProduct && maxProduct.productId ? maxProduct.productId + 1 : 1017;

    // Default emoji map if not specified
    const defaultEmojiMap = {
      Electronics: '🔌',
      Audio: '🎧',
      Wearables: '⌚',
      'Home & Living': '🏠',
      Accessories: '🎒'
    };

    await Product.create({
      productId: nextId,
      name: name.trim(),
      category: catDoc._id,
      categoryName: catDoc.name,
      brand: brand ? brand.trim() : 'OrangeCart',
      type: type ? type.trim() : 'Standard',
      year: year ? Number(year) : 2026,
      color: color ? color.trim() : 'Black',
      price: Number(price),
      stock: Number(stock) || 0,
      emoji: emoji || defaultEmojiMap[catDoc.name] || '📦',
      tag: tag || '',
      description: description ? description.trim() : 'Quality product from OrangeCart catalog.',
      featured: featured === 'on' || featured === true
    });

    req.session.success = `Product "${name}" added successfully!`;
    res.redirect('/admin/products');
  } catch (error) {
    console.error('Create product error:', error);
    req.session.error = 'Failed to create product: ' + error.message;
    res.redirect('/admin/products/add');
  }
};

// Show Edit Product Form
exports.getEditProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      req.session.error = 'Product not found';
      return res.redirect('/admin/products');
    }

    const categories = await Category.find().sort({ name: 1 });

    res.render('admin/product-form', {
      title: `Edit ${product.name} - OrangeCart Admin`,
      page: 'admin-products',
      product,
      categories
    });
  } catch (error) {
    console.error('Edit product page error:', error);
    res.redirect('/admin/products');
  }
};

// Update Product
exports.postEditProduct = async (req, res) => {
  const {
    name,
    category,
    brand,
    type,
    year,
    color,
    price,
    stock,
    emoji,
    tag,
    description,
    featured
  } = req.body;

  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      req.session.error = 'Product not found';
      return res.redirect('/admin/products');
    }

    const catDoc = await Category.findById(category);

    product.name = name.trim();
    if (catDoc) {
      product.category = catDoc._id;
      product.categoryName = catDoc.name;
    }
    product.brand = brand.trim();
    product.type = type.trim();
    product.year = Number(year);
    product.color = color.trim();
    product.price = Number(price);
    product.stock = Number(stock);
    product.emoji = emoji || product.emoji;
    product.tag = tag;
    product.description = description.trim();
    product.featured = featured === 'on' || featured === true;

    await product.save();

    req.session.success = `Product "${product.name}" updated successfully!`;
    res.redirect('/admin/products');
  } catch (error) {
    console.error('Update product error:', error);
    req.session.error = 'Failed to update product: ' + error.message;
    res.redirect(`/admin/products/edit/${req.params.id}`);
  }
};

// Delete Product
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      req.session.error = 'Product not found';
      return res.redirect('/admin/products');
    }

    req.session.success = `Product "${product.name}" deleted successfully!`;
    res.redirect('/admin/products');
  } catch (error) {
    console.error('Delete product error:', error);
    req.session.error = 'Failed to delete product';
    res.redirect('/admin/products');
  }
};

// Quick Stock / Price Update via AJAX or form
exports.quickUpdateProduct = async (req, res) => {
  const { id } = req.params;
  const { price, stock } = req.body;

  try {
    const updateData = {};
    if (price !== undefined) updateData.price = Number(price);
    if (stock !== undefined) updateData.stock = Number(stock);

    const product = await Product.findByIdAndUpdate(id, updateData, { new: true });

    if (req.xhr) {
      return res.json({ success: true, product });
    }

    req.session.success = 'Product updated successfully';
    res.redirect('/admin/products');
  } catch (error) {
    console.error('Quick update error:', error);
    if (req.xhr) return res.status(500).json({ success: false, message: 'Update failed' });
    res.redirect('/admin/products');
  }
};

// Manage Categories
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    // Product count per category
    const counts = await Product.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    const countMap = {};
    counts.forEach(c => {
      countMap[c._id.toString()] = c.count;
    });

    res.render('admin/categories', {
      title: 'Manage Categories - OrangeCart Admin',
      page: 'admin-categories',
      categories,
      countMap
    });
  } catch (error) {
    console.error('Admin categories error:', error);
    req.session.error = 'Failed to load categories';
    res.redirect('/admin');
  }
};

// Add Category
exports.postAddCategory = async (req, res) => {
  const { name, description, icon } = req.body;

  try {
    if (!name || name.trim() === '') {
      req.session.error = 'Category name is required';
      return res.redirect('/admin/categories');
    }

    await Category.create({
      name: name.trim(),
      description: description ? description.trim() : '',
      icon: icon ? icon.trim() : '📦'
    });

    req.session.success = `Category "${name}" created!`;
    res.redirect('/admin/categories');
  } catch (error) {
    console.error('Add category error:', error);
    req.session.error = 'Category already exists or invalid data';
    res.redirect('/admin/categories');
  }
};

// Delete Category
exports.deleteCategory = async (req, res) => {
  try {
    const productCount = await Product.countDocuments({ category: req.params.id });
    if (productCount > 0) {
      req.session.error = `Cannot delete category: ${productCount} products are assigned to it.`;
      return res.redirect('/admin/categories');
    }

    await Category.findByIdAndDelete(req.params.id);
    req.session.success = 'Category deleted successfully!';
    res.redirect('/admin/categories');
  } catch (error) {
    console.error('Delete category error:', error);
    req.session.error = 'Failed to delete category';
    res.redirect('/admin/categories');
  }
};

// Manage Orders
exports.getOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('customer', 'name email phone')
      .sort({ createdAt: -1 });

    res.render('admin/orders', {
      title: 'Manage Orders - OrangeCart Admin',
      page: 'admin-orders',
      orders
    });
  } catch (error) {
    console.error('Admin orders error:', error);
    req.session.error = 'Failed to load orders';
    res.redirect('/admin');
  }
};

// Update Order Status
exports.updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { orderStatus } = req.body;

  try {
    const order = await Order.findById(id);
    if (!order) {
      req.session.error = 'Order not found';
      return res.redirect('/admin/orders');
    }

    order.orderStatus = orderStatus;
    if (orderStatus === 'Delivered' && order.payment.paymentMode === 'Cash on Delivery') {
      order.payment.status = 'Paid';
    }
    await order.save();

    req.session.success = `Order #${order.orderId} status updated to ${orderStatus}`;
    res.redirect('/admin/orders');
  } catch (error) {
    console.error('Update order status error:', error);
    req.session.error = 'Failed to update order status';
    res.redirect('/admin/orders');
  }
};
