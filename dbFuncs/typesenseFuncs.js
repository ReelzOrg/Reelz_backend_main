import 'dotenv/config.js'
import TypeSense from 'typesense';
import http from 'http';

import { query } from './pgFuncs.js';

export const typeSenseKeepAlive = new http.Agent({ keepAlive: true, /* keepAliveMsecs: 1000 default */ });

const client = new TypeSense.Client({
  'nodes': [{
    'host': 'localhost',
    'port': 8108,
    'protocol': 'http',
  }],
  'apiKey': process.env.TYPESENSE_ADMIN_API_KEY,
  'cacheSearchResultsForSeconds': 5,
  'httpAgent': typeSenseKeepAlive
});

//TODO: change the id to _id
const usersSchema = {
  name: 'users',
  fields: [
    { name: 'id', type: 'string', facet: false },
    { name: 'username', type: 'string', facet: false },
    { name: 'first_name', type: 'string', facet: false },
    { name: 'last_name', type: 'string', facet: false },
    { name: 'created_at', type: 'int64' }
  ]
};

// Initialize Typesense
export const initTypesense = async () => {
  try {
    const data = await client.collections().create(usersSchema);
    console.log('Typesense collection created');
  } catch (e) {
    if (!e.message.includes('exists')) throw e;
  }
};

async function ensureCollection(collectionName, collectionSchema) {
  try {
    let x = await client.collections(collectionName).retrieve();
    console.log(collectionName + ' collection found');
    console.log(x.num_documents);
  } catch (error) {
    if (error.httpStatus === 404) {
      console.log(collectionName + ' collection not found, creating...');
      await client.collections().create(collectionSchema);
      console.log('Created the ' + collectionName + ' collection');
    } else {
      throw error;
    }
  }
}

export async function syncTypeSense(syncSingleUser = false, id = "") {
  // const y = await client.collections('users').delete();
  // console.log(y);
  await ensureCollection('users', usersSchema);
  // const x = await client.collections('users').documents().search({
  //   q: "*",
  //   per_page: 1
  // });
  // console.log("The number of users", x.hits.map((doc) => doc));
  // console.log("SYNC USERS IS RUNNING!!!!!!!");
  let result = syncSingleUser
  ? await query('SELECT _id, username, first_name, last_name, created_at FROM users WHERE _id = $1', [id], "syncSingleUser")
  : await query('SELECT _id, username, first_name, last_name, created_at FROM users;', [], "syncAllUsers")
  
  await client.collections('users').documents().import(
    result.map(user => ({
      id: user._id.toString(),
      username: user.username.toString(),
      first_name: user.first_name.toString(),
      last_name: user.last_name.toString(),
      created_at: Math.floor(new Date(user.created_at)/1000)
    })),
    { action: 'upsert' }  // Update existing records
  );
  // await Promise.all(users.map(indexUser));
}

// await syncAllUsers();

export async function searchTypeSense(collection, query, query_by, filterBy, per_page = 10) {
  return client.collections(collection).documents().search({
    q: query,
    query_by: query_by,
    prefix: true,
    filter_by: filterBy,
    per_page: per_page,
    min_len_1typo: 3
  })
}

// export const indexUser = async (user) => {
//   return client.collections('users')
//     .documents()
//     .upsert({
//       id: user.id.toString(),
//       name: user.name,
//       email: user.email,
//       bio: user.bio,
//       created_at: Math.floor(new Date(user.created_at)/1000)
//     });
// };