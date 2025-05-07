import express from 'express';

import { editProfile, getNetworkList, getUserById, getUserProfile, handleFollow, handlePostUpload, handleUnFollow } from '../controllers/userData.js';
import authenticateToken from '../../utils/authenticateToken.js';
import { getMultipleSignedUrls, getS3SignedUrl } from '../controllers/uploadToS3.js';
import checkUserAuthorization from '../../utils/checkUserAuthorization.js';
// import { query } from '../../utils/connectDB.js';
import { query } from "../../dbFuncs/pgFuncs.js"

// /api/user
const router = express.Router();

//remove this route and instead make a request from the api below
//after the first time the user logs in, save the user id in expo secure store
//and for any further requests use the userID from secure store
router.get("/me", authenticateToken, getUserById);

//we are using username for this one becuase this route will handle detching profile data
//for other users. Since on the frontend we only have the username
router.get("/:username", authenticateToken, getUserProfile);

router.get("/:id/follow", authenticateToken, checkUserAuthorization, handleFollow);
router.get("/:id/unfollow", authenticateToken, checkUserAuthorization, handleUnFollow);

router.get("/:id/followers", authenticateToken, checkUserAuthorization, (req, res) => getNetworkList(req, res, "followers"));
router.get("/:id/following", authenticateToken, checkUserAuthorization, (req, res) => getNetworkList(req, res, "following"));

router.post("/:id/edit-profile", authenticateToken, checkUserAuthorization, editProfile);

//create a function for this an move this to userData.js
router.post("/:id/save-post-media", authenticateToken, checkUserAuthorization, async (req, res) => {
  // console.log("We are chout to get the s3 signed url");
  // console.log(req.body.fileName, req.body.fileType, req.body.caption, req.body.mediaUrl);

  //create a post in the database, update post count, & insert a blank media_url in the media table
  const getPostMediaData = await handlePostUpload(req, res);
  // console.log("The post has been created:", getPostMediaData);
  if(getPostMediaData.success == false) {
    return res.json(getPostMediaData);
  }

  const mediaPath = typeof req.body.fileType == "string"
  ? `userPosts/${req.user.userId}/${getPostMediaData.post[0].post_id}/${req.body.fileName}`
  : req.body.fileName.map((file) => `userPosts/${req.user.userId}/${getPostMediaData.post[0].post_id}/${file}`);
  // console.log("the media path is:", mediaPath);

  let x = typeof req.body.fileType == "string"
  ? await getS3SignedUrl(res, mediaPath, req.body.fileType)
  : await getMultipleSignedUrls(res, "reelzapp", mediaPath, req.body.fileType);

  console.log(x);

  if(x.success) {
    //since the above query sets a blank url in the media table
    //we are just adding the media_url but still have uploaded the media to s3
    //this will be done by frontend
    const updateMediaQuery = typeof req.body.fileType == "string"
    ? `UPDATE media SET media_url = $1 WHERE _id = $2;`
    : `UPDATE media AS m
      SET media_url = u.media_url
      FROM UNNEST(
          $1::text[],
          $2::uuid[]
      ) AS u(media_url, id)
      WHERE m._id = u.id
      RETURNING m.*;`;
    const result = await query(updateMediaQuery, [x.fileURLs, getPostMediaData.post.map((singleMedia) => singleMedia._id)], "updateMediaURL");
    // console.log("The media url has been updated:", result);
  }
  return res.json(x);
});
// router.post("/:id/post/create", authenticateToken, checkUserAuthorization, handlePostUpload);

export default router;