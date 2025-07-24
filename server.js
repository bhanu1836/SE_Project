const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'supermarket_secret_key_2024';

// Middleware
app.use(express.json());
app.use(express.static('public'));

// SQLite database setup
const db = new sqlite3.Database(':memory:');

// Initialize database tables
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Users table
      db.run(`CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('manager', 'clerk', 'employee')),
        name TEXT NOT NULL
      )`);

      // Items table
      db.run(`CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        unitPrice REAL NOT NULL,
        costPrice REAL NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        unit TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Transactions table
      db.run(`CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        serialNumber TEXT UNIQUE NOT NULL,
        items TEXT NOT NULL,
        totalAmount REAL NOT NULL,
        clerkId INTEGER,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(clerkId) REFERENCES users(id)
      )`, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}

// Initialize default data
async function initializeData() {
  try {
    await initializeDatabase();
    
    // Check if users exist
    db.get("SELECT COUNT(*) as count FROM users", async (err, row) => {
      if (err) {
        console.error('Error checking users:', err);
        return;
      }
      
      if (row.count === 0) {
        const users = [
          { username: 'manager', password: await bcrypt.hash('manager123', 10), role: 'manager', name: 'John Manager' },
          { username: 'clerk1', password: await bcrypt.hash('clerk123', 10), role: 'clerk', name: 'Alice Clerk' },
          { username: 'employee1', password: await bcrypt.hash('emp123', 10), role: 'employee', name: 'Bob Employee' }
        ];
        
        const stmt = db.prepare("INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)");
        users.forEach(user => {
          stmt.run(user.username, user.password, user.role, user.name);
        });
        stmt.finalize();
        console.log('Default users created');
      }
    });

    // Check if items exist
    db.get("SELECT COUNT(*) as count FROM items", (err, row) => {
      if (err) {
        console.error('Error checking items:', err);
        return;
      }
      
      if (row.count === 0) {
        const items = [
          { code: 'ITM001', name: 'Apples', unitPrice: 150, costPrice: 100, quantity: 50, unit: 'kg' },
          { code: 'ITM002', name: 'Bananas', unitPrice: 80, costPrice: 50, quantity: 30, unit: 'kg' },
          { code: 'ITM003', name: 'Milk', unitPrice: 45, costPrice: 35, quantity: 100, unit: 'liters' },
          { code: 'ITM004', name: 'Bread', unitPrice: 25, costPrice: 18, quantity: 75, unit: 'pieces' },
          { code: 'ITM005', name: 'Rice', unitPrice: 60, costPrice: 45, quantity: 200, unit: 'kg' }
        ];
        
        const stmt = db.prepare("INSERT INTO items (code, name, unitPrice, costPrice, quantity, unit) VALUES (?, ?, ?, ?, ?, ?)");
        items.forEach(item => {
          stmt.run(item.code, item.name, item.unitPrice, item.costPrice, item.quantity, item.unit);
        });
        stmt.finalize();
        console.log('Default items created');
      }
    });
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
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (err) {
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, username: user.username, role: user.role, name: user.name } });
  });
});

// Get all items
app.get('/api/items', authenticateToken, (req, res) => {
  db.all("SELECT * FROM items ORDER BY name", (err, items) => {
    if (err) {
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    res.json(items);
  });
});

// Add new item (Manager only)
app.post('/api/items', authenticateToken, (req, res) => {
  if (req.user.role !== 'manager') {
    return res.status(403).json({ message: 'Access denied' });
  }

  const { code, name, unitPrice, costPrice, quantity, unit } = req.body;
  
  db.run("INSERT INTO items (code, name, unitPrice, costPrice, quantity, unit) VALUES (?, ?, ?, ?, ?, ?)",
    [code, name, unitPrice, costPrice, quantity, unit], function(err) {
    if (err) {
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    
    db.get("SELECT * FROM items WHERE id = ?", [this.lastID], (err, item) => {
      if (err) {
        return res.status(500).json({ message: 'Server error', error: err.message });
      }
      res.status(201).json(item);
    });
  });
});

// Update item price (Manager only)
app.put('/api/items/:id/price', authenticateToken, (req, res) => {
  if (req.user.role !== 'manager') {
    return res.status(403).json({ message: 'Access denied' });
  }

  const { unitPrice } = req.body;
  
  db.run("UPDATE items SET unitPrice = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
    [unitPrice, req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    db.get("SELECT * FROM items WHERE id = ?", [req.params.id], (err, item) => {
      if (err) {
        return res.status(500).json({ message: 'Server error', error: err.message });
      }
      res.json(item);
    });
  });
});

// Update inventory (Employee/Manager)
app.put('/api/items/:id/inventory', authenticateToken, (req, res) => {
  if (!['employee', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }

  const { quantity } = req.body;
  
  db.run("UPDATE items SET quantity = quantity + ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
    [quantity, req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    db.get("SELECT * FROM items WHERE id = ?", [req.params.id], (err, item) => {
      if (err) {
        return res.status(500).json({ message: 'Server error', error: err.message });
      }
      res.json(item);
    });
  });
});

// Create transaction (Clerk/Manager)
app.post('/api/transactions', authenticateToken, (req, res) => {
  if (!['clerk', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }

  const { items } = req.body;
  
  // Generate serial number
  db.get("SELECT COUNT(*) as count FROM transactions", (err, row) => {
    if (err) {
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    
    const serialNumber = `TXN${(row.count + 1).toString().padStart(6, '0')}`;
    
    // Validate and process items
    const processItems = async () => {
      const transactionItems = [];
      let totalAmount = 0;
      
      for (const item of items) {
        const dbItem = await new Promise((resolve, reject) => {
          db.get("SELECT * FROM items WHERE code = ?", [item.code], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });
        
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
        await new Promise((resolve, reject) => {
          db.run("UPDATE items SET quantity = quantity - ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
            [item.quantity, dbItem.id], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      // Create transaction
      db.run("INSERT INTO transactions (serialNumber, items, totalAmount, clerkId) VALUES (?, ?, ?, ?)",
        [serialNumber, JSON.stringify(transactionItems), totalAmount, req.user.id], function(err) {
        if (err) {
          return res.status(500).json({ message: 'Server error', error: err.message });
        }
        
        const transaction = {
          id: this.lastID,
          serialNumber,
          items: transactionItems,
          totalAmount,
          clerkId: req.user.id,
          createdAt: new Date().toISOString()
        };
        
        res.status(201).json(transaction);
      });
    };
    
    processItems().catch(error => {
      res.status(500).json({ message: 'Server error', error: error.message });
    });
  });
});

// Get sales statistics
app.get('/api/statistics', authenticateToken, (req, res) => {
  if (req.user.role !== 'manager') {
    return res.status(403).json({ message: 'Access denied' });
  }

  const { startDate, endDate } = req.query;
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  db.all("SELECT * FROM transactions WHERE createdAt >= ? AND createdAt <= ?",
    [start.toISOString(), end.toISOString()], (err, transactions) => {
    if (err) {
      return res.status(500).json({ message: 'Server error', error: err.message });
    }

    const statistics = {};

    transactions.forEach(transaction => {
      const items = JSON.parse(transaction.items);
      items.forEach(item => {
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
    db.all("SELECT code, costPrice FROM items", (err, items) => {
      if (err) {
        return res.status(500).json({ message: 'Server error', error: err.message });
      }

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
    });
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initializeData();
});