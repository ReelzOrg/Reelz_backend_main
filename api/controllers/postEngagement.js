import { transactionQuery,query } from "../../dbFuncs/pgFuncs";

export async function likeOnPost(req, res) {
  const loggedInUserId = req.user.userId;
  const postId = req.params.id;

  //check if the user has already liked the post
  const checkLikeQuery = `SELECT * FROM likes WHERE user_id = $1 AND post_id = $2;`;
  const like = await query(checkLikeQuery, [loggedInUserId, postId], "checkLike");

  if(like.length > 0) {
    return res.json({success: false, message: "You have already liked this post"})
  }

  //if the user has not liked the post, like the post
  transactionQuery(async (client) => {
    await client.query(`INSERT INTO likes (user_id, post_id) VALUES ($1, $2);`, [loggedInUserId, postId]);
    await client.query(`UPDATE posts SET like_count = like_count + 1 WHERE _id = $1;`, [postId]);

    //save like to the outbox table to add it later to neo4j
    //topic name: app_events_PostLiked
    const outboxQuery = `INSERT INTO outbox (event_type, payload) VALUES ($1, $2);`
    const outboxPayload = { userId: loggedInUserId, eventType: "PostLiked", postId: postId };
    await client.query(outboxQuery, [outboxPayload.eventType, outboxPayload]);
  });

  //kafka saves the user like in neo4j

  return res.json({success: true, message: "Post liked successfully"})
}

export async function commentOnPost(req, res) {
  const loggedInUserId = req.user.userId;
  const postId = req.params.id;
  const commentText = req.body.commentText;

  // This might be undefined, since a comment can be either a first level comment
  // or a reply to another comment
  const parentCommentId = req.body.parentCommentId || null;

  //error handling is done in the transactionQuery function
  transactionQuery(async (client) => {
    await client.query(`INSERT INTO comments (user_id, post_id, comment_text, parent_comment_id) VALUES ($1, $2, $3, $4);`, [loggedInUserId, postId, commentText, parentCommentId]);
    await client.query(`UPDATE posts SET comment_count = comment_count + 1 WHERE _id = $1;`, [postId]);

    //save comment to the outbox table to add it later to neo4j
    //topic name: app_events_PostCommented
    const outboxQuery = `INSERT INTO outbox (event_type, payload) VALUES ($1, $2);`
    const outboxPayload = { userId: loggedInUserId, eventType: "PostCommented", postId: postId };
    await client.query(outboxQuery, [outboxPayload.eventType, outboxPayload]);
  });

  return res.json({success: true, message: "Comment added successfully"})
}

export async function getCommentsOnPost(req, res) {
  const postId = req.params.id;

  const getCommentsQuery = `SELECT * FROM comments WHERE post_id = $1;`;
  const comments = await query(getCommentsQuery, [postId], "getCommentsOnPost");

  return res.json({success: true, comments: comments})
}