const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true },
    duration: { type: Number, required: true }, // in minutes
    category: { type: String, required: true },
    image: { type: String },
    isPopular: { type: Boolean, default: false },
    barbers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isActive: { type: Boolean, default: true }
});

module.exports = mongoose.model('Service', serviceSchema);
