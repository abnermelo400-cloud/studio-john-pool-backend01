const express = require('express');
const router = express.Router();
const CutHistory = require('../models/CutHistory');
const { protect, authorize } = require('../middleware/auth');

// @route   GET api/history
// @desc    Get all cut history (Admin only)
router.get('/', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const history = await CutHistory.find()
            .populate('client', 'name email')
            .populate('barber', 'name')
            .sort({ date: -1 });
        res.json(history);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

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

// @route   DELETE api/history/:id
router.delete('/:id', protect, authorize('ADMIN', 'BARBEIRO'), async (req, res) => {
    try {
        const history = await CutHistory.findByIdAndDelete(req.params.id);
        if (!history) return res.status(404).json({ message: 'Registro não encontrado' });
        res.json({ message: 'Registro excluído com sucesso' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
