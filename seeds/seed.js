const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

dotenv.config();

const Customer = require('../models/Customer');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const Review = require('../models/Review');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/orangecart');
    console.log('MongoDB connected for seeding...');
  } catch (err) {
    console.error('Error connecting to MongoDB:', err);
    process.exit(1);
  }
};

const seedData = async () => {
  try {
    await connectDB();

    console.log('Clearing existing data...');
    await Customer.deleteMany({});
    await Category.deleteMany({});
    await Product.deleteMany({});
    await Cart.deleteMany({});
    await Order.deleteMany({});
    await Review.deleteMany({});

    console.log('Seeding Categories...');
    const categoriesData = [
      { name: 'Electronics', description: 'Computing, desktop essentials, and power solutions', icon: '💻' },
      { name: 'Audio', description: 'Headphones, earbuds, speakers, and premium sound gear', icon: '🎧' },
      { name: 'Wearables', description: 'Smartwatches, fitness bands, and wearable tech', icon: '⌚' },
      { name: 'Home & Living', description: 'Smart lighting, hydration, and modern home decor', icon: '🏠' },
      { name: 'Accessories', description: 'Bags, phone stands, sunglasses, and daily essentials', icon: '🎒' }
    ];

    const categories = await Category.insertMany(categoriesData);
    const catMap = {};
    categories.forEach(c => {
      catMap[c.name] = c._id;
    });

    console.log('Seeding Customers & Admin...');
    const salt = await bcrypt.genSalt(10);
    const demoPasswordHash = await bcrypt.hash('password123', salt);
    const adminPasswordHash = await bcrypt.hash('admin123', salt);

    const customers = await Customer.create([
      {
        name: 'Demo Customer',
        email: 'customer@example.com',
        password: 'password123', // Will be hashed via pre-save hook
        phone: '+91 98765 43210',
        address: {
          street: '42 Orange Boulevard, Tech Park',
          city: 'Pune',
          state: 'Maharashtra',
          postalCode: '411033',
          country: 'India'
        },
        role: 'customer'
      },
      {
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'password123',
        phone: '+91 91234 56789',
        address: {
          street: '15 High Street, Bandra West',
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400050',
          country: 'India'
        },
        role: 'customer'
      },
      {
        name: 'OrangeCart Admin',
        email: 'admin@orangecart.com',
        password: 'admin123',
        phone: '+91 99999 88888',
        address: {
          street: 'Admin Headquarters, Shivaji Nagar',
          city: 'Pune',
          state: 'Maharashtra',
          postalCode: '411005',
          country: 'India'
        },
        role: 'admin'
      }
    ]);

    const demoCustomer = customers[0];
    const janeCustomer = customers[1];
    const adminUser = customers[2];

    console.log('Seeding Products...');
    const productsData = [
      {
        productId: 1001,
        name: 'Aero Wireless Headphones',
        category: catMap['Audio'],
        categoryName: 'Audio',
        brand: 'SoundPeak',
        type: 'Over-Ear Wireless',
        year: 2026,
        color: 'Matte Black',
        price: 2499,
        stock: 18,
        rating: 4.8,
        numReviews: 28,
        emoji: '🎧',
        tag: 'BESTSELLER',
        featured: true,
        description: 'High-fidelity wireless headphones with 40-hour battery life, active noise cancellation, and ultra-plush memory foam earcups.'
      },
      {
        productId: 1002,
        name: 'Smart Fitness Watch',
        category: catMap['Wearables'],
        categoryName: 'Wearables',
        brand: 'PulseFit',
        type: 'Smartwatch',
        year: 2026,
        color: 'Graphite',
        price: 3299,
        stock: 7,
        rating: 4.6,
        numReviews: 42,
        emoji: '⌚',
        tag: 'TRENDING',
        featured: true,
        description: 'Vibrant AMOLED display with real-time heart rate, blood oxygen tracking, GPS navigation, and 7-day battery endurance.'
      },
      {
        productId: 1003,
        name: 'Minimal Desk Lamp',
        category: catMap['Home & Living'],
        categoryName: 'Home & Living',
        brand: 'LumaHome',
        type: 'LED Table Lamp',
        year: 2025,
        color: 'Cream White',
        price: 1299,
        stock: 22,
        rating: 4.5,
        numReviews: 19,
        emoji: '💡',
        tag: '',
        featured: false,
        description: 'Architectural desk lamp with 3 color temperatures, stepless dimming, and built-in USB-C fast charging port.'
      },
      {
        productId: 1004,
        name: 'Everyday Urban Backpack',
        category: catMap['Accessories'],
        categoryName: 'Accessories',
        brand: 'UrbanTrail',
        type: 'Travel Backpack',
        year: 2026,
        color: 'Olive Green',
        price: 1899,
        stock: 12,
        rating: 4.7,
        numReviews: 31,
        emoji: '🎒',
        tag: 'POPULAR',
        featured: true,
        description: 'Water-repellent 25L commuter backpack featuring dedicated 16-inch laptop compartment, hidden security pocket, and ergonomic straps.'
      },
      {
        productId: 1005,
        name: 'Bluetooth Speaker Mini',
        category: catMap['Audio'],
        categoryName: 'Audio',
        brand: 'SoundPeak',
        type: 'Portable Speaker',
        year: 2025,
        color: 'Ocean Blue',
        price: 1599,
        stock: 4,
        rating: 4.4,
        numReviews: 15,
        emoji: '🔊',
        tag: 'LOW STOCK',
        featured: false,
        description: 'Pocket-sized powerhouse with deep bass punch, IPX7 water immersion resistance, and dual stereo pairing capability.'
      },
      {
        productId: 1006,
        name: 'Mechanical Gaming Keyboard',
        category: catMap['Electronics'],
        categoryName: 'Electronics',
        brand: 'KeyCraft',
        type: 'Mechanical Keyboard',
        year: 2026,
        color: 'Pure White',
        price: 2899,
        stock: 15,
        rating: 4.8,
        numReviews: 36,
        emoji: '⌨️',
        tag: '',
        featured: true,
        description: 'Hot-swappable linear switches, sound-dampening silicone foam, customizable per-key RGB backlighting, and braided USB-C cable.'
      },
      {
        productId: 1007,
        name: 'Insulated Travel Bottle',
        category: catMap['Home & Living'],
        categoryName: 'Home & Living',
        brand: 'TerraSip',
        type: 'Vacuum Flask',
        year: 2025,
        color: 'Orange Pop',
        price: 699,
        stock: 30,
        rating: 4.3,
        numReviews: 24,
        emoji: '🥤',
        tag: 'VALUE PICK',
        featured: false,
        description: 'Double-walled stainless steel flask keeping cold beverages chilled for 24 hours and hot coffee steaming for 12 hours.'
      },
      {
        productId: 1008,
        name: 'Precision Wireless Mouse',
        category: catMap['Electronics'],
        categoryName: 'Electronics',
        brand: 'KeyCraft',
        type: 'Ergonomic Mouse',
        year: 2026,
        color: 'Midnight Black',
        price: 899,
        stock: 9,
        rating: 4.5,
        numReviews: 20,
        emoji: '🖱️',
        tag: '',
        featured: false,
        description: 'Whisper-quiet optical clicks, dual Bluetooth 5.2 and 2.4GHz dongle connectivity, and contoured ergonomic thumb rest.'
      },
      {
        productId: 1009,
        name: 'Adjustable Phone Stand',
        category: catMap['Accessories'],
        categoryName: 'Accessories',
        brand: 'FlexiDesk',
        type: 'Aluminum Stand',
        year: 2025,
        color: 'Space Silver',
        price: 449,
        stock: 26,
        rating: 4.2,
        numReviews: 18,
        emoji: '📱',
        tag: '',
        featured: false,
        description: 'Aerospace-grade CNC aluminum stand with 360-degree rotation, dual hinges, and non-slip silicone anti-scratch pads.'
      },
      {
        productId: 1010,
        name: 'Smart Color LED Bulb',
        category: catMap['Home & Living'],
        categoryName: 'Home & Living',
        brand: 'LumaHome',
        type: 'Smart Lighting',
        year: 2026,
        color: 'White',
        price: 599,
        stock: 16,
        rating: 4.1,
        numReviews: 14,
        emoji: '💡',
        tag: '',
        featured: false,
        description: '16 million color options, voice assistant compatibility with Alexa and Google Home, and music sync mode.'
      },
      {
        productId: 1011,
        name: 'Fast-Charging Power Bank 20000mAh',
        category: catMap['Electronics'],
        categoryName: 'Electronics',
        brand: 'VoltGo',
        type: 'External Battery',
        year: 2026,
        color: 'Stealth Black',
        price: 1799,
        stock: 6,
        rating: 4.6,
        numReviews: 27,
        emoji: '🔋',
        tag: 'LOW STOCK',
        featured: true,
        description: '22.5W Power Delivery fast charging with digital LED power percentage display, dual USB-A, and bidirectional USB-C.'
      },
      {
        productId: 1012,
        name: 'Polarized Everyday Sunglasses',
        category: catMap['Accessories'],
        categoryName: 'Accessories',
        brand: 'Sunline',
        type: 'Eyewear',
        year: 2025,
        color: 'Tortoise Brown',
        price: 999,
        stock: 19,
        rating: 4.0,
        numReviews: 12,
        emoji: '🕶️',
        tag: '',
        featured: false,
        description: 'UV400 category 3 polarized lenses with lightweight durable TR90 frame for glare reduction and style.'
      },
      {
        productId: 1013,
        name: 'Noise-Cancelling True Wireless Earbuds',
        category: catMap['Audio'],
        categoryName: 'Audio',
        brand: 'SoundPeak',
        type: 'TWS In-Ear',
        year: 2026,
        color: 'Pearl White',
        price: 2199,
        stock: 14,
        rating: 4.7,
        numReviews: 33,
        emoji: '🎵',
        tag: 'NEW',
        featured: true,
        description: 'Hybrid ANC with transparency mode, quad-mic environmental noise cancellation for crystal clear calls, and wireless charging case.'
      },
      {
        productId: 1014,
        name: 'Ergonomic Vertical Mouse',
        category: catMap['Electronics'],
        categoryName: 'Electronics',
        brand: 'KeyCraft',
        type: 'Vertical Mouse',
        year: 2026,
        color: 'Slate Grey',
        price: 1299,
        stock: 8,
        rating: 4.6,
        numReviews: 16,
        emoji: '🖱️',
        tag: 'TRENDING',
        featured: false,
        description: 'Natural handshake position design reducing wrist strain and repetitive injury, with 4000 DPI adjustable optical sensor.'
      },
      {
        productId: 1015,
        name: 'Ceramic Pour-Over Coffee Dripper',
        category: catMap['Home & Living'],
        categoryName: 'Home & Living',
        brand: 'TerraSip',
        type: 'Coffee Maker',
        year: 2025,
        color: 'Warm Terracotta',
        price: 849,
        stock: 21,
        rating: 4.5,
        numReviews: 11,
        emoji: '☕',
        tag: '',
        featured: false,
        description: 'Artisanal ceramic cone with spiral interior ribs for optimal water flow extraction and rich aromatic brews.'
      },
      {
        productId: 1016,
        name: 'Rugged Fitness GPS Band',
        category: catMap['Wearables'],
        categoryName: 'Wearables',
        brand: 'PulseFit',
        type: 'Fitness Tracker',
        year: 2026,
        color: 'Volt Orange',
        price: 1999,
        stock: 5,
        rating: 4.4,
        numReviews: 17,
        emoji: '🏃',
        tag: 'LOW STOCK',
        featured: false,
        description: 'Military-grade shock resistance, 50m water depth rating, continuous sleep staging analysis, and 14-day battery life.'
      }
    ];

    const products = await Product.insertMany(productsData);

    console.log('Seeding Reviews...');
    const reviewsData = [
      {
        product: products[0]._id, // Aero Wireless Headphones
        customer: demoCustomer._id,
        customerName: demoCustomer.name,
        rating: 5,
        comment: 'Outstanding sound quality and ANC! The ear cushions are so comfortable for long study sessions.'
      },
      {
        product: products[0]._id,
        customer: janeCustomer._id,
        customerName: janeCustomer.name,
        rating: 4,
        comment: 'Great bass response and battery life is as advertised. Fast delivery too!'
      },
      {
        product: products[1]._id, // Smart Fitness Watch
        customer: demoCustomer._id,
        customerName: demoCustomer.name,
        rating: 5,
        comment: 'The AMOLED screen is stunning even in direct sunlight. Heart rate tracking is super accurate.'
      },
      {
        product: products[5]._id, // Mechanical Gaming Keyboard
        customer: janeCustomer._id,
        customerName: janeCustomer.name,
        rating: 5,
        comment: 'Typing on this keyboard is pure joy. The switches are buttery smooth and build quality is top tier!'
      },
      {
        product: products[6]._id, // Insulated Travel Bottle
        customer: demoCustomer._id,
        customerName: demoCustomer.name,
        rating: 4,
        comment: 'Keeps water ice cold all day in Pune heat! Love the bright orange finish.'
      }
    ];

    await Review.insertMany(reviewsData);

    console.log('Seeding Sample Orders...');
    const order1 = await Order.create({
      orderId: 'ORD-2408',
      customer: demoCustomer._id,
      items: [
        {
          product: products[2]._id,
          name: products[2].name,
          price: products[2].price,
          quantity: 1,
          emoji: products[2].emoji,
          brand: products[2].brand,
          color: products[2].color
        },
        {
          product: products[6]._id,
          name: products[6].name,
          price: products[6].price,
          quantity: 2,
          emoji: products[6].emoji,
          brand: products[6].brand,
          color: products[6].color
        }
      ],
      shippingAddress: {
        fullName: demoCustomer.name,
        email: demoCustomer.email,
        phone: demoCustomer.phone,
        street: demoCustomer.address.street,
        city: demoCustomer.address.city,
        state: demoCustomer.address.state,
        postalCode: demoCustomer.address.postalCode,
        country: demoCustomer.address.country
      },
      subtotal: 1299 + (699 * 2), // 2697
      shippingFee: 0,
      tax: 0,
      totalAmount: 2697,
      payment: {
        transactionId: 'TXN-984321',
        paymentMode: 'UPI (Demo)',
        status: 'Paid',
        date: new Date('2026-10-12T10:30:00Z'),
        amount: 2697
      },
      orderStatus: 'Delivered',
      createdAt: new Date('2026-10-12T10:30:00Z')
    });

    const order2 = await Order.create({
      orderId: 'ORD-2407',
      customer: demoCustomer._id,
      items: [
        {
          product: products[0]._id,
          name: products[0].name,
          price: products[0].price,
          quantity: 1,
          emoji: products[0].emoji,
          brand: products[0].brand,
          color: products[0].color
        }
      ],
      shippingAddress: {
        fullName: demoCustomer.name,
        email: demoCustomer.email,
        phone: demoCustomer.phone,
        street: demoCustomer.address.street,
        city: demoCustomer.address.city,
        state: demoCustomer.address.state,
        postalCode: demoCustomer.address.postalCode,
        country: demoCustomer.address.country
      },
      subtotal: 2499,
      shippingFee: 0,
      tax: 0,
      totalAmount: 2499,
      payment: {
        transactionId: 'TXN-765432',
        paymentMode: 'Cash on Delivery',
        status: 'Cash on Delivery',
        date: new Date('2026-10-09T14:15:00Z'),
        amount: 2499
      },
      orderStatus: 'Processing',
      createdAt: new Date('2026-10-09T14:15:00Z')
    });

    const order3 = await Order.create({
      orderId: 'ORD-2406',
      customer: janeCustomer._id,
      items: [
        {
          product: products[1]._id,
          name: products[1].name,
          price: products[1].price,
          quantity: 1,
          emoji: products[1].emoji,
          brand: products[1].brand,
          color: products[1].color
        },
        {
          product: products[10]._id,
          name: products[10].name,
          price: products[10].price,
          quantity: 1,
          emoji: products[10].emoji,
          brand: products[10].brand,
          color: products[10].color
        }
      ],
      shippingAddress: {
        fullName: janeCustomer.name,
        email: janeCustomer.email,
        phone: janeCustomer.phone,
        street: janeCustomer.address.street,
        city: janeCustomer.address.city,
        state: janeCustomer.address.state,
        postalCode: janeCustomer.address.postalCode,
        country: janeCustomer.address.country
      },
      subtotal: 3299 + 1799,
      shippingFee: 0,
      tax: 0,
      totalAmount: 5098,
      payment: {
        transactionId: 'TXN-543210',
        paymentMode: 'Card (Demo)',
        status: 'Paid',
        date: new Date('2026-10-08T18:40:00Z'),
        amount: 5098
      },
      orderStatus: 'Shipped',
      createdAt: new Date('2026-10-08T18:40:00Z')
    });

    console.log('Seeding Sample Demo Cart...');
    await Cart.create({
      customer: demoCustomer._id,
      items: [
        {
          product: products[7]._id, // Wireless Mouse
          quantity: 1,
          price: products[7].price
        }
      ]
    });

    console.log('✅ Seeding completed successfully!');
    console.log(`- Categories: ${categories.length}`);
    console.log(`- Products: ${products.length}`);
    console.log(`- Customers: ${customers.length}`);
    console.log(`- Orders: 3`);
    console.log(`- Reviews: ${reviewsData.length}`);
    console.log('\nDemo Credentials:');
    console.log('Customer: customer@example.com / password123');
    console.log('Admin: admin@orangecart.com / admin123');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
};

seedData();
