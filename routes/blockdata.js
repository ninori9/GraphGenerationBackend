var express = require('express');
const fs = require('fs');
const yaml = require('js-yaml')
const { exec, execSync } = require("child_process");
var findCircuits = require("elementary-circuits-directed-graph"); 
const { getLogsNoClient } = require('../blockchain_data/log_extraction/getBlockchainLogsNoClient');
const { getLogsClient } = require('../blockchain_data/log_extraction/getBlockchainLogsClient');
const { exampleTransactions } = require('../blockchain_data/utils')

var router = express.Router();

/* Endpoint to get parsed data for graph generation from blockchain */
router.get('/graphGeneration', async function(req, res, next) {

    // Check whether block parameters are valid
    if(req.query.startblock === undefined || req.query.endblock === undefined || Number(req.query.startblock) === NaN || Number(req.query.endblock) === NaN || Number(req.query.startblock) < 0 || Number(req.query.startblock) > Number(req.query.endblock)) {
        res.status(406).json({error: 'The provided block parameters are invalid.'});
        return;
    }

    let userConfiguration;

    // Read configuration specified by user
    try {
        const rawConfigData = fs.readFileSync('./config.yaml', 'utf-8');
        userConfiguration = yaml.load(rawConfigData);
    } catch (e) {
        console.log(e);
        res.status(406).json({error: 'The specified user configuation is invalid.'});
        return;
    }

    const d = new Date();
    // Name (blocks, data, time) of directory in which parsed transaction data will be saved
    const directory = `b${req.query.startblock}_${req.query.endblock}d${d.getMonth()}_${d.getDay()}_${d.getFullYear()}t${d.getHours()}_${d.getMinutes()}_${d.getSeconds()}_${d.getMilliseconds()}`;

    // If HyperledgerLab option true execute script that extracts blockchain data from Fabric network deployed using HyperledgerLab
    if(userConfiguration.HyperledgerLab !== undefined && userConfiguration.HyperledgerLab === true) {
        execSync('sudo chmod +x  ./blockchain_data/logExtractionLab.sh');
        console.log('Changed permissions of extraction script');

        execSync( `sh ./blockchain_data/logExtractionLab.sh ${req.query.startblock} ${req.query.endblock} ${directory}`, { stdio: 'ignore' });
        console.log('Executed data extraction shell script');
    }
    // Else retrieve data from Hyperledger Fabric network depending on user configuration
    else {
        // Verify user configuration (path to common connection profile has to be defined, shortest possible path: c.yaml)
        if(userConfiguration.ccp_path === undefined || String(userConfiguration.ccp_path).length <= 5) {
            res.status(406).json({error: 'The specified user configuation is invalid.'});
            return;
        }

        // If no client and crypto store defined connect to Hyperledger Fabric network using the fabric-network and fabric-ca-client modules
        if(userConfiguration.client_and_cryptoStore !== undefined && userConfiguration.client_and_cryptoStore === false && userConfiguration.certificateAuthority !== undefined && userConfiguration.channel !== undefined) {
            await getLogsNoClient(Number(req.query.startblock), Number(req.query.endblock), String(userConfiguration.channel), directory, String(userConfiguration.certificateAuthority), String(userConfiguration.ccp_path));
            exec('rm -r ./blockchain_data/log_extraction/wallet/admin');
        }
        // If client and its crypto store defined connect to Hyperledger Fabric network using the fabric-client module
        else if(userConfiguration.client_and_cryptoStore !== undefined && userConfiguration.client_and_cryptoStore === true) {
            // Get registered user if in common connection profile
            let registeredUser;
            if(userConfiguration.userRegistered !== undefined && userConfiguration.registeredUserId !== undefined && userConfiguration.registeredUserPassword !== undefined) {
                registeredUser = {
                    registered: userConfiguration.userRegistered,
                    userId: userConfiguration.registeredUserId,
                    userPw: userConfiguration.registeredUserPassword,
                }
            }
            else {
                res.status(406).json({error: 'The specified user configuation is invalid.'});
                return;
            }
            await getLogsClient(Number(req.query.startblock), Number(req.query.endblock), directory, registeredUser, String(userConfiguration.ccp_path));
        }
        else {
            res.status(406).json({error: 'The specified user configuation is invalid.'});
            return;
        }
    }

    // An error occured if the directory was not created during the data retrieval process
    if(! fs.existsSync(`./blockchain_data/log_store/${directory}`)) {
        res.status(404).json({error: 'Could not retrieve any transactions with the provided configuration and parameters.'});
        return;
    }

    // Get files in directory (this is needed as specified blocks might not all be part of blockchain)
    const directoryContents = fs.readdirSync(`./blockchain_data/log_store/${directory}`);

    // Accumulate all transactions in one array to enable determining conflict graph and attributes
    let accTransactions = [];

    if(directoryContents !== undefined && directoryContents.length !== 0) {
        // Sort the array based on block number, this is necessary as otherwise "10" < "2"
        directoryContents.sort(function(a, b) { return (parseInt(a.substring(0, a.indexOf('.'))) - parseInt(b.substring(0, b.indexOf('.')))) });

        for(let i = 0; i<directoryContents.length; i++) {

            const rawBlockData = fs.readFileSync(`./blockchain_data/log_store/${directory}/${directoryContents[i]}`);
            const parsedBlock = JSON.parse(rawBlockData);

            accTransactions = accTransactions.concat(parsedBlock.transactions);
        }
    }

    // Delete directory and contained json files
    exec(`rm -r ./blockchain_data/log_store/${directory}`);

    // If the directory did not contain any files, or no transaction could be retrieved, send error
    if(directoryContents === undefined || directoryContents.length === 0 || accTransactions.length === 0) {
        res.status(404).json({error: 'Could not retrieve any transactions with the provided configuration and parameters.'});
        return;
    }

    try {
        // Create conflict graph
        const graphAndAttributes = createConflictGraph(accTransactions);
        // Check serializability
        const serializabilityAttributes = serializabilityCheck(graphAndAttributes.attributes.adjacencyList, accTransactions.length, graphAndAttributes.edges.length);

        const result = {
            attributes: {
                startblock: req.query.startblock,
                endblock: req.query.endblock,
                serializable: serializabilityAttributes.serializable,
                needToAbort: serializabilityAttributes.abortedTx,
                conflicts: graphAndAttributes.attributes.totalConflicts,
                conflictsLeadingToFailure: graphAndAttributes.attributes.interBlockConflicts + graphAndAttributes.attributes.intraBlockConflicts,
                transactions: accTransactions.length,
                totalFailures: graphAndAttributes.attributes.totalFailures,
                failureTypes: graphAndAttributes.attributes.failureAmounts,
                interBlockConflicts: graphAndAttributes.attributes.interBlockConflicts,
                intraBlockConflicts: graphAndAttributes.attributes.intraBlockConflicts,
            },
            transactions: accTransactions,
            edges: graphAndAttributes.edges
        };
        res.send(result);

    } catch(e) {
        console.log(e);
        res.status(500).json({error: 'An error occured during the transaction conflict graph generation.'});
        return;
    }
});

