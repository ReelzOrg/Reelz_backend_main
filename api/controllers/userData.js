import path from "path";
import fs from "fs";

import { driver, neo4jQuery, ogm } from "../../dbFuncs/neo4jFuncs.js";
import { query } from "../../dbFuncs/pgFuncs.js";

/** Time decayed weight calculation for the closeness of 2 users
 * MATCH (u1:User)-[follow:FOLLOWS]->(u2:User)
OPTIONAL MATCH (u1)-[interaction:LIKED|COMMENTED|SHARED]->(post:Post)<-[:POSTED]-(u2)
WITH u1, u2, follow, interaction, post,
     duration.inDays(date(interaction.timestamp), date()).days AS days_ago
SET follow.weight = 1 + sum(
  CASE 
    WHEN interaction IS NULL THEN 0
    WHEN days_ago < 7 THEN 1.0    // Full value for recent interactions
    WHEN days_ago < 30 THEN 0.5   // Half value for older interactions
    ELSE 0.2                      // Minimal value for very old interactions
  END
)
RETURN count(follow) AS relationships_updated
 */

export async function getUserBasicData(req, res) {
  const loggedInUser = req.user.userId;

  const getUserBasicDataQuery = `SELECT * FROM users WHERE _id = $1;`;
  const basicData = await query(getUserBasicDataQuery, [loggedInUser], "getBasicUserData");

  res.json({ success: true, user: basicData });
}

export async function getUserProfile(req, res) {
  //req.user is the user that is logged in
  const reqUserUsername = req.params.username;
  const reqUserOffset = req.query.offset || 0;
  
  const userProfileQuery = `SELECT * FROM users WHERE username = $1 LIMIT 1;`;
  const requestedUser = await query(userProfileQuery, [reqUserUsername], "getUserByUsername");

  if(requestedUser) {
    let userData = {
      _id: requestedUser[0]._id,
      username: requestedUser[0].username,
      first_name: requestedUser[0].first_name,
      last_name: requestedUser[0].last_name,
      follower_count: requestedUser[0].follower_count,
      following_count: requestedUser[0].following_count,
      post_count: requestedUser[0].post_count,
      profile_picture: requestedUser[0].profile_picture,
      is_private: requestedUser[0].is_private,
      bio: requestedUser[0].bio
    }

    if(requestedUser[0]._id === req.user.userId) {
      // no further checks necessary if it is the user's own account
      // send the userData and also ***fetch all the posts***
      const getUserPostsQuery = `
      SELECT 
        p.*,
        (
          SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
              '_id', m._id,
              'media_url', m.media_url,
              'media_type', m.media_type,
              'position', m.position,
              'updated_at', m.updated_at
            )
          )
          FROM media m
          WHERE m.post_id = p._id
        ) AS media_items
      FROM posts p
      WHERE p.user_id = $1
      LIMIT 9
      OFFSET $2;`;
      const postData = await query(getUserPostsQuery, [req.user.userId, reqUserOffset], "getUserPosts");
      return res.json({ success: true, user: {...userData, posts: postData, isUserAcc: true} })
    }

    //check if the user is following the account
    const checkFollowStatusQuery = `MATCH (follower:User {_id: $loggedInUser})-[r:FOLLOWS|REQUESTED]->(following:User {_id: $requestedUser}) RETURN (r IS NOT NULL) AS relationshipExists, type(r) AS followStatus`
    const result = await neo4jQuery(checkFollowStatusQuery, {loggedInUser: req.user.userId, requestedUser: requestedUser[0]._id}, "checkFollow");
    let followStatus;
    if(result && result.length === 0) {followStatus = "none"}
    else followStatus = result[0].get("followStatus").toLowerCase();

    //if the requested user is followed by the loggedin user show all the posts
    //no matter whats the privacy status of the requested user
    //or if the requested user is public
    if(followStatus == "follows" || !requestedUser[0].is_private) {
      //fetch all the posts made by the user
      const getUserPostsQuery = `
      SELECT 
        p.*,
        (
          SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
              '_id', m._id,
              'media_url', m.media_url,
              'media_type', m.media_type,
              'position', m.position,
              'updated_at', m.updated_at
            )
          )
          FROM media m
          WHERE m.post_id = p._id
        ) AS media_items
      FROM posts p
      WHERE p.user_id = $1
      LIMIT 9;`;
      const postData = await query(getUserPostsQuery, [req.user.userId], "getUserPosts");
      return res.json({ success: true, user: {...userData, isUserAcc: false, followStatus: followStatus}, posts: postData });
    }
    //if the requested user is private and the loggedin user have requested to follow
    else if(requestedUser[0].is_private && (followStatus == "requested" || followStatus == "none")) {
      return res.json({ success: true, user: {...userData, isUserAcc: false, followStatus: followStatus} });
    }
  } else {
    return res.json({ success: false, message: "User not found" });
  }
}

