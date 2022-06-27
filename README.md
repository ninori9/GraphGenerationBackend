# Hyperledger Fabric Transaction Conflict Graph Generation Backend

This project is written in JavaScript and Shell, uses Node.js, Express.js, and the Hyperledger Fabric SDK for Node.js, and serves as the backend for an application that generates transaction conflict graphs (also called precedence graphs or serializability graphs) from transactions of the Hyperledger Fabric blockchain.

The app provides an endpoint ([http://localhost:3007/graphGeneration](http://localhost:3007/graphGeneration)), which receives startblock and endblock query parameters, extracts data from that block range from the Hyperledger Fabric blockchain (see [blockchain_data](https://github.com/ninori9/GraphGenerationBackend/tree/master/blockchain_data) folder), creates a transaction conflict graph, and checks for serializability using [Johnson's algorithm](http://www.cs.tufts.edu/comp/150GA/homeworks/hw1/Johnson%2075.PDF).

To see a visualization of the generated graphs, this app should be run together with the corresponding [frontend](https://github.com/ninori9/GraphGenerationFrontend).

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
