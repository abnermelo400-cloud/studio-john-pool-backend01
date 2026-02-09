const express = require('express');
const router = express.Router();
const Service = require('../models/Service');
const { protect, authorize } = require('../middleware/auth');

// @route   GET api/services
router.get('/', protect, async (req, res) => {
    try {
        const services = await Service.find({ isActive: true });
        res.json(services);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST api/services
router.post('/', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const service = new Service(req.body);
        await service.save();
        res.json(service);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT api/services/:id
router.put('/:id', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const service = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(service);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   DELETE api/services/:id
router.delete('/:id', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const service = await Service.findById(req.params.id);
        if (!service) return res.status(404).json({ message: 'Service not found' });
        service.isActive = false;
        await service.save();
        res.json({ message: 'Service deactivated' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
