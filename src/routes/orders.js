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
router.put('/:id/close', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        // Update stock for products
        for (const p of order.products) {
            await Product.findByIdAndUpdate(p.product, { $inc: { stock: -p.quantity } });
        }

        order.status = 'CLOSED';
        order.closedAt = Date.now();
        order.paymentMethod = req.body.paymentMethod;
        await order.save();

        // Add to cashier transactions
        await Cashier.findByIdAndUpdate(order.cashier, {
            $push: {
                transactions: {
                    type: 'IN',
                    amount: order.totalAmount,
                    description: `Order ${order._id} closed`
                }
            }
        });

        res.json(order);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
