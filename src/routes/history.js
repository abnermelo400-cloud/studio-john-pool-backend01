const express = require('express');
const router = express.Router();
const CutHistory = require('../models/CutHistory');
const { protect, authorize } = require('../middleware/auth');

// @route   GET api/history
// @desc    Get cut history (Admin or Barber)
router.get('/', protect, authorize('ADMIN', 'BARBEIRO'), async (req, res) => {
    try {
        let query = {};
        if (req.user.role === 'BARBEIRO') {
            query.barber = req.user.id;
        }

        const history = await CutHistory.find(query)
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
        const historyData = { ...req.body };
        // If user is not ADMIN, force barber to be the current user
        if (req.user.role !== 'ADMIN') {
            historyData.barber = req.user.id;
        } else if (!historyData.barber) {
            // If ADMIN and no barber provided, use current ADMIN id
            historyData.barber = req.user.id;
        }

        const history = new CutHistory(historyData);
        await history.save();
        res.json(history);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   DELETE api/history/:id
router.delete('/:id', protect, async (req, res) => {
    try {
        const history = await CutHistory.findById(req.params.id);

        if (!history) {
            return res.status(404).json({ message: 'Registro não encontrado' });
        }

        console.log(`🗑️ Deletion attempt: Record ${req.params.id} by User ${req.user.id} (${req.user.role})`);

        // Check permissions: ADMIN, BARBEIRO (if they created it), or the CLIENTE themselves
        const isOwner = history.client && history.client.toString() === req.user.id;
        const isAdmin = req.user.role === 'ADMIN';
        const isBarber = req.user.role === 'BARBEIRO';

        if (!isAdmin && !isBarber && !isOwner) {
            console.log(`🚫 Deletion denied: User ${req.user.id} is not owner of record ${req.params.id}`);
            return res.status(403).json({ message: 'Não autorizado a excluir este registro' });
        }

        await CutHistory.findByIdAndDelete(req.params.id);
        res.json({ message: 'Registro excluído com sucesso' });
    } catch (err) {
        console.error('Error deleting history:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
