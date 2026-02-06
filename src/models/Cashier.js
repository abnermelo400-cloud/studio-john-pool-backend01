const mongoose = require('mongoose');

const cashierSchema = new mongoose.Schema({
    openedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date },
    initialValue: { type: Number, default: 0 },
    finalValue: { type: Number },
    status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN' },
    transactions: [{
        type: { type: String, enum: ['IN', 'OUT'] },
        amount: Number,
        description: String,
        timestamp: { type: Date, default: Date.now }
    }]
});

module.exports = mongoose.model('Cashier', cashierSchema);
