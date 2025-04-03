import { query } from '../../utils/connectDB.js';

export async function getUserData(req, res) {
  // const userId = req.params.id;
  // const user = await query(`SELECT * FROM users WHERE _id = $1 LIMIT 1;`, [userId], "getUserById");

  if(user) {
    res.json({ success: true, user: user })
  }
}

export async function getUserById(req, res) {
  const getUserByIdQuery = `SELECT * FROM users WHERE _id = $1 LIMIT 1;`;
  const user = await query(getUserByIdQuery, [req.user.userId], "getuserById");

  const userData = {
    username: user[0].username,
    email: user[0].email,
    first_name: user[0].first_name,
    last_name: user[0].last_name,
    follower_count: user[0].follower_count,
    following_count: user[0].following_count,
    post_count: user[0].post_count,
    profile_picture: user[0].profile_picture,
    bio: user[0].bio,
    dob: user[0].dob
  }
  res.json({ success: true, user: userData });
}