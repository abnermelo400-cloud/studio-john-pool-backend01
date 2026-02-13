const mongoose = require('mongoose');

const faceAnalysisSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    faceShape: {
        type: String,
        required: true,
        enum: ['Oval', 'Quadrado', 'Redondo', 'Diamante', 'Oblongo', 'Coração']
    },
    confidence: { type: Number, required: true },
    suggestedCut: { type: String, required: true }, // Name of the cut selected/suggested
    generatedImage: { type: String }, // URL or Base64 of the generated/shown image
    notes: { type: String }, // Barber notes
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('FaceAnalysis', faceAnalysisSchema);
