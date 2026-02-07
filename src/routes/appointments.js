const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const { protect, authorize } = require('../middleware/auth');

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
    try {
        // Basic check for double booking
        const existing = await Appointment.findOne({ barber, date, status: { $ne: 'CANCELLED' } });
        if (existing) return res.status(400).json({ message: 'Time slot already taken' });

        const appointment = new Appointment({
            client: req.user.id,
            barber,
            service,
            date
        });
        await appointment.save();
        res.json(appointment);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

const CutHistory = require('../models/CutHistory');

// @route   PUT api/appointments/:id/status
router.put('/:id/status', protect, async (req, res) => {
    const { status, notes } = req.body;
    try {
        const appointment = await Appointment.findById(req.params.id)
            .populate('service', 'name price');
        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

        // Auth check
        if (req.user.role === 'CLIENTE' && appointment.client.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        appointment.status = status;
        if (notes) appointment.notes = notes;
        await appointment.save();

        // Sync with History if COMPLETED
        if (status === 'COMPLETED') {
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
