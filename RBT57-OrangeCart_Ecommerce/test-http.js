const runHttpTests = async () => {
  console.log('🌐 Testing OrangeCart HTTP Endpoints & Sessions...\n');
  const baseUrl = 'http://localhost:3000';
  let passed = 0;
  let failed = 0;

  const test = (name, cond) => {
    if (cond) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      console.error(`  ❌ ${name}`);
      failed++;
    }
  };

  try {
    // 1. Home Page
    const homeRes = await fetch(`${baseUrl}/`);
    const homeHtml = await homeRes.text();
    test('GET / returns 200 OK', homeRes.status === 200);
    test('Home page contains "Your everyday marketplace"', homeHtml.includes('Your everyday marketplace'));
    test('Home page contains "Popular right now"', homeHtml.includes('Popular right now'));
    test('Home page does NOT display SQL editors or DBMS demonstrations', !homeHtml.includes('DBMS Demonstration') && !homeHtml.includes('SELECT p.product_id'));

    // 2. Products Page
    const prodRes = await fetch(`${baseUrl}/products`);
    const prodHtml = await prodRes.text();
    test('GET /products returns 200 OK', prodRes.status === 200);
    test('Products page contains catalog items', prodHtml.includes('Aero Wireless Headphones'));

    // 3. Search & Filter
    const searchRes = await fetch(`${baseUrl}/products?search=watch`);
    const searchHtml = await searchRes.text();
    test('Search ?search=watch returns Smart Fitness Watch', searchHtml.includes('Smart Fitness Watch'));

    const catRes = await fetch(`${baseUrl}/products?category=Audio`);
    const catHtml = await catRes.text();
    test('Filter ?category=Audio returns Audio products', catHtml.includes('SoundPeak'));

    // 4. Cart Page
    const cartRes = await fetch(`${baseUrl}/cart`);
    const cartHtml = await cartRes.text();
    test('GET /cart returns 200 OK', cartRes.status === 200);

    // 5. Login Page
    const loginRes = await fetch(`${baseUrl}/auth/login`);
    const loginHtml = await loginRes.text();
    test('GET /auth/login returns 200 OK', loginRes.status === 200);
    test('Login page contains demo credentials autofill buttons', loginHtml.includes('customer@example.com') && loginHtml.includes('admin@orangecart.com'));

    // 6. Test Customer Authentication with Cookie jar
    let cookie = '';
    const loginPostRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'email=customer%40example.com&password=password123',
      redirect: 'manual'
    });
    const setCookie = loginPostRes.headers.get('set-cookie');
    if (setCookie) {
      cookie = setCookie.split(';')[0];
    }
    test('POST /auth/login sets session cookie', Boolean(cookie));

    // Access orders with authenticated session
    const ordersRes = await fetch(`${baseUrl}/orders`, {
      headers: { 'Cookie': cookie }
    });
    const ordersHtml = await ordersRes.text();
    test('GET /orders with session returns 200 OK', ordersRes.status === 200);
    test('Orders page displays customer order history', ordersHtml.includes('ORD-'));

    // Access customer profile with authenticated session
    const profileRes = await fetch(`${baseUrl}/auth/profile`, {
      headers: { 'Cookie': cookie }
    });
    const profileHtml = await profileRes.text();
    test('GET /auth/profile returns 200 OK and shows customer details', profileRes.status === 200 && profileHtml.includes('Demo Customer'));

    // Verify Customer cannot access /admin
    const customerAdminRes = await fetch(`${baseUrl}/admin`, {
      headers: { 'Cookie': cookie },
      redirect: 'manual'
    });
    test('Customer is redirected away from /admin (Role-based authorization)', customerAdminRes.status === 302);

    // 7. Test Admin Login and Dashboard Access
    let adminCookie = '';
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'email=admin%40orangecart.com&password=admin123',
      redirect: 'manual'
    });
    const adminSetCookie = adminLoginRes.headers.get('set-cookie');
    if (adminSetCookie) {
      adminCookie = adminSetCookie.split(';')[0];
    }

    const adminDashRes = await fetch(`${baseUrl}/admin`, {
      headers: { 'Cookie': adminCookie }
    });
    const adminDashHtml = await adminDashRes.text();
    test('GET /admin with admin session returns 200 OK', adminDashRes.status === 200);
    test('Admin dashboard contains "Total products" and "Total revenue"', adminDashHtml.includes('Total products') && adminDashHtml.includes('Total revenue'));
    test('Admin dashboard contains "Low Stock Alert"', adminDashHtml.includes('Low Stock Alert'));

    console.log(`\n========================================`);
    console.log(`🏁 HTTP Test Summary: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('HTTP test error:', err);
    process.exit(1);
  }
};

runHttpTests();
