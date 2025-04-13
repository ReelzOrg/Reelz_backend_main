import express from 'express';

import { getUserById, getUserProfile, handleFollow } from '../controllers/userData.js';
import authenticateToken from '../../utils/authenticateToken.js';

// /api/user
const router = express.Router();

router.get("/me", authenticateToken, getUserById)
router.get("/:username", authenticateToken, getUserProfile);
router.get("/:username/follow", authenticateToken, handleFollow);

export default router;