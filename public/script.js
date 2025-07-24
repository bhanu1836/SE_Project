class SupermarketApp {
    constructor() {
        this.token = localStorage.getItem('sas_token');
        this.user = JSON.parse(localStorage.getItem('sas_user') || 'null');
        this.cart = [];
        this.items = [];
        
        this.init(); 
    }

    init() {
        this.bindEvents();
        
        if (this.token && this.user) {
            this.showMainScreen();
        } else {
            this.showLoginScreen();
        }
    }

    bindEvents() {
        // Login
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('logoutBtn').addEventListener('click', () => this.handleLogout());

        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Sales
        document.getElementById('addItemBtn').addEventListener('click', () => this.addItemToCart());
        document.getElementById('itemCode').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addItemToCart();
        });
        document.getElementById('clearCartBtn').addEventListener('click', () => this.clearCart());
        document.getElementById('checkoutBtn').addEventListener('click', () => this.checkout());

        // Inventory
        document.getElementById('refreshInventoryBtn').addEventListener('click', () => this.loadInventory());
        document.getElementById('inventorySearch').addEventListener('input', (e) => this.filterInventory(e.target.value));

        // Statistics
        document.getElementById('generateStatsBtn').addEventListener('click', () => this.generateStatistics());

        // Management
        document.getElementById('refreshPricesBtn').addEventListener('click', () => this.loadPriceManagement());

        // Modals
        document.getElementById('stockUpdateForm').addEventListener('submit', (e) => this.updateStock(e));
        document.getElementById('priceUpdateForm').addEventListener('submit', (e) => this.updatePrice(e));

        // Set default dates
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('startDate').value = today;
        document.getElementById('endDate').value = today;
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                this.user = data.user;
                localStorage.setItem('sas_token', this.token);
                localStorage.setItem('sas_user', JSON.stringify(this.user));
                this.showMainScreen();
            } else {
                alert(data.message || 'Login failed');
            }
        } catch (error) {
            console.error('Login error:', error);
            alert('Login failed. Please try again.');
        }
    }

    handleLogout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('sas_token');
        localStorage.removeItem('sas_user');
        this.showLoginScreen();
    }

    showLoginScreen() {
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('mainScreen').classList.add('hidden');
    }

    showMainScreen() {
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainScreen').classList.remove('hidden');
        
        document.getElementById('userInfo').textContent = `${this.user.name} (${this.user.role})`;
        
        // Show/hide manager-only elements
        const managerElements = document.querySelectorAll('.manager-only');
        managerElements.forEach(el => {
            if (this.user.role === 'manager') {
                el.style.display = 'block';
            } else {
                el.style.display = 'none';
            }
        });

        // Hide clerk-only features for employees
        if (this.user.role === 'employee') {
            document.querySelector('[data-tab="sales"]').style.display = 'none';
            this.switchTab('inventory');
        }

        this.loadItems();
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabName}Tab`).classList.add('active');

        // Load data based on tab
        switch (tabName) {
            case 'inventory':
                this.loadInventory();
                break;
            case 'management':
                this.loadPriceManagement();
                break;
        }
    }

    async loadItems() {
        try {
            const response = await fetch('/api/items', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                this.items = await response.json();
            }
        } catch (error) {
            console.error('Error loading items:', error);
        }
    }

    async addItemToCart() {
        const itemCode = document.getElementById('itemCode').value.trim();
        const quantity = parseFloat(document.getElementById('itemQuantity').value);

        if (!itemCode || quantity <= 0) {
            alert('Please enter valid item code and quantity');
            return;
        }

        const item = this.items.find(i => i.code === itemCode);
        if (!item) {
            alert('Item not found');
            return;
        }

        if (item.quantity < quantity) {
            alert(`Insufficient stock. Available: ${item.quantity} ${item.unit}`);
            return;
        }

        // Check if item already in cart
        const existingItem = this.cart.find(i => i.code === itemCode);
        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            this.cart.push({
                code: item.code,
                name: item.name,
                quantity: quantity,
                unitPrice: item.unitPrice,
                unit: item.unit
            });
        }

        this.updateCartDisplay();
        document.getElementById('itemCode').value = '';
        document.getElementById('itemQuantity').value = '1';
    }

    updateCartDisplay() {
        const cartItems = document.getElementById('cartItems');
        const cartTotal = document.getElementById('cartTotal');

        if (this.cart.length === 0) {
            cartItems.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 2rem;">Cart is empty</p>';
            cartTotal.textContent = '0.00';
            return;
        }

        let total = 0;
        cartItems.innerHTML = this.cart.map(item => {
            const itemPrice = item.unitPrice * item.quantity;
            total += itemPrice;
            
            return `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <div class="cart-item-name">${item.name}</div>
                        <div class="cart-item-details">
                            ${item.quantity} ${item.unit} × ₹${item.unitPrice}
                        </div>
                    </div>
                    <div class="cart-item-price">₹${itemPrice.toFixed(2)}</div>
                    <button onclick="app.removeFromCart('${item.code}')" class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">Remove</button>
                </div>
            `;
        }).join('');

        cartTotal.textContent = total.toFixed(2);
    }

    removeFromCart(itemCode) {
        this.cart = this.cart.filter(item => item.code !== itemCode);
        this.updateCartDisplay();
    }

    clearCart() {
        this.cart = [];
        this.updateCartDisplay();
    }

    async checkout() {
        if (this.cart.length === 0) {
            alert('Cart is empty');
            return;
        }

        try {
            const response = await fetch('/api/transactions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ items: this.cart })
            });

            const transaction = await response.json();

            if (response.ok) {
                this.showBill(transaction);
                this.clearCart();
                await this.loadItems(); // Refresh items after sale
            } else {
                alert(transaction.message || 'Transaction failed');
            }
        } catch (error) {
            console.error('Checkout error:', error);
            alert('Transaction failed. Please try again.');
        }
    }

    showBill(transaction) {
        const billContent = document.getElementById('billContent');
        const now = new Date();
        
        billContent.innerHTML = `
            <div class="bill-header">
                <h2>SUPERMARKET RECEIPT</h2>
                <div>Transaction #: ${transaction.serialNumber}</div>
                <div>Date: ${now.toLocaleDateString()}</div>
                <div>Time: ${now.toLocaleTimeString()}</div>
                <div>Cashier: ${this.user.name}</div>
            </div>
            
            <div class="bill-items">
                ${transaction.items.map(item => `
                    <div class="bill-item">
                        <div>
                            <div>${item.name} (${item.code})</div>
                            <div style="font-size: 0.8em;">${item.quantity} × ₹${item.unitPrice}</div>
                        </div>
                        <div>₹${item.itemPrice.toFixed(2)}</div>
                    </div>
                `).join('')}
            </div>
            
            <div class="bill-total">
                <div style="font-size: 1.2em;">TOTAL: ₹${transaction.totalAmount.toFixed(2)}</div>
            </div>
            
            <div class="bill-footer">
                <div>Thank you for shopping with us!</div>
                <div>Visit us again soon</div>
            </div>
        `;

        document.getElementById('billModal').classList.remove('hidden');
    }

    async loadInventory() {
        try {
            const response = await fetch('/api/items', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                this.items = await response.json();
                this.displayInventory(this.items);
            }
        } catch (error) {
            console.error('Error loading inventory:', error);
        }
    }

    displayInventory(items) {
        const inventoryList = document.getElementById('inventoryList');
        
        if (items.length === 0) {
            inventoryList.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">No items found</p>';
            return;
        }

        inventoryList.innerHTML = items.map(item => {
            const stockStatus = this.getStockStatus(item.quantity);
            const canUpdateStock = ['employee', 'manager'].includes(this.user.role);
            
            return `
                <div class="inventory-item">
                    <div class="inventory-item-info">
                        <h3>${item.name} (${item.code})</h3>
                        <div class="inventory-item-details">
                            <div><strong>Stock:</strong> ${item.quantity} ${item.unit}</div>
                            <div><strong>Price:</strong> ₹${item.unitPrice}</div>
                            <div><strong>Updated:</strong> ${new Date(item.updatedAt).toLocaleDateString()}</div>
                            <div class="stock-status ${stockStatus.class}">${stockStatus.text}</div>
                        </div>
                    </div>
                    <div class="inventory-item-actions">
                        ${canUpdateStock ? `<button onclick="app.openStockModal('${item._id}', '${item.name}', ${item.quantity})" class="btn btn-primary">Update Stock</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    getStockStatus(quantity) {
        if (quantity > 20) return { class: 'stock-high', text: 'High Stock' };
        if (quantity > 5) return { class: 'stock-medium', text: 'Medium Stock' };
        return { class: 'stock-low', text: 'Low Stock' };
    }

    filterInventory(searchTerm) {
        const filteredItems = this.items.filter(item => 
            item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.code.toLowerCase().includes(searchTerm.toLowerCase())
        );
        this.displayInventory(filteredItems);
    }

    openStockModal(itemId, itemName, currentStock) {
        document.getElementById('stockItemId').value = itemId;
        document.getElementById('stockItemName').value = itemName;
        document.getElementById('currentStock').value = currentStock;
        document.getElementById('addStock').value = '';
        document.getElementById('stockModal').classList.remove('hidden');
    }

    async updateStock(e) {
        e.preventDefault();
        
        const itemId = document.getElementById('stockItemId').value;
        const addStock = parseInt(document.getElementById('addStock').value);

        try {
            const response = await fetch(`/api/items/${itemId}/inventory`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ quantity: addStock })
            });

            if (response.ok) {
                alert('Stock updated successfully');
                this.closeStockModal();
                this.loadInventory();
            } else {
                const error = await response.json();
                alert(error.message || 'Failed to update stock');
            }
        } catch (error) {
            console.error('Update stock error:', error);
            alert('Failed to update stock');
        }
    }

    async loadPriceManagement() {
        try {
            const response = await fetch('/api/items', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                this.items = await response.json();
                this.displayPriceManagement(this.items);
            }
        } catch (error) {
            console.error('Error loading price management:', error);
        }
    }

    displayPriceManagement(items) {
        const priceList = document.getElementById('priceManagementList');
        
        priceList.innerHTML = items.map(item => `
            <div class="price-item">
                <div class="price-item-info">
                    <h3>${item.name} (${item.code})</h3>
                    <div class="price-item-details">
                        <div><strong>Current Price:</strong> ₹${item.unitPrice}</div>
                        <div><strong>Cost Price:</strong> ₹${item.costPrice}</div>
                        <div><strong>Margin:</strong> ${(((item.unitPrice - item.costPrice) / item.costPrice) * 100).toFixed(1)}%</div>
                    </div>
                </div>
                <div>
                    <button onclick="app.openPriceModal('${item._id}', '${item.name}', ${item.unitPrice})" class="btn btn-primary">Update Price</button>
                </div>
            </div>
        `).join('');
    }

    openPriceModal(itemId, itemName, currentPrice) {
        document.getElementById('priceItemId').value = itemId;
        document.getElementById('priceItemName').value = itemName;
        document.getElementById('currentPrice').value = currentPrice;
        document.getElementById('newPrice').value = currentPrice;
        document.getElementById('priceModal').classList.remove('hidden');
    }

    async updatePrice(e) {
        e.preventDefault();
        
        const itemId = document.getElementById('priceItemId').value;
        const newPrice = parseFloat(document.getElementById('newPrice').value);

        try {
            const response = await fetch(`/api/items/${itemId}/price`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ unitPrice: newPrice })
            });

            if (response.ok) {
                alert('Price updated successfully');
                this.closePriceModal();
                this.loadPriceManagement();
                this.loadItems(); // Refresh items for sales
            } else {
                const error = await response.json();
                alert(error.message || 'Failed to update price');
            }
        } catch (error) {
            console.error('Update price error:', error);
            alert('Failed to update price');
        }
    }

    async generateStatistics() {
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        if (!startDate || !endDate) {
            alert('Please select both start and end dates');
            return;
        }

        try {
            const response = await fetch(`/api/statistics?startDate=${startDate}&endDate=${endDate}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const statistics = await response.json();
                this.displayStatistics(statistics);
            } else {
                const error = await response.json();
                alert(error.message || 'Failed to generate statistics');
            }
        } catch (error) {
            console.error('Statistics error:', error);
            alert('Failed to generate statistics');
        }
    }

    displayStatistics(statistics) {
        const reportDiv = document.getElementById('statisticsReport');
        
        if (statistics.length === 0) {
            reportDiv.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">No sales data found for the selected period</p>';
            return;
        }

        const totalRevenue = statistics.reduce((sum, item) => sum + item.priceRealized, 0);
        const totalProfit = statistics.reduce((sum, item) => sum + item.profit, 0);

        reportDiv.innerHTML = `
            <div style="padding: 1.5rem; background: #f9fafb; border-bottom: 1px solid #e5e7eb;">
                <h3 style="color: #2563eb; margin-bottom: 1rem;">Sales Summary</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                    <div><strong>Total Revenue:</strong> ₹${totalRevenue.toFixed(2)}</div>
                    <div><strong>Total Profit:</strong> ₹${totalProfit.toFixed(2)}</div>
                    <div><strong>Items Sold:</strong> ${statistics.length}</div>
                    <div><strong>Profit Margin:</strong> ${((totalProfit / totalRevenue) * 100).toFixed(1)}%</div>
                </div>
            </div>
            <table class="stats-table">
                <thead>
                    <tr>
                        <th>Item Name</th>
                        <th>Quantity Sold</th>
                        <th>Revenue</th>
                        <th>Profit</th>
                        <th>Margin %</th>
                    </tr>
                </thead>
                <tbody>
                    ${statistics.map(item => `
                        <tr>
                            <td>${item.name}</td>
                            <td>${item.quantitySold}</td>
                            <td>₹${item.priceRealized.toFixed(2)}</td>
                            <td>₹${item.profit.toFixed(2)}</td>
                            <td>${((item.profit / item.priceRealized) * 100).toFixed(1)}%</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    closeStockModal() {
        document.getElementById('stockModal').classList.add('hidden');
    }

    closePriceModal() {
        document.getElementById('priceModal').classList.add('hidden');
    }
}

// Modal functions
function closeBillModal() {
    document.getElementById('billModal').classList.add('hidden');
}

function printBill() {
    window.print();
}

function closeStockModal() {
    document.getElementById('stockModal').classList.add('hidden');
}

function closePriceModal() {
    document.getElementById('priceModal').classList.add('hidden');
}

// Initialize app
const app = new SupermarketApp();