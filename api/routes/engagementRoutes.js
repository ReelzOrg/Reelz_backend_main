import express from 'express';

import authenticateToken from '../../utils/authenticateToken.js';
import { commentOnPost, getCommentsOnPost, likeOnPost } from '../controllers/postEngagement.js';

//  api/posts/
const router = express.Router();

// The :id is the post ID
router.post("/:id/like", authenticateToken, likeOnPost);
router.post("/:id/comment", authenticateToken, commentOnPost);

// Should the user needs to be signed in if they want to see comments on the post?
router.get("/:id/comments", authenticateToken, getCommentsOnPost);

export default router;