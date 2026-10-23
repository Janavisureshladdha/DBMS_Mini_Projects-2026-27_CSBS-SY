const Product = require('../models/Product');
const Cart = require('../models/Cart');

// Helper to get formatted cart items and summary from DB or Session
const getCartData = async (req) => {
  let items = [];
  let subtotal = 0;

  if (req.session.user) {
    let cart = await Cart.findOne({ customer: req.session.user.id }).populate('items.product');
    if (cart && cart.items) {
      // Filter out any deleted products or sync current prices
      const validItems = [];
      for (const item of cart.items) {
        if (item.product) {
          const prod = item.product;
          // Ensure quantity does not exceed current stock
          const qty = Math.min(item.quantity, prod.stock > 0 ? prod.stock : 0);
          if (qty > 0) {
            validItems.push({
              product: prod,
              quantity: qty,
              price: prod.price,
              lineTotal: prod.price * qty
            });
            subtotal += prod.price * qty;
          }
        }
      }
      items = validItems;
    }
  } else {
    // Guest session cart: { [productId]: quantity }
    if (req.session.cart) {
      for (const [prodId, qty] of Object.entries(req.session.cart)) {
        const prod = await Product.findById(prodId);
        if (prod && prod.stock > 0) {
          const validQty = Math.min(qty, prod.stock);
          if (validQty > 0) {
            items.push({
              product: prod,
              quantity: validQty,
              price: prod.price,
              lineTotal: prod.price * validQty
            });
            subtotal += prod.price * validQty;
          }
        }
      }
    }
  }

  const shippingFee = subtotal >= 1999 || subtotal === 0 ? 0 : 79;
  const totalAmount = subtotal + shippingFee;
  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return {
    items,
    subtotal,
    shippingFee,
    totalAmount,
    totalCount
  };
};

// Render Cart Page
exports.getCart = async (req, res) => {
  try {
    const cartData = await getCartData(req);
    res.render('cart', {
      title: 'Shopping Cart - OrangeCart',
      page: 'cart',
      cart: cartData
    });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).render('error', { message: 'Failed to load shopping cart' });
  }
};

// Add to Cart
exports.addToCart = async (req, res) => {
  const { productId, quantity = 1 } = req.body;
  const qty = parseInt(quantity, 10) || 1;

  const isAjax = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
  try {
    // Validate product and stock
    const isObjectId = productId.match(/^[0-9a-fA-F]{24}$/);
    const product = isObjectId
      ? await Product.findById(productId)
      : await Product.findOne({ productId: Number(productId) });

    if (!product) {
      if (isAjax) return res.status(404).json({ success: false, message: 'Product not found' });
      req.session.error = 'Product not found';
      return res.redirect('/products');
    }

    if (product.stock <= 0) {
      if (isAjax) return res.status(400).json({ success: false, message: 'Sorry, this product is out of stock' });
      req.session.error = 'Sorry, this product is out of stock';
      return res.redirect(`/products/${product._id}`);
    }

    const prodIdStr = product._id.toString();

    if (req.session.user) {
      // User logged in: update MongoDB cart
      let cart = await Cart.findOne({ customer: req.session.user.id });
      if (!cart) {
        cart = new Cart({ customer: req.session.user.id, items: [] });
      }

      const existingItem = cart.items.find(item => item.product.toString() === prodIdStr);
      if (existingItem) {
        const newQty = existingItem.quantity + qty;
        if (newQty > product.stock) {
          existingItem.quantity = product.stock;
          await cart.save();
          if (isAjax) {
            const count = cart.items.reduce((s, i) => s + i.quantity, 0);
            return res.json({
              success: true,
              message: `Maximum available stock (${product.stock}) reached`,
              cartCount: count
            });
          }
        } else {
          existingItem.quantity = newQty;
          await cart.save();
        }
      } else {
        cart.items.push({
          product: product._id,
          quantity: Math.min(qty, product.stock),
          price: product.price
        });
        await cart.save();
      }

      const count = cart.items.reduce((s, i) => s + i.quantity, 0);

      if (isAjax) {
        return res.json({
          success: true,
          message: `${product.name} added to cart!`,
          cartCount: count
        });
      }
    } else {
      // Guest session cart
      if (!req.session.cart) req.session.cart = {};
      const currentQty = req.session.cart[prodIdStr] || 0;
      const newQty = currentQty + qty;

      if (newQty > product.stock) {
        req.session.cart[prodIdStr] = product.stock;
        const count = Object.values(req.session.cart).reduce((a, b) => a + b, 0);
        if (isAjax) {
          return res.json({
            success: true,
            message: `Maximum available stock (${product.stock}) reached`,
            cartCount: count
          });
        }
      } else {
        req.session.cart[prodIdStr] = newQty;
      }

      const count = Object.values(req.session.cart).reduce((a, b) => a + b, 0);

      if (isAjax) {
        return res.json({
          success: true,
          message: `${product.name} added to cart!`,
          cartCount: count
        });
      }
    }

    req.session.success = `${product.name} added to cart!`;
    res.redirect('/cart');
  } catch (error) {
    console.error('Add to cart error:', error);
    if (isAjax) return res.status(500).json({ success: false, message: 'Could not add to cart' });
    req.session.error = 'Could not add to cart';
    res.redirect('/cart');
  }
};

