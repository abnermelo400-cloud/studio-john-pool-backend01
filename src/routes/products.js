const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { protect, authorize } = require('../middleware/auth');

// @route   GET api/products
router.get('/', async (req, res) => {
    try {
        const { all } = req.query;
        let query = { isActive: true };

        // Se explicitamente pedido 'all' (usado no admin), não filtra por isActive
        if (all === 'true') {
            query = {};
        }

        const products = await Product.find(query);
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST api/products
router.post('/', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const product = new Product(req.body);
        await product.save();
        res.json(product);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT api/products/:id
router.put('/:id', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(product);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   DELETE api/products/:id
router.delete('/:id', protect, authorize('ADMIN'), async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });
        product.isActive = false;
        await product.save();
        res.json({ message: 'Product deactivated' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