export async function getUserFeed(req, res) {
  const loggedInUser = req.user.userId;

  //TODO: make the frontend return the number of follows instead of quering neo4j
  const getTotalUserFollows = `MATCH (:User {_id: $loggedInUser})-[:FOLLOWS]->(f:User) RETURN count(f) AS totalFollows`;
  const totalFollows = await neo4jQuery(getTotalUserFollows, {loggedInUser}, "getUserFollows")
  const topLimit = parseInt(Math.ceil(parseFloat(totalFollows[0].get('totalFollows')) * 0.1));

  const userFeedQuery2 = `
  // 1. Start with the user
MATCH (userA:User {_id: $loggedInUser})

// 2. Get top 10% followed accounts
WITH userA
MATCH (userA)-[followRel:FOLLOWS]->(followed:User)
WITH userA, followRel.weight AS followWeight, collect(followed) AS topFollowedUsers
ORDER BY followWeight DESC
LIMIT toInteger($topLimit)

// 3. Get their prioritized posts
UNWIND topFollowedUsers AS followed
MATCH (followed)-[:POSTED]->(priorityPost:Post)
WHERE priorityPost.created_at > datetime() - duration('P14D') //change it to 7
WITH userA, topFollowedUsers, collect({post: priorityPost, score: followWeight * 1.1, user: followed}) AS priorityPosts

// 4. Get regular posts from other follows
OPTIONAL MATCH (userA)-[regularFollowRel:FOLLOWS]->(regularFollowed:User)-[:POSTED]->(regularPost:Post)
WHERE regularPost.created_at > datetime() - duration('P7D')
AND NOT regularFollowed IN topFollowedUsers
// AND NOT EXISTS { (userA)-[:VIEWED]->(regularPost) }
WITH priorityPosts, collect({post: regularPost, score: regularFollowRel.weight, user: regularFollowed}) AS regularPosts

// 5. Combine and rank
// WITH 
//   collect({post: priorityPost, score: postScore, user: followed}) + 
//   collect({post: regularPost, score: followWeight, user: regularFollowed}) AS allPosts
// WITH priorityPosts + regularPosts AS allPosts
WITH [item IN (priorityPosts + regularPosts) WHERE item.post IS NOT NULL] AS allPosts
UNWIND allPosts AS feedItem
RETURN DISTINCT feedItem.post AS post,
  feedItem.score AS relevanceScore,
  feedItem.user AS poster
ORDER BY relevanceScore DESC, post.created_at DESC
LIMIT 20`

  const getViewedPostIdsQuery = `SELECT post_id FROM usersviewedposts WHERE user_id = $1 AND viewed_at > NOW() - INTERVAL '14 days'`;
  let viewedPostIds = await query(getViewedPostIdsQuery, [loggedInUser], "getViewedPostIds");
  viewedPostIds = viewedPostIds.map((postId) => postId.post_id)

  const userFeed = await neo4jQuery(userFeedQuery2, {loggedInUser: loggedInUser, topLimit: topLimit}, "getUserFeed");
  const userFeedPostIds = userFeed.map((post) =>
    [post.get("post").properties._id, post.get("relevanceScore"), post.get("poster").properties._id])
  .filter((item) => !viewedPostIds.includes(item[0]));

  if(userFeedPostIds.length == 0) {
    return res.json({ success: true, feed: [] });
  }

  const getFeedPostsQuery = `
  WITH post_ids AS (
    SELECT 
      unnest($1::uuid[]) AS post_id,
      unnest($2::float[]) AS relevance_score,
      unnest($3::uuid[]) AS user_id
  )
  SELECT
    json_agg(
      json_build_object(
        'post', json_build_object(
          '_id', p._id,
          'user_id', p.user_id,
          'caption', p.caption,
          'like_count', p.like_count,
          'comment_count', p.comment_count,
          'share_count', p.share_count,
          'created_at', p.created_at,
          'media_items', (
            SELECT json_agg(
              json_build_object(
                '_id', m._id,
                'post_id', m.post_id,
                'media_type', m.media_type,
                'media_url', m.media_url,
                'position', m.position,
                'media_alt', m.media_alt
              )
            )
            FROM media m
            WHERE m.post_id = p._id
          )
        ),
        'user', json_build_object(
          '_id', u._id,
          'username', u.username,
          'first_name', u.first_name,
          'last_name', u.last_name,
          'profile_picture', u.profile_picture
        ),
        'relevance_score', pd.relevance_score
      )
    ) AS feed_items
  FROM posts p
  JOIN users u ON p.user_id = u._id
  JOIN post_ids pd ON p._id = pd.post_id
  GROUP BY p._id, u._id, pd.relevance_score, p.created_at
  ORDER BY pd.relevance_score DESC, p.created_at DESC
  `;
  const feedPosts = await query(getFeedPostsQuery, [userFeedPostIds.map((posts) => posts[0]), userFeedPostIds.map((posts) => posts[1]), userFeedPostIds.map((posts) => posts[2])], "getFeedPosts");
  // console.log("These are the entire posts data:", feedPosts);

  return res.json({ success: true, feed: feedPosts });
}

