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
    const { name, email, password, role, avatar, phone, bio } = req.body;
    try {
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ message: 'User already exists' });

        user = new User({
            name,
            email,
            password,
            role,
            avatar: avatar || '',
            phone: phone || '',
            bio: bio || '',
            specialties: req.body.specialties || []
        });
        await user.save();

        res.json({ id: user._id, name: user.name, role: user.role });
    } catch (err) {
        console.error('Error creating user:', err);
        if (err.code === 11000) {
            return res.status(400).json({ message: 'Email already exists' });
        }
        res.status(500).json({ message: err.message || 'Server error' });
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

// @route   PUT api/users/:id
// @desc    Update user details (ADMIN only)
router.put('/:id', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const { name, email, phone, bio, avatar, role } = req.body;
        const updateData = {};

        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (bio !== undefined) updateData.bio = bio;
        if (avatar !== undefined) updateData.avatar = avatar;
        if (role) updateData.role = role;
        if (req.body.specialties !== undefined) updateData.specialties = req.body.specialties;

        const user = await User.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(user);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ message: 'Email already exists' });
        }
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   DELETE api/users/:id
// @desc    Delete a user (ADMIN only)
router.delete('/:id', protect, authorize('ADMIN'), async (req, res) => {
    try {
        // Prevent deleting yourself
        if (req.params.id === req.user.id) {
            return res.status(400).json({ message: 'Cannot delete your own account' });
        }

        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if this is the last admin
        if (user.role === 'ADMIN') {
            const adminCount = await User.countDocuments({ role: 'ADMIN' });
            if (adminCount <= 1) {
                return res.status(400).json({ message: 'Cannot delete the last admin user' });
            }
        }

        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
