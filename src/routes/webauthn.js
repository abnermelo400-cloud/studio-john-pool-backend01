const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.FRONTEND_URL || 'http://localhost:3000';

const generateToken = (user) => {
    return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
        expiresIn: '30d'
    });
};

// --- REGISTRATION ---

// @route   GET api/auth/webauthn/register-options
// @desc    Generate registration options for a logged-in user
router.get('/register-options', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        const options = await generateRegistrationOptions({
            rpName: 'Studio John Pool',
            rpID,
            userID: user._id.toString(),
            userName: user.email,
            attestationType: 'none',
            authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: 'preferred',
                authenticatorAttachment: 'platform', // Force biometric/device password
            },
        });

        // Save challenge to user
        user.currentChallenge = options.challenge;
        await user.save();

        res.json(options);
    } catch (err) {
        console.error('🔥 WebAuthn Register Options Error:', err);
        res.status(500).json({ message: 'Error generating registration options' });
    }
});

// @route   POST api/auth/webauthn/register-verify
// @desc    Verify the device attestation and save the credential
router.post('/register-verify', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const { body } = req;

        const verification = await verifyRegistrationResponse({
            response: body,
            expectedChallenge: user.currentChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
        });

        if (verification.verified && verification.registrationInfo) {
            const { credentialID, credentialPublicKey, counter, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

            const newCredential = {
                credentialID: Buffer.from(credentialID).toString('base64'),
                credentialPublicKey: Buffer.from(credentialPublicKey).toString('base64'),
                counter,
                credentialDeviceType,
                credentialBackedUp,
                transports: body.response.transports,
            };

            user.webauthnCredentials.push(newCredential);
            user.currentChallenge = undefined; // Clear challenge
            await user.save();

            res.json({ verified: true });
        } else {
            res.status(400).json({ verified: false, message: 'Verification failed' });
        }
    } catch (err) {
        console.error('🔥 WebAuthn Register Verify Error:', err);
        res.status(500).json({ message: 'Error verifying registration' });
    }
});

// --- LOGIN ---

// @route   POST api/auth/webauthn/login-options
// @desc    Generate authentication options for a user (by email)
router.post('/login-options', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email: email.toLowerCase().trim() });

        if (!user || user.webauthnCredentials.length === 0) {
            return res.status(400).json({ message: 'User not found or no biometrics registered' });
        }

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
        console.error('🔥 WebAuthn Login Options Error:', err);
        res.status(500).json({ message: 'Error generating login options' });
    }
});

// @route   POST api/auth/webauthn/login-verify
// @desc    Verify the device assertion and issue a JWT
router.post('/login-verify', async (req, res) => {
    try {
        const { email, body } = req; // email should be sent with the body or retrieved via credentialID
        // Simple approach: user sends email + WebAuthn body
        const user = await User.findOne({ email: email ? email.toLowerCase().trim() : undefined });

        // Alternative: find user by credentialID
        const credentialID = body.id;
        const targetUser = await User.findOne({ 'webauthnCredentials.credentialID': credentialID });

        if (!targetUser) {
            return res.status(400).json({ message: 'Authenticator not recognized' });
        }

        const dbCredential = targetUser.webauthnCredentials.find(c => c.credentialID === credentialID);

        const verification = await verifyAuthenticationResponse({
            response: body,
            expectedChallenge: targetUser.currentChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            authenticator: {
                credentialID: Buffer.from(dbCredential.credentialID, 'base64'),
                credentialPublicKey: Buffer.from(dbCredential.credentialPublicKey, 'base64'),
                counter: dbCredential.counter,
                transports: dbCredential.transports,
            },
        });

        if (verification.verified) {
            // Update counter
            dbCredential.counter = verification.authenticationInfo.newCounter;
            targetUser.currentChallenge = undefined;
            await targetUser.save();

            const token = generateToken(targetUser);
            res.json({ token, user: { id: targetUser._id, name: targetUser.name, role: targetUser.role } });
        } else {
            res.status(400).json({ verified: false, message: 'Authentication failed' });
        }
    } catch (err) {
        console.error('🔥 WebAuthn Login Verify Error:', err);
        res.status(500).json({ message: 'Error verifying login' });
    }
});

module.exports = router;
