const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// @route   GET api/users
// @desc    Get all users (ADMIN only, Barbers get CLIENTE list)
router.get('/', protect, authorize('ADMIN', 'BARBEIRO'), async (req, res) => {
    try {
        let query = {};
        if (req.user.role === 'BARBEIRO') {
            query.role = 'CLIENTE';
        }
        const users = await User.find(query).select('-password');
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST api/users
// @desc    Create a user (ADMIN only)
router.post('/', protect, authorize('ADMIN'), async (req, res) => {
    let { name, email, password, role, avatar, phone, bio } = req.body;
    try {
        email = email.toLowerCase().trim();
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ message: 'Este e-mail já está em uso' });

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
        console.log(`✅ User created by admin: ${email} (${role})`);

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

router.put('/:id', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const { name, email, phone, bio, avatar, role, password } = req.body;

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (name) user.name = name;
        if (email) user.email = email.toLowerCase().trim();
        if (phone !== undefined) user.phone = phone;
        if (bio !== undefined) user.bio = bio;
        if (avatar !== undefined) user.avatar = avatar;
        if (role) user.role = role;
        if (req.body.specialties !== undefined) user.specialties = req.body.specialties;

        // Se houver senha, ela será hashada pelo hook pre('save')
        if (password) {
            console.log(`📡 Updating password for user: ${user.email}`);
            user.password = password;
        }

        await user.save();
        console.log(`✅ User updated by admin: ${user.email}`);

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
