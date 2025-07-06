import express from 'express';

import authenticateToken from '../../utils/authenticateToken';
import { llmChatClient } from '../controllers/llmChat';

// /api/llm
const router = express.Router();

router.post("/chat", authenticateToken, llmChatClient)

export default router;