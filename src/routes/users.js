const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// @route   GET api/users
// @desc    Get all users (ADMIN only)
router.get('/', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST api/users
// @desc    Create a user (ADMIN only)
router.post('/', protect, authorize('ADMIN'), async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ message: 'User already exists' });

        user = new User({ name, email, password, role });
        await user.save();

        res.json({ id: user._id, name: user.name, role: user.role });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET api/users/barbers
// @desc    Get all barbers
router.get('/barbers', async (req, res) => {
    try {
        const barbers = await User.find({ role: 'BARBEIRO' }).select('-password');
        res.json(barbers);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET api/users/profile
router.get('/profile', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT api/users/profile
router.put('/profile', protect, async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.user.id, req.body, { new: true }).select('-password');
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT api/users/:id/role
router.put('/:id/role', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, { role: req.body.role }, { new: true }).select('-password');
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
