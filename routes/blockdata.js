var express = require('express');
const { exec, execSync } = require("child_process");

var router = express.Router();

/* Endpoint to get parsed data for graph generation from blockchain */
router.get('/graphGeneration', function(req, res, next) {
    const d = new Date();
    const directory = `blocks${req.query.startblock}${req.query.endblock}${d.getMonth()}${d.getDay()}${d.getFullYear()}${d.getHours()}${d.getMinutes()}${d.getSeconds()}${d.getMilliseconds()}`;

    console.log('directory', directory);

    console.log('Executed pwd');
    execSync('sudo chmod +x  ./routes/logExtraction.sh');
    console.log('Changed permissions of extraction script');
    execSync( `sh ./routes/logExtraction.sh ${req.query.startblock} ${req.query.endblock} ${directory}`, { stdio: 'ignore' });
    console.log('Should have executed shell script');

    res.send('Placeholder response');
});


/* Endpoint sends example data, can be used for testing purposes */
router.get('/exampleData', function(req, res, next) {
  // Simulate delay by adding timeout
  setTimeout(() => {
    res.send(
        {
        attributes: {
            startblock: req.query.startblock,
            endblock: req.query.endblock,
            serializable: true,
            abort: 1,
            conflicts: 5,
            transactions: 5,
            successful: 4,
            failed: 1
        },
        edges: [
            { from: 1, to: 2 },
            { from: 1, to: 3 },
            { from: 2, to: 4 },
            { from: 2, to: 5 },
            { from: 5, to: 2},
        ],
        transactions: [
            {
                tx_number: 1,
                tx_id: "6ff26d6a450237dab6ebfda8a6b75d9f8d21f7d4d723788920d7c18097e8fa8a",
                block_number: 2,
                status: 0,
                rw_set: {
                    reads: [
                        {
                            key: "1009",
                            version: {
                                block_num: 6,
                                tx_num: "296"
                            }
                        }
                    ],
                    range_queries_info: [],
                    writes: [],
                }
            },
            {
                tx_number: 2,
                tx_id: "c9a99a620feac0fd7ef44f4050a3a1f9dda85efa26ee8995eb4b5d9a3afa7d1d",
                block_number: 3,
                status: 0,
                rw_set: {
                    reads: [
                        {
                            key: "1010",
                            version: {
                                block_num: 6,
                                tx_num: "297"
                            }
                        }
                    ],
                    range_queries_info: [],
                    writes: [],
                }
            },
            {
                tx_number: 3,
                tx_id: "pl10a620feac0fd7ef44f4050a3a1f9dda85efa26ee8995eb4b5d9a3afa7d1d",
                block_number: 4,
                status: 0,
                rw_set: {
                    reads: [
                        {
                            key: "1000",
                            version: {
                                block_num: 6,
                                tx_num: "297"
                            }
                        }
                    ],
                    range_queries_info: [],
                    writes: [],
                }
            },
            {
                tx_number: 4,
                tx_id: "f1o23a620feac0fd7ef44f4050a3a1f9dda85efa26ee8995eb4b5d9a3afa7d1d",
                block_number: 6,
                status: 0,
                rw_set: {
                    reads: [
                        {
                            key: "999",
                            version: {
                                block_num: 6,
                                tx_num: "297"
                            }
                        }
                    ],
                    range_queries_info: [],
                    writes: [],
                }
            },
            {
                tx_number: 5,
                tx_id: "d8a99a620feac0fd7ef44f4050a3a1f9dda85efa26ee8995eb4b5d9a3afa7d1d",
                block_number: 8,
                status: 11,
                rw_set: {
                    reads: [
                        {
                            key: "999",
                            version: {
                                block_num: 6,
                                tx_num: "297"
                            }
                        }
                    ],
                    range_queries_info: [],
                    writes: [],
                }
            },
        ],
        },
    );
  }, 1000);
});
  
module.exports = router;
