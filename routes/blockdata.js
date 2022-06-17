var express = require('express');
const fs = require('fs');
const { exec, execSync } = require("child_process");
const { routes } = require('../app');

var router = express.Router();

/* Endpoint to get parsed data for graph generation from blockchain */
router.get('/graphGeneration', function(req, res, next) {
    // Check whether block parameters are valid
    if(req.query.startblock < 0 || req.query.endblock - req.query.startblock > 5 || req.query.endblock < req.query.startblock) {
        res.status(406).json({error: 'invalid block parameters.'});
        return;
    }

    const d = new Date();
    // Directory name (blocks, data, time)
    const directory = `b${req.query.startblock}_${req.query.endblock}d${d.getMonth()}_${d.getDay()}_${d.getFullYear()}t${d.getHours()}_${d.getMinutes()}_${d.getSeconds()}_${d.getMilliseconds()}`;
    console.log('Directory name', directory);

    execSync('sudo chmod +x  ./blockchain_data/logExtraction.sh');
    console.log('Changed permissions of extraction script');

    execSync( `sh ./blockchain_data/logExtraction.sh ${req.query.startblock} ${req.query.endblock} ${directory}`, { stdio: 'ignore' });
    console.log('Executed shell script');

    // Get files in directory (this is needed as specified blocks might not all be part of blockchain)
    const directoryContents = fs.readdirSync(`./blockchain_data/log_store/${directory}`);
    console.log('directoryContents: ', directoryContents);

    // Accumulate all transactions in one array to enable determining conflict graph and attributes
    let accTransactions = [];

    for(let i = 0; i<directoryContents.length; i++) {
        const rawBlockData = fs.readFileSync(`./blockchain_data/log_store/${directory}/${directoryContents[i]}`);
        const parsedBlock = JSON.parse(rawBlockData);

        accTransactions = accTransactions.concat(parsedBlock.transactions);
    }

    // Delete directory and contained json files 
    exec(`rm -r ./blockchain_data/log_store/${directory}`);

    // edges = createConflictGraph(accTransactions);
    // attributes = generateAttributes(edges, accTransactions);

    res.send(accTransactions);
});