export async function handleFollow(req, res) {
  const reqUserId = req.params.id;

  if(reqUserId == req.user.userId) {
    return res.json({ success: false, message: "You cannot follow yourself" })
  }

  //if the requested user is a private account then create a REQUESTED relationship
  const isUserPrivateQuery = `SELECT is_private FROM users WHERE _id = $1 LIMIT 1;`;
  const userisPrivate = await query(isUserPrivateQuery, [reqUserId], "isUserPrivate");
  let relationship = userisPrivate[0].is_private ? "REQUESTED" : "FOLLOWS";

  //create a FOLLOWS/REQUESTED relationship in neo4j with a weight that defines the closeness of the users
  //when the user first follows someone, set the weight to 1 so that the user gets a chance to be on the 
  //loggedInUsers feed then change it to 0.1
  //Create a constraint ensuring all FOLLOWS relationships have weight = 0.1 rather than involving it in every first follow
  /**
   * CREATE CONSTRAINT default_follows_weight 
   * FOR ()-[r:FOLLOWS]->() 
   * REQUIRE r.weight IS NOT NULL AND r.weight = 0.1
   */
  const createFollowQuery = relationship == "FOLLOWS"
  ? `MATCH (follower:User {_id: $loggedInUser})
  WITH follower
  MATCH (following:User {_id: $requestedUser})
  MERGE (follower)-[r:FOLLOWS]->(following)
  ON CREATE SET r.weight = 0.1, r.timeStamp = datetime()
  RETURN follower, following;`
  : `MATCH (follower:User {_id: $loggedInUser})
  WITH follower
  MATCH (following:User {_id: $requestedUser})
  MERGE (follower)-[r:REQUESTED]->(following)
  RETURN follower, following;`;
  const records = await neo4jQuery(createFollowQuery, {loggedInUser: req.user.userId, requestedUser: reqUserId}, "createFollowRelationship");
  console.log("These 2 users have been connected:", records);

  if(userisPrivate[0].is_private) {
    //send a notification to the requested user that he received a follow request
    return res.json({ success: true, message: "created REQUESTED relationship" })
  }

  //update the follower and following count in postgresql
  const incrementFollowerCountQuery = `UPDATE users SET follower_count = CASE WHEN _id = $2 THEN follower_count + 1 ELSE follower_count END, following_count = CASE WHEN _id = $1 THEN following_count + 1 ELSE following_count END WHERE _id IN ($1, $2);`;
  const values = [req.user.userId, reqUserId];
  const result = await query(incrementFollowerCountQuery, values, "incrementFollower&FollowingCount");
  console.log("The counts have been incremented", result);

  return res.json({ success: true, message: "updated relationships and incrememnted follow counts on both accounts" })
}

