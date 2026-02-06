const express = require('express');
const router = express.Router();
const Cashier = require('../models/Cashier');
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
            initialValue
        });
        await cashier.save();
        res.json(cashier);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST api/cashier/close
// @desc    Close the cashier
router.post('/close', protect, authorize('ADMIN'), async (req, res) => {
    const { finalValue } = req.body;
    try {
        const cashier = await Cashier.findOne({ status: 'OPEN' });
        if (!cashier) return res.status(400).json({ message: 'No open cashier found' });

        cashier.status = 'CLOSED';
        cashier.closedAt = Date.now();
        cashier.closedBy = req.user.id;
        cashier.finalValue = finalValue;
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

module.exports = router;
