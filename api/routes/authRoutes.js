import express from 'express';
import multer from 'multer';

import { loginUser, registerUser, registerUserGoogle, registerUserFacebook, setUsername } from '../controllers/auth.js';
import { getS3SignedUrl } from '../controllers/uploadToS3.js';

// /api/auth
const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post("/login", loginUser);
router.post("/register", upload.single('imgUrl'), registerUser);
router.post("/register/setusername", setUsername)
router.get("/register/upload-profile-photo", async (req, res) => {
  await getS3SignedUrl(res, `userDP/${req.body.fileName}`, req.body.fileType)
});

router.get("/google/callback", registerUserGoogle);
router.get("/facebook/callback", registerUserFacebook);
router.get("/register", (req, res) => {
  res.render("register");
})

export default router;