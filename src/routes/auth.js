const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

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
    let { email, password, portal } = req.body; // portal can be 'CLIENT' or 'STAFF'
    try {
        console.log(`🔍 Login attempt for: ${email} on portal: ${portal}`);

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

        // --- Role Restriction Logic ---
        if (portal === 'CLIENT' && user.role !== 'CLIENTE') {
            console.log(`🚫 Access Denied: Staff ${email} tried to login as client`);
            return res.status(403).json({ message: 'Acesso negado: Use o Portal Staff para sua conta.' });
        }

        if (portal === 'STAFF' && user.role === 'CLIENTE') {
            console.log(`🚫 Access Denied: Client ${email} tried to login as staff`);
            return res.status(403).json({ message: 'Acesso negado: Este portal é restrito para barbeiros e administradores.' });
        }
        // ------------------------------

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
                hasBiometrics: false
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

const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const rpName = 'Studio John Pool';
const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.RP_ORIGIN || 'http://localhost:3000';

// @route   GET api/auth/webauthn/register-options
router.get('/webauthn/register-options', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const options = await generateRegistrationOptions({
            rpName,
            rpID,
            userID: user._id.toString(),
            userName: user.email,
            attestationType: 'none',
            authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: 'preferred',
                authenticatorAttachment: 'platform',
            },
        });

        user.currentChallenge = options.challenge;
        await user.save();

        res.json(options);
    } catch (err) {
        console.error('🔥 Register options error:', err);
        res.status(500).json({ message: 'Erro ao gerar opções de registro' });
    }
});

// @route   POST api/auth/webauthn/register-verify
router.post('/webauthn/register-verify', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const expectedChallenge = user.currentChallenge;

        const verification = await verifyRegistrationResponse({
            response: req.body,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
        });

        if (verification.verified) {
            const { registrationInfo } = verification;
            const { credentialID, credentialPublicKey, counter, credentialDeviceType, credentialBackedUp } = registrationInfo;

            user.webauthnCredentials.push({
                credentialID: Buffer.from(credentialID).toString('base64url'),
                credentialPublicKey: Buffer.from(credentialPublicKey).toString('base64url'),
                counter,
                credentialDeviceType,
                credentialBackedUp,
            });

            user.currentChallenge = undefined;
            await user.save();

            res.json({ verified: true });
        } else {
            res.status(400).json({ verified: false, message: 'Verificação falhou' });
        }
    } catch (err) {
        console.error('🔥 Register verify error:', err);
        res.status(500).json({ message: 'Erro ao verificar registro' });
    }
});

// @route   GET api/auth/webauthn/login-options
router.get('/webauthn/login-options', async (req, res) => {
    const { email } = req.query;
    try {
        const user = await User.findOne({ email: email?.toLowerCase() });
        if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });

        const options = await generateAuthenticationOptions({
            rpID,
            allowCredentials: user.webauthnCredentials.map(cred => ({
                id: cred.credentialID,
                type: 'public-key',
                transports: cred.transports,
            })),
            userVerification: 'preferred',
        });

        user.currentChallenge = options.challenge;
        await user.save();

        res.json(options);
    } catch (err) {
        console.error('🔥 Login options error:', err);
        res.status(500).json({ message: 'Erro ao gerar opções de login' });
    }
});

// @route   POST api/auth/webauthn/login-verify
router.post('/webauthn/login-verify', async (req, res) => {
    const { email, response } = req.body;
    try {
        const user = await User.findOne({ email: email?.toLowerCase() });
        if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });

        const dbCredential = user.webauthnCredentials.find(c => c.credentialID === response.id);
        if (!dbCredential) return res.status(400).json({ message: 'Credencial não encontrada' });

        const verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge: user.currentChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            authenticator: {
                credentialID: dbCredential.credentialID,
                credentialPublicKey: Buffer.from(dbCredential.credentialPublicKey, 'base64url'),
                counter: dbCredential.counter,
            },
        });

        if (verification.verified) {
            dbCredential.counter = verification.authenticationInfo.newCounter;
            user.currentChallenge = undefined;
            await user.save();

            const token = generateToken(user);
            res.json({
                verified: true,
                token,
                user: {
                    id: user._id,
                    name: user.name,
                    role: user.role,
                    hasBiometrics: true
                }
            });
        } else {
            res.status(400).json({ verified: false, message: 'Verificação falhou' });
        }
    } catch (err) {
        console.error('🔥 Login verify error:', err);
        res.status(500).json({ message: 'Erro ao verificar login' });
    }
});

module.exports = router;

