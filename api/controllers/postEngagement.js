import { transactionQuery, query } from "../../dbFuncs/pgFuncs.js";

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

  //still fetches all the comments, just in a proper format
  const getCommentsQuery = `
  SELECT
  c._id,
  c.comment_text,
  c.user_id,
  c.post_id,
  c.parent_comment_id,
  COALESCE(
    json_agg(
      json_build_object(
        '_id', r._id,
        'comment_text', r.comment_text,
        'user_id', r.user_id,
        'post_id', r.post_id,
        'parent_comment_id', r.parent_comment_id
      )
    ) FILTER (WHERE r._id IS NOT NULL),
    '[]'
  ) AS child_comments
  FROM comments c
  LEFT JOIN comments r ON r.post_id = c.post_id AND r.parent_comment_id IS NOT NULL
  WHERE c.post_id = $1 AND c.parent_comment_id IS NULL
  GROUP BY c._id, c.comment_text, c.user_id, c.post_id, c.parent_comment_id;
  `

  //fetches only the latest 10 top-level comments and latest 5 children of each of them
  //how about removing the ORDER BY clause? It will return random 10 comments and random 5 children of each of them
  //this could help in visibility of each comment
  const getCommentsQuery2 = `
  SELECT c._id, c.comment_text, c.user_id, c.post_id, c.parent_comment_id,
  COALESCE(
    json_agg(
      json_build_object(
        '_id', r._id,
        'comment_text', r.comment_text,
        'user_id', r.user_id,
        'post_id', r.post_id,
        'parent_comment_id', r.parent_comment_id
      )
    ),
    '[]'
  ) AS child_comments
  FROM
    (
      SELECT *
      FROM comments
      WHERE post_id = $1 AND parent_comment_id IS NULL
      ORDER BY created_at DESC
      LIMIT 10 OFFSET $2
    ) c
  LEFT JOIN LATERAL
    (
      SELECT *
      FROM comments r
      WHERE r.post_id = c.post_id AND r.parent_comment_id = c._id
      ORDER BY r.created_at DESC
      LIMIT 5 OFFSET $3
    ) r ON true
  GROUP BY c._id, c.comment_text, c.user_id, c.post_id, c.parent_comment_id;
  `;

  const comments = await query(getCommentsQuery, [postId], "getCommentsOnPost");

  return res.json({success: true, comments: comments})
}