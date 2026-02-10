const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String },
  googleId: { type: String },
  role: { type: String, enum: ['ADMIN', 'BARBEIRO', 'CLIENTE'], default: 'CLIENTE' },
  avatar: { type: String },
  bio: { type: String },
  specialties: [{ type: String }],
  phone: { type: String },
  webauthnCredentials: [{
    credentialID: { type: String, required: true },
    credentialPublicKey: { type: String, required: true },
    counter: { type: Number, default: 0 },
    credentialDeviceType: { type: String },
    credentialBackedUp: { type: Boolean },
    transports: [{ type: String }]
  }],
  currentChallenge: { type: String },
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  try {
    if (this.password) {
      const salt = bcrypt.genSaltSync(10);
      this.password = bcrypt.hashSync(this.password, salt);
      console.log(`🔐 Password hashed for user: ${this.email}`);
    }
  } catch (err) {
    console.error(`🔥 Hashing error for ${this.email}:`, err);
    throw err;
  }
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compareSync(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
