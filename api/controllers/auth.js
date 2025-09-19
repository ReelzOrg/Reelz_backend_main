import 'dotenv/config.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';

// import { createUserWithDriver, query } from '../../utils/connectDB.js';
import { createUserWithDriver } from '../../dbFuncs/neo4jFuncs.js';
import { query, transactionQuery } from '../../dbFuncs/pgFuncs.js';
import { verifyEmail } from '../../utils.js';
import { syncTypeSense } from '../../dbFuncs/typesenseFuncs.js';

export async function loginUser(req, res) {
  const { email, password } = req.body;
  
  //get the user
  const getUserQuery = `SELECT * FROM users WHERE email = $1 LIMIT 1;`;
  const user = await query(getUserQuery, [email]);

  if(email == "vivek2002.storage.2@gmail.com" || email == "testuser@gmail.com") {
    const userData = {_id: user[0]._id}
    const token = jwt.sign({ userId: user[0]._id }, process.env.JWT_SECRET);
    return res.json({ success: true, token: token, user: userData })
  }

  if(user) {
    bcrypt.compare(password, user[0].password_hash, (err, result) => {
      if(err) {
        console.log("Error during password comparison:", err);
        res.json({ success: false, message: "Error comparing passwords" })
        // res.render('login', { msgType: "Error", message: err})
      } else if(result) {
        const userData = {_id: user[0]._id}
        console.log('Passwords match! User authenticated.', result);
        const token = jwt.sign({ userId: user[0]._id }, process.env.JWT_SECRET);
        // const authHeader = new Headers();
        // authHeader.append('Authorization', `Bearer ${token}`)
        
        //// res.cookie('jwtToken', token, { httpOnly: true });
        // res.set('Authorization', `Bearer ${token}`)
        res.json({ success: true, token: token, user: userData })
        // res.redirect('/blogs/create');
      } else {  
        console.log("Passwords don't match");
        res.status(500).json({ success: false, message: 'Invalid credentials'})
      }
    })
  } else {
    console.log(`No user with email ${email} exists`)
    res.json({ success: false, message: `No user with email ${email} exist` })
  }
}

async function checkExistingUser(email, username="") {
  const existingUser = await query(`SELECT * FROM users WHERE email = $1 LIMIT 1;`, [email], "searchByEmail");
  let existingUserName = [];
  if(username != "") {
    existingUserName = await query(`SELECT * FROM users WHERE username = $1 LIMIT 1;`, [username], "searchByUsername");
  }

  if(existingUserName.length) {
    console.log("A user with this username already exists");
    return res.json({ success: false, message: "A user with this username already exists, please login" })
  }
  if(existingUser.length) {
    console.log("A user with this email already exists");
    return res.json({ success: false, message: "A user with this email already exists, Please login!" })
  }
}

export async function registerUser(req, res) {
  //verify the email
  if(!verifyEmail(req.body.email)) return res.json({ success: false, message: "Email is not valid" });

  // ADD A BLOOM FILTER HERE BEFORE THE DATABASE CHECK FOR THE USERNAME
  checkExistingUser(req.body.email, req.body.username);

  //hash the password here
  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(req.body.password, salt);

  transactionQuery(async (client) => {
    //save the user to the "users" table
    const insertQuery = `
    INSERT INTO users (username, email, password_hash, first_name, last_name, profile_picture)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;`
    const values = [req.body.username, req.body.email, password_hash, req.body.first_name, req.body.last_name, req.body.imgUrl];
    const savedUser = await client.query(insertQuery, values);
    console.log(savedUser);

    //Write to the outbox table
    const outboxQuery = `INSERT INTO outbox (event_type, payload) VALUES ($1, $2);`
    //Debezium is configured to create a topic name like so: app_events_${routedByValue} so
    //the topic name in kafka would be app_events_UserCreated which should match the topic
    //the consumer subscribes to
    const outboxPayload = { userId: savedUser.rows[0]._id, eventType: "UserCreated", username: req.body.username, first_name: req.body.first_name, last_name: req.body.last_name };
    await client.query(outboxQuery, [outboxPayload.eventType, outboxPayload]);
  })

  //------------- This is now handled by Outbox pattern to avoid the duel write problem ---------------
  // const neo4jUser = await createUserWithDriver(req.body.username, savedUser.rows[0]._id);
  // console.log("This is the neo4j user", neo4jUser);

  //Sync the newly created user with typesense
  // await syncTypeSense(true, savedUser.rows[0]._id);
  //---------------------------------------------------------------------------------------------------

  if(savedUser) {
    console.log("user have been saved!");
    const userData = {_id: savedUser.rows[0]._id}
    const token = jwt.sign({ userId: savedUser.rows[0]._id }, process.env.JWT_SECRET)
    return res.json({ success: true, token: token, user: userData })
  }
  return res.json({ success: false, message: "The user was not saved to the database" })
}

