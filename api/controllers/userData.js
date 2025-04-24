import { driver, neo4jQuery, ogm, query } from '../../utils/connectDB.js';

export async function getUserProfile(req, res) {
  //req.user is the user that is logged in
  const reqUserid = req.params.id;
  const userProfileQuery = `SELECT * FROM users WHERE _id = $1 LIMIT 1;`;
  const requestedUser = await query(userProfileQuery, [reqUserid], "getUserById");

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
      // send the userData object here
      res.json({ success: true, user: {...userData, isUserAcc: true} })
    }

    //check if the user is following the account
    //request the neo4j database
    const checkFollowQuery = `MATCH (follower:User {_id: $loggedInUser})-[r:FOLLOWS]->(following:User {_id: $requestedUser}) RETURN COUNT(r) > 0 AS isFollowing;`;
    const result = await neo4jQuery(checkFollowQuery, {loggedInUser: req.user.userId, requestedUser: requestedUser[0]._id}, "checkFollow");
    const isFollowing = result[0].get("isFollowing");

    if(isFollowing) {
      //get all the posts of the user since the user is following the account
      res.json({ success: true, user: {...userData, isUserAcc: false, isFollowing: true} })
    } else {
      res.json({ success: true, user: {...userData, isUserAcc: false, isFollowing: false} })
    }
    
  } else {
    res.json({ success: false, message: "User not found" })
  }
}

export async function handleFollow(req, res) {
  const reqUserId = req.params.id;
  //create a FOLLOWS relationship in neo4j
  // const createFollowQuery = `MATCH (follower:User {_id: $loggedInUser}), (following:User {_id: $requestedUser}) CREATE (follower)-[:FOLLOWS]->(following) RETURN follower, following;`;
  // const records = await neo4jQuery(createFollowQuery, {loggedInUser: req.user.userId, requestedUser: requestedUser[0]._id}, "createFollowRelationship");
  // console.log(records);
  const createFollowQuery = `MATCH (follower:User {_id: $loggedInUser}), (following:User {_id: $requestedUser}) MERGE (follower)-[:FOLLOWS]->(following) RETURN follower, following;`;
  const records = await neo4jQuery(createFollowQuery, {loggedInUser: req.user.userId, requestedUser: reqUserId}, "createFollowRelationship");
  console.log(records);

  //update the follower and following count in postgresql
  const incrementFollowerCountQuery = `UPDATE users SET follower_count = CASE WHEN _id = $2 THEN follower_count + 1 ELSE follower_count END, following_count = CASE WHEN _id = $1 THEN following_count + 1 ELSE following_count END WHERE _id IN ($1, $2);`;
  const values = [req.user.userId, reqUserId];
  const result = await query(incrementFollowerCountQuery, values, "incrementFollower&FollowingCount");
  console.log("The counts have been incremented", result);

  res.json({ success: true, message: "updated relationships and incrememnted follow counts on both accounts" })
}

export async function getUserById(req, res) {
  const getUserByIdQuery = `SELECT * FROM users WHERE _id = $1 LIMIT 1;`;
  const user = await query(getUserByIdQuery, [req.user.userId], "getuserById");

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

  //get the media from the post
  // const getMediaQuery = `SELECT * FROM media WHERE post_id = $1;`;
  // const media = await query(getMediaQuery, [postMetaData[0]._id], "getMedia");

  const userData = {
    _id: user[0]._id,
    username: user[0].username,
    first_name: user[0].first_name,
    last_name: user[0].last_name,
    follower_count: user[0].follower_count,
    following_count: user[0].following_count,
    post_count: user[0].post_count,
    profile_picture: user[0].profile_picture,
    is_private: user[0].is_private,
    bio: user[0].bio
  }

  console.log("These is the post data:", postData);

  res.json({ success: true, user: userData, posts: postData });
}

//  /:id/followers
export async function getFollowers(req, res) {
  const reqUserId = req.params.id;
  console.log("The user id is", reqUserId);
  const getUserByIdQuery = `SELECT is_private FROM users WHERE _id = $1 LIMIT 1;`;
  const userisPrivate = await query(getUserByIdQuery, [reqUserId], "getuserById");

  //get the id from the jwt token
  //compare this token of the loggedin user with the id in the request
  //if they are different then check if the loggedin user is following the account
  //and then return the followers list
  let isFollowing = false;
  console.log("The user is private", userisPrivate, reqUserId);
  if(reqUserId == req.user.userId || !userisPrivate[0].is_private) {
    isFollowing = true;
  } else if(reqUserId != req.user.userId && userisPrivate[0].is_private) {
    const checkFollowQuery = `MATCH (follower:User {_id: $loggedInUser})-[r:FOLLOWS]->(following:User {_id: $requestedUser}) RETURN COUNT(r) > 0 AS isFollowing;`;
    const result = await neo4jQuery(checkFollowQuery, {loggedInUser: req.user.userId, requestedUser: reqUserId}, "checkFollow");
    isFollowing = result[0].get("isFollowing");
  }

  //look at this query. see if it works (specially the ORDER BY clause)
  if(isFollowing) {
    const getFollowersListQuery = `MATCH (user:User {_id: $userId})<-[:FOLLOWS]-(follower:User)
      WITH COUNT(follower) as count, COLLECT(follower) as followers 
      WHERE count > 0 
      RETURN followers
      ORDER BY follower._id
      SKIP $offset
      LIMIT $limit;`;
    const followers = await neo4jQuery(getFollowersListQuery, {userId: reqUserId, offset: 0, limit: 50}, "getFollowersList");
    return res.json({ success: true, followers: followers.length > 0 ? followers[0].get("followers") : null });
  }

  return res.json({ success: false, message: "You are not following this account" })
}

export async function getFollowing(req, res) {
  const username = req.params.username;
  const getFollowingsListQuery = `MATCH (user:User {_id: $userId})-[:FOLLOWS]->(following:User) RETURN following;`;
  const following = await neo4jQuery(getFollowingsListQuery, {userId: req.user.userId}, "getFollowingsList");

  res.json({ success: true, following: following });
}

// /:id/edit-profile
export async function editProfile(req, res) {
  //TODO: Complete this
}

// /:id/post/create
export async function handlePostUpload(req, res) {
  //upload the post to the database

  //jwt token id
  const loggedInUserId = req.user.userId;
  //url id
  const apiId = req.params.id;

  if(loggedInUserId != apiId) {
    return res.json({ success: false, message: "You are not authorized to upload a post on this account" })
  }

  //get the post id from this query
  const postQuery = `
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
      RETURNING *;
    `;
    //, (SELECT _id FROM new_post) AS post_id
  const post = await query(postQuery, [loggedInUserId, req.body.caption, req.body.mediaUrl, req.body.mediaType], "createPost");

  //create the node for the post in neo4j and create a relationship from the user to the post
  const createPostQuery = `MATCH (user:User {_id: $userId}) CREATE (post:Post {_id: $postId}) CREATE (user)-[:POSTED]->(post) RETURN post;`;
  const neo4jPost = await neo4jQuery(createPostQuery, {userId: loggedInUserId, postId: post[0].post_id}, "createPost");

  res.json({ success: true, message: "Post uploaded successfully", post: post[0] })
}