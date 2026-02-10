const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (user) => {
    return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
        expiresIn: '30d'
    });
};

// @route   POST api/auth/register
router.post('/register', async (req, res) => {
    let { name, email, password } = req.body;
    try {
        email = email.toLowerCase().trim();
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ message: 'E-mail já cadastrado' });

        user = new User({ name, email, password });
        await user.save();

        const token = generateToken(user);
        res.json({ token, user: { id: user._id, name: user.name, role: user.role, hasBiometrics: false } });
    } catch (err) {
        console.error('🔥 Register error:', err);
        res.status(500).json({ message: 'ERRO_REGISTER: Falha no servidor' });
    }
});

// @route   POST api/auth/login
router.post('/login', async (req, res) => {
    let { email, password } = req.body;
    try {
        console.log(`🔍 Login attempt for: ${email}`);

        if (!email || !password) {
            console.log('⚠️ Login attempt with missing fields');
            return res.status(400).json({ message: 'ERRO: E-mail e senha são obrigatórios' });
        }

        email = email.toLowerCase().trim();
        const user = await User.findOne({ email });

        if (!user) {
            console.log(`❌ Login failed: User not found (${email})`);
            return res.status(400).json({ message: 'ERRO: E-mail não encontrado no sistema' });
        }

        console.log(`👤 User found: ${user.email} (Role: ${user.role})`);

        const isMatch = user.comparePassword(password);
        if (!isMatch) {
            console.log(`❌ Login failed: Invalid password for ${email}`);
            return res.status(400).json({ message: 'ERRO: Senha incorreta' });
        }

        console.log(`✅ Login successful: ${email} (${user.role})`);
        const token = generateToken(user);
        res.json({
            token,
            user: {
                id: user._id,
                name: user.name,
                role: user.role,
                hasBiometrics: user.webauthnCredentials && user.webauthnCredentials.length > 0
            }
        });
    } catch (err) {
        console.error('🔥 Login error:', err);
        res.status(500).json({ message: 'ERRO_LOGIN: Falha no servidor' });
    }
});

// @route   GET api/auth/google
router.get('/google', (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.status(400).json({
            message: 'Google Login não está configurado no servidor. Por favor, adicione GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET às variáveis de ambiente.'
        });
    }
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// @route   GET api/auth/google/callback
router.get('/google/callback', passport.authenticate('google', { session: false }), (req, res) => {
    const token = generateToken(req.user);
    // Redirect to frontend with token
    res.redirect(`${process.env.FRONTEND_URL}/auth-success?token=${token}`);
});

module.exports = router;
