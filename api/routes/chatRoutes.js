import express from 'express';

import authenticateToken from '../../utils/authenticateToken.js';
import { llmChatClient } from '../controllers/llmChat.js';

// /api/llm
const router = express.Router();

router.post("/chat", authenticateToken, llmChatClient)

export default router;