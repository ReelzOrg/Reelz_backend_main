import fs from 'fs';
import path from 'path';
import express from 'express';
import multer from 'multer';

import { editProfile, getNetworkList, getUserBasicData, getUserFeed, getUserPosts, getUserProfile, handleFollow, handlePostUpload, handleUnFollow, saveViewedPosts } from '../controllers/userData.js';
// import { authenticateToken, checkUserAuthorization } from "../../utils/index.js"
import authenticateToken from "../../utils/authenticateToken.js";
import checkUserAuthorization from "../../utils/checkUserAuthorization.js"
import { getMultipleSignedUrls, getS3SignedUrl } from '../controllers/uploadToS3.js';
import { query } from "../../dbFuncs/pgFuncs.js"
import handleFileUpload from '../../utils/handleFileUpload.js';

// /api/user
const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, //500MB limit
  // fileFilter
});

router.get("/", authenticateToken, getUserBasicData);

//remove this route and instead make a request from the api below
//after the first time the user logs in, save the user id in expo secure store
//and for any further requests use the userID from secure store
// router.get("/me", authenticateToken, getUserById);
router.get("/posts", authenticateToken, getUserPosts);
router.get("/feed", authenticateToken, getUserFeed);

//we are using username for this one becuase this route will handle detching profile data
//for other users. Since on the frontend we only have the username
router.get("/:username", authenticateToken, getUserProfile);

router.get("/:id/follow", authenticateToken, handleFollow);
router.get("/:id/unfollow", authenticateToken, handleUnFollow);

router.get("/:id/followers", authenticateToken, checkUserAuthorization, (req, res) => getNetworkList(req, res, "followers"));
router.get("/:id/following", authenticateToken, checkUserAuthorization, (req, res) => getNetworkList(req, res, "following"));

router.post("/:id/edit-profile", authenticateToken, checkUserAuthorization, editProfile);

//create a function for this an move this to userData.js
router.post("/:id/save-post-media", authenticateToken, checkUserAuthorization, upload.array("mediaFiles", 10), async (req, res) => {
  // console.log("\n\nThe request body is:");
  // console.log(req.body);
  // console.log("\n\nThe request files are:");
  // console.log(req.files);
  // [
  //   {
  //     fieldname: 'mediaFiles',
  //     originalname: 'post_1000000045',
  //     encoding: '7bit',
  //     mimetype: 'video/mp4',
  //     buffer: <Buffer 00 00 00 1c 66 74 79 70 69 73 6f 35 00 00 02 00 69 73 6f 35 69 73 6f 36 6d 70 34 31 00 00 04 e1 6d 6f 6f 76 00 00 00 6c 6d 76 68 64 00 00 00 00 00 00 ... 18655275 more bytes>,
  //     size: 18655325
  //   },
  // ]
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: 'No files provided.' });
  }

  //create a post in the database, update post count, & insert a blank media_url in the media table
  const getPostMediaData = await handlePostUpload(req, res);
  if(getPostMediaData.success == false) {
    return res.json(getPostMediaData);
  }

  const mediaPath = req.files.length == 1
  ? `userPosts/${req.user.userId}/${getPostMediaData.post[0].post_id}/${req.files[0].originalname}`
  : req.files.map((file) => `userPosts/${req.user.userId}/${getPostMediaData.post[0].post_id}/${file.originalname}`);
  // console.log("the media path is:", mediaPath);

  const x = await handleFileUpload(req, res, mediaPath);

  // let x = typeof req.body.fileType == "string"
  // ? await getS3SignedUrl(res, mediaPath, req.body.fileType)
  // : await getMultipleSignedUrls(res, "reelzapp", mediaPath, req.body.fileType);

  if(x && x.success) {
    console.log("The uploaded files", x.uploadedFiles);
    console.log("The list of uploaded files:", x.uploadedFiles.map((singleFile) => singleFile.s3Location));
    //since the above query sets a blank url in the media table
    //we are just adding the media_url but still have uploaded the media to s3
    //this will be done by frontend
    const updateMediaQuery = req.files.length == 1
    ? `UPDATE media SET media_url = $1 WHERE _id = $2;`
    : `UPDATE media AS m
      SET media_url = u.media_url
      FROM UNNEST(
          $1::text[],
          $2::uuid[]
      ) AS u(media_url, id)
      WHERE m._id = u.id
      RETURNING m.*;`;
    const result = req.files.length == 1
    ? await query(updateMediaQuery, [x.uploadedFiles[0].s3Location, getPostMediaData.post[0]._id], "updateMediaURL")
    : await query(updateMediaQuery, [x.uploadedFiles.map((singleFile) => singleFile.s3Location), getPostMediaData.post.map((singleMedia) => singleMedia._id)], "updateMediaURLs");
  }
  return res.json(x);
});
router.post("/:id/save-viewed-posts", authenticateToken, checkUserAuthorization, saveViewedPosts)
// router.post("/:id/post/create", authenticateToken, checkUserAuthorization, handlePostUpload);

export default router;