const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// Web Push Config
webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@sistemas-barber.shop',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

// Helper: Send a push notification to all subscriptions of a user
async function sendPushNotification(user, payload) {
    if (!user.pushSubscriptions || user.pushSubscriptions.length === 0) return;

    const notifications = user.pushSubscriptions.map(sub => {
        return webpush.sendNotification(sub, JSON.stringify(payload))
            .catch(async (err) => {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    // Subscription expired or no longer valid
                    await User.updateOne(
                        { _id: user._id },
                        { $pull: { pushSubscriptions: { endpoint: sub.endpoint } } }
                    );
                }
            });
    });

    return Promise.all(notifications);
}

// -------------------------------------------------------------------
// @route   POST /api/notifications/subscribe
// @desc    Subscribe a user to push notifications
// -------------------------------------------------------------------
router.post('/subscribe', protect, async (req, res) => {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ message: 'Invalid subscription' });
    }

    try {
        const user = await User.findById(req.user._id);

        // Check if subscription already exists
        const exists = user.pushSubscriptions.some(s => s.endpoint === subscription.endpoint);
        if (!exists) {
            user.pushSubscriptions.push(subscription);
            await user.save();
        }

        res.status(201).json({ message: 'Subscribed successfully' });
    } catch (err) {
        console.error('Subscription Error:', err);
        res.status(500).json({ message: 'Failed to subscribe' });
    }
});

// -------------------------------------------------------------------
// @route   POST /api/notifications/broadcast
// @desc    Admin sends a push notification to ALL users with subscriptions
// -------------------------------------------------------------------
router.post('/broadcast', protect, authorize('ADMIN'), async (req, res) => {
    const { title, body, url } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required' });

    const payload = {
        title,
        body: body || '',
        data: { url: url || process.env.FRONTEND_URL }
    };

    try {
        const users = await User.find({
            role: 'CLIENTE',
            'pushSubscriptions.0': { $exists: true }
        });

        if (!users.length) return res.json({ message: 'No clients with active push subscriptions', sent: 0 });

        let totalSent = 0;
        await Promise.all(users.map(async (user) => {
            const results = await sendPushNotification(user, payload);
            if (results) totalSent += results.length;
        }));

        res.json({ message: `Campanha enviada com sucesso`, sent: totalSent });
    } catch (err) {
        console.error('Broadcast Error:', err);
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

    const payload = {
        title,
        body: body || '',
        data: { url: url || process.env.FRONTEND_URL }
    };

    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        await sendPushNotification(user, payload);
        res.json({ message: `Notificação enviada para ${user.name}` });
    } catch (err) {
        console.error('Send One Error:', err);
        res.status(500).json({ message: 'Erro ao enviar notificação' });
    }
});

module.exports = router;
module.exports.sendPushNotification = sendPushNotification;
