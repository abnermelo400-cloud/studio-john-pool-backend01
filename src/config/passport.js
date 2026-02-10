const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

module.exports = function (passport) {

    // 🔒 Só ativa Google se existir credencial
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        console.log('⚠️ Google OAuth desativado (credenciais ausentes)');
        return;
    }

    passport.use(
        new GoogleStrategy({
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback'
        },
            async (accessToken, refreshToken, profile, done) => {

                try {

                    const email = profile.emails?.[0]?.value;

                    if (!email) {
                        return done(new Error('Email não encontrado no Google'), null);
                    }

                    let user = await User.findOne({ email });

                    if (user) {

                        // Atualiza vínculo Google
                        if (!user.googleId) {
                            user.googleId = profile.id;
                            user.avatar = profile.photos?.[0]?.value;
                            await user.save();
                        }

                        return done(null, user);
                    }

                    // 🧠 Criação automática CLIENTE (padrão SaaS)
                    user = await User.create({
                        googleId: profile.id,
                        name: profile.displayName,
                        email,
                        avatar: profile.photos?.[0]?.value,
                        role: 'CLIENTE'
                    });

                    return done(null, user);

                } catch (err) {
                    console.error('Erro Google Auth:', err);
                    return done(err, null);
                }
            })
    );

    // ⚠️ PWA + JWT não precisa sessão
    passport.serializeUser((user, done) => done(null, user.id));
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id);
            done(null, user);
        } catch (err) {
            done(err, null);
        }
    });

};