// Update item quantity
exports.updateQuantity = async (req, res) => {
  const { productId, delta } = req.body;
  const change = parseInt(delta, 10);
  const isAjax = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));

  try {
    const product = await Product.findById(productId);
    if (!product) {
      if (isAjax) return res.status(404).json({ success: false, message: 'Product not found' });
      return res.redirect('/cart');
    }

    const prodIdStr = product._id.toString();

    if (req.session.user) {
      let cart = await Cart.findOne({ customer: req.session.user.id });
      if (cart) {
        const item = cart.items.find(i => i.product.toString() === prodIdStr);
        if (item) {
          const updatedQty = item.quantity + change;
          if (updatedQty <= 0) {
            cart.items = cart.items.filter(i => i.product.toString() !== prodIdStr);
          } else if (updatedQty > product.stock) {
            item.quantity = product.stock;
          } else {
            item.quantity = updatedQty;
          }
          await cart.save();
        }
      }
    } else {
      if (req.session.cart && req.session.cart[prodIdStr]) {
        const updatedQty = req.session.cart[prodIdStr] + change;
        if (updatedQty <= 0) {
          delete req.session.cart[prodIdStr];
        } else if (updatedQty > product.stock) {
          req.session.cart[prodIdStr] = product.stock;
        } else {
          req.session.cart[prodIdStr] = updatedQty;
        }
      }
    }

    if (isAjax) {
      const cartData = await getCartData(req);
      return res.json({
        success: true,
        cart: cartData
      });
    }

    res.redirect('/cart');
  } catch (error) {
    console.error('Update quantity error:', error);
    if (isAjax) return res.status(500).json({ success: false, message: 'Failed to update quantity' });
    res.redirect('/cart');
  }
};

// Remove item from cart
exports.removeFromCart = async (req, res) => {
  const { productId } = req.body;
  const isAjax = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));

  try {
    if (req.session.user) {
      const cart = await Cart.findOne({ customer: req.session.user.id });
      if (cart) {
        cart.items = cart.items.filter(i => i.product.toString() !== productId);
        await cart.save();
      }
    } else {
      if (req.session.cart && req.session.cart[productId]) {
        delete req.session.cart[productId];
      }
    }

    if (isAjax) {
      const cartData = await getCartData(req);
      return res.json({
        success: true,
        message: 'Item removed from cart',
        cart: cartData
      });
    }

    req.session.success = 'Item removed from cart';
    res.redirect('/cart');
  } catch (error) {
    console.error('Remove from cart error:', error);
    if (req.xhr) return res.status(500).json({ success: false, message: 'Failed to remove item' });
    res.redirect('/cart');
  }
};

exports.getCartDataHelper = getCartData;
