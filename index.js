const express = require('express');
const { connectDB } = require('./db');
const app = express();
app.use(express.json());

// IMPORTANT: WooCommerce sends the signature based on the RAW body. 
// If you use express.json(), it might modify the body. 
// For high accuracy, we use a custom verify function.
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

const WOO_SECRET = 'WOXO9aBnJeSg)ZCQ'; // The secret you set in WooCommerce

app.post('/api/webhooks/woocommerce', async (req, res) => {
  try {
    // 1. VERIFY THE SECRET
    const signature = req.headers['x-wc-webhook-signature'];
    const expectedSignature = crypto
      .createHmac('sha256', WOO_SECRET)
      .update(req.rawBody)
      .digest('base64');

    if (signature !== expectedSignature) {
      console.error('❌ Unauthorized: Signature mismatch');
      return res.status(401).send('Unauthorized');
    }

    // 2. CONNECT TO DB & PREPARE DATA
    const db = await connectDB();
    const data = req.body;

    const newOrder = {
      order_id: data.id,
      source_domain: req.headers['x-wc-webhook-source'] || 'perfume-site-main',
      customer: {
        name: `${data.billing.first_name} ${data.billing.last_name}`,
        phone: data.billing.phone,
        address: `${data.billing.address_1}, ${data.billing.city}`,
        email: data.billing.email
      },
      items: data.line_items.map(item => ({
        name: item.name,
        qty: item.quantity,
        sku: item.sku,
        price: item.price
      })),
      total: parseFloat(data.total),
      status: 'Pending',
      fraud_status: 'Unchecked',
      courier_status: 'Not Sent',
      created_at: new Date()
    };

    // 3. SAVE TO all_orders COLLECTION
    const result = await db.collection('all_orders').insertOne(newOrder);
    
    console.log(`✅ Verified Order ${data.id} saved to all_orders`);
    res.status(201).json({ message: "Order Collected Safely", id: result.insertedId });

  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 2. GET ORDERS FOR DASHBOARD
app.get('/api/orders', async (req, res) => {
  const db = await connectDB();
  const orders = await db.collection('all_orders')
    .find({})
    .sort({ created_at: -1 })
    .toArray();
  res.json(orders);
});

app.listen(3000, () => console.log("Server running on port 3000"));