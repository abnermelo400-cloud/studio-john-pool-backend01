const mongoose = require('mongoose');

const cutHistorySchema = new mongoose.Schema({
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    barber: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    photos: [String],
    description: String,
    techniques: [String],
    materials: [String],
    observations: String,
    date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CutHistory', cutHistorySchema);
