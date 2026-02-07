const express = require('express');
const router = express.Router();
const Setting = require('../models/Setting');
const { protect, authorize } = require('../middleware/auth');

// @route   GET api/settings
// @desc    Get shop settings
router.get('/', async (req, res) => {
    try {
        let settings = await Setting.findOne();
        if (!settings) {
            settings = new Setting();
            await settings.save();
        }
        res.json(settings);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT api/settings
// @desc    Update shop settings
router.put('/', protect, authorize('ADMIN'), async (req, res) => {
    try {
        let settings = await Setting.findOne();
        if (!settings) settings = new Setting();

        Object.assign(settings, req.body);
        await settings.save();
        res.json(settings);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
