const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'supermarket_secret_key_2024';

// Middleware
app.use(express.json());
app.use(express.static('public'));

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/supermarket_db';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    initializeData();
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    console.log('Please provide a valid MongoDB connection string in MONGODB_URI environment variable');
  });

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['manager', 'clerk', 'employee'], required: true },
  name: { type: String, required: true }
});

const User = mongoose.model('User', userSchema);

// Item Schema
const itemSchema = new mongoose.Schema({
  code: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  unitPrice: { type: Number, required: true },
  costPrice: { type: Number, required: true },
  quantity: { type: Number, default: 0 },
  unit: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Item = mongoose.model('Item', itemSchema);

// Transaction Schema
const transactionSchema = new mongoose.Schema({
  serialNumber: { type: String, unique: true, required: true },
  items: [{
    code: String,
    name: String,
    quantity: Number,
    unitPrice: Number,
    itemPrice: Number
  }],
  totalAmount: { type: Number, required: true },
  clerkId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

const Transaction = mongoose.model('Transaction', transactionSchema);

// Initialize default data
async function initializeData() {
  try {
    // Check if users exist
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      const users = [
        { username: 'manager', password: await bcrypt.hash('manager123', 10), role: 'manager', name: 'John Manager' },
        { username: 'clerk1', password: await bcrypt.hash('clerk123', 10), role: 'clerk', name: 'Alice Clerk' },
        { username: 'employee1', password: await bcrypt.hash('emp123', 10), role: 'employee', name: 'Bob Employee' }
      ];
      
      await User.insertMany(users);
      console.log('Default users created');
    }

    // Check if items exist
    const itemCount = await Item.countDocuments();
    if (itemCount === 0) {
      const items = [
        { code: 'ITM001', name: 'Apples', unitPrice: 150, costPrice: 100, quantity: 50, unit: 'kg' },
        { code: 'ITM002', name: 'Bananas', unitPrice: 80, costPrice: 50, quantity: 30, unit: 'kg' },
        { code: 'ITM003', name: 'Milk', unitPrice: 45, costPrice: 35, quantity: 100, unit: 'liters' },
        { code: 'ITM004', name: 'Bread', unitPrice: 25, costPrice: 18, quantity: 75, unit: 'pieces' },
        { code: 'ITM005', name: 'Rice', unitPrice: 60, costPrice: 45, quantity: 200, unit: 'kg' }
      ];
      
      await Item.insertMany(items);
      console.log('Default items created');
    }
  } catch (error) {
    console.error('Error initializing data:', error);
  }
}

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Routes

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ username });
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user._id, username: user.username, role: user.role, name: user.name } });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all items
app.get('/api/items', authenticateToken, async (req, res) => {
  try {
    const items = await Item.find().sort({ name: 1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add new item (Manager only)
app.post('/api/items', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'manager') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { code, name, unitPrice, costPrice, quantity, unit } = req.body;
    
    const item = new Item({ code, name, unitPrice, costPrice, quantity, unit });
    await item.save();
    
    res.status(201).json(item);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Item code already exists' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update item price (Manager only)
app.put('/api/items/:id/price', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'manager') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { unitPrice } = req.body;
    
    const item = await Item.findByIdAndUpdate(
      req.params.id,
      { unitPrice, updatedAt: new Date() },
      { new: true }
    );
    
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update inventory (Employee/Manager)
app.put('/api/items/:id/inventory', authenticateToken, async (req, res) => {
  try {
    if (!['employee', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { quantity } = req.body;
    
    const item = await Item.findByIdAndUpdate(
      req.params.id,
      { $inc: { quantity }, updatedAt: new Date() },
      { new: true }
    );
    
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create transaction (Clerk/Manager)
app.post('/api/transactions', authenticateToken, async (req, res) => {
  try {
    if (!['clerk', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { items } = req.body;
    
    // Generate serial number
    const transactionCount = await Transaction.countDocuments();
    const serialNumber = `TXN${(transactionCount + 1).toString().padStart(6, '0')}`;
    
    // Validate and process items
    const transactionItems = [];
    let totalAmount = 0;
    
    for (const item of items) {
      const dbItem = await Item.findOne({ code: item.code });
      
      if (!dbItem) {
        return res.status(400).json({ message: `Item ${item.code} not found` });
      }
      if (dbItem.quantity < item.quantity) {
        return res.status(400).json({ message: `Insufficient stock for ${dbItem.name}` });
      }

      const itemPrice = dbItem.unitPrice * item.quantity;
      totalAmount += itemPrice;

      transactionItems.push({
        code: dbItem.code,
        name: dbItem.name,
        quantity: item.quantity,
        unitPrice: dbItem.unitPrice,
        itemPrice: itemPrice
      });

      // Update inventory
      await Item.findByIdAndUpdate(
        dbItem._id,
        { $inc: { quantity: -item.quantity }, updatedAt: new Date() }
      );
    }

    // Create transaction
    const transaction = new Transaction({
      serialNumber,
      items: transactionItems,
      totalAmount,
      clerkId: req.user.id
    });
    
    await transaction.save();
    
    res.status(201).json(transaction);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get sales statistics
app.get('/api/statistics', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'manager') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { startDate, endDate } = req.query;
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const transactions = await Transaction.find({
      createdAt: { $gte: start, $lte: end }
    });

    const statistics = {};

    transactions.forEach(transaction => {
      transaction.items.forEach(item => {
        if (!statistics[item.code]) {
          statistics[item.code] = {
            name: item.name,
            quantitySold: 0,
            priceRealized: 0,
            profit: 0
          };
        }

        statistics[item.code].quantitySold += item.quantity;
        statistics[item.code].priceRealized += item.itemPrice;
      });
    });

    // Get cost prices for profit calculation
    const items = await Item.find({}, 'code costPrice');
    const costPrices = {};
    items.forEach(item => {
      costPrices[item.code] = item.costPrice;
    });

    // Calculate profits
    Object.keys(statistics).forEach(code => {
      const stat = statistics[code];
      const avgUnitPrice = stat.priceRealized / stat.quantitySold;
      const costPrice = costPrices[code] || 0;
      stat.profit = (avgUnitPrice - costPrice) * stat.quantitySold;
    });

    res.json(Object.values(statistics));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});