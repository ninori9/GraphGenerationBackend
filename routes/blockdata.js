var express = require('express');
const fs = require('fs');
const { exec, execSync } = require("child_process");

var router = express.Router();

/* Endpoint to get parsed data for graph generation from blockchain */
router.get('/graphGeneration', function(req, res, next) {
    // Check whether block parameters are valid
    if(req.query.startblock < 0 || res.query.endblock - req.query.startblock > 5 || res.query.endblock < req.query.startblock) {
        res.status(406).json({error: 'invalid block parameters.'});
        return;
    }

    const d = new Date();
    // Directory name (blocks, data, time)
    const directory = `b${req.query.startblock}_${req.query.endblock}d${d.getMonth()}_${d.getDay()}_${d.getFullYear()}t${d.getHours()}_${d.getMinutes()}_${d.getSeconds()}_${d.getMilliseconds()}`;

    console.log('Created directory', directory);

    execSync('sudo chmod +x  ./blockchain_data/logExtraction.sh');
    console.log('Changed permissions of extraction script');
    execSync( `sh ./blockchain_data/logExtraction.sh ${req.query.startblock} ${req.query.endblock} ${directory}`, { stdio: 'ignore' });

    console.log('Executed shell script');

    // Get files in directory (this is needed as specified blocks might not all be part of blockchain)
    const directoryContents = fs.readdirSync(`./blockchain_data/log_store/${directory}`);
    console.log('directoryContents: ', directoryContents);

    let accTransactions = [];

    for(let i = 0; i<directoryContents.length; i++) {
        const rawBlockData = fs.readFileSync(`../blockchain_data/log_store/${directory}/${directoryContents[i]}`);
        const parsedBlock = JSON.parse(rawBlockData);

        accTransactions = accTransactions.concat(parsedBlock.transactions);
    }

    // TODO: delete files and directory

    // edges = createConflictGraph(accTransactions);
    // attributes = generateAttributes(edges, accTransactions);

    res.send(accTransactions);
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
