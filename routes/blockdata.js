var express = require('express');
const fs = require('fs');
const { exec, execSync } = require("child_process");
var findCircuits = require("elementary-circuits-directed-graph"); 

var router = express.Router();

/* Endpoint to get parsed data for graph generation from blockchain */
router.get('/graphGeneration', function(req, res, next) {
    console.log('startblock', req.query.startblock);
    console.log('endblock', req.query.endblock);
    console.log(req.query.endblock - req.query.startblock);
    console.log(req.query.endblock < req.query.startblock);

    // Check whether block parameters are valid
    if(req.query.startblock === undefined || req.query.endblock === undefined || req.query.startblock < 0 || req.query.endblock - req.query.startblock > 5 || req.query.endblock - req.query.startblock < 0) {
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

    console.log('Amount of transactions', accTransactions.length);

    const graphAndAttributes = createConflictGraph(accTransactions);
    const serializabilityAttributes = serializabilityCheck(graphAndAttributes.attributes.adjacencyList);

    const result = {
        attributes: {
            startblock: req.query.startblock,
            endblock: req.query.endblock,
            serializable: serializabilityAttributes.serializable,
            needToAbort: serializabilityAttributes.abortedTx,
            conflicts: graphAndAttributes.attributes.totalConflicts,
            conflictsLeadingToFailure: graphAndAttributes.attributes.conflictsLeadingToFailure,
            transactions: accTransactions.length,
            totalFailures: graphAndAttributes.attributes.totalFailures,
            failureTypes: graphAndAttributes.attributes.failureAmounts
        },
        transactions: accTransactions,
        edges: graphAndAttributes.edges
    };
    res.send(result);
});

router.get('/ggTest', function(req, res, next) {
    const tx = exampleTransactions();
    const graphAndAttributes = createConflictGraph(tx);
    const serializabilityAttributes = serializabilityCheck(graphAndAttributes.attributes.adjacencyList);

    const result = {
        attributes: {
            startblock: req.query.startblock,
            endblock: req.query.endblock,
            serializable: serializabilityAttributes.serializable,
            needToAbort: serializabilityAttributes.abortedTx,
            conflicts: graphAndAttributes.attributes.totalConflicts,
            conflictsLeadingToFailure: graphAndAttributes.attributes.conflictsLeadingToFailure,
            transactions: tx.length,
            totalFailures: graphAndAttributes.attributes.totalFailures,
            failureTypes: graphAndAttributes.attributes.failureAmounts
        },
        transactions: tx,
        edges: graphAndAttributes.edges
    };

    // Add timeout to simulate fetching blockchain data
    setTimeout(() => {res.send(result);}, 2000);
});


function createConflictGraph(transactions) {
    console.log('Creating conflict graph...');
    /* NOTE: transactions is an array of sorted transaction objects (first has tx_number 0, increased by 1 for each tx)
    This method also returns the amount of conflicts leading to conflicts, and the amount of failures of each type */

    const edges = [];
    let current_edge_number = 0;

    // Adjacency list returned for subsequent serializability check
    const adjacencyList = [];

    const failureAmounts = new Map();
    let totalFailures = 0;

    let totalConflicts = 0;
    let conflictsLeadingToFailure = 0;

    const keyMap = new Map();

    // For all transactions
    for(let i=0; i<transactions.length; i++) {
        const tx = transactions[i];

        adjacencyList.push([]);

        // If transaction fails, add failure amounts
        if(tx.status !== 0) {
            totalFailures++;
            failureAmounts.set(tx.status, failureAmounts.get(tx.status) + 1 || 1);
        }

        // Exclude CONFIG transactions as they never have an edge due to key overlap
        if(tx.typeString !== 'CONFIG') {
            // Create list of all ns_rwsets to consider (have to match tx chaincode, no system chaincodes)
            let tx_rw_sets = [];
            for(let j=0; j<tx.rw_set.length; j++) {
                if(tx.rw_set[j].namespace === tx.chaincode_spec.chaincode_id.name) {
                    tx_rw_sets.push(tx.rw_set[j].rwset);
                }
            }
            // Create combined rw_set create keyMap entry and check for edges
            const combined_rw_set = [];
            // Set used for quickly checking whether key already in combined_rw_set
            const rw_set_keys = new Set();

            for(let j=0; j<tx_rw_sets.length; j++) {
                // Add reads
                for(let k=0; k<tx_rw_sets[j].reads.length; k++) {
                    const read = tx_rw_sets[j].reads[k];
                    rw_set_keys.add(read.key);
                    combined_rw_set.push(
                        {
                            key: read.key,
                            read: true,
                            read_version: {
                                block_num: read.version === null ? 0 : parseInt(read.version.block_num),
                                tx_num: read.version === null ? 0 : parseInt(read.version.tx_num)
                            },
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
                                    read_version: {
                                        block_num: range_read_reads[k].version === null ? 0 : parseInt(range_read_reads[k].version.block_num),
                                        tx_num: range_read_reads[k].version === null ? 0 : parseInt(range_read_reads[k].version.tx_num)
                                    },
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
                        const index = combined_rw_set.findIndex(entry => entry.key === write.key);
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

            // Sets to quickly look up whether a dependency between two transactions is caused by multiple keys
            const addedEdgesFrom = new Set(); const addedEdgesTo = new Set();
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
                            // If an edge form the conflicting transaction to tx already exists due to another key, add this key to key_overlap of edge
                            if(addedEdgesFrom.has(conflicting_entries[c].tx)) {
                                edges[edges.findIndex(edge => edge.from === conflicting_entries[c].tx && edge.to === tx.tx_number)].key_overlap.push(combined_rw_set[j].key);
                            }
                            // Else create new edge
                            else {
                                edges.push(
                                    {
                                        edge_number: current_edge_number,
                                        from: conflicting_entries[c].tx,
                                        to: tx.tx_number,
                                        key_overlap: [combined_rw_set[j].key],
                                        reason_for_failure: true,
                                    }
                                );
                                addedEdgesFrom.add(conflicting_entries[c].tx);
                                adjacencyList[conflicting_entries[c].tx].push(tx.tx_number);
                                current_edge_number++;
                            }
                            totalConflicts++;
                            conflictsLeadingToFailure++;
                        }
                    }
                    // If write, search for preceding reads accessing the same key
                    if(combined_rw_set[j].write) {
                        const conflicting_entries = keyMap.get(combined_rw_set[j].key).filter(entry => entry.read === true);
                        for(let c=0; c<conflicting_entries.length; c++) {
                            // If an edge to the conflicting transaction from tx already exists due to another key, add this key to key_overlap of edge
                            if(addedEdgesTo.has(conflicting_entries[c].tx)) {
                                edges[edges.findIndex(edge => edge.from === tx.tx_number && edge.to === conflicting_entries[c].tx)].key_overlap.push(combined_rw_set[j].key);
                            }
                            // Else create new edge
                            else {
                                edges.push(
                                    {
                                        edge_number: current_edge_number,
                                        from: tx.tx_number,
                                        to: conflicting_entries[c].tx,
                                        key_overlap: [combined_rw_set[j].key],
                                        reason_for_failure: false,
                                    }
                                );
                                addedEdgesTo.add(conflicting_entries[c].tx);
                                adjacencyList[tx.tx_number].push(conflicting_entries[c].tx);
                                current_edge_number++;
                            }
                            totalConflicts++;
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

    console.log('failureAmounts', failureAmounts);
    console.log('adjacencyList', adjacencyList);
    console.log('totalConflicts', totalConflicts);

    // Parse failure type amounts
    const parsedFailureAmounts = [];
    for(failureStatusAmount of failureAmounts) {
        parsedFailureAmounts.push(failureStatusAmount);
    }

    console.log('Created conflict graph!');

    return {
        edges: edges,
        attributes: {
            totalFailures: totalFailures,
            totalConflicts: totalConflicts,
            conflictsLeadingToFailure: conflictsLeadingToFailure,
            failureAmounts: parsedFailureAmounts,
            adjacencyList: adjacencyList,
        }
    }
}


function serializabilityCheck(adjacencyList) {
    console.log('Checking for serializability...');
    let cycles = findCircuits(adjacencyList);

    console.log('Initial cycles', cycles);

    const serializable = ! (cycles !== undefined && cycles.length > 0);
    
    let abortedTx = [];

    while(cycles.length > 0) {

        // Find all transactions involved in cycles
        const txInvolvedInCycles = new Set();
        
        for(let i=0; i<cycles.length; i++) {
            for(let j=0; j<cycles[i].length; j++) {
                txInvolvedInCycles.add(cycles[i][j]);
            }
        }

        // Find transaction involved in the most cycles (should be aborted)
        let maximum = 0; let txToBeAborted = -1;

        txInvolvedInCycles.forEach(tx => {
            let cyclesOfTx = 0;

            // Count cycles tx is involved in
            for(let i=0; i<cycles.length; i++) {
                if(cycles[i].includes(tx)) {
                    cyclesOfTx++;
                }
            }

            // In the case of a tie, the transaction with the highest tx_number should be aborted (ensure deterministic algorithm)
            if(cyclesOfTx > maximum || cyclesOfTx === maximum && tx > txToBeAborted) {
                maximum = cyclesOfTx;
                txToBeAborted = tx;
            }
        });

        abortedTx.push(txToBeAborted);
        console.log('txToBeAborted involved in X cycles', txToBeAborted, maximum);

        cycles = cycles.filter(cycle => (! cycle.includes(txToBeAborted)) );
        console.log('cycles', cycles);
    }

    console.log('Done checking for serializability.');
    console.log('Result', serializable, abortedTx);

    return {
        serializable: serializable,
        abortedTx: abortedTx,
    }
}


function exampleTransactions() { 
    const transactions = [
        {
            tx_number: 0,
            tx_id: "b6b0593e3dcd1818bc2f63fdb21fbc0062610bada76b8472f9b1cc412436ac7f",
            creator: {
                Mspid: "Org1MSP",
                IdBytes: "-----BEGIN CERTIFICATE-----\nMIICBTCCAaugAwIBAgIRALIjogqwdNLqTj93y5OujnowCgYIKoZIzj0EAwIwWzEL\nMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBG\ncmFuY2lzY28xDTALBgNVBAoTBG9yZzExEDAOBgNVBAMTB2NhLm9yZzEwHhcNMjIw\nNjE0MDkyNTAwWhcNMzIwNjExMDkyNTAwWjBeMQswCQYDVQQGEwJVUzETMBEGA1UE\nCBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNU2FuIEZyYW5jaXNjbzENMAsGA1UECxME\ncGVlcjETMBEGA1UEAxMKcGVlcjAub3JnMTBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABIKwAk1B/C+j7Qut/IGg3FDvgCFVYCjxkuDyjUWON0JxtLUI9aU5zxb6PTce\nqmbHadKs47W4g4SAlk+eLvPxWZWjTTBLMA4GA1UdDwEB/wQEAwIHgDAMBgNVHRMB\nAf8EAjAAMCsGA1UdIwQkMCKAIBOvXfL41Zmdp1yoZ/YWZfWd8QR5EwaPf8d5kDNl\nCL/PMAoGCCqGSM49BAMCA0gAMEUCIQCIoLNmcZLi1eqoIszPp8LjTWi0nycRm+Ay\nOht76uxQbAIgSkpx6NE6oIOiMi3fSJ7d5NfhMdLIfn789SmdesUJdzQ=\n-----END CERTIFICATE-----\n"
            },
            class: "Update",
            typeString: "ENDORSER_TRANSACTION",
            block_number: 15,
            tx_block_number: 0,
            rw_set: [
                {
                    namespace: "_lifecycle",
                    rwset: {
                        reads: [
                            {
                                key: "namespaces/fields/simplesupplychain/Sequence",
                                version: {
                                    block_num: "4",
                                    tx_num: "0"
                                }
                            }
                        ],
                        range_queries_info: [],
                        writes: [],
                        metadata_writes: []
                    },
                    collection_hashed_rwset: []
                },
                {
                    namespace: "simplesupplychain",
                    rwset: {
                        reads: [
                            {
                                key: "0",
                                version: {
                                    block_num: "10",
                                    tx_num: "202"
                                }
                            },
                            {
                                key: "1",
                                version: {
                                    block_num: "11",
                                    tx_num: "20"
                                }
                            },
                        ],
                        range_queries_info: [],
                        writes: [
                            {
                                key: "2",
                                is_delete: false,
                                value: "{\"id\":\"1107\",\"date\":\"Sat Jun 18 2022 09:37:40 GMT+0000 (Coordinated Universal Time)\",\"source\":\"A\",\"destination\":\"D\",\"status\":\"1\"}"
                            }
                        ],
                        metadata_writes:[]
                    },
                    collection_hashed_rwset:[]
                }
            ],
            chaincode_spec: {
                type: 1,
                typeString: "GOLANG",
                chaincode_id: {
                    path: "",
                    name: "simplesupplychain",
                    version: ""
                }
            },
            endorsements: [
                {
                    endorser: {
                        Mspid: "Org1MSP",
                        IdBytes: "-----BEGIN CERTIFICATE-----\nMIICBTCCAaugAwIBAgIRALIjogqwdNLqTj93y5OujnowCgYIKoZIzj0EAwIwWzEL\nMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBG\ncmFuY2lzY28xDTALBgNVBAoTBG9yZzExEDAOBgNVBAMTB2NhLm9yZzEwHhcNMjIw\nNjE0MDkyNTAwWhcNMzIwNjExMDkyNTAwWjBeMQswCQYDVQQGEwJVUzETMBEGA1UE\nCBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNU2FuIEZyYW5jaXNjbzENMAsGA1UECxME\ncGVlcjETMBEGA1UEAxMKcGVlcjAub3JnMTBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABIKwAk1B/C+j7Qut/IGg3FDvgCFVYCjxkuDyjUWON0JxtLUI9aU5zxb6PTce\nqmbHadKs47W4g4SAlk+eLvPxWZWjTTBLMA4GA1UdDwEB/wQEAwIHgDAMBgNVHRMB\nAf8EAjAAMCsGA1UdIwQkMCKAIBOvXfL41Zmdp1yoZ/YWZfWd8QR5EwaPf8d5kDNl\nCL/PMAoGCCqGSM49BAMCA0gAMEUCIQCIoLNmcZLi1eqoIszPp8LjTWi0nycRm+Ay\nOht76uxQbAIgSkpx6NE6oIOiMi3fSJ7d5NfhMdLIfn789SmdesUJdzQ=\n-----END CERTIFICATE-----\n"
                    }
                },
                {
                    endorser: {
                        Mspid: "Org2MSP",
                        IdBytes: "-----BEGIN CERTIFICATE-----\nMIICBTCCAaugAwIBAgIRAM+rm/PPu8IoXe6YbcL7RVMwCgYIKoZIzj0EAwIwWzEL\nMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBG\ncmFuY2lzY28xDTALBgNVBAoTBG9yZzIxEDAOBgNVBAMTB2NhLm9yZzIwHhcNMjIw\nNjE0MDkyNTAwWhcNMzIwNjExMDkyNTAwWjBeMQswCQYDVQQGEwJVUzETMBEGA1UE\nCBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNU2FuIEZyYW5jaXNjbzENMAsGA1UECxME\ncGVlcjETMBEGA1UEAxMKcGVlcjAub3JnMjBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABMFWcOC3f9OAbVQc6ttVJdjoG7Hr5DI+UmeNa7D6QFGrz9hmxW+/Y69cso1Q\n82T5s9hHUTzupBrm2kGBWhJiK5KjTTBLMA4GA1UdDwEB/wQEAwIHgDAMBgNVHRMB\nAf8EAjAAMCsGA1UdIwQkMCKAIC+hKL3nL0qMPzL8RdbSoPfR7Fyx11Hx0DoGw+M5\nRm7UMAoGCCqGSM49BAMCA0gAMEUCIQD7QlwhDtH5Nl+AzH9wLyPWoaeIel4vYWjq\nDREVzMAWvwIgZjMSdiGBtzSwt/45nI/z6l6wCaRH1zWp3k9wQVuZ2WM=\n-----END CERTIFICATE-----\n"
                    }
                }
            ],
            status: 0
        },
        {
            tx_number: 1,
            tx_id: "f50e4b086c43aa1c8cba91a66f37b8a85414e3edbc758a8e72db906c73ba5e76",
            creator: {
                Mspid: "Org1MSP",
                IdBytes: "-----BEGIN CERTIFICATE-----\nMIICBTCCAaugAwIBAgIRALIjogqwdNLqTj93y5OujnowCgYIKoZIzj0EAwIwWzEL\nMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBG\ncmFuY2lzY28xDTALBgNVBAoTBG9yZzExEDAOBgNVBAMTB2NhLm9yZzEwHhcNMjIw\nNjE0MDkyNTAwWhcNMzIwNjExMDkyNTAwWjBeMQswCQYDVQQGEwJVUzETMBEGA1UE\nCBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNU2FuIEZyYW5jaXNjbzENMAsGA1UECxME\ncGVlcjETMBEGA1UEAxMKcGVlcjAub3JnMTBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABIKwAk1B/C+j7Qut/IGg3FDvgCFVYCjxkuDyjUWON0JxtLUI9aU5zxb6PTce\nqmbHadKs47W4g4SAlk+eLvPxWZWjTTBLMA4GA1UdDwEB/wQEAwIHgDAMBgNVHRMB\nAf8EAjAAMCsGA1UdIwQkMCKAIBOvXfL41Zmdp1yoZ/YWZfWd8QR5EwaPf8d5kDNl\nCL/PMAoGCCqGSM49BAMCA0gAMEUCIQCIoLNmcZLi1eqoIszPp8LjTWi0nycRm+Ay\nOht76uxQbAIgSkpx6NE6oIOiMi3fSJ7d5NfhMdLIfn789SmdesUJdzQ=\n-----END CERTIFICATE-----\n"
            },
            class: "Range Query",
            typeString: "ENDORSER_TRANSACTION",
            block_number: 15,
            tx_block_number: 1,
            rw_set: [
                {
                    namespace: "_lifecycle",
                    rwset: {
                        reads: [
                            {
                                key: "namespaces/fields/simplesupplychain/Sequence",
                                version: {
                                    block_num: "4",
                                    tx_num: "0"
                                }
                            }
                        ],
                        range_queries_info: [],
                        writes: [],
                        metadata_writes: []
                    },
                    collection_hashed_rwset: []
                },
                {
                    namespace: "simplesupplychain",
                    rwset: {
                        reads: [],
                        range_queries_info: [
                            {
                                start_key: "3",
                                end_key: "6",
                                itr_exhausted: true,
                                raw_reads: {
                                    kv_reads: [
                                        {
                                            key: "3",
                                            version: {
                                                block_num: "6",
                                                tx_num: "3"
                                            }
                                        },
                                        {
                                            key: "4",
                                            version: {
                                                block_num: "6",
                                                tx_num: "3"
                                            }
                                        },
                                        {
                                            key: "5",
                                            version: {
                                                block_num: "6",
                                                tx_num: "3"
                                            }
                                        },
                                    ]
                                }
                            }
                        ],
                        writes: [
                            {
                                key: "0",
                                is_delete: false,
                                value: "{\"id\":\"1107\",\"date\":\"Sat Jun 18 2022 09:37:40 GMT+0000 (Coordinated Universal Time)\",\"source\":\"A\",\"destination\":\"D\",\"status\":\"1\"}"
                            }
                        ],
                        metadata_writes:[]
                    },
                    collection_hashed_rwset:[]
                }
            ],
            chaincode_spec: {
                type: 1,
                typeString: "GOLANG",
                chaincode_id: {
                    path: "",
                    name: "simplesupplychain",
                    version: ""
                }
            },
            endorsements: [
                {
                    endorser: {
                        Mspid: "Org1MSP",
                        IdBytes: "-----BEGIN CERTIFICATE-----\nMIICBTCCAaugAwIBAgIRALIjogqwdNLqTj93y5OujnowCgYIKoZIzj0EAwIwWzEL\nMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBG\ncmFuY2lzY28xDTALBgNVBAoTBG9yZzExEDAOBgNVBAMTB2NhLm9yZzEwHhcNMjIw\nNjE0MDkyNTAwWhcNMzIwNjExMDkyNTAwWjBeMQswCQYDVQQGEwJVUzETMBEGA1UE\nCBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNU2FuIEZyYW5jaXNjbzENMAsGA1UECxME\ncGVlcjETMBEGA1UEAxMKcGVlcjAub3JnMTBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABIKwAk1B/C+j7Qut/IGg3FDvgCFVYCjxkuDyjUWON0JxtLUI9aU5zxb6PTce\nqmbHadKs47W4g4SAlk+eLvPxWZWjTTBLMA4GA1UdDwEB/wQEAwIHgDAMBgNVHRMB\nAf8EAjAAMCsGA1UdIwQkMCKAIBOvXfL41Zmdp1yoZ/YWZfWd8QR5EwaPf8d5kDNl\nCL/PMAoGCCqGSM49BAMCA0gAMEUCIQCIoLNmcZLi1eqoIszPp8LjTWi0nycRm+Ay\nOht76uxQbAIgSkpx6NE6oIOiMi3fSJ7d5NfhMdLIfn789SmdesUJdzQ=\n-----END CERTIFICATE-----\n"
                    }
                },
                {
                    endorser: {
                        Mspid: "Org2MSP",
                        IdBytes: "-----BEGIN CERTIFICATE-----\nMIICBTCCAaugAwIBAgIRAM+rm/PPu8IoXe6YbcL7RVMwCgYIKoZIzj0EAwIwWzEL\nMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBG\ncmFuY2lzY28xDTALBgNVBAoTBG9yZzIxEDAOBgNVBAMTB2NhLm9yZzIwHhcNMjIw\nNjE0MDkyNTAwWhcNMzIwNjExMDkyNTAwWjBeMQswCQYDVQQGEwJVUzETMBEGA1UE\nCBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNU2FuIEZyYW5jaXNjbzENMAsGA1UECxME\ncGVlcjETMBEGA1UEAxMKcGVlcjAub3JnMjBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABMFWcOC3f9OAbVQc6ttVJdjoG7Hr5DI+UmeNa7D6QFGrz9hmxW+/Y69cso1Q\n82T5s9hHUTzupBrm2kGBWhJiK5KjTTBLMA4GA1UdDwEB/wQEAwIHgDAMBgNVHRMB\nAf8EAjAAMCsGA1UdIwQkMCKAIC+hKL3nL0qMPzL8RdbSoPfR7Fyx11Hx0DoGw+M5\nRm7UMAoGCCqGSM49BAMCA0gAMEUCIQD7QlwhDtH5Nl+AzH9wLyPWoaeIel4vYWjq\nDREVzMAWvwIgZjMSdiGBtzSwt/45nI/z6l6wCaRH1zWp3k9wQVuZ2WM=\n-----END CERTIFICATE-----\n"
                    }
                }
            ],
            status: 0
        },
        {
            tx_number: 2,
            tx_id: "a4027bcfa477f1b5793fd011734aa295bb5bae60e384df1995a6d2b5c858290a",
            creator: {
                Mspid: "Org1MSP",
                IdBytes: "-----BEGIN CERTIFICATE-----\nMIICBTCCAaugAwIBAgIRALIjogqwdNLqTj93y5OujnowCgYIKoZIzj0EAwIwWzEL\nMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBG\ncmFuY2lzY28xDTALBgNVBAoTBG9yZzExEDAOBgNVBAMTB2NhLm9yZzEwHhcNMjIw\nNjE0MDkyNTAwWhcNMzIwNjExMDkyNTAwWjBeMQswCQYDVQQGEwJVUzETMBEGA1UE\nCBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNU2FuIEZyYW5jaXNjbzENMAsGA1UECxME\ncGVlcjETMBEGA1UEAxMKcGVlcjAub3JnMTBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABIKwAk1B/C+j7Qut/IGg3FDvgCFVYCjxkuDyjUWON0JxtLUI9aU5zxb6PTce\nqmbHadKs47W4g4SAlk+eLvPxWZWjTTBLMA4GA1UdDwEB/wQEAwIHgDAMBgNVHRMB\nAf8EAjAAMCsGA1UdIwQkMCKAIBOvXfL41Zmdp1yoZ/YWZfWd8QR5EwaPf8d5kDNl\nCL/PMAoGCCqGSM49BAMCA0gAMEUCIQCIoLNmcZLi1eqoIszPp8LjTWi0nycRm+Ay\nOht76uxQbAIgSkpx6NE6oIOiMi3fSJ7d5NfhMdLIfn789SmdesUJdzQ=\n-----END CERTIFICATE-----\n"
            },
            class: "Update",
            typeString: "ENDORSER_TRANSACTION",
            block_number: 15,
            tx_block_number: 2,
            rw_set: [
                {
                    namespace: "_lifecycle",
                    rwset: {
                        reads: [
                            {
                                key: "namespaces/fields/simplesupplychain/Sequence",
                                version: {
                                    block_num: "4",
                                    tx_num: "0"
                                }
                            }
                        ],
                        range_queries_info: [],
                        writes: [],
                        metadata_writes: []
                    },
                    collection_hashed_rwset: []
                },
                {
                    namespace: "simplesupplychain",
                    rwset: {
                        reads: [
                            {
                                key: "6",
                                version: {
                                    block_num: "10",
                                    tx_num: "202"
                                }
                            },
                            {
                                key: "7",
                                version: {
                                    block_num: "12",
                                    tx_num: "2"
                                }
                            }
                        ],
                        range_queries_info: [],
                        writes: [
                            {
                                key: "3",
                                is_delete: false,
                                value: "{\"id\":\"1107\",\"date\":\"Sat Jun 18 2022 09:37:40 GMT+0000 (Coordinated Universal Time)\",\"source\":\"A\",\"destination\":\"D\",\"status\":\"1\"}"
                            },
                            {
                                key: "9",
                                is_delete: false,
                                value: "{\"id\":\"1107\",\"date\":\"Sat Jun 18 2022 09:37:40 GMT+0000 (Coordinated Universal Time)\",\"source\":\"A\",\"destination\":\"D\",\"status\":\"1\"}"
                            }
                        ],
                        metadata_writes:[]
                    },
                    collection_hashed_rwset:[]
                }
            ],
            chaincode_spec: {
                type: 1,
                typeString: "GOLANG",
                chaincode_id: {
                    path: "",
                    name: "simplesupplychain",
                    version: ""
                }
            },
            endorsements: [
                {
                    endorser: {
                        Mspid: "Org1MSP",
                        IdBytes: "-----BEGIN CERTIFICATE-----\nMIICBTCCAaugAwIBAgIRALIjogqwdNLqTj93y5OujnowCgYIKoZIzj0EAwIwWzEL\nMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBG\ncmFuY2lzY28xDTALBgNVBAoTBG9yZzExEDAOBgNVBAMTB2NhLm9yZzEwHhcNMjIw\nNjE0MDkyNTAwWhcNMzIwNjExMDkyNTAwWjBeMQswCQYDVQQGEwJVUzETMBEGA1UE\nCBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNU2FuIEZyYW5jaXNjbzENMAsGA1UECxME\ncGVlcjETMBEGA1UEAxMKcGVlcjAub3JnMTBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABIKwAk1B/C+j7Qut/IGg3FDvgCFVYCjxkuDyjUWON0JxtLUI9aU5zxb6PTce\nqmbHadKs47W4g4SAlk+eLvPxWZWjTTBLMA4GA1UdDwEB/wQEAwIHgDAMBgNVHRMB\nAf8EAjAAMCsGA1UdIwQkMCKAIBOvXfL41Zmdp1yoZ/YWZfWd8QR5EwaPf8d5kDNl\nCL/PMAoGCCqGSM49BAMCA0gAMEUCIQCIoLNmcZLi1eqoIszPp8LjTWi0nycRm+Ay\nOht76uxQbAIgSkpx6NE6oIOiMi3fSJ7d5NfhMdLIfn789SmdesUJdzQ=\n-----END CERTIFICATE-----\n"
                    }
                },
                {
                    endorser: {
                        Mspid: "Org2MSP",
                        IdBytes: "-----BEGIN CERTIFICATE-----\nMIICBTCCAaugAwIBAgIRAM+rm/PPu8IoXe6YbcL7RVMwCgYIKoZIzj0EAwIwWzEL\nMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBG\ncmFuY2lzY28xDTALBgNVBAoTBG9yZzIxEDAOBgNVBAMTB2NhLm9yZzIwHhcNMjIw\nNjE0MDkyNTAwWhcNMzIwNjExMDkyNTAwWjBeMQswCQYDVQQGEwJVUzETMBEGA1UE\nCBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNU2FuIEZyYW5jaXNjbzENMAsGA1UECxME\ncGVlcjETMBEGA1UEAxMKcGVlcjAub3JnMjBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABMFWcOC3f9OAbVQc6ttVJdjoG7Hr5DI+UmeNa7D6QFGrz9hmxW+/Y69cso1Q\n82T5s9hHUTzupBrm2kGBWhJiK5KjTTBLMA4GA1UdDwEB/wQEAwIHgDAMBgNVHRMB\nAf8EAjAAMCsGA1UdIwQkMCKAIC+hKL3nL0qMPzL8RdbSoPfR7Fyx11Hx0DoGw+M5\nRm7UMAoGCCqGSM49BAMCA0gAMEUCIQD7QlwhDtH5Nl+AzH9wLyPWoaeIel4vYWjq\nDREVzMAWvwIgZjMSdiGBtzSwt/45nI/z6l6wCaRH1zWp3k9wQVuZ2WM=\n-----END CERTIFICATE-----\n"
                    }
                }
            ],
            status: 0
        },
        {
            tx_number: 3,
            tx_id: "3c50a3ed31a4e9f5c58818d65cabe7f57471a2bc9cfef6876a0a6466478a8875",
            creator: {
                Mspid: "Org1MSP",
                IdBytes: "-----BEGIN CERTIFICATE-----\nMIICBTCCAaugAwIBAgIRALIjogqwdNLqTj93y5OujnowCgYIKoZIzj0EAwIwWzEL\nMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBG\ncmFuY2lzY28xDTALBgNVBAoTBG9yZzExEDAOBgNVBAMTB2NhLm9yZzEwHhcNMjIw\nNjE0MDkyNTAwWhcNMzIwNjExMDkyNTAwWjBeMQswCQYDVQQGEwJVUzETMBEGA1UE\nCBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNU2FuIEZyYW5jaXNjbzENMAsGA1UECxME\ncGVlcjETMBEGA1UEAxMKcGVlcjAub3JnMTBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABIKwAk1B/C+j7Qut/IGg3FDvgCFVYCjxkuDyjUWON0JxtLUI9aU5zxb6PTce\nqmbHadKs47W4g4SAlk+eLvPxWZWjTTBLMA4GA1UdDwEB/wQEAwIHgDAMBgNVHRMB\nAf8EAjAAMCsGA1UdIwQkMCKAIBOvXfL41Zmdp1yoZ/YWZfWd8QR5EwaPf8d5kDNl\nCL/PMAoGCCqGSM49BAMCA0gAMEUCIQCIoLNmcZLi1eqoIszPp8LjTWi0nycRm+Ay\nOht76uxQbAIgSkpx6NE6oIOiMi3fSJ7d5NfhMdLIfn789SmdesUJdzQ=\n-----END CERTIFICATE-----\n"
            },
            class: "Update",
            typeString: "ENDORSER_TRANSACTION",
            block_number: 16,
            tx_block_number: 3,
            rw_set: [
                {
                    namespace: "_lifecycle",
                    rwset: {
                        reads: [
                            {
                                key: "namespaces/fields/simplesupplychain/Sequence",
                                version: {
                                    block_num: "4",
                                    tx_num: "0"
                                }
                            }
                        ],
                        range_queries_info: [],
                        writes: [],
                        metadata_writes: []
                    },
                    collection_hashed_rwset: []
                },
                {
                    namespace: "simplesupplychain",
                    rwset: {
                        reads: [
                            {
                                key: "2",
                                version: {
                                    block_num: "10",
                                    tx_num: "202"
                                }
                            },
                            {
                                key: "8",
                                version: {
                                    block_num: "7",
                                    tx_num: "202"
                                }
                            }
                        ],
                        range_queries_info: [],
                        writes: [
                            {
                                key: "1",
                                is_delete: false,
                                value: "{\"id\":\"1107\",\"date\":\"Sat Jun 18 2022 09:37:40 GMT+0000 (Coordinated Universal Time)\",\"source\":\"A\",\"destination\":\"D\",\"status\":\"1\"}"
                            },
                            {
                                key: "4",
                                is_delete: false,
                                value: "{\"id\":\"1107\",\"date\":\"Sat Jun 18 2022 09:37:40 GMT+0000 (Coordinated Universal Time)\",\"source\":\"A\",\"destination\":\"D\",\"status\":\"1\"}"
                            }
                        ],
                        metadata_writes:[]
                    },
                    collection_hashed_rwset:[]
                }
            ],
            chaincode_spec: {
                type: 1,
                typeString: "GOLANG",
                chaincode_id: {
                    path: "",
                    name: "simplesupplychain",
                    version: ""
                }
            },
            endorsements: [
                {
                    endorser: {
                        Mspid: "Org1MSP",
                        IdBytes: "-----BEGIN CERTIFICATE-----\nMIICBTCCAaugAwIBAgIRALIjogqwdNLqTj93y5OujnowCgYIKoZIzj0EAwIwWzEL\nMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBG\ncmFuY2lzY28xDTALBgNVBAoTBG9yZzExEDAOBgNVBAMTB2NhLm9yZzEwHhcNMjIw\nNjE0MDkyNTAwWhcNMzIwNjExMDkyNTAwWjBeMQswCQYDVQQGEwJVUzETMBEGA1UE\nCBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNU2FuIEZyYW5jaXNjbzENMAsGA1UECxME\ncGVlcjETMBEGA1UEAxMKcGVlcjAub3JnMTBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABIKwAk1B/C+j7Qut/IGg3FDvgCFVYCjxkuDyjUWON0JxtLUI9aU5zxb6PTce\nqmbHadKs47W4g4SAlk+eLvPxWZWjTTBLMA4GA1UdDwEB/wQEAwIHgDAMBgNVHRMB\nAf8EAjAAMCsGA1UdIwQkMCKAIBOvXfL41Zmdp1yoZ/YWZfWd8QR5EwaPf8d5kDNl\nCL/PMAoGCCqGSM49BAMCA0gAMEUCIQCIoLNmcZLi1eqoIszPp8LjTWi0nycRm+Ay\nOht76uxQbAIgSkpx6NE6oIOiMi3fSJ7d5NfhMdLIfn789SmdesUJdzQ=\n-----END CERTIFICATE-----\n"
                    }
                },
                {
                    endorser: {
                        Mspid: "Org2MSP",
                        IdBytes: "-----BEGIN CERTIFICATE-----\nMIICBTCCAaugAwIBAgIRAM+rm/PPu8IoXe6YbcL7RVMwCgYIKoZIzj0EAwIwWzEL\nMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBG\ncmFuY2lzY28xDTALBgNVBAoTBG9yZzIxEDAOBgNVBAMTB2NhLm9yZzIwHhcNMjIw\nNjE0MDkyNTAwWhcNMzIwNjExMDkyNTAwWjBeMQswCQYDVQQGEwJVUzETMBEGA1UE\nCBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNU2FuIEZyYW5jaXNjbzENMAsGA1UECxME\ncGVlcjETMBEGA1UEAxMKcGVlcjAub3JnMjBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABMFWcOC3f9OAbVQc6ttVJdjoG7Hr5DI+UmeNa7D6QFGrz9hmxW+/Y69cso1Q\n82T5s9hHUTzupBrm2kGBWhJiK5KjTTBLMA4GA1UdDwEB/wQEAwIHgDAMBgNVHRMB\nAf8EAjAAMCsGA1UdIwQkMCKAIC+hKL3nL0qMPzL8RdbSoPfR7Fyx11Hx0DoGw+M5\nRm7UMAoGCCqGSM49BAMCA0gAMEUCIQD7QlwhDtH5Nl+AzH9wLyPWoaeIel4vYWjq\nDREVzMAWvwIgZjMSdiGBtzSwt/45nI/z6l6wCaRH1zWp3k9wQVuZ2WM=\n-----END CERTIFICATE-----\n"
                    }
                }
            ],
            status: 12
        },
        {
            tx_number: 4,
            tx_id: "4ccbb77ec80e7e0d29e70214dd1981b37151be0fa55a402a505fea0004328b10",
            creator: {
                Mspid: "Org1MSP",
                IdBytes: "-----BEGIN CERTIFICATE-----\nMIICBTCCAaugAwIBAgIRALIjogqwdNLqTj93y5OujnowCgYIKoZIzj0EAwIwWzEL\nMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBG\ncmFuY2lzY28xDTALBgNVBAoTBG9yZzExEDAOBgNVBAMTB2NhLm9yZzEwHhcNMjIw\nNjE0MDkyNTAwWhcNMzIwNjExMDkyNTAwWjBeMQswCQYDVQQGEwJVUzETMBEGA1UE\nCBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNU2FuIEZyYW5jaXNjbzENMAsGA1UECxME\ncGVlcjETMBEGA1UEAxMKcGVlcjAub3JnMTBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABIKwAk1B/C+j7Qut/IGg3FDvgCFVYCjxkuDyjUWON0JxtLUI9aU5zxb6PTce\nqmbHadKs47W4g4SAlk+eLvPxWZWjTTBLMA4GA1UdDwEB/wQEAwIHgDAMBgNVHRMB\nAf8EAjAAMCsGA1UdIwQkMCKAIBOvXfL41Zmdp1yoZ/YWZfWd8QR5EwaPf8d5kDNl\nCL/PMAoGCCqGSM49BAMCA0gAMEUCIQCIoLNmcZLi1eqoIszPp8LjTWi0nycRm+Ay\nOht76uxQbAIgSkpx6NE6oIOiMi3fSJ7d5NfhMdLIfn789SmdesUJdzQ=\n-----END CERTIFICATE-----\n"
            },
            class: "Update",
            typeString: "ENDORSER_TRANSACTION",
            block_number: 16,
            tx_block_number: 4,
            rw_set: [
                {
                    namespace: "_lifecycle",
                    rwset: {
                        reads: [
                            {
                                key: "namespaces/fields/simplesupplychain/Sequence",
                                version: {
                                    block_num: "4",
                                    tx_num: "0"
                                }
                            }
                        ],
                        range_queries_info: [],
                        writes: [],
                        metadata_writes: []
                    },
                    collection_hashed_rwset: []
                },
                {
                    namespace: "simplesupplychain",
                    rwset: {
                        reads: [
                            {
                                key: "9",
                                version: {
                                    block_num: "7",
                                    tx_num: "1"
                                }
                            }
                        ],
                        range_queries_info: [],
                        writes: [
                            {
                                key: "5",
                                is_delete: false,
                                value: "{\"id\":\"1107\",\"date\":\"Sat Jun 18 2022 09:37:40 GMT+0000 (Coordinated Universal Time)\",\"source\":\"A\",\"destination\":\"D\",\"status\":\"1\"}"
                            },
                            {
                                key: "6",
                                is_delete: false,
                                value: "{\"id\":\"1107\",\"date\":\"Sat Jun 18 2022 09:37:40 GMT+0000 (Coordinated Universal Time)\",\"source\":\"A\",\"destination\":\"D\",\"status\":\"1\"}"
                            },
                            {
                                key: "8",
                                is_delete: false,
                                value: "{\"id\":\"1107\",\"date\":\"Sat Jun 18 2022 09:37:40 GMT+0000 (Coordinated Universal Time)\",\"source\":\"A\",\"destination\":\"D\",\"status\":\"1\"}"
                            }
                        ],
                        metadata_writes:[]
                    },
                    collection_hashed_rwset:[]
                }
            ],
            chaincode_spec: {
                type: 1,
                typeString: "GOLANG",
                chaincode_id: {
                    path: "",
                    name: "simplesupplychain",
                    version: ""
                }
            },
            endorsements: [
                {
                    endorser: {
                        Mspid: "Org1MSP",
                        IdBytes: "-----BEGIN CERTIFICATE-----\nMIICBTCCAaugAwIBAgIRALIjogqwdNLqTj93y5OujnowCgYIKoZIzj0EAwIwWzEL\nMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBG\ncmFuY2lzY28xDTALBgNVBAoTBG9yZzExEDAOBgNVBAMTB2NhLm9yZzEwHhcNMjIw\nNjE0MDkyNTAwWhcNMzIwNjExMDkyNTAwWjBeMQswCQYDVQQGEwJVUzETMBEGA1UE\nCBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNU2FuIEZyYW5jaXNjbzENMAsGA1UECxME\ncGVlcjETMBEGA1UEAxMKcGVlcjAub3JnMTBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABIKwAk1B/C+j7Qut/IGg3FDvgCFVYCjxkuDyjUWON0JxtLUI9aU5zxb6PTce\nqmbHadKs47W4g4SAlk+eLvPxWZWjTTBLMA4GA1UdDwEB/wQEAwIHgDAMBgNVHRMB\nAf8EAjAAMCsGA1UdIwQkMCKAIBOvXfL41Zmdp1yoZ/YWZfWd8QR5EwaPf8d5kDNl\nCL/PMAoGCCqGSM49BAMCA0gAMEUCIQCIoLNmcZLi1eqoIszPp8LjTWi0nycRm+Ay\nOht76uxQbAIgSkpx6NE6oIOiMi3fSJ7d5NfhMdLIfn789SmdesUJdzQ=\n-----END CERTIFICATE-----\n"
                    }
                },
                {
                    endorser: {
                        Mspid: "Org2MSP",
                        IdBytes: "-----BEGIN CERTIFICATE-----\nMIICBTCCAaugAwIBAgIRAM+rm/PPu8IoXe6YbcL7RVMwCgYIKoZIzj0EAwIwWzEL\nMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBG\ncmFuY2lzY28xDTALBgNVBAoTBG9yZzIxEDAOBgNVBAMTB2NhLm9yZzIwHhcNMjIw\nNjE0MDkyNTAwWhcNMzIwNjExMDkyNTAwWjBeMQswCQYDVQQGEwJVUzETMBEGA1UE\nCBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNU2FuIEZyYW5jaXNjbzENMAsGA1UECxME\ncGVlcjETMBEGA1UEAxMKcGVlcjAub3JnMjBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABMFWcOC3f9OAbVQc6ttVJdjoG7Hr5DI+UmeNa7D6QFGrz9hmxW+/Y69cso1Q\n82T5s9hHUTzupBrm2kGBWhJiK5KjTTBLMA4GA1UdDwEB/wQEAwIHgDAMBgNVHRMB\nAf8EAjAAMCsGA1UdIwQkMCKAIC+hKL3nL0qMPzL8RdbSoPfR7Fyx11Hx0DoGw+M5\nRm7UMAoGCCqGSM49BAMCA0gAMEUCIQD7QlwhDtH5Nl+AzH9wLyPWoaeIel4vYWjq\nDREVzMAWvwIgZjMSdiGBtzSwt/45nI/z6l6wCaRH1zWp3k9wQVuZ2WM=\n-----END CERTIFICATE-----\n"
                    }
                }
            ],
            status: 11
        },
        {
            tx_number: 5,
            tx_id: "e3d8738a410d5ab0461d3ff9d58cd966dfff35a5f2f78adfc67bf0c5ee5f2afe",
            creator: {
                Mspid: "Org1MSP",
                IdBytes: "-----BEGIN CERTIFICATE-----\nMIICBTCCAaugAwIBAgIRALIjogqwdNLqTj93y5OujnowCgYIKoZIzj0EAwIwWzEL\nMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBG\ncmFuY2lzY28xDTALBgNVBAoTBG9yZzExEDAOBgNVBAMTB2NhLm9yZzEwHhcNMjIw\nNjE0MDkyNTAwWhcNMzIwNjExMDkyNTAwWjBeMQswCQYDVQQGEwJVUzETMBEGA1UE\nCBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNU2FuIEZyYW5jaXNjbzENMAsGA1UECxME\ncGVlcjETMBEGA1UEAxMKcGVlcjAub3JnMTBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABIKwAk1B/C+j7Qut/IGg3FDvgCFVYCjxkuDyjUWON0JxtLUI9aU5zxb6PTce\nqmbHadKs47W4g4SAlk+eLvPxWZWjTTBLMA4GA1UdDwEB/wQEAwIHgDAMBgNVHRMB\nAf8EAjAAMCsGA1UdIwQkMCKAIBOvXfL41Zmdp1yoZ/YWZfWd8QR5EwaPf8d5kDNl\nCL/PMAoGCCqGSM49BAMCA0gAMEUCIQCIoLNmcZLi1eqoIszPp8LjTWi0nycRm+Ay\nOht76uxQbAIgSkpx6NE6oIOiMi3fSJ7d5NfhMdLIfn789SmdesUJdzQ=\n-----END CERTIFICATE-----\n"
            },
            class: "Write-only",
            typeString: "ENDORSER_TRANSACTION",
            block_number: 17,
            tx_block_number: 1,
            rw_set: [
                {
                    namespace: "_lifecycle",
                    rwset: {
                        reads: [
                            {
                                key: "namespaces/fields/simplesupplychain/Sequence",
                                version: {
                                    block_num: "4",
                                    tx_num: "0"
                                }
                            }
                        ],
                        range_queries_info: [],
                        writes: [],
                        metadata_writes: []
                    },
                    collection_hashed_rwset: []
                },
                {
                    namespace: "simplesupplychain",
                    rwset: {
                        reads: [],
                        range_queries_info: [],
                        writes: [
                            {
                                key: "6",
                                is_delete: false,
                                value: "{\"id\":\"1107\",\"date\":\"Sat Jun 18 2022 09:37:40 GMT+0000 (Coordinated Universal Time)\",\"source\":\"A\",\"destination\":\"D\",\"status\":\"1\"}"
                            },
                            {
                                key: "7",
                                is_delete: false,
                                value: "{\"id\":\"1107\",\"date\":\"Sat Jun 18 2022 09:37:40 GMT+0000 (Coordinated Universal Time)\",\"source\":\"A\",\"destination\":\"D\",\"status\":\"1\"}"
                            }
                        ],
                        metadata_writes:[]
                    },
                    collection_hashed_rwset:[]
                }
            ],
            chaincode_spec: {
                type: 1,
                typeString: "GOLANG",
                chaincode_id: {
                    path: "",
                    name: "simplesupplychain",
                    version: ""
                }
            },
            endorsements: [
                {
                    endorser: {
                        Mspid: "Org1MSP",
                        IdBytes: "-----BEGIN CERTIFICATE-----\nMIICBTCCAaugAwIBAgIRALIjogqwdNLqTj93y5OujnowCgYIKoZIzj0EAwIwWzEL\nMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBG\ncmFuY2lzY28xDTALBgNVBAoTBG9yZzExEDAOBgNVBAMTB2NhLm9yZzEwHhcNMjIw\nNjE0MDkyNTAwWhcNMzIwNjExMDkyNTAwWjBeMQswCQYDVQQGEwJVUzETMBEGA1UE\nCBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNU2FuIEZyYW5jaXNjbzENMAsGA1UECxME\ncGVlcjETMBEGA1UEAxMKcGVlcjAub3JnMTBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABIKwAk1B/C+j7Qut/IGg3FDvgCFVYCjxkuDyjUWON0JxtLUI9aU5zxb6PTce\nqmbHadKs47W4g4SAlk+eLvPxWZWjTTBLMA4GA1UdDwEB/wQEAwIHgDAMBgNVHRMB\nAf8EAjAAMCsGA1UdIwQkMCKAIBOvXfL41Zmdp1yoZ/YWZfWd8QR5EwaPf8d5kDNl\nCL/PMAoGCCqGSM49BAMCA0gAMEUCIQCIoLNmcZLi1eqoIszPp8LjTWi0nycRm+Ay\nOht76uxQbAIgSkpx6NE6oIOiMi3fSJ7d5NfhMdLIfn789SmdesUJdzQ=\n-----END CERTIFICATE-----\n"
                    }
                },
                {
                    endorser: {
                        Mspid: "Org2MSP",
                        IdBytes: "-----BEGIN CERTIFICATE-----\nMIICBTCCAaugAwIBAgIRAM+rm/PPu8IoXe6YbcL7RVMwCgYIKoZIzj0EAwIwWzEL\nMAkGA1UEBhMCVVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFjAUBgNVBAcTDVNhbiBG\ncmFuY2lzY28xDTALBgNVBAoTBG9yZzIxEDAOBgNVBAMTB2NhLm9yZzIwHhcNMjIw\nNjE0MDkyNTAwWhcNMzIwNjExMDkyNTAwWjBeMQswCQYDVQQGEwJVUzETMBEGA1UE\nCBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNU2FuIEZyYW5jaXNjbzENMAsGA1UECxME\ncGVlcjETMBEGA1UEAxMKcGVlcjAub3JnMjBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABMFWcOC3f9OAbVQc6ttVJdjoG7Hr5DI+UmeNa7D6QFGrz9hmxW+/Y69cso1Q\n82T5s9hHUTzupBrm2kGBWhJiK5KjTTBLMA4GA1UdDwEB/wQEAwIHgDAMBgNVHRMB\nAf8EAjAAMCsGA1UdIwQkMCKAIC+hKL3nL0qMPzL8RdbSoPfR7Fyx11Hx0DoGw+M5\nRm7UMAoGCCqGSM49BAMCA0gAMEUCIQD7QlwhDtH5Nl+AzH9wLyPWoaeIel4vYWjq\nDREVzMAWvwIgZjMSdiGBtzSwt/45nI/z6l6wCaRH1zWp3k9wQVuZ2WM=\n-----END CERTIFICATE-----\n"
                    }
                }
            ],
            status: 0
        },
    ];
    return transactions;
}
  
module.exports = router;
