import 'dotenv/config.js';
import neo4j from 'neo4j-driver';
import { OGM } from '@neo4j/graphql-ogm';

const typeDefs = `
  type User {
    _id: ID! @id
    username: String! @unique
    createdAt: DateTime! @timestamp(operations: [CREATE])
  }
`;

//Establish Neo4j connection
export const neo4jDriver = neo4j.driver(process.env.NEO4J_URI, neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD), {maxConnectionPoolSize: 100,connectionTimeout: 30000});
export const ogm = new OGM({ typeDefs, neo4jDriver });
await ogm.init();

/**
 * Execute a raw Cypher query with parameters. User this function for complex queries
 * @param {string} queryStr - Raw Cypher Query
 * @param {object} params - Query parameters
 * @param {string} name - Name of the query
 * @returns {Promise<object[]>} Query result
 */
export async function neo4jQuery(queryStr, params = {}, name="default") {
  const session = neo4jDriver.session();
  try {
    const result = await session.run(queryStr, params);
    return result.records;
  } catch(err) {
    console.error("Neo4j Error on the query " + name + ":", err);
    return [];
  } finally {
    await session.close();
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