function createConflictGraph(transactions) {
    /* NOTE: transactions is an array of sorted transaction objects
    This method also returns the amount of conflicts leading to conflicts, and the amount of failures of each type */

    const edges = [];
    const failureAmounts = Map();
    let totalFailures = 0;
    let conflictsLeadingToFailure = 0;

    const keyMap = Map();

    // For all transactions
    for(let i=0; i<transactions.length; i++) {
        const tx = transactions[i];

        // If transaction fails, add failure amounts
        if(tx.status !== 0) {
            totalFailures++;
            failureAmounts.set(tx.status, failureAmounts.get(tx.status) + 1 || 1);
        }

        // Exclude CONFIG transactions as they never have an edge
        if(tx.typeString !== 'CONFIG') {
            // Create list of all ns_rwsets to consider (have to match tx chaincode, no system chaincodes)
            let tx_rw_sets = [];
            for(let j=0; j<tx.rw_set.length; j++) {
                if(tx.rw_set[j].namespace === tx.chaincode_spec.chaincode_id) {
                    tx_rw_sets.push(tx.rw_set);
                }
            }
            // Create combined rw_set create keyMap entry and check for edges
            const combined_rw_set = [];
            // Set used for quickly checking whether key already in combined_rw_set
            const rw_set_keys = Set();

            for(let j=0; j<tx_rw_sets.length; j++) {
                // Add reads
                for(let k=0; k<tx_rw_sets[j].reads.length; k++) {
                    const read = tx_rw_sets[j].reads[k];
                    rw_set_keys.add(read.key);
                    combined_rw_set.push(
                        {
                            key: read.key,
                            read: true,
                            read_version: read.version,
                            write: false,
                            write_version: null,
                        }
                    );
                }
                // Add range reads
                for(let rr=0; rr<tx_rw_sets[j].range_queries_info.length; rr++) {
                    const range_read_reads = tx_rw_sets[j].range_queries_info[rr].raw_reads.kv_reads;
                    for(let k=0; k<range_read_reads.length; k++) {
                        // NOTE: It is assumed that if key is read in range read and normal read (which will likely not happen), that same version is read
                        if(! rw_set_keys.has(range_read_reads[k].key)) {
                            rw_set_keys.add(range_read_reads[k].key);
                            combined_rw_set.push(
                                {
                                    key: range_read_reads[k].key,
                                    read: true,
                                    read_version: range_read_reads[k].version,
                                    write: false,
                                    write_version: null,                                        
                                }
                            );
                        }
                    }
                }
                // Add writes
                for(let k=0; k<tx_rw_sets[j].writes.length; k++) {
                    const write = tx_rw_sets[j].writes[k];
                    // If key already in combined set, modify so that write true and add write version
                    if(rw_set_keys.has(write.key)) {
                        const index = combined_rw_set.indexOf(entry => entry.key === write.key);
                        combined_rw_set[index].write = true;
                        combined_rw_set[index].write_version = {
                            block_num: tx.block_number,
                            tx_num: tx.tx_number,
                        };
                    }
                    else {
                        rw_set_keys.add(write.key);
                        combined_rw_set.push(
                            {
                                key: write.key,
                                read: false,
                                read_version: null,
                                write: true,
                                write_version: {
                                    block_num: tx.block_number,
                                    tx_num: tx.tx_number,
                                }
                            }
                        );
                    }
                }
            }
            // For all keys of combined rw_set of transaction, create keyMap entry and possibly check for edges
            for(let j=0; j<combined_rw_set.length; j++) {

                // If key already in keyMap search for conflicts
                if(keyMap.has(combined_rw_set[j].key)) {
                
                    // If transaction is a failed read transaction, search for reason (prior write) and add edge
                    if(combined_rw_set[j].read && tx.status !== 0) {
                        // Entry at key is conflicting if there exists a prior write transaction and its write_version is bigger than read version of tx
                        const conflicting_entries = keyMap.get(combined_rw_set[j].key).filter(entry => entry.write &&
                            (entry.write_version.block_num > combined_rw_set[j].read_version.block_num || entry.write_version.block_num === combined_rw_set[j].read_version.block_num && entry.write_version.tx_num > combined_rw_set[j].read_version.tx_num)
                        );
                        // Add an edge for all conflicting entries
                        for(let c=0; c<conflicting_entries.length; c++) {
                            conflictsLeadingToFailure++;
                            edges.add(
                                {
                                    from: conflicting_entries[c].tx,
                                    to: tx.tx_number,
                                    key_overlap: combined_rw_set[j].key,
                                    reason_for_failure: true,
                                }
                            );
                        }
                    }
                    // If write, search for preceding reads accessing the same key
                    if(combined_rw_set[j].write) {
                        const conflicting_entries = keyMap.get(combined_rw_set[j].key).filter(entry => entry.read === true);
                        for(let c=0; c<conflicting_entries.length; c++) {
                            edges.add(
                                {
                                    from: tx.tx_number,
                                    to: conflicting_entries[c].tx,
                                    key_overlap: combined_rw_set[j].key,
                                    reason_for_failure: false,
                                }
                            );
                        }
                    }
                    // Add transaction to keyMap
                    keyMap.get(combined_rw_set[j].key).push(
                        {
                            tx: tx.tx_number,
                            read: combined_rw_set[j].read,
                            read_version: combined_rw_set[j].read_version,
                            write: combined_rw_set[j].write,
                            write_version: combined_rw_set[j].write_version,
                        }
                    );
                }
                // Else if no entry at key, there can't be a edge, so just add transaction to keyMap
                else {
                    // If key not in map create array for key and add entry
                    keyMap.set(combined_rw_set[j].key, [
                        {
                            tx: tx.tx_number,
                            read: combined_rw_set[j].read,
                            read_version: combined_rw_set[j].read_version,
                            write: combined_rw_set[j].write,
                            write_version: combined_rw_set[j].write_version,
                        }
                    ]);
                }
            }
        }
    }

    // Parse failure type amounts
    const parsedFailureAmounts = [];
    for(failureStatusAmount in failureAmounts) {
        parsedFailureAmounts.push(failureAmounts);
    }

    return {
        edges: edges,
        attributes: {
            totalFailures: totalFailures,
            conflictsLeadingToFailure: conflictsLeadingToFailure,
            failureAmounts: parsedFailureAmounts
        }
    }
}


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
