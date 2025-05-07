import 'dotenv/config.js'
import TypeSense from 'typesense';
import { query } from './pgFuncs.js';

let client = new TypeSense.Client({
  'nodes': [{
    'host': 'localhost',
    'port': 8108,
    'protocol': 'http'
  }],
  'apiKey': process.env.TYPESENSE_ADMIN_API_KEY,
  'cacheSearchResultsForSeconds': 5
});

const usersSchema = {
  name: 'users',
  fields: [
    { name: '_id', type: 'string' },
    { name: 'username', type: 'string', facet: true },
    { name: 'first_name', type: 'string', facet: true },
    { name: 'last_name', type: 'string', facet: true },
    { name: 'created_at', type: 'int64' }
  ]
};

await client.collections().create(usersSchema);

async function syncUsers() {
  console.log("SYNC USERS IS RUNNING!!!!!!!");
  const { rows } = await query('SELECT _id, username, email, created_at FROM users;', [], "getTypesenseData");
  
  // await client.collections('users').documents().import(
  //   rows.map(user => ({
  //     _id: user._id.toString(),
  //     username: user.username.toString(),
  //     first_name: user.first_name.toString(),
  //     last_name: user.last_name.toString(),
  //     created_at: Math.floor(new Date(user.created_at)/1000)
  //   }))
  // );
  await Promise.all(users.map(indexUser));
}

await syncUsers();

export async function search(collection, query, query_by, filterBy, per_page = 10) {
  return client.collections(collection).documents().search({
    q: query,
    query_by: query_by,
    filter_by: filterBy,
    per_page: per_page
  })
}

export const indexUser = async (user) => {
  return typesense.collections('users')
    .documents()
    .upsert({
      id: user.id.toString(),
      name: user.name,
      email: user.email,
      bio: user.bio,
      created_at: Math.floor(new Date(user.created_at)/1000)
    });
};