const User = require('../models/User');

const seedAdmin = async () => {
    try {
        const adminEmail = 'admin@studiojohnpool.com';
        const adminPassword = '2017inicio@';

        let admin = await User.findOne({ email: adminEmail });

        if (admin) {
            console.log('📝 Atualizando senha do Admin...');
            admin.password = adminPassword;
            admin.role = 'ADMIN';
            await admin.save();
            console.log('✅ Senha do Admin atualizada com sucesso!');
        } else {
            console.log('🚀 Criando novo usuário Admin...');
            admin = new User({
                name: 'Administrador Studio',
                email: adminEmail,
                password: adminPassword,
                role: 'ADMIN'
            });
            await admin.save();
            console.log('✅ Admin criado com sucesso!');
        }
    } catch (err) {
        console.error('❌ Erro ao semear Admin:', err.message);
    }
};

module.exports = seedAdmin;
