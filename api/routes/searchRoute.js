import express from 'express';
// import { search } from '../../utils/typesenseUtils';
import { searchTypeSense } from '../../dbFuncs/typesenseFuncs.js';
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const result = await searchTypeSense(
      'users', //Collection name
      req.query.searchTerm, //search term
      "username,first_name,last_name", //query_by
      req.query.filters || "" //filters
    );

    // console.log("THESE ARE THE SEARCH RESULTS:", result.hits.map(hit => hit.document));
    console.log("The typesense search took this much time: ", result.search_time_ms)
    
    res.json(result.hits.map(hit => hit.document));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;