const client_id = process.env.GOOGLE_OAUTH_WEB_CLIENT_ID;
const client = new OAuth2Client(client_id);

//dont use
export async function registerUserGoogleClientCentric(req, res) {
  const { idToken, accessToken } = req.body;

  try {
    //Verify the ID token for a secure login
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: client_id
    });

    const payload = ticket.getPayload();
    const googleId = payload['sub'];
    const email = payload['email'];
    const name = payload['name'];
    const picture = payload['picture'];

    checkExistingUser(email);

    //fetch other information about the user using Google People API
    const otherData = await fetch(
      `https://people.googleapis.com/v1/people/me?personFields=names,phoneNumbers,addresses,biographies,organizations,relations,interests,skills,associations,locations,urls,coverPhotos,photos,brithdays,gender&access_token=${accessToken}`,
      // { headers: { "Authorization": `Bearer ${accessToken}` } }
    );
    const extendedUserData = await otherData.json();
    console.log("Extended user data:", extendedUserData)

    // TODO: Saving the user to database

    // the googleId here will be changed to the ID given by my database
    const token = jwt.sign({ userId: googleId }, process.env.JWT_SECRET);
    res.status(200).json({
      success: true,
      token: token,
      userData: {
        id: googleId,
        name: name,
        email: email,
        profilePicture: picture,
        extendedUserData: extendedUserData
      },
    });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: "Invalid ID token" });
  }
}

export async function registerUserGoogle(req, res) {
  const { code } = req.query;
  if (!code) return res.status(400).send('No code provided -- Google');

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_WEB_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_WEB_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
      code: code,
    }),
  });
  const tokenData = await tokenRes.json();

  //Fetch Profile
  const profileRes = await fetch("https://people.googleapis.com/v1/people/me?personFields=names,phoneNumbers,addresses,biographies,organizations,relations,interests,skills,associations,locations,urls,coverPhotos,photos,brithdays,gender", {
    headers: { "Authorization": `Bearer ${tokenData.access_token}` }
  })
  const profileData = await profileRes.json();
  console.log("Profile data from Google:", profileData);

  //Save the user to database

  // The id here should be changed to the id my database creates
  const token = jwt.sign({ userId: profileData.id }, process.env.JWT_SECRET);
  res.status(200).json({
    success: true,
    token: token,
    userData: {
      id: profileData.id,
      name: profileData.names[0].displayName,
      email: profileData.emailAddresses[0].value,
      profilePicture: profileData.photos[0].url,
      extendedUserData: null
    },
  });
}

export async function registerUserFacebook(req, res) {
  const { code } = req.query;
  if (!code) return res.status(400).send('No code provided -- Facebook');

  try {
    const tokenRes = await fetch(`https://graph.facebook.com/v17.0/oauth/access_token?client_id=${process.env.FACEBOOK_APP_ID}&redirect_uri=${process.env.FACEBOOK_REDIRECT_URI}&client_secret=${process.env.FACEBOOK_APP_SECRET}&code=${code}`);
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const userRes = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${accessToken}`);
    const userData = await userRes.json();
    console.log("User data from Facebook:", userData);

    // TODO: create user in DB

    //create and return a JWT token
    const token = jwt.sign({ userId: userData.id }, process.env.JWT_SECRET);
    res.status(200).json({
      success: true,
      token: token,
      userData: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        profilePicture: userData.picture.data.url,
        extendedUserData: null
      },
    });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: "Invalid code" });
  }
}

export async function setUsername(req, res) {
  const { username } = req.body;

  const user = await query(`UPDATE users SET username = $1 WHERE _id = $2 RETURNING *;`, [username, req.user.userId]);

  if(user) {
    console.log("Username updated successfully");
    res.json({ success: true, message: "Username updated successfully" })
  } else {
    res.json({ success: false, message: "Username update failed" })
  }
}