# Hyperledger Fabric Transaction Conflict Graph Generation Backend

This project is written in JavaScript and Shell, uses Node.js, Express.js, and the Hyperledger Fabric SDK for Node.js, and serves as the backend for an application that generates transaction conflict graphs (also called precedence graphs or serializability graphs) from transactions of the Hyperledger Fabric blockchain.

To see a visualization of the generated graphs, this app should be run together with the corresponding [frontend](https://github.com/ninori9/GraphGenerationFrontend).

## Endpoint

The app provides an endpoint ([http://localhost:3007/graphGeneration?startblock=<start block value>&endblock=<end block value>](http://localhost:3007/graphGeneration)), which receives startblock and endblock query parameters, and executes the following steps successively:

1. Extraction of transactions data within the specified block range fom the Hyperledger Fabric blockchain
2. Transaction conflict graph generation (edges, ndoes, and specific attributes (such as types of failure))
3. Serializability check

## Data extraction

All the code related to the extraction of the transaction data from the Hyperledger Fabric blockchain can be found in the [blockchain_data](https://github.com/ninori9/GraphGenerationBackend/tree/master/blockchain_data) folder.

The [logExtraction.sh](https://github.com/ninori9/GraphGenerationBackend/blob/master/blockchain_data/logExtraction.sh) script is called to retrieve the relevant data. By executing [getBlockchainLogs.js](https://github.com/ninori9/GraphGenerationBackend/blob/master/blockchain_data/log_extraction/getBlockchainLogs.js) on a Fabric network node, it registers a new client to the network using the [connection profile](https://github.com/ninori9/GraphGenerationBackend/blob/master/blockchain_data/log_extraction/connectionprofile.yaml), and queries and parses the block data from the specified block range. This data is then written to .json files, which are subsequently copied to and read by the backend server.

## Graph Generation
  
To create the transaction conflict graph, a map is used which maps each key to the transactions that access that key. A combined read/write-set, which contains the operations of a transaction and their accessed key, is created for each transaction. To create the edges of the graph, the following two checks are done:
  
  - If the entry in the set is a write transaction, the prior read transactions are searched for in the key map.
  
  - If the entry is a failed read operation, the reason for the failure, which is a prior write transaction that overwrote the version of key read by the read operation, is detected.
  
In any case, the transaction is added to the key map at any key it accesses in an operation.
  
Additionally, attributes of the transaction conflict graph, such as the number of conflicts or the type of failures, are gathered.

## Serializability Check

All cycles of the graph are detected using [Johnson's algorithm](http://www.cs.tufts.edu/comp/150GA/homeworks/hw1/Johnson%2075.PDF). If there are no cycles, the set of transactions is serializable. Otherwise, the transactions involved in the most cycles are iteratively removed (and added to the array of transactions that would need to be aborted to ensure serializability) until there are no cycles left.

## How to use

### Modify the [connection profile](https://github.com/ninori9/GraphGenerationBackend/blob/master/blockchain_data/log_extraction/connectionprofile.yaml) to match the Fabric network.

If you start the frontend for the first time, run:

### `npm install`

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
If the Hyperledger Fabric blockchain is running on a remote cluster, this project should also be installed on there.
You may want to use `ssh -i ~/.ssh/id_rsa -L 3007:localhost:3007 <remote username><remote IP address>` to connect to the remote instance via SSH and run the app there.
Open [http://localhost:3007](http://localhost:3007) to access it via the browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
The app is ready to be deployed!