export async function handleUnFollow(req, res) {
  const reqUserId = req.params.id;

  if(reqUserId == req.user.userId) {
    return res.json({ success: false, message: "You cannot unfollow yourself" })
  }

  //check what type of relationship exists between the two users
  const checkFollowStatusQuery = `MATCH (follower:User {_id: $loggedInUser})-[r:FOLLOWS|REQUESTED]->(following:User {_id: $requestedUser}) RETURN EXISTS(r) AS relationshipExists, type(r) AS followStatus`
  const result = await neo4jQuery(checkFollowStatusQuery, {loggedInUser: req.user.userId, requestedUser: reqUserId}, "checkFollowStatus");
  const followStatus = result[0].get("followStatus") || "NONE";
  const relationshipExists = result[0].get("relationshipExists");

  if(relationshipExists) {
    const deleteFollowQuery = `MATCH (follower:User {_id: $loggedInUser})-[r:${followStatus}]->(following:User {_id: $requestedUser}) DELETE r;`;
    const records = await neo4jQuery(deleteFollowQuery, {loggedInUser: req.user.userId, requestedUser: reqUserId}, "deleteFollowRelationship");
    console.log("The relationship has been deleted:", records);
  }

  //if the followStatus was FOLLOWS then we have to decrement the counts
  //if the followStatus was REQUESTED then we dont have to decrement the counts
  if(followStatus == "FOLLOWS") {
    //update the follower and following count in postgresql
    const decrementFollowerCountQuery = `UPDATE users SET follower_count = CASE WHEN _id = $2 THEN follower_count - 1 ELSE follower_count END, following_count = CASE WHEN _id = $1 THEN following_count - 1 ELSE following_count END WHERE _id IN ($1, $2);`;
    const values = [req.user.userId, reqUserId];
    const result = await query(decrementFollowerCountQuery, values, "decrementFollower&FollowingCount");
    console.log("The counts have been decremented", result);
  } else if(followStatus == "NONE") {
    return res.json({ success: false, message: "No relationship exists between the two users" })
  }

  return res.json({ success: true, message: `removed the relationship ${followStatus} & decremented follow counts on both accounts` })
}

export async function getUserPosts(req, res) {
  // const getUserByIdQuery = `SELECT * FROM users WHERE _id = $1 LIMIT 1;`;
  // const user = await query(getUserByIdQuery, [req.user.userId], "getuserById");

  const reqUserOffset = req.query.offset || 0;

  //get all users posts (limit 9)
  const getUserPostsQuery = `
  SELECT 
    p.*,
    (
      SELECT JSON_AGG(
        JSON_BUILD_OBJECT(
          '_id', m._id,
          'media_url', m.media_url,
          'media_type', m.media_type,
          'position', m.position,
          'updated_at', m.updated_at
        )
      )
      FROM media m
      WHERE m.post_id = p._id
    ) AS media_items
  FROM posts p
  WHERE p.user_id = $1
  LIMIT 9
  OFFSET $2 ;`;
  const postData = await query(getUserPostsQuery, [req.user.userId, reqUserOffset], "getUserPosts");

  // BECAUSE WE ARE ALREADY FETCHING ALL THE USER DATA IN THE api/user ROUTE
  // const userData = {
  //   _id: user[0]._id,
  //   username: user[0].username,
  //   first_name: user[0].first_name,
  //   last_name: user[0].last_name,
  //   follower_count: user[0].follower_count,
  //   following_count: user[0].following_count,
  //   post_count: user[0].post_count,
  //   profile_picture: user[0].profile_picture,
  //   is_private: user[0].is_private,
  //   bio: user[0].bio
  // }

  return res.json({ success: true, /*user: userData,*/ posts: postData });
}

