# 🍊 OrangeCart — Complete Full-Stack E-Commerce Website

OrangeCart is a complete, production-ready full-stack online shopping platform built with **Node.js**, **Express.js**, **MongoDB (Mongoose)**, and **EJS**. It features the signature modern orange-and-white theme (`#F47721`) and shopping user experience modeled directly on the OrangeCart prototype.

---

## 🌟 Features Overview

### 🛍️ Customer Experience
- **Home Page**: Promotional hero banner, catalog overview stats, category navigation pills, and popular/featured product recommendations.
- **Product Catalog**: Live search by product name and brand, department category filter, and dynamic sorting (Featured, Price: Low-to-High, Price: High-to-Low, Top-Rated).
- **Product Details**: Complete specifications derived from the ER model (Brand, Type, Color, Release Year, Available Stock, SKU/Code), interactive quantity selector, stock indicator, and instant Add-to-Cart.
- **Ratings & Reviews**: Real customer feedback with 1–5 star ratings and written reviews, automatically recalculating the product's average rating in MongoDB.
- **Interactive Shopping Cart**: Supports both guest and logged-in users with seamless cart merging upon sign-in. Increase/decrease quantities with live stock limits, remove items, and see server-calculated subtotals, delivery charges (Free over ₹1,999), and final totals.
- **Checkout & Safe Payments**: Shipping address collection, order summary review, and demo payment modes (**Cash on Delivery**, **UPI Demo**, **Card Demo**).
- **Order Tracking & Confirmation**: Instant invoice confirmation with unique human-readable order IDs (e.g. `ORD-2408`), order fulfillment timeline, and private order details protected by customer ownership checks.
- **Customer Accounts**: Secure registration, login/logout with session management, securely hashed passwords with `bcryptjs`, profile information, and default delivery address management.

### 🛡️ Admin Dashboard (`/admin`)
- **Real-Time Analytics**: Total products, registered customers, completed orders, and total aggregated revenue directly queried from MongoDB.
- **Low-Stock Alert**: Automated alert table identifying catalog items with stock below 10 units for timely restocking.
- **Recent Orders**: Live feed of the latest orders placed across all store customers.
- **Catalog Management (CRUD)**: Add new products with all ER attributes, edit details, adjust prices and stock inline, or delete items.
- **Category Management**: Create new store categories with custom emoji icons and inspect product counts per department.
- **Order Fulfillment**: Track all customer orders and update shipping statuses (**Processing** ➔ **Shipped** ➔ **Delivered** ➔ **Cancelled**).
- **Role-Based Protection**: All `/admin` routes strictly require administrator privileges.

---

## 🗄️ MongoDB Database Architecture (Mongoose)

The database schema directly implements the entities from the provided ER diagram:

```
  ┌──────────────┐          ┌──────────────┐
  │   Customer   │ 1      N │    Order     │
  │──────────────│─────────▶│──────────────│
  │ name, email, │          │ orderId,     │
  │ phone, role, │          │ items[],     │
  │ address{}    │          │ shipping{},  │
  └──────────────┘          │ payment{}    │
         │ 1                └──────────────┘
         │                         │ N
         │ 1                       │ references
         ▼                         ▼
  ┌──────────────┐          ┌──────────────┐
  │     Cart     │        N │   Product    │ N      1 ┌──────────────┐
  │──────────────│─────────▶│──────────────│─────────▶│   Category   │
  │ customer_id, │          │ name, brand, │          │──────────────│
  │ items[]      │          │ price, stock,│          │ name, slug,  │
  │              │          │ type, color, │          │ icon, desc   │
  └──────────────┘          │ year, emoji  │          └──────────────┘
                            └──────────────┘
                                   │ 1
                                   │ N
                                   ▼
                            ┌──────────────┐
                            │    Review    │
                            │──────────────│
                            │ product_id,  │
                            │ customer_id, │
                            │ rating (1-5),│
                            │ comment      │
                            └──────────────┘
```

- **Customer Model**: Name, unique lowercase email, bcrypt-hashed password, phone, structured address (street, city, state, postalCode, country), and role (`customer` | `admin`).
- **Category Model**: Name, automatic slug generation, icon, and description.
- **Product Model**: `productId` (numeric index), `name`, `brand`, `type`, `year`, `color`, `price`, `stock`, `category` (ObjectId reference), `categoryName`, `rating`, `numReviews`, `emoji`, `tag`, and `featured` flag.
- **Cart Model**: Dedicated customer document containing an array of item subdocuments referencing Product with purchase quantities and validated prices.
- **Order Model**: Unique `orderId` (e.g., `ORD-2408`), customer reference, ordered item snapshot (preserving purchase-time price, name, emoji, color), shipping address, subtotal, shipping fee, tax, payment snapshot (`transactionId`, `paymentMode`, `status`, `amount`), and fulfillment `orderStatus`.
- **Review Model**: Customer feedback referencing Product and Customer, indexed with `{ product: 1, customer: 1 }` to prevent duplicate submissions, with an automated post-save hook that updates the product's overall rating.

---

## 🚀 Setup & Installation Instructions

### Prerequisites
1. **Node.js** (v18.0 or newer)
2. **MongoDB** running locally on default port `27017` (or MongoDB Atlas connection string)

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory (a `.env.example` is provided):
```env
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/orangecart
SESSION_SECRET=orangecart_production_ready_secret_key_2026
NODE_ENV=development
```

### 3. Seed Realistic Sample Data
Run the database seeder to populate 5 categories, 16 realistic products, demo customers, admin, sample orders, and reviews:
```bash
npm run seed
```

### 4. Start the Application
```bash
npm start
```
The website will start on `http://localhost:3000`.

---

## 🔑 Demo Login Credentials

| Role | Email Address | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin@orangecart.com` | `admin123` | Full Admin Dashboard, Catalog Management, Order Statuses, Category Management |
| **Customer** | `customer@example.com` | `password123` | Shopping, Cart, Checkout, Order History, Reviews, Profile Editing |
| **Customer 2** | `jane@example.com` | `password123` | Independent Cart, Orders, Reviews |

> **Convenience Feature**: The login page includes 1-click **Quick Autofill** buttons for instant testing.

---

## 🧪 Testing Verification Guide

1. **Browsing Catalog**: Visit `http://localhost:3000/products`. Use the search bar for "headphones" or "watch", filter by "Electronics", or sort by "Price: High to low".
2. **Product Details & Reviews**: Click any product (e.g. *Aero Wireless Headphones*). Inspect specifications, select quantity, read customer reviews, and submit a new review.
3. **Cart Operations**: Click "Add to Cart". Open `/cart`. Test `+` and `−` quantity buttons and verify that quantities cannot exceed current stock.
4. **Checkout**: Click "Proceed to checkout". Fill delivery details, select payment mode (e.g., UPI Demo), and place the order.
5. **Order Confirmation & Privacy**: Review the confirmation page. Click "Orders" to see your order history. Confirm that logging in as Customer B does not permit viewing Customer A's private orders.
6. **Admin Dashboard**: Sign in as `admin@orangecart.com`. Visit `/admin`. Inspect revenue, add a new product, edit stock for low-stock items, and update order statuses.
