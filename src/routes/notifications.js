const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// Setup web-push
webpush.setVapidDetails(
    process.env.VAPID_EMAIL,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

// @route   POST api/notifications/subscribe
// @desc    Register a client for push notifications
router.post('/subscribe', protect, async (req, res) => {
    const subscription = req.body;

    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Check if subscription already exists to avoid duplicates
        const exists = user.pushSubscriptions.some(sub => sub.endpoint === subscription.endpoint);
        if (!exists) {
            user.pushSubscriptions.push(subscription);
            await user.save();
        }

        res.status(201).json({ message: 'Subscribed successfully' });
    } catch (err) {
        console.error('Push Subscription Error:', err);
        res.status(500).json({ message: 'Error saving subscription' });
    }
});

// @route   POST api/notifications/broadcast
// @desc    Send a promotional message to all subscribed clients
router.post('/broadcast', protect, authorize('ADMIN'), async (req, res) => {
    const { title, body, icon, url } = req.body;
    const payload = JSON.stringify({ title, body, icon: icon || '/icons/icon-192x192.png', url });

    try {
        const users = await User.find({ 'pushSubscriptions.0': { $exists: true } });
        let successCount = 0;

        const promises = users.map(async (user) => {
            const subPromises = user.pushSubscriptions.map(async (sub) => {
                try {
                    await webpush.sendNotification(sub, payload);
                    successCount++;
                } catch (err) {
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        // Subscription expired or invalid - remove it
                        user.pushSubscriptions = user.pushSubscriptions.filter(s => s.endpoint !== sub.endpoint);
                        await user.save();
                    }
                }
            });
            return Promise.all(subPromises);
        });

        await Promise.all(promises);
        res.json({ message: `Broadcast sent. Successful deliveries: ${successCount}` });
    } catch (err) {
        res.status(500).json({ message: 'Error during broadcast' });
    }
});

module.exports = router;
