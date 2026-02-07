const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { startOfDay, startOfMonth, endOfMonth } = require('date-fns');

// @route   GET api/stats
// @desc    Get management statistics
router.get('/', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const now = new Date();
        const startDay = startOfDay(now);
        const startMonth = startOfMonth(now);
        const endMonth = endOfMonth(now);

        // 1. Revenue Stats
        const revenueStats = await Order.aggregate([
            { $match: { status: 'CLOSED', closedAt: { $gte: startMonth, $lte: endMonth } } },
            {
                $group: {
                    _id: null,
                    totalMonth: { $sum: '$totalAmount' },
                    today: { $sum: { $cond: [{ $gte: ['$closedAt', startDay] }, '$totalAmount', 0] } },
                    count: { $sum: 1 }
                }
            }
        ]);

        const revenue = revenueStats[0] || { totalMonth: 0, today: 0, count: 0 };
        const ticketMedio = revenue.count > 0 ? revenue.totalMonth / revenue.count : 0;

        // 2. Appointment Stats
        const appointmentsCount = await Appointment.countDocuments({
            date: { $gte: startDay },
            status: { $ne: 'CANCELLED' }
        });

        const pendingAppointments = await Appointment.find({
            date: { $gte: startDay },
            status: 'PENDING'
        }).populate('client', 'name').populate('barber', 'name').limit(5).sort({ date: 1 });

        // 3. User Stats
        const totalClients = await User.countDocuments({ role: 'CLIENT' });
        const totalBarbers = await User.countDocuments({ role: 'BARBEIRO' });

        // 4. Performance by Barber (Current Month)
        const barberPerformance = await Order.aggregate([
            { $match: { status: 'CLOSED', closedAt: { $gte: startMonth } } },
            { $lookup: { from: 'users', localField: 'barber', foreignField: '_id', as: 'barberInfo' } },
            { $unwind: '$barberInfo' },
            {
                $group: {
                    _id: '$barber',
                    name: { $first: '$barberInfo.name' },
                    revenue: { $sum: '$totalAmount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { revenue: -1 } }
        ]);

        // 5. Revenue Breakdown (Service vs Product)
        const breakdown = await Order.aggregate([
            { $match: { status: 'CLOSED', closedAt: { $gte: startMonth } } },
            { $unwind: '$products' },
            { $lookup: { from: 'products', localField: 'products.product', foreignField: '_id', as: 'prodInfo' } },
            { $unwind: '$prodInfo' },
            {
                $group: {
                    _id: '$prodInfo.category',
                    revenue: { $sum: { $multiply: ['$products.quantity', '$prodInfo.price'] } }
                }
            }
        ]);

        res.json({
            kpis: {
                revenueToday: revenue.today,
                revenueMonth: revenue.totalMonth,
                ticketMedio,
                todayAppointments: appointmentsCount,
                totalClients
            },
            recentOrders: await Order.find({ status: 'CLOSED' }).sort({ closedAt: -1 }).limit(5).populate('client', 'name'),
            pendingAppointments,
            barberPerformance,
            breakdown
        });
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