//in the AllUserProfilePage component we get all the data of the requested user
//based on if the loggedin user is following the account or not
//so we can perform a check there itself and can make a request to fetch the list
//only if the loggedin user is following the account
export async function getNetworkList(req, res, networkType) {
  const reqUserId = req.params.id;
  const loggedinUserId = req.user.userId;
  let getNetworkListQuery;
  const limit = 20;

  if(networkType == "following") {
    getNetworkListQuery = `MATCH (user:User {_id: $loggedInUser})-[:FOLLOWS]->(f:User)
      RETURN COLLECT(f) AS fu;`;
  } else if(networkType == "followers") {
    getNetworkListQuery = `MATCH (user:User {_id: $loggedInUser})<-[:FOLLOWS]-(f:User)
      RETURN COLLECT(f) AS fu;`;
  }

  if(reqUserId == req.user.userId) {
    /**
     * Query to get the followers list where the followers that are also followed by
     * the loggedin user are shown first
     * 
     * MATCH (targetUser:User { userId: $targetUserId })<-[:FOLLOWS]-(follower:User)
WITH targetUser, follower
OPTIONAL MATCH (targetUser)-[:FOLLOWS]->(follower)
WITH targetUser, follower, CASE WHEN path IS NOT NULL THEN 1 ELSE 0 END AS followsBack
ORDER BY followsBack DESC, follower.userId
RETURN collect(follower.userId) AS orderedFollowerIds
     */
    const networkList = await neo4jQuery(getNetworkListQuery, {loggedInUser: req.user.userId}, "getNetworkListQuery");
    const following = networkList.length > 0 ? networkList[0].get('fu') : [];
    const userIds = following.map(userNode => userNode.properties._id);

    //get the user data from postgresql
    const getBasicUserDataQuery = `
    SELECT _id, username, first_name, last_name, profile_picture
    FROM users
    WHERE _id = ANY($1::uuid[])
    `
    const userData = await query(getBasicUserDataQuery, [userIds], "getBasicUserData");
    console.log("These are the usersssssss:", userData);

    return res.json({success: true, network: userData});
  }
  
  const getUserByIdQuery = `SELECT is_private FROM users WHERE _id = $1 LIMIT 1;`;
  const userisPrivate = await query(getUserByIdQuery, [reqUserId], "getuserById");

  //if both ids are different and if the loggedin user is not following the account
  //then dont show the followers list
  if(userisPrivate[0].is_private) {
    const checkFollowQuery = `MATCH (follower:User {_id: $loggedInUser})-[r:FOLLOWS]->(following:User {_id: $requestedUser}) RETURN EXISTS(r) AS isFollowing;`;
    const result = await neo4jQuery(checkFollowQuery, {loggedInUser: req.user.userId, requestedUser: reqUserId}, "checkFollow");
    if(!result[0].get("isFollowing")) return res.json({ success: false, message: "You are not following this account" });
  }
  
  const networkList = await neo4jQuery(getNetworkListQuery, {userId: reqUserId}, "getNetworkListQuery");
  networkType == "followers"
    ? res.json({success: true, network: networkList[0].get("followers")})
    : res.json({success: true, network: networkList[0].get("following")});
  return;
}

// /:id/edit-profile
export async function editProfile(req, res) {
  //TODO: Complete this
  const loggedInUserId = req.user.userId;
  const apiId = req.params.id;

  console.log("The updated User is:", req.body.updatedUser);
  return res.json({success: true, message: "Profile updated successfully"})
}

// /:id/post/create
export async function handlePostUpload(req, res) {
  //upload the post to the database
  const loggedInUserId = req.user.userId;
  const apiId = req.params.id;

  //mimetype: 'video/mp4' | 'image/jpeg'
  const mimeType = typeof req.body.fileType == "string" ? req.body.fileType.split("/")[0] : req.body.fileType.map((file) => file.split("/")[0]);
  console.log("The mime type of the media is:", mimeType);

  const mediaUrl = typeof req.body.fileType == "string" ? "" : new Array(req.body.fileType.length).fill("")

  //get the post id from this query
  const postQuery = typeof req.body.fileType == "string" ? `
    WITH new_post AS (
      INSERT INTO posts (user_id, caption) 
      VALUES ($1, $2)
      RETURNING _id
    ),
    update_user AS (
      UPDATE users 
      SET post_count = post_count + 1 
      WHERE _id = $1
    )
    INSERT INTO media (post_id, media_url, media_type, position)
    SELECT _id, $3, $4, 1 FROM new_post
    RETURNING *;`
    : `
    WITH new_post AS (
      INSERT INTO posts (user_id, caption)
      VALUES ($1, $2)
      RETURNING _id
    ),
    update_user AS (
      UPDATE users
      SET post_count = post_count + 1
      WHERE _id = $1
    )
    INSERT INTO media (post_id, media_url, media_type, position)
    SELECT
      new_post._id,
      m.url,
      m.type,
      m.pos
    FROM new_post
    CROSS JOIN unnest($3::text[], $4::text[]) WITH ORDINALITY AS m(url, type, pos)
    RETURNING *;`;
    //, (SELECT _id FROM new_post) AS post_id
  const post = await query(postQuery, [loggedInUserId, req.body.caption, mediaUrl, mimeType], "createPost");

  //create the node for the post in neo4j and create a relationship from the user to the post
  const createPostQuery = `MATCH (user:User {_id: $userId}) CREATE (post:Post {_id: $postId, created_at: datetime()}) CREATE (user)-[:POSTED]->(post) RETURN post;`;
  const neo4jPost = await neo4jQuery(createPostQuery, {userId: loggedInUserId, postId: post[0].post_id}, "createPost");

  return { success: true, message: "Post uploaded successfully", post: post }
}

