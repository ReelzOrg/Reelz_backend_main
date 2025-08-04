import 'dotenv/config.js'
import pgsql from 'pg';

const pool = new pgsql.Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: parseInt(process.env.POSTGRES_PORT || "5432"), // Default PostgreSQL port
});

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
 * Makes a transaction queries to execute multiple queries at the same time
 * @param {Function} callback - An async function that receives the client and executes the specific queries
 */
export async function transactionQuery(callback) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await callback(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.log("There was ana error in the transaction", error);
  } finally {
    client.release();
  }
}