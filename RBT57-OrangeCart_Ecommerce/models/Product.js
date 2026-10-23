const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    productId: {
      type: Number,
      unique: true,
      index: true
    },
    name: {
      type: String,
      required: [true, 'Please provide product name'],
      trim: true,
      maxlength: [150, 'Product name cannot exceed 150 characters']
    },
    brand: {
      type: String,
      required: [true, 'Please provide brand name'],
      trim: true
    },
    type: {
      type: String,
      trim: true,
      default: 'Standard'
    },
    year: {
      type: Number,
      default: 2026
    },
    color: {
      type: String,
      trim: true,
      default: 'Black'
    },
    price: {
      type: Number,
      required: [true, 'Please provide product price'],
      min: [0, 'Price must be positive']
    },
    stock: {
      type: Number,
      required: [true, 'Please provide stock quantity'],
      min: [0, 'Stock cannot be negative'],
      default: 10
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Please specify category']
    },
    categoryName: {
      type: String,
      trim: true
    },
    description: {
      type: String,
      default: 'High quality product designed for everyday performance and durability.'
    },
    emoji: {
      type: String,
      default: '🛍️'
    },
    imageUrl: {
      type: String,
      default: ''
    },
    tag: {
      type: String,
      enum: ['', 'BESTSELLER', 'TRENDING', 'POPULAR', 'VALUE PICK', 'NEW', 'LOW STOCK'],
      default: ''
    },
    rating: {
      type: Number,
      default: 4.5,
      min: [0, 'Rating cannot be negative'],
      max: [5, 'Rating cannot exceed 5']
    },
    numReviews: {
      type: Number,
      default: 0
    },
    featured: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Text index for search
productSchema.index({ name: 'text', brand: 'text', description: 'text' });
productSchema.index({ category: 1, price: 1 });

module.exports = mongoose.model('Product', productSchema);