// /:id/save-viewed-posts
export async function saveViewedPosts(req, res) {
  const saveViewedPostsQuery = `
  INSERT INTO usersviewedposts (user_id, post_id)
  VALUES ($1, unnest($2::uuid[]))
  ON CONFLICT DO NOTHING
  RETURNING post_id;
  `;
  const savedPosts = await query(saveViewedPostsQuery, [req.user.userId, req.body.viewedPosts], "saveViewedPosts")
  if(savedPosts) {
    return res.json({ success: true, savedPosts: savedPosts })
  }
  return res.json({ success: false, savedPosts: [] })
}

//------------------------------------------------------------------------
//                         MEDIA PROCESSING FUNCTIONS
//------------------------------------------------------------------------
//
// Define image resolutions
const IMAGE_RESOLUTIONS = [
  { width: 1080, height: 1350, suffix: 'large' },
  { width: 1280, height: 720, suffix: 'medium' },
  { width: 640, height: 360, suffix: 'small' },
  { width: 200, height: 200, suffix: 'thumbnail' }, // For square thumbnails
];

const IMAGE_RESOLUTIONS2 = {
  // Profile Photos (square for circular display)
  profile: [
    { width: 600, height: 600, suffix: '600x600' }, // High-res for large displays/future
    { width: 320, height: 320, suffix: '320x320' }, // Instagram's recommended base, covers 3x for 90px
  ],
  // Standard Posts (images in main feed)
  post: [
    { width: 1080, height: 1350, suffix: '1080x1350_4x5' }, // Vertical (Portrait) - Most common
    { width: 1080, height: 1080, suffix: '1080x1080_1x1' }, // Square - Classic
    { width: 1080, height: 566, suffix: '1080x566_1.91x1' }, // Landscape (Horizontal)
    { width: 640, height: 800, suffix: '640x800_4x5' },   // Medium res for faster loading or lower-res displays
    { width: 200, height: 250, suffix: '200x250_thumb' }, // Small thumbnail for feeds/grids (4:5 aspect ratio)
  ],
  // Stories / Reels Thumbnails (if you generate one for the grid from a 9:16 source)
  reel_thumbnail: [
    { width: 600, height: 1067, suffix: '600x1067_thumb_9x16_preview' }, // A preview for full-screen vertical content
    { width: 300, height: 400, suffix: '300x400_thumb_3x4_preview' }, // Common smaller preview for some feeds
    { width: 200, height: 200, suffix: '200x200_thumb_1x1_preview' }, // Classic square thumbnail if needed
  ],
};

// Define video resolutions (example, adjust as needed)
const VIDEO_RESOLUTIONS = [
  { resolution: '1920x1080', suffix: '1080p', bitrate: '5M' },
  { resolution: '1280x720', suffix: '720p', bitrate: '2.5M' },
  { resolution: '640x360', suffix: '360p', bitrate: '1M' },
];

const VIDEO_RESOLUTIONS2 = {
  // Standard Posts (videos in main feed)
  post: [
    // Note: The input video might not perfectly match these aspect ratios.
    // ffmpeg's 'autopad' or 'scale' filters can be used to handle this.
    // 'fit: sharp.fit.inside' for images is equivalent to 'scale' with 'force_original_aspect_ratio=decrease' for video.
    // 'autopad' will add black bars if aspect ratio is changed.
    { resolution: '1080x1350', suffix: '1080p_4x5', bitrate: '4M' }, // Vertical (Portrait)
    { resolution: '1080x1080', suffix: '1080p_1x1', bitrate: '3.5M' }, // Square
    { resolution: '1080x608', suffix: '1080p_16x9', bitrate: '3M' }, // Landscape (16:9 is common for video)
    { resolution: '720x900', suffix: '720p_4x5', bitrate: '2M' }, // Medium res for faster loading
    { resolution: '640x800', suffix: '640p_4x5', bitrate: '1.5M' }, // Lower res for slower networks
  ],
  // Full Page Videos / Reels / Stories
  reel: [
    { resolution: '1080x1920', suffix: '1080p_9x16', bitrate: '5M' }, // Full HD vertical
    { resolution: '720x1280', suffix: '720p_9x16', bitrate: '2.5M' }, // HD vertical
    { resolution: '480x854', suffix: '480p_9x16', bitrate: '1M' }, // SD vertical
  ],
};

