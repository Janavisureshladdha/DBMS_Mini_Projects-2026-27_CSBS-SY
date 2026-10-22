const Review = require('../models/Review');
const Product = require('../models/Product');

// Post a review
exports.postReview = async (req, res) => {
  const { productId, rating, comment } = req.body;

  try {
    if (!req.session.user) {
      req.session.error = 'You must be logged in to leave a review';
      return res.redirect(`/products/${productId}`);
    }

    if (!rating || !comment || comment.trim() === '') {
      req.session.error = 'Please provide both a star rating and comment';
      return res.redirect(`/products/${productId}`);
    }

    const product = await Product.findById(productId);
    if (!product) {
      req.session.error = 'Product not found';
      return res.redirect('/products');
    }

    // Check if user already submitted a review for this product
    let review = await Review.findOne({
      product: product._id,
      customer: req.session.user.id
    });

    if (review) {
      // Update existing review
      review.rating = Number(rating);
      review.comment = comment.trim();
      review.customerName = req.session.user.name;
      await review.save();
      req.session.success = 'Your review has been updated!';
    } else {
      // Create new review
      review = await Review.create({
        product: product._id,
        customer: req.session.user.id,
        customerName: req.session.user.name,
        rating: Number(rating),
        comment: comment.trim()
      });
      req.session.success = 'Thank you for submitting your review!';
    }

    // Recalculate average rating
    await Review.calculateAverageRating(product._id);

    res.redirect(`/products/${product._id}`);
  } catch (error) {
    console.error('Submit review error:', error);
    req.session.error = 'Failed to submit review';
    res.redirect(`/products/${productId}`);
  }
};
