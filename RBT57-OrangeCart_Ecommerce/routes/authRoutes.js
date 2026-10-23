const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { isAuthenticated } = require('../middleware/auth');

// Login
router.get('/login', authController.getLogin);
router.post('/login', authController.postLogin);

// Register
router.get('/register', authController.getRegister);
router.post('/register', authController.postRegister);

// Logout
router.get('/logout', authController.logout);

// Profile
router.get('/profile', isAuthenticated, authController.getProfile);
router.post('/profile/update', isAuthenticated, authController.updateProfile);

module.exports = router;