router.get('/graphGenerationTest', function(req, res, next) {
    const tx = exampleTransactions();
    const graphAndAttributes = createConflictGraph(tx);
    const serializabilityAttributes = serializabilityCheck(graphAndAttributes.attributes.adjacencyList, tx.length, graphAndAttributes.edges.length);

    const result = {
        attributes: {
            startblock: req.query.startblock,
            endblock: req.query.endblock,
            serializable: serializabilityAttributes.serializable,
            needToAbort: serializabilityAttributes.abortedTx,
            conflicts: graphAndAttributes.attributes.totalConflicts ,
            conflictsLeadingToFailure: graphAndAttributes.attributes.conflictsLeadingToFailure,
            transactions: tx.length,
            totalFailures: graphAndAttributes.attributes.totalFailures,
            failureTypes: graphAndAttributes.attributes.failureAmounts,
            interBlockConflicts: graphAndAttributes.attributes.interBlockConflicts,
            intraBlockConflicts: graphAndAttributes.attributes.intraBlockConflicts,
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

    let intraBlockConflicts = 0; // Reason for failure in same block
    let interBlockConflicts = 0; // Reason for failure in different blocks

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
                if(tx.rw_set[j].namespace === tx.chaincode_spec.chaincode) {
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

            // Per transaction: if transaction failed and contains a read, but no conflict can be determined --> inter-block conflict to prior block
            let readButNoConflict = combined_rw_set.filter(rw => rw.read === true).length > 0 && (tx.status === 11 || tx.status === 12);

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
                                        reason_for_failure: conflicting_entries[c].status === 0,
                                    }
                                );
                                addedEdgesFrom.add(conflicting_entries[c].tx);
                                adjacencyList[conflicting_entries[c].tx].push(tx.tx_number);
                                current_edge_number++;

                                // Every edge corresponds to a dependency
                                totalConflicts++;
                                
                                // Prior successful write caused failrue, test if in same or different block
                                if(conflicting_entries[c].status === 0 && (tx.status === 11 || tx.status === 12)) {
                                    conflictsLeadingToFailure++;
                                    readButNoConflict = false;

                                    // Find out if inter or intra block conflict
                                    if(conflicting_entries[c].block_num === tx.block_number) {
                                        intraBlockConflicts++;
                                    }
                                    else {
                                        interBlockConflicts++;
                                    }
                                }
                            }
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

                                // Every edge corresponds to a dependency
                                totalConflicts++;
                            }
                        }
                    }
                    // Add transaction to keyMap
                    keyMap.get(combined_rw_set[j].key).push(
                        {
                            tx: tx.tx_number,
                            status: tx.status,
                            block_num: tx.block_number,
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
                            status: tx.status,
                            block_num: tx.block_number,
                            read: combined_rw_set[j].read,
                            read_version: combined_rw_set[j].read_version,
                            write: combined_rw_set[j].write,
                            write_version: combined_rw_set[j].write_version,
                        }
                    ]);
                }
            }

            // If transaction is read tx that failed due to MVCC Read conflict or Phantom Read Conflict
            if(readButNoConflict) {
                interBlockConflicts++;
            }
        }
    }

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
            interBlockConflicts: interBlockConflicts,
            intraBlockConflicts: intraBlockConflicts,
        }
    }
}


