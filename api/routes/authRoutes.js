import express from 'express';
import { loginUser, registerUser } from '../controllers/auth.js';
import { getS3SignedUrl } from '../controllers/uploadToS3.js';

// /api/auth
const router = express.Router();

router.post("/login", loginUser);
router.post("/register", registerUser);
router.get("/register/upload-profile-photo", async (req, res) => {
  await getS3SignedUrl(res, `userDP/${req.body.fileName}`, req.body.fileType)
})

router.get("/register", (req, res) => {
  res.render("register");
})

export default router;