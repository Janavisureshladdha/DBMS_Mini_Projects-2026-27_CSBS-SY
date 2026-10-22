const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

// All products & filtering
router.get('/', productController.getProducts);

// Single product detail
router.get('/:id', productController.getProductDetail);

module.exports = router;
