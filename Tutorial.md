# Set up of Fabric test network and Caliper
This file is a tutorial on how to set up the Fabric test network and use it with the benchmarking framework Hyperledger Caliper.
A repository, which facilitates this process and contains scripts, chaincodes, and workloads, can be found [here](https://github.com/ninori9/caliper-workspace). This is especially recommended for experimentation

-----

# Hyperledger Fabric test network
If you do not have a Fabric network set up already, you may want to use the [Hyperledger Fabric test network](https://hyperledger-fabric.readthedocs.io/en/latest/test_network.html).

### Install prerequisites
To be able to run a Hyperledger Fabric network on your machine, the installation of certain [prerequisites](https://hyperledger-fabric.readthedocs.io/en/release-2.2/prereqs.html) is required.

### Execute `curl -sSL https://bit.ly/2ysbOFE | bash -s`
This command clones the fabric-samples repository, and installs the required binaries and Docker images.

### Change to test network directory
Execute `cd fabric-samples/test-network` to change to the directory of the test network. From here all the following commands can be executed.

### Adapt network configuration
You can adapt parameters such as block size by editing the <strong>fabric-samples/test-network/configtx/configtx.yaml</strong> file.

### Start network
Execute `./network.sh up createChannel -ca`. This command starts the network, creates a channel and joins the peers, and also starts certificate authorities, which is required for the backend to retrieve the transaction data.

### Install chaincode
To deploy a smart contract on the channel, execute the following command: `./network.sh deployCC -ccn $CHAINCODE_NAME -ccp $CHAINCODE_PATH -ccl $PROGRAMMING_LANGUAGE`.

### View components of network
The `docker ps -a` command can be used to view all participants of the Fabric network.

### Bring down network
The network can be brought down using `./network.sh down`. The network has to be running to use it for benchmarking.

-----

# Hyperledger Caliper
You may also want to use the official [documentation](https://hyperledger.github.io/caliper/v0.4.2/fabric-tutorial/tutorials-fabric-existing/) of Caliper to on how to run a benchmark on an existing network. However, using version v0.5.0 of Caliper instead of v0.4.2 is recommended to avoid certain errors.

### Create caliper workspace `mkdir caliper-workspace`
In this folder, there should be three folder: <strong>networks</strong>, <strong>benchmarks</strong>, and <strong>workload</strong>.


In any case, before using Caliper for the first time, execute the following two commands in the project directory of this repository (caliper-workspace):

### `npm install --only=prod @hyperledger/caliper-cli@0.5.0`

### `npx caliper bind --caliper-bind-sut fabric:2.2`

### Create network configuration file
A network configuration file <strong>networkConfig.yaml</strong> should be created in the <strong>networks</strong> folder. The file contains information about the network and has the following structure:

```
name: Calier test
version: "2.0.0"

caliper:
  blockchain: fabric

channels:
  - channelName: mychannel
    contracts:
    - id: <CHAINCODE_NAME> 

organizations:
  - mspid: Org1MSP
    identities:
      certificates:
      - name: 'User1'
        clientPrivateKey:
          path: '../fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/User1@org1.example.com/msp/keystore/<PRIV_KEY_FILE_NAME_sk'
        clientSignedCert:
          path: '../fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/User1@org1.example.com/msp/signcerts/cert.pem'
    connectionProfile:
      path: '../fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.yaml'
      discover: true

```

Adapt the paths if you are not using the fabric-samples test network. In any case, you should adapt the client private key path and the id of the deployed chaincode.

### Create a workload
In the <strong>workloads</strong> folder, create a .js file that describes the workload during benchmarking round. A tutorial on how to create such files can be found [here](https://hyperledger.github.io/caliper/v0.4.2/fabric-tutorial/tutorials-fabric-existing/#step-3---build-a-test-workload-module). You may also use other existing workload files.

### Build benchmarking configuration file
In the <strong>benchmarks</strong> folder, you can create a <strong>config.yaml</strong> file. In this file, variables related to the benchmarking run, such as the number of workers or the transaction send rate, are defined. The file has the following structure:

```
test:
  workers:
    type: local
    number: 10

  rounds:
    - label: common
      txNumber: 5000
      rateControl:
          type: fixed-rate
          opts:
            tps: 25
      workload:
        module: benchmarks/generator/common.js
```

### Run the benchmark
Execute `npx caliper launch manager --caliper-workspace ./ --caliper-networkconfig networks/networkConfig.yaml --caliper-benchconfig benchmarks/config.yaml --caliper-flow-only-test --caliper-fabric-gateway-enabled --caliper-fabric-timeout-invokeorquery 110>`. The last parameter is only needed in the case of a low send rate and high block size to prevent timeout errors.

-----

# Folder structure
The recommended final folder structure can be seen below.
```    
│
└───caliper-workspace
│       
│   
└───GraphGenerationBackend
│       
│   
└───GraphGenerationFrontend
│       
│   
└───fabric-samples
│   │
│   └───test-network
│   │
│   └───...
```
