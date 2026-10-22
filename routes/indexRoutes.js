const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

// Home page
router.get('/', productController.getHome);

module.exports = router;
