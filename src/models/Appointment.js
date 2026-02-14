const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    barber: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    date: { type: Date, required: true },
    status: { type: String, enum: ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'], default: 'PENDING' },
    withAI: { type: Boolean, default: false },
    notes: { type: String }
});

module.exports = mongoose.model('Appointment', appointmentSchema);
