import 'dotenv/config.js'
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { pinoHttp } from 'pino-http';

import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { authRouter, userDataRouter, searchRouter, chatRouter, postRouter } from './api/routes/index.js';
import { KafkaProducerManager } from './utils/kafka/kafkaUtils.js';
import { query, closePool } from './dbFuncs/pgFuncs.js';
import { initTypesense, syncTypeSense, typeSenseKeepAlive } from './dbFuncs/typesenseFuncs.js';
import { neo4jDriver } from './dbFuncs/neo4jFuncs.js';
import logger from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT_NUM || 5000;

app.use(pinoHttp({ logger }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors({origin:'*'}));
// app.set("view engine", "ejs");
// app.set('views', path.join(__dirname, 'views')); // Set the views directory
app.use(bodyParser.urlencoded({extended: true}));

app.use("/api/auth", authRouter);
app.use("/api/user", userDataRouter);
app.use("/api/llm", chatRouter);
app.use("/api/search", searchRouter);
app.use("/api/posts", postRouter);

//TypeSence Functions ---------------------------
// await initTypesense();
// await syncTypeSense();

// if(process.env.NODE_ENV == "production") {
//   setInterval(syncTypeSense, 60 * 60 * 1000); // Hourly
// }
// ----------------------------------------------

app.get("/", async (req, res) => {
  //fetch all the latests posts and storise by users following list
  req.log.info("[TEST] - Fetching all users");
  const result = await query("SELECT * FROM users");
  res.json(result)
});


// Serve static files from the 'public' directory
// app.use(express.static(path.join(__dirname, 'public')));

const server = app.listen(PORT, () => {
  console.success("Server started on port: " + PORT);
});

// Clear all the resources when the server shuts down
async function shutDownServer() {
  console.warn("\x1b[33m%s\x1b[0m", "The server is shutting down. Cleaning up all the resources...");

  await KafkaProducerManager.shutdownAll();
  await closePool();
  await neo4jDriver.close();
  console.success("Neo4j pool closed successfully.");

  typeSenseKeepAlive.destroy()
  console.success("Typesense keep alive destroyed successfully.")

  server.close(() => {
    logger.info("Server has been shut down successfully.");
    process.exit(0);
  });
}

process.on('SIGINT', shutDownServer);
process.on('SIGTERM', shutDownServer);