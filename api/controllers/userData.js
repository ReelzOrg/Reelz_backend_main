// import { driver, neo4jQuery, ogm, query } from '../../utils/connectDB.js';
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
      LIMIT 9;`;
      const postData = await query(getUserPostsQuery, [req.user.userId], "getUserPosts");
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

  const getTotalUserFollows = `MATCH (:User {_id: $loggedInUser})-[:FOLLOWS]->(f:User) RETURN count(f) AS totalFollows`;
  const totalFollows = await neo4jQuery(getTotalUserFollows, {loggedInUser}, "getUserFollows")
  const topLimit = parseInt(Math.ceil(parseFloat(totalFollows[0].get('totalFollows')) * 0.1));

  const userFeedQuery2 = `
  // 1. Start with the user
MATCH (userA:User {id: $loggedInUser})

// 2. Get top 10% followed accounts
WITH userA
MATCH (userA)-[followRel:FOLLOWS]->(followed:User)
WITH userA, followed, followRel.weight AS followWeight
ORDER BY followWeight DESC
LIMIT toInteger($topLimit)

// 3. Get their prioritized posts
MATCH (followed)-[:POSTED]->(priorityPost:Post)
WHERE priorityPost.created_at > datetime() - duration('P2D')
WITH userA, priorityPost, followWeight, followWeight * 1.5 AS postScore

// 4. Get regular posts from other follows
MATCH (userA)-[:FOLLOWS]->(regularFollowed:User)-[:POSTED]->(regularPost:Post)
WHERE regularPost.created_at > datetime() - duration('P2D')
AND NOT EXISTS { (userA)-[:VIEWED]->(regularPost) }

// 5. Combine and rank
WITH 
  collect({post: priorityPost, score: postScore}) + 
  collect({post: regularPost, score: followWeight}) AS allPosts
UNWIND allPosts AS feedItem
RETURN feedItem.post AS post,
       feedItem.score AS relevanceScore
ORDER BY relevanceScore DESC, post.created_at DESC
LIMIT 20`

  const userFeed = await neo4jQuery(userFeedQuery2, {loggedInUser: loggedInUser, topLimit: topLimit}, "getUserFeed");
  console.log("The user feed is:", userFeed);

  res.json({ success: true, feed: [] })
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
  LIMIT 9;`;
  const postData = await query(getUserPostsQuery, [req.user.userId], "getUserPosts");

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
}

// /:id/post/create
export async function handlePostUpload(req, res) {
  //upload the post to the database
  const loggedInUserId = req.user.userId;
  const apiId = req.params.id;

  //get the post id from this query
  const postQuery = typeof req.body.mediaUrl == "string" ? `
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
  const post = await query(postQuery, [loggedInUserId, req.body.caption, req.body.mediaUrl, req.body.fileType], "createPost");

  //create the node for the post in neo4j and create a relationship from the user to the post
  const createPostQuery = `MATCH (user:User {_id: $userId}) CREATE (post:Post {_id: $postId, created_at: datetime()}) CREATE (user)-[:POSTED]->(post) RETURN post;`;
  const neo4jPost = await neo4jQuery(createPostQuery, {userId: loggedInUserId, postId: post[0].post_id}, "createPost");

  return { success: true, message: "Post uploaded successfully", post: post }
  // res.json({ success: true, message: "Post uploaded successfully", post: post })
}

//0f9214c2-2cd3-4f06-8f06-d5b1ff521419
//https://reelzapp.s3.us-east-1.amazonaws.com/userPosts/bf5bd32d-d037-411d-9e5d-6323cc6199ca/post_1000000040

//7309bd33-0243-4da4-80f7-2e74c8326436
//https://reelzapp.s3.us-east-1.amazonaws.com/userPosts/bf5bd32d-d037-411d-9e5d-6323cc6199ca/post_1000000039