const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  emoji: {
    type: String,
    default: '🛍️'
  },
  brand: {
    type: String,
    default: ''
  },
  color: {
    type: String,
    default: 'Black'
  }
});

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      unique: true,
      required: true,
      index: true
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true
    },
    items: [orderItemSchema],
    shippingAddress: {
      fullName: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, default: 'India' }
    },
    subtotal: {
      type: Number,
      required: true
    },
    shippingFee: {
      type: Number,
      default: 0
    },
    tax: {
      type: Number,
      default: 0
    },
    totalAmount: {
      type: Number,
      required: true
    },
    payment: {
      transactionId: {
        type: String,
        default: () => 'TXN-' + Math.floor(100000 + Math.random() * 900000)
      },
      paymentMode: {
        type: String,
        enum: ['Cash on Delivery', 'UPI (Demo)', 'Card (Demo)'],
        default: 'Cash on Delivery'
      },
      status: {
        type: String,
        enum: ['Paid', 'Pending', 'Cash on Delivery'],
        default: 'Pending'
      },
      date: {
        type: Date,
        default: Date.now
      },
      amount: {
        type: Number
      }
    },
    orderStatus: {
      type: String,
      enum: ['Processing', 'Shipped', 'Delivered', 'Cancelled'],
      default: 'Processing'
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Order', orderSchema);
