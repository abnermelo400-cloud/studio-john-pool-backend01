const express = require('express');
const router = express.Router();
const CutHistory = require('../models/CutHistory');
const { protect, authorize } = require('../middleware/auth');

// @route   GET api/history/:clientId
router.get('/:clientId', protect, async (req, res) => {
    try {
        const history = await CutHistory.find({ client: req.params.clientId })
            .populate('barber', 'name')
            .sort({ date: -1 });
        res.json(history);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST api/history
router.post('/', protect, authorize('ADMIN', 'BARBEIRO'), async (req, res) => {
    try {
        const history = new CutHistory({
            ...req.body,
            barber: req.user.id
        });
        await history.save();
        res.json(history);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
