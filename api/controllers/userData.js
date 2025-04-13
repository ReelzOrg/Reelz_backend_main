import { driver, neo4jQuery, ogm, query } from '../../utils/connectDB.js';

async function isFollowing(userId) {
  const session = driver.session();
  const User = ogm.model("User");

  const [result] = await User.find({
    where: {
      _id: userId
    }
  })
} 

export async function getUserProfile(req, res) {
  //req.user is the user that is logged in
  const username = req.params.username;
  const userProfileQuery = `SELECT * FROM users WHERE username = $1 LIMIT 1;`;
  const requestedUser = await query(userProfileQuery, [username], "getUserByUsername");

  if(requestedUser) {
    let userData = {
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

//cmon store both id and username in jwt token to avoid the first postgres query
export async function handleFollow(req, res) {
  const username = req.params.username;
  const userFollowQuery = `SELECT _id FROM users WHERE username = $1 LIMIT 1;`;
  const requestedUser = await query(userFollowQuery, [username], "userFollowQuery");

  //create a FOLLOWS relationship in neo4j
  const createFollowQuery = `MATCH (follower:User {_id: $loggedInUser}), (following:User {_id: $requestedUser}) CREATE (follower)-[:FOLLOWS]->(following) RETURN follower, following;`;
  const records = await neo4jQuery(createFollowQuery, {loggedInUser: req.user.userId, requestedUser: requestedUser[0]._id}, "createFollowRelationship");
  console.log(records);

  //update the follower and following count in postgresql
  const incrementFollowerCountQuery = `UPDATE users SET follower_count = CASE WHEN _id = $2 THEN follower_count + 1 ELSE follower_count END, following_count = CASE WHEN _id = $1 THEN following_count + 1 ELSE following_count END WHERE _id IN ($1, $2);`;
  const values = [req.user.userId, requestedUser[0]._id];
  const result = await query(incrementFollowerCountQuery, values, "incrementFollower&FollowingCount");
  console.log("The counts have been incremented", result);

  res.json({ success: true, message: "updated relationships and incrememnt follow counts on both accounts" })
}

export async function getUserById(req, res) {
  const getUserByIdQuery = `SELECT * FROM users WHERE _id = $1 LIMIT 1;`;
  const user = await query(getUserByIdQuery, [req.user.userId], "getuserById");

  console.log("We got the user");

  const userData = {
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
  res.json({ success: true, user: userData });
}