// THIS WILL GO IN A SEPARATE MICROSERVICE
export async function processMedia(req, res) {
  console.log("The S3 URLS to process are:")
  console.log(req.body.toProcessUrls);

  // if (!req.files || req.files.length === 0) {
  //   return res.status(400).send('No files uploaded.');
  // }

  const uploadedFileUrls = [];
  const processingPromises = [];

  return res.status(200).json({ success: true, message: "Test" });

  /*
  for (const file of req.files) {
    const originalFilePath = file.path;
    const originalFileName = file.originalname;
    const fileExtension = path.extname(originalFileName).toLowerCase();
    const baseName = path.basename(originalFileName, fileExtension);

    try {
      if (file.mimetype.startsWith('image/')) {
        //review this code
        for (const resConfig of IMAGE_RESOLUTIONS) {
          const outputFileName = `${baseName}_${resConfig.suffix}.webp`; // Using webp for better compression
          const outputPath = path.join('uploads', outputFileName);

          const imageProcessingPromise = sharp(originalFilePath)
            .resize(resConfig.width, resConfig.height, { fit: sharp.fit.inside, withoutEnlargement: true })
            .webp({ quality: 80 }) // Adjust quality as needed
            .toFile(outputPath)
            .then(async () => {
              const s3Key = `images/${baseName}/${outputFileName}`;
              await uploadToS3(outputPath, s3Key, 'image/webp');
              uploadedFileUrls.push(`https://${S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`);
              fs.unlinkSync(outputPath); // Clean up temp file
            });
          processingPromises.push(imageProcessingPromise);
        }
      } else if(file.mimeType.startsWith("video/")) {
        for (const resConfig of VIDEO_RESOLUTIONS) {
          const outputFileName = `${baseName}_${resConfig.suffix}.mp4`;
          const outputPath = path.join('uploads', outputFileName);

          const videoProcessingPromise = new Promise((resolve, reject) => {
            ffmpeg(originalFilePath)
              .output(outputPath)
              .videoCodec('libx264')
              .audioCodec('aac')
              .size(resConfig.resolution)
              .autopad() // Add black borders to maintain aspect ratio if scaling
              .outputOptions([
                `-b:v ${resConfig.bitrate}`, // Video bitrate
                '-preset fast', // Encoding speed vs. compression ratio
                '-crf 28', // Constant Rate Factor (quality setting, lower is better quality)
              ])
              .on('end', async () => {
                try {
                  const s3Key = `videos/${baseName}/${outputFileName}`;
                  await uploadToS3(outputPath, s3Key, 'video/mp4');
                  uploadedFileUrls.push(`https://${S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`);
                  fs.unlinkSync(outputPath); // Clean up temp file
                  resolve();
                } catch (s3Err) {
                  console.error('S3 upload error for video:', s3Err);
                  reject(s3Err);
                }
              })
              .on('error', (err) => {
                console.error(`Error processing video ${originalFileName} to ${resConfig.resolution}:`, err);
                reject(err);
              })
              .run();
          });
          processingPromises.push(videoProcessingPromise);
        }
      }
    } catch (error) {
      console.error('Error processing media:', error);
    } finally {
      // Delete the original uploaded temp file
      if (fs.existsSync(originalFilePath)) {
        fs.unlinkSync(originalFilePath);
      }
    }
  }

  // Wait for all processing and S3 uploads to complete
  try {
    await Promise.all(processingPromises);
    res.status(200).json({ message: 'Files processed and uploaded successfully!', urls: uploadedFileUrls });
  } catch (error) {
    console.error('One or more processing/upload tasks failed:', error);
    res.status(500).json({ error: 'Failed to process and upload some files.' });
  }
  */
}