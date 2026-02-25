const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const Cashier = require('../models/Cashier');
const { protect, authorize } = require('../middleware/auth');

// @route   GET api/orders
// @desc    Get all orders (Admin gets all, Barber gets theirs)
router.get('/', protect, authorize('ADMIN', 'BARBEIRO'), async (req, res) => {
    try {
        let query = {};
        if (req.user.role === 'BARBEIRO') {
            query.barber = req.user.id;
        }

        // Filters
        if (req.query.cashier) query.cashier = req.query.cashier;
        if (req.query.barber && req.user.role === 'ADMIN') query.barber = req.query.barber;
        if (req.query.status) query.status = req.query.status;

        if (req.query.startDate || req.query.endDate) {
            query.createdAt = {};
            if (req.query.startDate) query.createdAt.$gte = new Date(req.query.startDate);
            if (req.query.endDate) query.createdAt.$lte = new Date(req.query.endDate);
        }

        const orders = await Order.find(query)
            .populate('client', 'name')
            .populate('barber', 'name')
            .populate('products.product', 'name price')
            .sort({ createdAt: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST api/orders
// @desc    Create a new order
router.post('/', protect, authorize('ADMIN', 'BARBEIRO'), async (req, res) => {
    try {
        const { client, services, products, totalAmount } = req.body;
        console.log(`📝 Order creation attempt by ${req.user.email} (Role: ${req.user.role})`);

        const cashier = await Cashier.findOne({ status: 'OPEN' });
        if (!cashier) {
            console.log('⚠️ Order blocked: Cashier is CLOSED');
            return res.status(400).json({ message: 'Não é possível abrir comanda com o caixa fechado. Peça ao administrador para abrir o caixa.' });
        }

        const barberId = req.user.role === 'BARBEIRO' ? req.user.id : req.body.barber;
        const { appointment, tipAmount, status } = req.body;

        if (!barberId) {
            console.log('⚠️ Order blocked: Missing barber ID');
            return res.status(400).json({ message: 'O barbeiro é obrigatório.' });
        }

        // ... (stock validation logic remains)

        const orderData = {
            client,
            services: services || [],
            products: products || [],
            totalAmount: totalAmount || 0,
            tipAmount: tipAmount || 0,
            appointment: appointment || null,
            cashier: cashier._id,
            barber: barberId,
            status: status || 'OPEN'
        };

        const order = new Order(orderData);
        await order.save();

        if (appointment) {
            const Appointment = require('../models/Appointment');
            await Appointment.findByIdAndUpdate(appointment, { status: 'WAITING_PAYMENT' });
        }
        console.log(`✅ Order created and stock reserved: ID ${order._id}`);

        const populatedOrder = await Order.findById(order._id)
            .populate('client', 'name')
            .populate('barber', 'name')
            .populate('services.service', 'name')
            .populate('products.product', 'name');

        res.status(201).json(populatedOrder);
    } catch (err) {
        console.error('🔥 Error creating order:', err);
        res.status(500).json({
            message: `ERRO_CREATE_ORDER: ${err.message}`,
            details: err.message
        });
    }
});

// @route   PUT api/orders/:id/pre-close
// @desc    Mark order as ready for payment (Barber only, must be the one who opened it)
router.put('/:id/pre-close', protect, authorize('BARBEIRO'), async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Comanda não encontrada' });

        // Validate that the barber who opened the comanda is the one trying to pre-close it
        if (order.barber.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Apenas o barbeiro que abriu a comanda pode pré-fechá-la' });
        }

        if (order.status !== 'OPEN') {
            return res.status(400).json({ message: 'Comanda já foi pré-fechada ou finalizada' });
        }

        order.status = 'READY_FOR_PAYMENT';
        await order.save();

        const populatedOrder = await Order.findById(order._id)
            .populate('client', 'name')
            .populate('barber', 'name')
            .populate('services.service', 'name')
            .populate('products.product', 'name');

        res.json(populatedOrder);
    } catch (err) {
        console.error('Error pre-closing order:', err);
        res.status(500).json({ message: 'Erro ao pré-fechar comanda' });
    }
});

// @route   PUT api/orders/:id/close
router.put('/:id/close', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const cashier = await Cashier.findOne({ status: 'OPEN' });
        if (!cashier) return res.status(400).json({ message: 'Cannot close order when cashier is closed' });

        // Stock is now reserved upon addition (POST /api/orders or POST /api/orders/:id/items)
        // No need to decrement here anymore.

        order.status = 'CLOSED';
        order.closedAt = Date.now();
        order.paymentMethod = req.body.paymentMethod || 'OUTRO';

        // Preserve tip if not explicitly provided (avoid resetting to 0)
        if (req.body.tipAmount !== undefined) {
            order.tipAmount = req.body.tipAmount;
        }

        await order.save();

        // Update Appointment status if linked
        if (order.appointment) {
            const Appointment = require('../models/Appointment');
            await Appointment.findByIdAndUpdate(order.appointment, { status: 'COMPLETED' });
        }

        // Update Cashier Transactions and barberStats
        const activeCashier = await Cashier.findById(order.cashier);
        if (activeCashier) {
            const method = order.paymentMethod || 'PIX';
            const totalWithTip = order.totalAmount + order.tipAmount;

            activeCashier.transactions.push({
                type: 'IN',
                amount: totalWithTip,
                description: `Pedido #${order._id.toString().slice(-4)}${order.tipAmount > 0 ? ' + Gorjeta' : ''} - ${order.client?.name || 'Cliente'}`,
                paymentMethod: method,
                barber: order.barber
            });

            // Update Summary
            if (method === 'CASH') activeCashier.summary.cash += totalWithTip;
            else if (method === 'CARD') activeCashier.summary.card += totalWithTip;
            else if (method === 'PIX') activeCashier.summary.pix += totalWithTip;
            else activeCashier.summary.other += totalWithTip;

            // Update barberStats in Cashier
            const barberStatIndex = activeCashier.barberStats.findIndex(s => s.barber.toString() === order.barber.toString());
            if (barberStatIndex > -1) {
                activeCashier.barberStats[barberStatIndex].dailyRevenue += order.totalAmount;
                activeCashier.barberStats[barberStatIndex].dailyTips += order.tipAmount;
                activeCashier.barberStats[barberStatIndex].serviceCount += 1;
            } else {
                activeCashier.barberStats.push({
                    barber: order.barber,
                    dailyRevenue: order.totalAmount,
                    dailyTips: order.tipAmount,
                    serviceCount: 1
                });
            }

            await activeCashier.save();
        }

        res.json(order);
    } catch (err) {
        console.error('Error closing order:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET api/orders/my-open-comanda
// @desc    Get the open comanda for the logged-in client
router.get('/my-open-comanda', protect, async (req, res) => {
    try {
        const order = await Order.findOne({
            client: req.user.id,
            status: { $in: ['OPEN', 'READY_FOR_PAYMENT'] }
        })
            .populate('client', 'name')
            .populate('barber', 'name')
            .populate('services.service', 'name')
            .populate('products.product', 'name price');
        res.json(order);
    } catch (err) {
        console.error('🔥 Error fetching my-open-comanda:', err);
        res.status(500).json({ message: 'Server error fetching your comanda' });
    }
});

// @route   GET api/orders/:id
router.get('/:id', protect, async (req, res) => {
    try {
        if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ message: 'Invalid order ID format' });
        }
        const order = await Order.findById(req.params.id)
            .populate('client', 'name')
            .populate('barber', 'name')
            .populate('products.product', 'name price');
        if (!order) return res.status(404).json({ message: 'Order not found' });
        res.json(order);
    } catch (err) {
        console.error(`🔥 Error fetching order ${req.params.id}:`, err);
        res.status(500).json({ message: 'Server error fetching order' });
    }
});

// @route   PUT api/orders/:id
router.put('/:id', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const order = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!order) return res.status(404).json({ message: 'Order not found' });
        res.json(order);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST api/orders/:id/items
router.post('/:id/items', protect, authorize('ADMIN', 'BARBEIRO', 'CLIENTE'), async (req, res) => {
    try {
        const { type, itemId, price, quantity = 1 } = req.body; // type: 'SERVICE' or 'PRODUCT'

        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.status !== 'OPEN') return res.status(400).json({ message: 'A comanda já está fechada.' });

        // Validação de propriedade para clientes
        if (req.user.role === 'CLIENTE') {
            if (order.client.toString() !== req.user.id) {
                return res.status(403).json({ message: 'Você não tem permissão para alterar esta comanda.' });
            }
            if (type !== 'PRODUCT') {
                return res.status(403).json({ message: 'Clientes só podem adicionar produtos à comanda.' });
            }
        }

        if (type === 'SERVICE') {
            order.services.push({ service: itemId, price, addedAt: new Date() });
        } else if (type === 'PRODUCT') {
            const product = await Product.findById(itemId);
            if (!product) return res.status(404).json({ message: 'Produto não encontrado' });
            if (product.stock < quantity) return res.status(400).json({ message: 'Estoque insuficiente' });

            // Reservar estoque imediatamente
            await Product.findByIdAndUpdate(itemId, { $inc: { stock: -quantity } });
            console.log(`📉 Estoque reservado: -${quantity} para o produto ${product.name}`);

            order.products.push({ product: itemId, price, quantity, addedAt: new Date() });
        }

        // Recalculate Total
        const servicesTotal = order.services.reduce((acc, s) => acc + s.price, 0);
        const productsTotal = order.products.reduce((acc, p) => acc + (p.price * p.quantity), 0);
        order.totalAmount = servicesTotal + productsTotal;

        await order.save();

        const updatedOrder = await Order.findById(order._id)
            .populate('client', 'name')
            .populate('barber', 'name')
            .populate('services.service', 'name')
            .populate('products.product', 'name');

        res.json(updatedOrder);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   DELETE api/orders/:id/items/:itemId
router.delete('/:id/items/:itemId', protect, authorize('ADMIN', 'BARBEIRO'), async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.status !== 'OPEN') return res.status(400).json({ message: 'Order is closed' });

        const { type } = req.query; // 'SERVICE' or 'PRODUCT'

        if (type === 'SERVICE') {
            order.services = order.services.filter(s => s._id.toString() !== req.params.itemId);
        } else if (type === 'PRODUCT') {
            const productItem = order.products.find(p => p._id.toString() === req.params.itemId);
            if (productItem) {
                // Devolver ao estoque
                await Product.findByIdAndUpdate(productItem.product, { $inc: { stock: productItem.quantity } });
                console.log(`📈 Stock restored: +${productItem.quantity} for product ID ${productItem.product}`);
            }
            order.products = order.products.filter(p => p._id.toString() !== req.params.itemId);
        }

        // Recalculate Total
        const servicesTotal = order.services.reduce((acc, s) => acc + s.price, 0);
        const productsTotal = order.products.reduce((acc, p) => acc + (p.price * p.quantity), 0);
        order.totalAmount = servicesTotal + productsTotal;

        await order.save();

        const updatedOrder = await Order.findById(order._id)
            .populate('client', 'name')
            .populate('barber', 'name')
            .populate('services.service', 'name')
            .populate('products.product', 'name');

        res.json(updatedOrder);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   DELETE api/orders/:id
router.delete('/:id', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        // Se a comanda estiver ABERTA, devolver estoque de todos os produtos
        if (order.status === 'OPEN') {
            for (const p of order.products) {
                await Product.findByIdAndUpdate(p.product, { $inc: { stock: p.quantity } });
            }
            console.log(`♻️ Stock restored for all products in deleted OPEN order ${order._id}`);
        }

        await Order.findByIdAndDelete(req.params.id);
        res.json({ message: 'Order removed and stock handled' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
