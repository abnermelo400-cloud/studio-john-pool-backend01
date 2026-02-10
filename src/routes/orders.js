const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const Cashier = require('../models/Cashier');
const { protect, authorize } = require('../middleware/auth');

// @route   POST api/orders
// @desc    Open a new comanda
router.post('/', protect, authorize('ADMIN', 'BARBEIRO'), async (req, res) => {
    try {
        const cashier = await Cashier.findOne({ status: 'OPEN' });
        if (!cashier) return res.status(400).json({ message: 'Cashier must be open to create orders' });

        const order = new Order({
            ...req.body,
            barber: req.user.id,
            cashier: cashier._id
        });
        await order.save();
        res.json(order);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT api/orders/:id/close
router.put('/:id/close', protect, authorize('ADMIN', 'BARBEIRO'), async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const cashier = await Cashier.findOne({ status: 'OPEN' });
        if (!cashier) return res.status(400).json({ message: 'Cannot close order when cashier is closed' });

        // Update stock for products
        for (const p of order.products) {
            await Product.findByIdAndUpdate(p.product, { $inc: { stock: -p.quantity } });
        }

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

            await activeCashier.save();
        }

        res.json(order);
    } catch (err) {
        console.error('Error closing order:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET api/orders
// @desc    Get all orders (Admin only)
router.get('/', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const orders = await Order.find()
            .populate('client', 'name')
            .populate('barber', 'name')
            .populate('products.product', 'name price')
            .sort({ createdAt: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET api/orders/:id
router.get('/:id', protect, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('client', 'name')
            .populate('barber', 'name')
            .populate('products.product', 'name price');
        if (!order) return res.status(404).json({ message: 'Order not found' });
        res.json(order);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
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
        const order = await Order.findByIdAndDelete(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        res.json({ message: 'Order removed' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
