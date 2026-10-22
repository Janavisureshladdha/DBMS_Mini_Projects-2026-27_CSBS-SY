const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { isAuthenticated } = require('../middleware/auth');

// Checkout view
router.get('/checkout', orderController.getCheckout);

// Place order
router.post('/place', orderController.placeOrder);

// Order confirmation / success
router.get('/success/:id', orderController.getOrderSuccess);

// Customer's orders list (authenticated)
router.get('/', isAuthenticated, orderController.getMyOrders);

// Single order detail
router.get('/:id', isAuthenticated, orderController.getOrderDetail);

module.exports = router;