function serializabilityCheck(adjacencyList, transactionsAmount, edgesAmount) {
    console.log('Checking for serializability...');
    console.log('Number of edges', edgesAmount);

    // Early abort in the case of potentially very large amounts of cycles due to memory heap error
    if(edgesAmount >= 500) {
        try {
	        findCircuits(adjacencyList, (circuit) => {
                throw "Not serializable.";
	        });
	    }
	    catch(e) {
	        console.log(e);
	        return {
                serializable: false,
                abortedTx: [false],
            };
	    }
    }

    // Max time of function 3.5 minutes
    let maxTime = Date.now() + 210000;

    let cycles = findCircuits(adjacencyList);
    console.log(`Found ${cycles.length} cycles using Johnson's Algorithm.`);

    const serializable = ! (cycles !== undefined && cycles.length > 0);

    // If serializable, no transactions need to be aborted
    if(serializable === true) {
        return {
            serializable: true,
            abortedTx: [],
        };
    }

    let abortedTx = [];

    // Initialize array of transactions and amount of cycles they are involved in
    let transactionsAmountOfCycles = [];
    for(let i=0; i<transactionsAmount; i++) {
        transactionsAmountOfCycles[i] = 0;
    }
    console.log('Initialized tx cycle data strucutre');

    // For each transaction determine how many cycles it is involved in
    for(let i=0; i<cycles.length; i++) {
        // Add a cycle to each distinct tx in cycle
        for(let j=0; j<cycles[i].length - 1; j++) {
            transactionsAmountOfCycles[cycles[i][j]]++;
        }
    }

    console.log('Cycles added to data structure');

    while(cycles.length > 0) {

        // Check if max time has elapsed
        if(Date.now() > maxTime) {
            console.log('Max time has passed.');
            return {
                serializable: false,
                abortedTx: [false],
           }
        }

        // Get transaction involved in most cycles (should be aborted)
        let maxCycles = 0; let maxTx = -1;
        for(let i=0; i<transactionsAmountOfCycles.length; i++) {
            if(transactionsAmountOfCycles[i] > maxCycles) {
                maxCycles = transactionsAmountOfCycles[i];
                maxTx = i;
            }
        }

        // Transaction involved in most cycles added to array of tx to be aborted
        abortedTx.push(maxTx);

        for(let i=0; i<cycles.length; i++) {
	        let maxTxIncluded = false;
	        for(let j=0; j<cycles[i].length-1; j++) {
		        if(cycles[i][j] === maxTx) {
		            maxTxIncluded = true;
		            j=cycles[i].length-1;
		        }
	        }

            // If the cycle includes the transaction involved in the most cycles
            if(maxTxIncluded) {
                // Each transaction involved in the cycle is now involved in one less cycle
                for(let j=0; j<cycles[i].length - 1; j++) {
                    transactionsAmountOfCycles[cycles[i][j]]--;
                }
                // Cycle is removed
                // cycles.splice(i, 1);
            }
        }

        // Remvoe all cycles containing tx to be aborted
	    cycles = cycles.filter(cycle => (! cycle.includes(maxTx)));
    }

    console.log('Done checking for serializability.');
    console.log('Result', serializable, abortedTx);

    return {
        serializable: serializable,
        abortedTx: abortedTx,
    }
}
  
module.exports = router;
