const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    barber: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    cashier: { type: mongoose.Schema.Types.ObjectId, ref: 'Cashier', required: true },
    services: [{
        service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
        price: Number,
        addedAt: { type: Date, default: Date.now }
    }],
    products: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        quantity: { type: Number, default: 1 },
        price: Number,
        addedAt: { type: Date, default: Date.now }
    }],
    totalAmount: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['CASH', 'CARD', 'PIX'] },
    status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN' },
    createdAt: { type: Date, default: Date.now },
    closedAt: { type: Date }
});

module.exports = mongoose.model('Order', orderSchema);
