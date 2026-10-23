const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { isAuthenticated } = require('../middleware/auth');

// Submit product review (authenticated)
router.post('/', isAuthenticated, reviewController.postReview);

module.exports = router;
