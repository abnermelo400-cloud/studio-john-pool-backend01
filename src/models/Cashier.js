const mongoose = require('mongoose');

const cashierSchema = new mongoose.Schema({
    openedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date },
    initialValue: { type: Number, default: 0 },
    finalValue: { type: Number }, // Expected value based on transactions
    declaredValue: { type: Number }, // Value declared by the user at closing
    status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN' },
    transactions: [{
        type: { type: String, enum: ['IN', 'OUT'] },
        amount: { type: Number, required: true },
        description: { type: String, required: true },
        paymentMethod: { type: String, enum: ['CASH', 'CARD', 'PIX', 'EXPENSE'] },
        timestamp: { type: Date, default: Date.now }
    }],
    summary: {
        cash: { type: Number, default: 0 },
        card: { type: Number, default: 0 },
        pix: { type: Number, default: 0 },
        expenses: { type: Number, default: 0 }
    },
    barberStats: [{
        barber: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        dailyRevenue: { type: Number, default: 0 },
        dailyTips: { type: Number, default: 0 }
    }],
    notes: { type: String }
});

module.exports = mongoose.model('Cashier', cashierSchema);
