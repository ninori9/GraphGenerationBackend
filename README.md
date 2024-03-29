# Hyperledger Fabric Transaction Conflict Graph Generation Backend

This project is written in JavaScript and Shell, uses Node.js, Express.js, and the Hyperledger Fabric SDK for Node.js, and serves as the backend for an application that generates transaction conflict graphs (also called precedence graphs or serializability graphs) from transactions of the Hyperledger Fabric blockchain.

If the Hyperledger Fabric blockchain is running on a remote cluster, this project should be installed there.
You may want to use `ssh -i ~/.ssh/id_rsa -L 3007:localhost:3007 <remote username>@<remote IP address>` to connect to the remote machine via SSH and run the app there.

To see a visualization of the generated graphs, this app should be run together with the corresponding [frontend](https://github.com/ninori9/GraphGenerationFrontend).

## Endpoint

The app provides an endpoint ([http://localhost:3007/graphGeneration?startblock=<start block value>&endblock=<end block value>](http://localhost:3007/graphGeneration)), which receives startblock and endblock query parameters, and executes the following steps successively:

1. Extraction of transactions data within the specified block range from the Hyperledger Fabric blockchain
2. Transaction conflict graph generation (edges, nodes, and specific attributes (such as types of failure))
3. Serializability check

## Data extraction

All the code related to the extraction of the transaction data from the Hyperledger Fabric blockchain can be found in the [blockchain_data](https://github.com/ninori9/GraphGenerationBackend/tree/master/blockchain_data) folder.

The [logExtractionLab.sh](https://github.com/ninori9/GraphGenerationBackend/blob/master/blockchain_data/logExtractionLab.sh) script, which executes [getBlockchainLogsLab.js](https://github.com/ninori9/GraphGenerationBackend/blob/master/blockchain_data/log_extraction/getBlockchainLogsLab.js) on a Fabric network node, is called to retrieve the data from a HyperledgerLab network.

The default method uses [getBlockchainLogsNoClient.js](https://github.com/ninori9/GraphGenerationBackend/blob/master/blockchain_data/log_extraction/getBlockchainLogsNoClient.js) for transaction data extraction.

If the transaction data should be retrieved using a client defined in the common connection profile, [getBlockchainLogsClient.js](https://github.com/ninori9/GraphGenerationBackend/blob/master/blockchain_data/log_extraction/getBlockchainLogsClient.js) is called.

In any case, the collected parsed transactions are written to the file system for further processing.

## Graph Generation
  
To create the transaction conflict graph, a combined read/write-set, which contains the operations of a transaction and their accessed keys, is created for each transaction. To determine the edges of the graph, the following two checks are done:
  
  - If the entry in the set is a write operation, the algorithm searches for prior read transactions on the keys.
  
  - If the entry is a failed read operation, the reason for the failure, which is a prior write transaction on the same key, is detected.
  
Additionally, attributes of the transaction conflict graph, such as the number of dependencies, inter- and intra-block conflicts, or the type of failures, are gathered.

## Serializability Check

All cycles of the graph are detected using [Johnson's algorithm](http://www.cs.tufts.edu/comp/150GA/homeworks/hw1/Johnson%2075.PDF). If there are no cycles, the set of transactions is serializable. Otherwise, the transactions involved in the most cycles are iteratively removed (and added to the array of transactions that would need to be aborted to ensure serializability) until there are no cycles left. This task may require significant memory resources, therefore 8GB of RAM is required.

-----

## How to use
  
### Caliper and test network
If you do not have a Fabric network running already, you might want to use the benchmarking framework Hyperledger Caliper and the Hyperledger Fabric test network.
A tutorial on how to setup the Fabric test network and Hyperledger Caliper is provided [here](https://github.com/ninori9/GraphGenerationBackend/blob/master/Tutorial.md).
The network has to contain certificate authorities to be able to register and enroll new users.

### Modify the [config.yaml](https://github.com/ninori9/GraphGenerationBackend/blob/master/config.yaml) file
The [config.yaml](https://github.com/ninori9/GraphGenerationBackend/blob/master/config.yaml) file should be edited by the user before using the application. The variables need to be adapted based on the Hyperledger Fabric network under test. 

If the application is used to generate graphs from a network deployed using [HyperledgerLab](https://github.com/MSRG/HyperLedgerLab-2.0), the variable <strong>HyperledgerLab</strong> should be set to true. Make sure the [connection profile](https://github.com/ninori9/GraphGenerationBackend/blob/master/blockchain_data/log_extraction/connectionprofile.yaml) matches the HyperledgerLab network.

Otherwise, the path to the common connection profile of the network, which may be a .json or .yaml file, needs to be specified (<strong>ccp_path</strong> variable). Depending on whether a client and its crypto store are defined in the common connection profile (<strong>client_and_cryptoStore</strong> variable), different methods to retrieve the transaction data are used. By default, a connection is established without using a predefined client, hence the <strong>channel</strong> and <strong>certificateAuthority</strong> variables need to be provided.
  
### Before running for the first time
If you start the backend for the first time, run the following command (may take several minutes):

### `npm install`

### Start application
To run the application, execute the following command in the project directory:

### `npm start`
Runs the app in the development mode.\
Open [http://localhost:3007](http://localhost:3007) to access the backend endpoints it via the browser.

Keep in mind that the [frontend](https://github.com/ninori9/GraphGenerationFrontend) should be run simultaneously. If it is, [http://localhost:3006](http://localhost:3006) can be visited to view the user interface and interact with the application.

-----
  
### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
The app is ready to be deployed!
