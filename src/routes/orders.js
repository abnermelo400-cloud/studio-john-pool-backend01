const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const Cashier = require('../models/Cashier');
const { protect, authorize } = require('../middleware/auth');

// @route   GET api/orders
// @desc    Get all orders (Admin gets all, Barber gets theirs)
router.get('/', protect, authorize('ADMIN', 'BARBEIRO'), async (req, res) => {
    try {
        let query = {};
        if (req.user.role === 'BARBEIRO') {
            query.barber = req.user.id;
        }

        const orders = await Order.find(query)
            .populate('client', 'name')
            .populate('barber', 'name')
            .populate('products.product', 'name price')
            .sort({ createdAt: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST api/orders
// @desc    Create a new order
router.post('/', protect, authorize('ADMIN', 'BARBEIRO'), async (req, res) => {
    try {
        const { client, services, products, totalAmount } = req.body;
        console.log(`📝 Order creation attempt by ${req.user.email} (Role: ${req.user.role})`);

        const cashier = await Cashier.findOne({ status: 'OPEN' });
        if (!cashier) {
            console.log('⚠️ Order blocked: Cashier is CLOSED');
            return res.status(400).json({ message: 'Não é possível abrir comanda com o caixa fechado. Peça ao administrador para abrir o caixa.' });
        }

        const barberId = req.user.role === 'BARBEIRO' ? req.user.id : req.body.barber;

        if (!barberId) {
            console.log('⚠️ Order blocked: Missing barber ID');
            return res.status(400).json({ message: 'O barbeiro é obrigatório.' });
        }

        // Validar e reservar estoque se houver produtos na criação
        if (products && products.length > 0) {
            for (const item of products) {
                const product = await Product.findById(item.product);
                if (!product) throw new Error(`Produto não encontrado: ${item.product}`);
                if (product.stock < item.quantity) {
                    return res.status(400).json({ message: `Estoque insuficiente para o produto: ${product.name}` });
                }
            }
            // Deduzir estoque
            for (const item of products) {
                await Product.findByIdAndUpdate(item.product, { $inc: { stock: -item.quantity } });
            }
        }

        const orderData = {
            client,
            services: services || [],
            products: products || [],
            totalAmount: totalAmount || 0,
            cashier: cashier._id,
            barber: barberId
        };

        const order = new Order(orderData);
        await order.save();
        console.log(`✅ Order created and stock reserved: ID ${order._id}`);

        const populatedOrder = await Order.findById(order._id)
            .populate('client', 'name')
            .populate('barber', 'name')
            .populate('services.service', 'name')
            .populate('products.product', 'name');

        res.status(201).json(populatedOrder);
    } catch (err) {
        console.error('🔥 Error creating order:', err);
        res.status(500).json({
            message: `ERRO_CREATE_ORDER: ${err.message}`,
            details: err.message
        });
    }
});

// @route   PUT api/orders/:id/close
router.put('/:id/close', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const cashier = await Cashier.findOne({ status: 'OPEN' });
        if (!cashier) return res.status(400).json({ message: 'Cannot close order when cashier is closed' });

        // Stock is now reserved upon addition (POST /api/orders or POST /api/orders/:id/items)
        // No need to decrement here anymore.

        order.status = 'CLOSED';
        order.closedAt = Date.now();
        order.paymentMethod = req.body.paymentMethod || 'OUTRO';
        await order.save();

        // Update Cashier Transactions
        const activeCashier = await Cashier.findById(order.cashier);
        if (activeCashier) {
            const method = order.paymentMethod || 'PIX';
            activeCashier.transactions.push({
                type: 'IN',
                amount: order.totalAmount,
                description: `Pedido #${order._id.toString().slice(-4)} - ${order.client?.name || 'Cliente'}`,
                paymentMethod: method
            });

            // Update Summary
            if (method === 'CASH') activeCashier.summary.cash += order.totalAmount;
            else if (method === 'CARD') activeCashier.summary.card += order.totalAmount;
            else if (method === 'PIX') activeCashier.summary.pix += order.totalAmount;
            else activeCashier.summary.other += order.totalAmount;

            await activeCashier.save();
        }

        res.json(order);
    } catch (err) {
        console.error('Error closing order:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET api/orders/my-open-comanda
// @desc    Get the open comanda for the logged-in client
router.get('/my-open-comanda', protect, async (req, res) => {
    try {
        const order = await Order.findOne({ client: req.user.id, status: 'OPEN' })
            .populate('client', 'name')
            .populate('barber', 'name')
            .populate('services.service', 'name')
            .populate('products.product', 'name price');
        res.json(order);
    } catch (err) {
        console.error('🔥 Error fetching my-open-comanda:', err);
        res.status(500).json({ message: 'Server error fetching your comanda' });
    }
});

// @route   GET api/orders/:id
router.get('/:id', protect, async (req, res) => {
    try {
        if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ message: 'Invalid order ID format' });
        }
        const order = await Order.findById(req.params.id)
            .populate('client', 'name')
            .populate('barber', 'name')
            .populate('products.product', 'name price');
        if (!order) return res.status(404).json({ message: 'Order not found' });
        res.json(order);
    } catch (err) {
        console.error(`🔥 Error fetching order ${req.params.id}:`, err);
        res.status(500).json({ message: 'Server error fetching order' });
    }
});

// @route   PUT api/orders/:id
router.put('/:id', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const order = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!order) return res.status(404).json({ message: 'Order not found' });
        res.json(order);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST api/orders/:id/items
router.post('/:id/items', protect, authorize('ADMIN', 'BARBEIRO'), async (req, res) => {
    try {
        const { type, itemId, price, quantity = 1 } = req.body; // type: 'SERVICE' or 'PRODUCT'

        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.status !== 'OPEN') return res.status(400).json({ message: 'Order is closed' });

        if (type === 'SERVICE') {
            order.services.push({ service: itemId, price });
        } else if (type === 'PRODUCT') {
            const product = await Product.findById(itemId);
            if (!product) return res.status(404).json({ message: 'Product not found' });
            if (product.stock < quantity) return res.status(400).json({ message: 'Insufficient stock' });

            // Reservar estoque imediatamente
            await Product.findByIdAndUpdate(itemId, { $inc: { stock: -quantity } });
            console.log(`📉 Stock reserved: -${quantity} for product ${product.name}`);

            order.products.push({ product: itemId, price, quantity });
        }

        // Recalculate Total
        const servicesTotal = order.services.reduce((acc, s) => acc + s.price, 0);
        const productsTotal = order.products.reduce((acc, p) => acc + (p.price * p.quantity), 0);
        order.totalAmount = servicesTotal + productsTotal;

        await order.save();

        const updatedOrder = await Order.findById(order._id)
            .populate('client', 'name')
            .populate('barber', 'name')
            .populate('services.service', 'name')
            .populate('products.product', 'name');

        res.json(updatedOrder);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   DELETE api/orders/:id/items/:itemId
router.delete('/:id/items/:itemId', protect, authorize('ADMIN', 'BARBEIRO'), async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.status !== 'OPEN') return res.status(400).json({ message: 'Order is closed' });

        const { type } = req.query; // 'SERVICE' or 'PRODUCT'

        if (type === 'SERVICE') {
            order.services = order.services.filter(s => s._id.toString() !== req.params.itemId);
        } else if (type === 'PRODUCT') {
            const productItem = order.products.find(p => p._id.toString() === req.params.itemId);
            if (productItem) {
                // Devolver ao estoque
                await Product.findByIdAndUpdate(productItem.product, { $inc: { stock: productItem.quantity } });
                console.log(`📈 Stock restored: +${productItem.quantity} for product ID ${productItem.product}`);
            }
            order.products = order.products.filter(p => p._id.toString() !== req.params.itemId);
        }

        // Recalculate Total
        const servicesTotal = order.services.reduce((acc, s) => acc + s.price, 0);
        const productsTotal = order.products.reduce((acc, p) => acc + (p.price * p.quantity), 0);
        order.totalAmount = servicesTotal + productsTotal;

        await order.save();

        const updatedOrder = await Order.findById(order._id)
            .populate('client', 'name')
            .populate('barber', 'name')
            .populate('services.service', 'name')
            .populate('products.product', 'name');

        res.json(updatedOrder);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   DELETE api/orders/:id
router.delete('/:id', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        // Se a comanda estiver ABERTA, devolver estoque de todos os produtos
        if (order.status === 'OPEN') {
            for (const p of order.products) {
                await Product.findByIdAndUpdate(p.product, { $inc: { stock: p.quantity } });
            }
            console.log(`♻️ Stock restored for all products in deleted OPEN order ${order._id}`);
        }

        await Order.findByIdAndDelete(req.params.id);
        res.json({ message: 'Order removed and stock handled' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
