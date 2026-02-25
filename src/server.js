process.env.TZ = 'America/Sao_Paulo';
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
app.use('/api/analysis', require('./routes/analysis'));
app.use('/api/notifications', require('./routes/notifications'));

// Cron Job for Appointment Reminders (Every 15 minutes) — powered by MagicBell
const cron = require('node-cron');
const Appointment = require('./models/Appointment');
const { sendMagicBellNotification } = require('./routes/notifications');

cron.schedule('*/15 * * * *', async () => {
    console.log('⏰ Checking for upcoming appointments...');
    const now = new Date();
    const fortyFiveMinsLater = new Date(now.getTime() + 45 * 60000);

    try {
        const upcoming = await Appointment.find({
            date: { $gte: now, $lte: fortyFiveMinsLater },
            status: 'PENDING',
            notified: false
        }).populate('client');

        for (const appt of upcoming) {
            const client = appt.client;
            if (client && client.email) {
                try {
                    await sendMagicBellNotification({
                        title: '✂️ Lembrete de Agendamento',
                        content: `Olá ${client.name}! Seu horário está chegando em breve. Até já!`,
                        action_url: `${process.env.FRONTEND_URL}/booking`,
                        email: client.email,
                    });
                    console.log(`✅ Reminder sent via MagicBell to ${client.email}`);
                } catch (err) {
                    console.error(`MagicBell reminder error for ${client.email}:`, err?.response?.data || err.message);
                }
            }
            appt.notified = true;
            await appt.save();
        }
    } catch (err) {
        console.error('Cron Job Error:', err);
    }
});

const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => {
    res.json({
        status: 'API Studio John Pool Online 🚀 (VPS)',
        version: '1.0.0'
    });
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
