import express from 'express';

import { editProfile, getFollowers, getFollowing, getUserById, getUserProfile, handleFollow, handlePostUpload, handleUnFollow } from '../controllers/userData.js';
import authenticateToken from '../../utils/authenticateToken.js';
import { getS3SignedUrl } from '../controllers/uploadToS3.js';

// /api/user
const router = express.Router();

router.get("/me", authenticateToken, getUserById);

//we are using username for this one becuase this route will handle detching profile data
//for other users. Since on the frontend we only have the username
router.get("/:username", authenticateToken, getUserProfile);

router.get("/:id/follow", authenticateToken, handleFollow);
router.get("/:id/unfollow", authenticateToken, handleUnFollow);
// router.get("/:username/unfollow", authenticateToken, handleFollow);
router.get("/:id/followers", authenticateToken, getFollowers);
router.get("/:id/following", authenticateToken, getFollowing);

router.post("/:id/edit-profile", authenticateToken, editProfile);
router.post("/:id/save-post-media", authenticateToken, async (req, res) => {
  console.log("We are chout to get the s3 signed url");
  console.log(req.body.fileName, req.body.fileType);
  await getS3SignedUrl(res, `userPosts/${req.user.userId}/${req.body.fileName}`, req.body.fileType);
});
router.post("/:id/post/create", authenticateToken, handlePostUpload);

export default router;