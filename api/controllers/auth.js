import 'dotenv/config.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

import { createUserWithDriver, query } from '../../utils/connectDB.js';
import { verifyEmail } from '../../utils.js';

export async function loginUser(req, res) {
  const { email, password } = req.body;
  
  //get the user
  const getUserQuery = `SELECT * FROM users WHERE email = $1 LIMIT 1;`;
  const user = await query(getUserQuery, [email]);

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

export async function registerUser(req, res) {
  //look for the user in the database.
  const existingUser = await query(`SELECT * FROM users WHERE email = $1 LIMIT 1;`, [req.body.email], "searchByEmail");
  const existingUserName = await query(`SELECT * FROM users WHERE username = $1 LIMIT 1;`, [req.body.username], "searchByUsername");

  if(existingUserName.length) {
    console.log("A user with this username already exists");
    return res.json({ success: false, message: "A user with this username already exists, please login" })
  }
  if(existingUser.length) {
    console.log("A user with this email already exists");
    return res.json({ success: false, message: "A user with this email already exists, Please login!" })
  }

  //verify the email
  if(!verifyEmail(req.body.email)) return res.json({ success: false, message: "Email is not valid" })

  //hash the password here
  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(req.body.password, salt);

  //save the user to the database
  const insertQuery = `
  INSERT INTO users (username, email, password_hash, first_name, last_name, profile_picture)
  VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING *;`
  const values = [req.body.username, req.body.email, password_hash, req.body.first_name, req.body.last_name, req.body.imgUrl];
  const savedUser = await query(insertQuery, values, "insertUser");
  console.log(savedUser);

  //also create a node in the NEO4J database
  const neo4jUser = await createUserWithDriver(req.body.username, savedUser[0]._id);
  console.log("This is the neo4j user", neo4jUser);

  //creating a user in postgresql is more important
  if(savedUser) {
    console.log("user have been saved!");
    const userData = {_id: savedUser[0]._id}
    const token = jwt.sign({ userId: savedUser[0]._id }, process.env.JWT_SECRET)
    res.json({ success: true, token: token, user: userData })
  } else {
    res.json({ success: false, message: "The user was not saved to the database" })
  }
}