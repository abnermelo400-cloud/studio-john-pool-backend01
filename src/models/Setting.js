const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
    shopName: { type: String, default: 'Studio John Pool' },
    businessHours: {
        period1Start: { type: String, default: '09:00' },
        period1End: { type: String, default: '12:00' },
        period2Start: { type: String, default: '13:00' },
        period2End: { type: String, default: '18:00' }
    },
    saturdayHours: {
        period1Start: { type: String, default: '09:00' },
        period1End: { type: String, default: '12:00' },
        period2Start: { type: String, default: '13:00' },
        period2End: { type: String, default: '14:00' },
        active: { type: Boolean, default: true }
    },
    workingDays: { type: [Number], default: [1, 2, 3, 4, 5] }, // 0=Sun, 1=Mon...
    weeklySchedule: {
        type: [{
            day: { type: Number }, // 0=Sun, 1=Mon...
            active: { type: Boolean, default: true },
            period1Start: { type: String, default: '09:00' },
            period1End: { type: String, default: '12:00' },
            period2Start: { type: String, default: '13:00' },
            period2End: { type: String, default: '18:00' }
        }],
        default: () => [
            { day: 0, active: false, period1Start: '09:00', period1End: '12:00', period2Start: '13:00', period2End: '18:00' },
            { day: 1, active: true, period1Start: '09:00', period1End: '12:00', period2Start: '13:00', period2End: '18:00' },
            { day: 2, active: true, period1Start: '09:00', period1End: '12:00', period2Start: '13:00', period2End: '18:00' },
            { day: 3, active: true, period1Start: '09:00', period1End: '12:00', period2Start: '13:00', period2End: '18:00' },
            { day: 4, active: true, period1Start: '09:00', period1End: '12:00', period2Start: '13:00', period2End: '18:00' },
            { day: 5, active: true, period1Start: '09:00', period1End: '12:00', period2Start: '13:00', period2End: '18:00' },
            { day: 6, active: true, period1Start: '09:00', period1End: '12:00', period2Start: '13:00', period2End: '18:00' }
        ]
    },
    slotDuration: { type: Number, default: 30 }, // minutes
    closedDays: [{ type: Date }], // Specific dates where the shop is closed
    founderImage: { type: String, default: '' }, // URL of the founder's image
    socialLinks: {
        instagram: { type: String, default: '' },
        whatsapp: { type: String, default: '' }
    },
    address: { type: String, default: '' },
    mapsUrl: { type: String, default: '' },
    heroImage: { type: String, default: '' }, // Background for landing
    founderBio: { type: String, default: '' },
    cancellationWindow: { type: Number, default: 2 } // Hours
});

module.exports = mongoose.model('Setting', settingSchema);
