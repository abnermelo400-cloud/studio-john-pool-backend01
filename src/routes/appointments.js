const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const Setting = require('../models/Setting');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { parse, addMinutes, format, isAfter, isBefore, isSameDay, startOfDay } = require('date-fns');

// @route   GET api/appointments/available-slots
// @desc    Get available slots for a barber and date
router.get('/available-slots', protect, async (req, res) => {
    const { barberId, date } = req.query; // date ISO string
    if (!barberId || !date) return res.status(400).json({ message: 'Missing barberId or date' });

    try {
        const settings = await Setting.findOne() || new Setting();
        const selectedDate = new Date(date);
        const dayOfWeek = selectedDate.getDay();

        // Check if shop is closed on this day
        if (!settings.workingDays.includes(dayOfWeek) && !(dayOfWeek === 6 && settings.saturdayHours.active)) {
            return res.json([]);
        }

        const isSaturday = dayOfWeek === 6;
        const hours = isSaturday ? settings.saturdayHours : settings.businessHours;

        // Check if it's a specific closed day
        const isClosedDay = settings.closedDays.some(d => isSameDay(new Date(d), selectedDate));
        if (isClosedDay) return res.json([]);

        // Get already booked appointments
        const booked = await Appointment.find({
            barber: barberId,
            date: {
                $gte: startOfDay(selectedDate),
                $lt: addMinutes(startOfDay(selectedDate), 1440)
            },
            status: { $ne: 'CANCELLED' }
        });

        const slots = [];
        let current = parse(hours.start, 'HH:mm', selectedDate);
        const endTime = parse(hours.end, 'HH:mm', selectedDate);

        while (isBefore(current, endTime)) {
            const slotTime = new Date(current);

            // Validation: Must be in the future if date is today
            const isFuture = isAfter(slotTime, new Date());

            // Validation: Not already booked
            const isTaken = booked.some(b => b.date.getTime() === slotTime.getTime());

            slots.push({
                time: format(slotTime, 'HH:mm'),
                iso: slotTime.toISOString(),
                available: isFuture && !isTaken
            });

            current = addMinutes(current, settings.slotDuration);
        }

        res.json(slots);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET api/appointments
router.get('/', protect, async (req, res) => {
    let query = {};
    if (req.user.role === 'CLIENTE') query.client = req.user.id;
    if (req.user.role === 'BARBEIRO') query.barber = req.user.id;

    try {
        const appointments = await Appointment.find(query)
            .populate('client', 'name')
            .populate('barber', 'name')
            .populate('service', 'name price');
        res.json(appointments);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST api/appointments
router.post('/', protect, async (req, res) => {
    const { barber, service, date } = req.body;
    const bookingDate = new Date(date);

    try {
        // 1. Future check
        if (!isAfter(bookingDate, new Date())) {
            return res.status(400).json({ message: 'Cannot book in the past' });
        }

        // 2. Double booking check
        const existing = await Appointment.findOne({ barber, date, status: { $ne: 'CANCELLED' } });
        if (existing) return res.status(400).json({ message: 'Time slot already taken' });

        // 3. Shop hours check
        const settings = await Setting.findOne() || new Setting();
        const dayOfWeek = bookingDate.getDay();
        const isSaturday = dayOfWeek === 6;

        if (!settings.workingDays.includes(dayOfWeek) && !(isSaturday && settings.saturdayHours.active)) {
            return res.status(400).json({ message: 'Shop is closed on this day' });
        }

        const hours = isSaturday ? settings.saturdayHours : settings.businessHours;
        const slotTimeStr = format(bookingDate, 'HH:mm');

        if (slotTimeStr < hours.start || slotTimeStr >= hours.end) {
            return res.status(400).json({ message: 'Outside business hours' });
        }

        // 4. Closed days check (holidays)
        const isClosedDay = settings.closedDays.some(d => isSameDay(new Date(d), bookingDate));
        if (isClosedDay) return res.status(400).json({ message: 'Shop is closed on this date' });

        const appointment = new Appointment({
            client: req.user.id,
            barber,
            service,
            date
        });
        await appointment.save();
        res.json(appointment);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

const CutHistory = require('../models/CutHistory');

// @route   PUT api/appointments/:id/cancel
router.put('/:id/cancel', protect, async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

        if (req.user.role === 'CLIENTE' && appointment.client.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const settings = await Setting.findOne() || new Setting();
        const now = new Date();
        const windowInMs = (settings.cancellationWindow || 2) * 60 * 60 * 1000;

        if (req.user.role === 'CLIENTE' && appointment.date.getTime() - now.getTime() < windowInMs) {
            return res.status(400).json({
                message: `Cancellations only allowed with ${settings.cancellationWindow}h advance notice.`
            });
        }

        appointment.status = 'CANCELLED';
        await appointment.save();
        res.json(appointment);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT api/appointments/:id/status
router.put('/:id/status', protect, authorize('ADMIN', 'BARBEIRO'), async (req, res) => {
    const { status, notes } = req.body;
    try {
        const appointment = await Appointment.findById(req.params.id)
            .populate('service', 'name price');
        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

        appointment.status = status;
        if (notes) appointment.notes = notes;
        await appointment.save();

        if (status === 'COMPLETED') {
            const CutHistory = require('../models/CutHistory');
            const history = new CutHistory({
                client: appointment.client,
                barber: appointment.barber,
                description: `Serviço: ${appointment.service.name}`,
                observations: notes || appointment.notes,
                date: appointment.date
            });
            await history.save();
        }

        res.json(appointment);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT api/appointments/:id
router.put('/:id', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const appointment = await Appointment.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });
        res.json(appointment);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   DELETE api/appointments/:id
router.delete('/:id', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const appointment = await Appointment.findByIdAndDelete(req.params.id);
        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });
        res.json({ message: 'Appointment removed' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
