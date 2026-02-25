const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// MagicBell base config
const MB_BASE = 'https://api.magicbell.com';
const MB_HEADERS = {
    'X-MAGICBELL-API-KEY': process.env.MAGICBELL_API_KEY,
    'X-MAGICBELL-API-SECRET': process.env.MAGICBELL_API_SECRET,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
};

// Helper: send a MagicBell broadcast to a list of recipients
async function sendMagicBellBroadcast({ title, content, action_url, recipients }) {
    const body = {
        broadcast: {
            title,
            content: content || '',
            action_url: action_url || process.env.FRONTEND_URL || '',
            recipients,
        },
    };
    const { data } = await axios.post(`${MB_BASE}/broadcasts`, body, { headers: MB_HEADERS });
    return data;
}

// Helper: send a single MagicBell notification to one user (by email or external_id)
async function sendMagicBellNotification({ title, content, action_url, email, external_id }) {
    const recipient = {};
    if (email) recipient.email = email;
    if (external_id) recipient.external_id = external_id;

    return sendMagicBellBroadcast({ title, content, action_url, recipients: [recipient] });
}

// -------------------------------------------------------------------
// @route   POST /api/notifications/broadcast
// @desc    Admin sends a push notification to ALL users
// -------------------------------------------------------------------
router.post('/broadcast', protect, authorize('ADMIN'), async (req, res) => {
    const { title, body, url } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required' });

    try {
        const allUsers = await User.find({ role: 'CLIENTE' }).select('email name');
        if (!allUsers.length) return res.json({ message: 'No clients to notify', sent: 0 });

        const recipients = allUsers.map(u => ({ email: u.email }));

        await sendMagicBellBroadcast({
            title,
            content: body || '',
            action_url: url || process.env.FRONTEND_URL,
            recipients,
        });

        res.json({ message: `Campanha enviada para ${allUsers.length} cliente(s)`, sent: allUsers.length });
    } catch (err) {
        console.error('MagicBell Broadcast Error:', err?.response?.data || err.message);
        res.status(500).json({ message: 'Erro ao enviar campanha' });
    }
});

// -------------------------------------------------------------------
// @route   POST /api/notifications/send-one
// @desc    Send a notification to a single user by userId (admin only)
// -------------------------------------------------------------------
router.post('/send-one', protect, authorize('ADMIN'), async (req, res) => {
    const { userId, title, body, url } = req.body;
    if (!userId || !title) return res.status(400).json({ message: 'userId and title are required' });

    try {
        const user = await User.findById(userId).select('email name');
        if (!user) return res.status(404).json({ message: 'User not found' });

        await sendMagicBellNotification({
            title,
            content: body || '',
            action_url: url || process.env.FRONTEND_URL,
            email: user.email,
        });

        res.json({ message: `Notificação enviada para ${user.name}` });
    } catch (err) {
        console.error('MagicBell Send Error:', err?.response?.data || err.message);
        res.status(500).json({ message: 'Erro ao enviar notificação' });
    }
});

// -------------------------------------------------------------------
// @route   GET /api/notifications/token
// @desc    Returns the HMAC user token for MagicBell widget authentication
// -------------------------------------------------------------------
router.get('/token', protect, async (req, res) => {
    try {
        const crypto = require('crypto');
        const apiSecret = process.env.MAGICBELL_API_SECRET;
        const userEmail = req.user.email;

        if (!apiSecret) return res.status(500).json({ message: 'MAGICBELL_API_SECRET not configured' });

        const hmac = crypto.createHmac('sha256', apiSecret).update(userEmail).digest('hex');
        res.json({
            apiKey: process.env.MAGICBELL_API_KEY,
            userEmail,
            userKey: hmac,
        });
    } catch (err) {
        console.error('MagicBell Token Error:', err.message);
        res.status(500).json({ message: 'Erro ao gerar token MagicBell' });
    }
});

// Keep old web-push subscribe route so existing devices don't break
// but new reminder logic uses MagicBell
router.post('/subscribe', protect, async (_req, res) => {
    // Kept for backwards compat, MagicBell doesn't need client-side subscription
    res.status(200).json({ message: 'OK' });
});

module.exports = router;
module.exports.sendMagicBellNotification = sendMagicBellNotification;
module.exports.sendMagicBellBroadcast = sendMagicBellBroadcast;
