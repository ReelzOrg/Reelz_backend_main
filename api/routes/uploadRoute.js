import express from 'express';
import { getS3SignedUrl } from '../controllers/uploadToS3.js';

// /api/upload
const router = express.Router();

router.post("/", getS3SignedUrl);

export default router;