import express from 'express';
// import { search } from '../../utils/typesenseUtils';
import { search } from '../../dbFuncs/typesenseFuncs.js';
const router = express.Router();

router.get("/search", async (req, res) => {
  try {
    const result = await search(
      'users', //Collection name
      req.query.q, //query term
      "username,first_name,last_name", //query_by
      req.query.filters //filters
    );

    console.log("THESE ARE THE SEARCH RESULTS:", result);

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/sync-users', async (req, res) => {
  await syncAllUsers();
  res.json({ status: 'sync completed' });
});

export default router;