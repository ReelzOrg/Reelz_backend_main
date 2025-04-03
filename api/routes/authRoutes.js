import express from 'express';
import { loginUser, registerUser } from '../controllers/auth.js';

// /api/auth
const router = express.Router();

router.post("/login", loginUser);
router.post("/register", registerUser);

router.get("/register", (req, res) => {
  res.render("register");
})

export default router;