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
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
