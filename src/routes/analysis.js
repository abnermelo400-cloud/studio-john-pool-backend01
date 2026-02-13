const express = require('express');
const router = express.Router();
const FaceAnalysis = require('../models/FaceAnalysis');
const auth = require('../middleware/auth');

// @route   POST api/analysis
// @desc    Save a new face analysis
// @access  Private
router.post('/', auth, async (req, res) => {
    try {
        const { faceShape, confidence, suggestedCut, generatedImage, notes, userId } = req.body;

        // If admin/barber is saving for a client, userId should be in body. 
        // If client is saving, use req.user.id
        const targetUser = (req.user.role === 'ADMIN' || req.user.role === 'BARBEIRO') && userId
            ? userId
            : req.user.id;

        const newAnalysis = new FaceAnalysis({
            user: targetUser,
            faceShape,
            confidence,
            suggestedCut,
            generatedImage,
            notes
        });

        const analysis = await newAnalysis.save();
        res.json(analysis);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/analysis/user/:userId
// @desc    Get analysis history for a user
// @access  Private
router.get('/user/:userId', auth, async (req, res) => {
    try {
        // Check permissions: User can see own, Admin/Barber can see anyone's
        if (req.user.role !== 'ADMIN' && req.user.role !== 'BARBEIRO' && req.user.id !== req.params.userId) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        const history = await FaceAnalysis.find({ user: req.params.userId }).sort({ createdAt: -1 });
        res.json(history);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
