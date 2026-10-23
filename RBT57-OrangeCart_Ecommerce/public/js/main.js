// OrangeCart Interactive Frontend Script

// Toast Notification
function showToast(message, duration = 2500) {
  let toastEl = document.getElementById('toast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'toast';
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => {
    toastEl.classList.remove('show');
  }, duration);
}

// Global Currency Formatter
function formatINR(n) {
  return '₹' + Number(n).toLocaleString('en-IN');
}

// User Dropdown toggle
function toggleUserDropdown() {
  const menu = document.getElementById('userDropdownMenu');
  if (menu) {
    menu.classList.toggle('show');
  }
}

// Close dropdown when clicked outside
window.addEventListener('click', (e) => {
  const userMenuBtn = document.getElementById('userMenuBtn');
  const menu = document.getElementById('userDropdownMenu');
  if (menu && userMenuBtn && !userMenuBtn.contains(e.target) && !menu.contains(e.target)) {
    menu.classList.remove('show');
  }
});

// Update Cart Count Badges
function updateCartCountBadges(count) {
  const topCartCount = document.getElementById('cartCount');
  const sideCartCount = document.getElementById('sideCartCount');
  if (topCartCount) topCartCount.textContent = count;
  if (sideCartCount) sideCartCount.textContent = count;
}

// AJAX Add to Cart
async function addToCart(productId, quantity = 1) {
  try {
    const response = await fetch('/cart/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ productId, quantity })
    });

    const data = await response.json();
    if (data.success) {
      showToast(data.message || 'Added to cart!');
      if (data.cartCount !== undefined) {
        updateCartCountBadges(data.cartCount);
      }
    } else {
      showToast(data.message || 'Could not add to cart');
    }
  } catch (error) {
    console.error('Add to cart error:', error);
    // Fallback: standard form submit
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/cart/add';
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'productId';
    input.value = productId;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
  }
}

// AJAX Update Cart Quantity
async function updateCartQty(productId, delta) {
  try {
    const response = await fetch('/cart/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ productId, delta })
    });

    const data = await response.json();
    if (data.success) {
      window.location.reload();
    }
  } catch (err) {
    window.location.reload();
  }
}

// AJAX Remove Cart Item
async function removeCartItem(productId) {
  try {
    const response = await fetch('/cart/remove', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ productId })
    });

    const data = await response.json();
    if (data.success) {
      window.location.reload();
    }
  } catch (err) {
    window.location.reload();
  }
}

// Global search bar enter key handler
document.addEventListener('DOMContentLoaded', () => {
  const globalSearch = document.getElementById('globalSearch');
  if (globalSearch) {
    globalSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = globalSearch.value.trim();
        window.location.href = `/products?search=${encodeURIComponent(val)}`;
      }
    });
  }
});
