require('dotenv').config(); // 🔥 PRIMEIRA LINHA ABSOLUTA

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const passport = require('passport');

console.log('Mongo URI:', process.env.MONGODB_URI);

const app = express();

// Middlewares
app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(passport.initialize());

// Passport
require('./config/passport')(passport);

// DB
if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI não definido');
    process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ MongoDB Connected');
        require('./config/adminSeed')();
    })
    .catch(err => {
        console.error('❌ Mongo Error:', err.message);
        process.exit(1);
    });

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/auth/webauthn', require('./routes/webauthn'));
app.use('/api/users', require('./routes/users'));
app.use('/api/services', require('./routes/services'));
app.use('/api/products', require('./routes/products'));
app.use('/api/cashier', require('./routes/cashier'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/history', require('./routes/history'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/upload', require('./routes/upload'));

const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => {
    res.json({
        status: 'API Studio John Pool Online 🚀'
    });
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
