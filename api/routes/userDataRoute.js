import express from 'express';

import { getUserData, getUserById } from '../controllers/userData.js';
import authenticateToken from '../../utils/authenticateToken.js';

// /api/user
const router = express.Router();

router.get("/me", authenticateToken, getUserById)

export default router;