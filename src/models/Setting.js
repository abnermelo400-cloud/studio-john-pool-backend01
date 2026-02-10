const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
    shopName: { type: String, default: 'Studio John Pool' },
    businessHours: {
        start: { type: String, default: '09:00' },
        end: { type: String, default: '18:00' }
    },
    saturdayHours: {
        start: { type: String, default: '09:00' },
        end: { type: String, default: '14:00' },
        active: { type: Boolean, default: true }
    },
    workingDays: { type: [Number], default: [1, 2, 3, 4, 5] }, // 0=Sun, 1=Mon...
    slotDuration: { type: Number, default: 30 }, // minutes
    closedDays: [{ type: Date }], // Specific dates where the shop is closed
    founderImage: { type: String, default: '' } // URL of the founder's image
});

module.exports = mongoose.model('Setting', settingSchema);
