const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');
const Review = require('../models/Review');

// Home page
exports.getHome = async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    const featuredProducts = await Product.find({ featured: true }).limit(8);
    const popularProducts = await Product.find().sort({ rating: -1, numReviews: -1 }).limit(4);
    const totalProducts = await Product.countDocuments();
    const totalOrders = await Order.countDocuments();

    res.render('home', {
      title: 'OrangeCart | Good finds. Better prices.',
      page: 'home',
      categories,
      featuredProducts: featuredProducts.length > 0 ? featuredProducts : popularProducts,
      popularProducts,
      stats: {
        totalProducts,
        totalCategories: categories.length,
        totalOrders
      }
    });
  } catch (error) {
    console.error('Home page error:', error);
    res.status(500).render('error', { message: 'Failed to load home page' });
  }
};

// All products with search, filter, and sort
exports.getProducts = async (req, res) => {
  try {
    const { search, category, sort } = req.query;
    const categories = await Category.find().sort({ name: 1 });

    const query = {};

    // Search filter (name, brand, description)
    if (search && search.trim() !== '') {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ name: regex }, { brand: regex }, { description: regex }];
    }

    // Category filter
    let selectedCategory = 'All';
    if (category && category !== 'All' && category !== '') {
      const catDoc = await Category.findOne({
        $or: [{ name: category }, { slug: category }]
      });
      if (catDoc) {
        query.category = catDoc._id;
        selectedCategory = catDoc.name;
      }
    }

    // Sorting
    let sortOption = { createdAt: -1 };
    if (sort === 'low') {
      sortOption = { price: 1 };
    } else if (sort === 'high') {
      sortOption = { price: -1 };
    } else if (sort === 'rating') {
      sortOption = { rating: -1 };
    }

    const products = await Product.find(query).populate('category').sort(sortOption);

    // If request asks for JSON (for dynamic filtering)
    if (req.xhr || req.query.format === 'json') {
      return res.json({
        success: true,
        count: products.length,
        products
      });
    }

    res.render('products', {
      title: 'Products - OrangeCart',
      page: 'products',
      products,
      categories,
      selectedCategory,
      currentSearch: search || '',
      currentSort: sort || 'featured',
      totalProductsCount: await Product.countDocuments()
    });
  } catch (error) {
    console.error('Products error:', error);
    res.status(500).render('error', { message: 'Failed to load products' });
  }
};

// Product detail page
exports.getProductDetail = async (req, res) => {
  try {
    const { id } = req.params;

    // Support both MongoDB ObjectId and numeric productId
    const isObjectId = id.match(/^[0-9a-fA-F]{24}$/);
    const product = isObjectId
      ? await Product.findById(id).populate('category')
      : await Product.findOne({ productId: Number(id) }).populate('category');

    if (!product) {
      req.session.error = 'Product not found';
      return res.redirect('/products');
    }

    // Fetch reviews for this product
    const reviews = await Review.find({ product: product._id }).sort({ createdAt: -1 });

    // Fetch related products in the same category
    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: product._id }
    }).limit(4);

    res.render('product-detail', {
      title: `${product.name} - OrangeCart`,
      page: 'products',
      product,
      reviews,
      relatedProducts
    });
  } catch (error) {
    console.error('Product detail error:', error);
    req.session.error = 'Product not found';
    res.redirect('/products');
  }
};
