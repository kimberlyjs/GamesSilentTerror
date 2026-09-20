const aiService = require('../services/aiService');

exports.handleChat = async (req, res) => {
    try {
        const { message, player_id } = req.body;
        
        // Memanggil service yang bertugas ngobrol dengan Python
        const aiReply = await aiService.getAIReply(message);

        // Balikkan respon ke Angular
        res.status(200).json({
            success: true,
            sender: "AI_BOT",
            reply: aiReply
        });

    } catch (error) {
        console.error("Error di Chat Controller:", error);
        res.status(500).json({ 
            success: false, 
            message: "Gagal terhubung ke Sistem AI" 
        });
    }
};