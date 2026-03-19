const express = require('express');
const { connectDB } = require('./db');
const app = express();
app.use(express.json());
const crypto = require('crypto');

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
    // LOG: See if the request actually arrived
    console.log("📩 Webhook received from:", req.headers['x-wc-webhook-source']);

    // 2. CHECK FOR PING (WooCommerce Test)
    // If it's a ping, WooCommerce sends a Webhook ID but no order data.
    if (req.headers['x-wc-webhook-topic'] === 'webhook.actioned') {
      console.log("✅ WooCommerce Ping received and verified.");
      return res.status(200).send('Webhook Active');
    }

    // 3. VERIFY SIGNATURE
    const signature = req.headers['x-wc-webhook-signature'];
    if (!signature) {
      console.error('❌ No signature header found');
      return res.status(401).send('No signature');
    }

    const expectedSignature = crypto
      .createHmac('sha256', WOO_SECRET)
      .update(req.rawBody || '')
      .digest('base64');

    if (signature !== expectedSignature) {
      console.error('❌ Signature Mismatch!');
      return res.status(401).send('Invalid Signature');
    }

    // 4. DATA VALIDATION
    const data = req.body;
    if (!data || !data.billing) {
      console.error('❌ Invalid Order Data Structure');
      return res.status(400).send('Invalid Data');
    }

    // 5. DATABASE OPERATION
    const db = await connectDB();
    const newOrder = {
      order_id: data.id,
      source_domain: req.headers['x-wc-webhook-source'] || 'unknown',
      customer: {
        name: `${data.billing.first_name} ${data.billing.last_name}`,
        phone: data.billing.phone,
        address: `${data.billing.address_1}, ${data.billing.city}`,
      },
      items: data.line_items?.map(item => ({
        name: item.name,
        qty: item.quantity,
        sku: item.sku
      })) || [],
      total: parseFloat(data.total),
      status: 'Pending',
      fraud_status: 'Unchecked',
      created_at: new Date()
    };

    const result = await db.collection('all_orders').insertOne(newOrder);
    console.log(`🚀 Order ${data.id} saved successfully!`);
    
    res.status(201).json({ success: true });

  } catch (err) {
    // This will show you the EXACT line that caused the 500 error in your terminal
    console.error('🔥 SERVER CRASH ERROR:', err.message);
    res.status(500).send('Internal Server Error: ' + err.message);
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