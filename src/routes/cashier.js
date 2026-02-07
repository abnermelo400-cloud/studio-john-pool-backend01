const express = require('express');
const router = express.Router();
const Cashier = require('../models/Cashier');
const Order = require('../models/Order');
const { protect, authorize } = require('../middleware/auth');

// @route   POST api/cashier/open
// @desc    Open the cashier
router.post('/open', protect, authorize('ADMIN'), async (req, res) => {
    const { initialValue } = req.body;
    try {
        const activeCashier = await Cashier.findOne({ status: 'OPEN' });
        if (activeCashier) return res.status(400).json({ message: 'Cashier is already open' });

        const cashier = new Cashier({
            openedBy: req.user.id,
            initialValue: initialValue || 0,
            summary: { cash: 0, card: 0, pix: 0, expenses: 0 }
        });
        await cashier.save();
        res.json(cashier);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST api/cashier/expense
// @desc    Add an expense to the active cashier
router.post('/expense', protect, authorize('ADMIN'), async (req, res) => {
    const { amount, description } = req.body;
    try {
        const cashier = await Cashier.findOne({ status: 'OPEN' });
        if (!cashier) return res.status(400).json({ message: 'No open cashier found' });

        cashier.transactions.push({
            type: 'OUT',
            amount,
            description,
            paymentMethod: 'EXPENSE'
        });

        cashier.summary.expenses += amount;
        await cashier.save();
        res.json(cashier);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST api/cashier/close
// @desc    Close the cashier
router.post('/close', protect, authorize('ADMIN'), async (req, res) => {
    const { declaredValue, notes } = req.body;
    try {
        const cashier = await Cashier.findOne({ status: 'OPEN' });
        if (!cashier) return res.status(400).json({ message: 'No open cashier found' });

        // Calculate final expected value
        const totalRevenue = cashier.summary.cash + cashier.summary.card + cashier.summary.pix;
        const finalExpected = cashier.initialValue + totalRevenue - cashier.summary.expenses;

        cashier.status = 'CLOSED';
        cashier.closedAt = Date.now();
        cashier.closedBy = req.user.id;
        cashier.finalValue = finalExpected;
        cashier.declaredValue = declaredValue;
        cashier.notes = notes;

        await cashier.save();
        res.json(cashier);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET api/cashier/status
// @desc    Check if cashier is open
router.get('/status', protect, async (req, res) => {
    try {
        const cashier = await Cashier.findOne({ status: 'OPEN' });
        res.json({ isOpen: !!cashier, cashier });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET api/cashier/history
// @desc    Get cashier history
router.get('/history', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const history = await Cashier.find({ status: 'CLOSED' })
            .sort({ closedAt: -1 })
            .limit(10)
            .populate('openedBy', 'name')
            .populate('closedBy', 'name');
        res.json(history);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
