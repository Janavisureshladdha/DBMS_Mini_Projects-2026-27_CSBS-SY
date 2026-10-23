const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isAdmin } = require('../middleware/auth');

// Protect all admin routes
router.use(isAdmin);

// Dashboard
router.get('/', adminController.getDashboard);

// Products management
router.get('/products', adminController.getProducts);
router.get('/products/add', adminController.getAddProduct);
router.post('/products/add', adminController.postAddProduct);
router.get('/products/edit/:id', adminController.getEditProduct);
router.post('/products/edit/:id', adminController.postEditProduct);
router.post('/products/delete/:id', adminController.deleteProduct);
router.post('/products/quick-update/:id', adminController.quickUpdateProduct);

// Category management
router.get('/categories', adminController.getCategories);
router.post('/categories/add', adminController.postAddCategory);
router.post('/categories/delete/:id', adminController.deleteCategory);

// Orders management
router.get('/orders', adminController.getOrders);
router.post('/orders/status/:id', adminController.updateOrderStatus);

module.exports = router;
