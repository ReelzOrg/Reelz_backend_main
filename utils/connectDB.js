import 'dotenv/config.js'
import pgsql from 'pg';

import { OGM } from '@neo4j/graphql-ogm';
import neo4j from 'neo4j-driver';

const typeDefs = `
  type User {
    _id: ID! @id
    username: String! @unique
    createdAt: DateTime! @timestamp(operations: [CREATE])
  }
`;

const pool = new pgsql.Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: parseInt(process.env.POSTGRES_PORT || "5432"), // Default PostgreSQL port
});

//Establish Neo4j connection
export const driver = neo4j.driver(process.env.NEO4J_URI, neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD), /*{maxConnectionPoolSize: 100,connectionTimeout: 30000}*/);
export const ogm = new OGM({ typeDefs, driver });
await ogm.init();

export async function query(queryStr, params, name="default") {
  try {
    const start = Date.now();
    const result = await pool.query(queryStr, params);
    const duration = Date.now() - start;
    console.log(`Query ${name} executed in ${duration}ms`);
    return result.rows;
  } catch(err) {
    console.error(`Database query error(${name}):`, err);
  }
}

export async function closePool() {
  try {
    await pool.end();
    console.log("PostgreSQL connection pool closed.");
  } catch (error) {
    console.error("Error closing pool:", error);
  }
};


/**
 * Execute a raw Cypher query with parameters. User this function for complex queries
 * @param {string} queryStr - Raw Cypher Query
 * @param {object} params - Query parameters
 * @param {string} name - Name of the query
 * @returns {Promise<object[]>} Query result
 */
export async function neo4jQuery(queryStr, params = {}, name="default") {
  const session = driver.session();
  try {
    const result = await session.run(queryStr, params);
    return result.records;
  } catch(err) {
    console.error("Neo4j Error on the query " + name + ":", err);
  }
}

/**
 * This function creates a new user node with the **ogm module**
 * @param {string} username - Username of the user
 * @returns The node created in neo4j for the user
 */
export async function createNeo4jUserNode(username) {
  try {
    const User = ogm.model("User");
    const { users } = await User.create({ input: [{ username }] });
    return users[0];
  } catch (err) {
    console.error("OGM User Creation Error:", err);
  }
}

/**
 * This function creates a new user node with the **driver module**
 * @param {string} username - Username of the user
 * @returns the created user node
 */
export async function createUserWithDriver(username, _id) {
  const query = `
    CREATE (u:User {
      _id: ${_id},
      username: ${username},
      createdAt: datetime()
    })
    RETURN u
  `;
  const result = await neo4jQuery(query, { username });
  return result[0].u.properties;
}