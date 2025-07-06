import express from 'express';
import multer from 'multer';

import { editProfile, getNetworkList, getUserBasicData, getUserFeed, getUserPosts, getUserProfile, handleFollow, handlePostUpload, handleUnFollow, processMedia, saveViewedPosts } from '../controllers/userData.js';
// import { authenticateToken, checkUserAuthorization } from "../../utils/index.js"
import authenticateToken from "../../utils/authenticateToken.js";
import checkUserAuthorization from "../../utils/checkUserAuthorization.js";
import { query } from "../../dbFuncs/pgFuncs.js";
import { getS3SignedUrl, getMultipleSignedUrls } from "../controllers/uploadToS3.js";
// import handleFileUpload from '../../utils/handleFileUpload.js';

// /api/user
const router = express.Router();
const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'temp/userPosts/');
    },
    filename: function (req, file, cb) {
      cb(null, Date.now() + '-' + file.originalname);
    }
  }),
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
router.post("/:id/save-post-media", authenticateToken, checkUserAuthorization, async (req, res) => {
  // [
  //   {
  //     fieldname: 'mediaFiles',
  //     originalname: 'post_1000000045',
  //     encoding: '7bit',
  //     mimetype: 'video/mp4',
  //     buffer: <Buffer 00 00 00 1c 66 74 79 70 69 73 6f ... 18655275 more bytes>,
  //     size: 18655325
  //   },
  // ]
  console.log("THE FILES DATA IS:");
  console.log(req.body.fileName, req.body.fileType, req.body.caption, req.body.mediaUrl);
  // if (!req.files || req.files.length === 0) {
  //   return res.status(400).json({ message: 'No files provided.' });
  // }

  //create a post in the database, update post count, & insert a blank media_url in the media table
  const getPostMediaData = await handlePostUpload(req, res);
  if(getPostMediaData.success == false) return res.json(getPostMediaData);

  const mediaPath = typeof req.body.fileName == "string"
  ? `userPosts/${req.user.userId}/${getPostMediaData.post[0].post_id}/${req.body.fileName}`
  : req.body.fileName.map((name) => `userPosts/${req.user.userId}/${getPostMediaData.post[0].post_id}/${name}`);

  //USE IF YOU WANT TO UPLOAD THE FILE FROM THE SERVER
  // const x = await handleFileUpload(req, res, mediaPath);

  let x = typeof req.body.fileType == "string"
  ? await getS3SignedUrl(res, mediaPath, req.body.fileType)
  : await getMultipleSignedUrls(res, "reelzapp", mediaPath, req.body.fileType);

  if(x && x.success) {
    console.log("The uploaded files", x.uploadURL);
    console.log("The list of uploaded files:", x.fileURL);
    //since the above query sets a blank url in the media table
    //we are just adding the media_url but still have uploaded the media to s3
    //this will be done by frontend
    const updateMediaQuery = typeof req.body.fileName == "string"
    ? `UPDATE media SET media_url = $1 WHERE _id = $2;`
    : `UPDATE media AS m
      SET media_url = u.media_url
      FROM UNNEST(
          $1::text[],
          $2::uuid[]
      ) AS u(media_url, id)
      WHERE m._id = u.id
      RETURNING m.*;`;
    const result = typeof req.body.fileName == "string"
    ? await query(updateMediaQuery, [x.fileURL, getPostMediaData.post[0]._id], "updateMediaURL")
    : await query(updateMediaQuery, [x.fileURL.map((singleFile) => singleFile), getPostMediaData.post.map((singleMedia) => singleMedia._id)], "updateMediaURLs");
  }
  return res.json({...x, post_id: getPostMediaData.post[0].post_id});
});
router.post("/:id/save-viewed-posts", authenticateToken, checkUserAuthorization, saveViewedPosts);
router.post("/:id/process-media", authenticateToken, checkUserAuthorization, (req, res) => {
  // processMedia()

  //perform some validation checks. See if the urls are actually valid s3 urls.
  //instead of adding the "processing" status here how about just put the processing status when you add the post
  //in the database? this might not be a real proper status but it will save a database update

  //For now make a HTTP request to the processing servie but later add a message queue to handle this
  //we are not "awaiting" the response from the processing service
  const res = fetch(`http://localhost:5000/api/user/${req.user.userId}/process-media`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req.body),
  });
});
// router.post("/:id/post/create", authenticateToken, checkUserAuthorization, handlePostUpload);

export default router;