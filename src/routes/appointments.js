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

        // Parse date (YYYY-MM-DD) as local time to avoid UTC shift
        const dateParts = date.split('-').map(Number);
        const selectedDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
        const dayOfWeek = selectedDate.getDay();

        // Get hours for the specific day
        let hours = null;
        if (settings.weeklySchedule && settings.weeklySchedule.length > 0) {
            const schedule = settings.weeklySchedule.find(s => s.day === dayOfWeek);
            if (schedule && schedule.active) hours = schedule;
        } else {
            // Fallback to old logic
            const isSaturday = dayOfWeek === 6;
            const isWorkingDay = settings.workingDays.includes(dayOfWeek) || (isSaturday && settings.saturdayHours.active);
            if (isWorkingDay) {
                hours = isSaturday ? settings.saturdayHours : settings.businessHours;
            }
        }

        if (!hours) return res.json([]);

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
        const generateSlotsForPeriod = (startStr, endStr) => {
            let current = parse(startStr, 'HH:mm', selectedDate);
            const endTime = parse(endStr, 'HH:mm', selectedDate);

            while (isBefore(current, endTime)) {
                const slotTime = new Date(current);
                const isFuture = isAfter(slotTime, new Date());
                const isTaken = booked.some(b => b.date.getTime() === slotTime.getTime());

                slots.push({
                    time: format(slotTime, 'HH:mm'),
                    iso: slotTime.toISOString(),
                    available: isFuture && !isTaken
                });

                current = addMinutes(current, settings.slotDuration);
            }
        };

        if (hours.period1Start && hours.period1End) {
            generateSlotsForPeriod(hours.period1Start, hours.period1End);
        }

        if (hours.period2Start && hours.period2End) {
            generateSlotsForPeriod(hours.period2Start, hours.period2End);
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
            .populate('client', 'name phone email avatar')
            .populate('barber', 'name')
            .populate('service', 'name price duration');
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

        let hours = null;
        if (settings.weeklySchedule && settings.weeklySchedule.length > 0) {
            const schedule = settings.weeklySchedule.find(s => s.day === dayOfWeek);
            if (schedule && schedule.active) hours = schedule;
        } else {
            const isSaturday = dayOfWeek === 6;
            const isWorkingDay = settings.workingDays.includes(dayOfWeek) || (isSaturday && settings.saturdayHours.active);
            if (isWorkingDay) {
                hours = isSaturday ? settings.saturdayHours : settings.businessHours;
            }
        }

        if (!hours) {
            return res.status(400).json({ message: 'Shop is closed on this day' });
        }

        const slotTimeStr = format(bookingDate, 'HH:mm');

        const inPeriod1 = (hours.period1Start && hours.period1End) &&
            (slotTimeStr >= hours.period1Start && slotTimeStr < hours.period1End);

        const inPeriod2 = (hours.period2Start && hours.period2End) &&
            (slotTimeStr >= hours.period2Start && slotTimeStr < hours.period2End);

        if (!inPeriod1 && !inPeriod2) {
            return res.status(400).json({ message: 'Outside business hours' });
        }

        // 4. Closed days check (holidays)
        const isClosedDay = settings.closedDays.some(d => isSameDay(new Date(d), bookingDate));
        if (isClosedDay) return res.status(400).json({ message: 'Shop is closed on this date' });

        const appointment = new Appointment({
            client: req.user.id,
            barber,
            service,
            date: new Date(date),
            withAI: req.body.withAI || false
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
router.put('/:id', protect, authorize('ADMIN', 'BARBEIRO'), async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

        if (req.user.role === 'BARBEIRO' && appointment.barber.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized to update this appointment' });
        }

        Object.assign(appointment, req.body);
        await appointment.save();
        res.json(appointment);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   DELETE api/appointments/:id
router.delete('/:id', protect, authorize('ADMIN', 'BARBEIRO'), async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

        if (req.user.role === 'BARBEIRO' && appointment.barber.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized to delete this appointment' });
        }

        await Appointment.findByIdAndDelete(req.params.id);
        res.json({ message: 'Appointment removed' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
