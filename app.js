import 'dotenv/config.js'
import express from 'express';

import bodyParser from 'body-parser';
import cors from 'cors';

import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { query, closePool } from './utils/connectDB.js';

import { authRouter, uploadRouter, userDataRouter } from './api/routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT_NUM || 5000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors({origin:'*'}));
app.set("view engine", "ejs");
app.set('views', path.join(__dirname, 'views')); // Set the views directory
app.use(bodyParser.urlencoded({extended: true}));

app.use("/api/auth", authRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/user", userDataRouter);

app.get("/", async (req, res) => {
  //fetch all the latests posts and storise by users following list
  const result = await query("SELECT * FROM users");
  res.json({users: result.rows && result.rows[0]})
});


// Serve static files from the 'public' directory
// app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log("Server started on port: " + PORT);
});

// Close the connection pool when the server shuts down
async function shutDownServer() {
  console.log("The server is shutting down");
  await closePool();
}

process.on('SIGINT' | 'SIGTERM', shutDownServer);