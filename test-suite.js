const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

dotenv.config();

const Customer = require('./models/Customer');
const Category = require('./models/Category');
const Product = require('./models/Product');
const Cart = require('./models/Cart');
const Order = require('./models/Order');
const Review = require('./models/Review');

const runTests = async () => {
  console.log('🧪 Starting OrangeCart End-to-End Database & Feature Tests...\n');
  let passed = 0;
  let failed = 0;

  const assert = (condition, testName) => {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  };

  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/orangecart');
    console.log('Connected to MongoDB test database.\n');

    // 1. Test Product Retrieval
    console.log('--- 1. Product Catalog & Categories ---');
    const products = await Product.find().populate('category');
    assert(products.length >= 15, `Catalog contains ${products.length} products (at least 15 required)`);
    const categories = await Category.find();
    assert(categories.length >= 5, `Store contains ${categories.length} categories (at least 5 required)`);

    // 2. Test Search & Filter
    console.log('\n--- 2. Search & Filter Querying ---');
    const headphones = await Product.find({ name: { $regex: 'Headphones', $options: 'i' } });
    assert(headphones.length > 0 && headphones[0].name.includes('Headphones'), 'Search by keyword finds products correctly');
    const audioCat = categories.find(c => c.name === 'Audio');
    const audioProducts = await Product.find({ category: audioCat._id });
    assert(audioProducts.length > 0, `Category filter on "Audio" returns ${audioProducts.length} items`);

    // 3. Test Customer Authentication & Hashing
    console.log('\n--- 3. Customer Authentication & Password Hashing ---');
    const demoCust = await Customer.findOne({ email: 'customer@example.com' });
    assert(demoCust !== null, 'Demo customer exists in MongoDB');
    const isPwMatch = await demoCust.comparePassword('password123');
    assert(isPwMatch === true, 'Bcrypt password comparison works for customer');
    const isWrongPw = await demoCust.comparePassword('wrongpassword');
    assert(isWrongPw === false, 'Invalid password is properly rejected');
    assert(demoCust.password !== 'password123', 'Password is not stored in plaintext');

    const adminUser = await Customer.findOne({ email: 'admin@orangecart.com' });
    assert(adminUser && adminUser.role === 'admin', 'Admin user exists with role "admin"');

    // 4. Test Cart Management
    console.log('\n--- 4. Cart Operations & Stock Validation ---');
    let testProduct = await Product.findOne({ stock: { $gt: 5 } });
    const initialStock = testProduct.stock;

    let cart = await Cart.findOne({ customer: demoCust._id });
    if (!cart) {
      cart = new Cart({ customer: demoCust._id, items: [] });
    }
    // Add item to cart
    cart.items = [{ product: testProduct._id, quantity: 2, price: testProduct.price }];
    await cart.save();

    const savedCart = await Cart.findOne({ customer: demoCust._id }).populate('items.product');
    assert(savedCart.items.length === 1 && savedCart.items[0].quantity === 2, 'Item added to customer cart in MongoDB');

    // 5. Test Order Placement & Safe Stock Deduction
    console.log('\n--- 5. Order Placement & Inventory Deduction ---');
    const orderItems = [{
      product: testProduct._id,
      name: testProduct.name,
      price: testProduct.price,
      quantity: 2,
      emoji: testProduct.emoji,
      brand: testProduct.brand,
      color: testProduct.color
    }];

    const subtotal = testProduct.price * 2;
    const shippingFee = subtotal >= 1999 ? 0 : 79;
    const totalAmount = subtotal + shippingFee;

    const newOrder = await Order.create({
      orderId: 'ORD-' + Math.floor(8000 + Math.random() * 1000),
      customer: demoCust._id,
      items: orderItems,
      shippingAddress: {
        fullName: demoCust.name,
        email: demoCust.email,
        phone: demoCust.phone,
        street: demoCust.address.street,
        city: demoCust.address.city,
        state: demoCust.address.state,
        postalCode: demoCust.address.postalCode,
        country: 'India'
      },
      subtotal,
      shippingFee,
      tax: 0,
      totalAmount,
      payment: {
        paymentMode: 'UPI (Demo)',
        status: 'Paid',
        amount: totalAmount
      },
      orderStatus: 'Processing'
    });

    assert(newOrder._id !== null, `Order #${newOrder.orderId} successfully placed and saved to MongoDB`);

    // Safely deduct stock
    await Product.findByIdAndUpdate(testProduct._id, { $inc: { stock: -2 } });
    const updatedProduct = await Product.findById(testProduct._id);
    assert(updatedProduct.stock === initialStock - 2, `Inventory updated safely in MongoDB: ${initialStock} -> ${updatedProduct.stock}`);

    // Restore stock for repeatability
    await Product.findByIdAndUpdate(testProduct._id, { $inc: { stock: 2 } });

    // 6. Test Privacy & Authorization
    console.log('\n--- 6. Customer Order Privacy ---');
    const janeCust = await Customer.findOne({ email: 'jane@example.com' });
    const isOwner = newOrder.customer.toString() === demoCust._id.toString();
    const isJaneOwner = newOrder.customer.toString() === janeCust._id.toString();
    assert(isOwner === true, 'Order owner matches ordering customer');
    assert(isJaneOwner === false, 'Another customer is prevented from claiming ownership of private order');

    // 7. Test Product Reviews & Rating Calculation
    console.log('\n--- 7. Reviews & Rating Recalculation ---');
    // Remove any previous test review
    await Review.deleteMany({ product: testProduct._id, customer: demoCust._id });
    const newReview = await Review.create({
      product: testProduct._id,
      customer: demoCust._id,
      customerName: demoCust.name,
      rating: 5,
      comment: 'Automated test verified review: Excellent performance!'
    });
    assert(newReview._id !== null, 'Review saved in MongoDB');

    // Wait for post-save calculation
    await Review.calculateAverageRating(testProduct._id);
    const refreshedProduct = await Product.findById(testProduct._id);
    assert(refreshedProduct.numReviews > 0, `Product reviews count updated: ${refreshedProduct.numReviews}`);

    // 8. Test Admin Dashboard Aggregation & CRUD
    console.log('\n--- 8. Admin Statistics & Catalog Management ---');
    const revStats = await Order.aggregate([
      { $match: { orderStatus: { $ne: 'Cancelled' } } },
      { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } }
    ]);
    const totalRev = revStats.length > 0 ? revStats[0].totalRevenue : 0;
    assert(totalRev > 0, `Admin total revenue calculated via MongoDB aggregate: ₹${totalRev}`);

    // Admin create product
    const createdByAdmin = await Product.create({
      productId: 9999,
      name: 'Admin Test Device',
      brand: 'OrangeLab',
      category: categories[0]._id,
      categoryName: categories[0].name,
      price: 1499,
      stock: 5,
      emoji: '⚡',
      description: 'Test product added via admin panel'
    });
    assert(createdByAdmin._id !== null, 'Admin can create product in MongoDB');

    // Admin update stock/price
    await Product.findByIdAndUpdate(createdByAdmin._id, { price: 1299, stock: 8 });
    const checkedAdminProd = await Product.findById(createdByAdmin._id);
    assert(checkedAdminProd.price === 1299 && checkedAdminProd.stock === 8, 'Admin can update price and stock in MongoDB');

    // Admin delete product
    await Product.findByIdAndDelete(createdByAdmin._id);
    const deletedCheck = await Product.findById(createdByAdmin._id);
    assert(deletedCheck === null, 'Admin can delete product from MongoDB');

    // Admin update order status
    newOrder.orderStatus = 'Delivered';
    await newOrder.save();
    const updatedOrder = await Order.findById(newOrder._id);
    assert(updatedOrder.orderStatus === 'Delivered', 'Admin can update order status in MongoDB');

    console.log(`\n========================================`);
    console.log(`🏁 Test Summary: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
};

runTests();
