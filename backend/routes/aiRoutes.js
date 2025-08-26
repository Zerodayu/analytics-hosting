import express from "express";
import { generateContent } from "../api/aiService.js";

const router = express.Router();

// Generate content using AI
router.post("/generate", async (req, res) => {
  try {
    const { prompt, content } = req.body;

    if (!prompt || !content) {
      return res.status(400).json({
        success: false,
        message: "Prompt and content are required",
      });
    }

    const result = await generateContent(prompt, content);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in AI generate endpoint:", error);
    res.status(500).json({
      success: false,
      message: "Error generating content",
      error: error.message,
    });
  }
});

export default router;
