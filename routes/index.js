var express = require('express');
var router = express.Router();

/* Basic endpoint. Can be used to query status of backend */
router.get('/', function(req, res, next) {
  res.status(200).send("Backend running.");
});

module.exports = router;
