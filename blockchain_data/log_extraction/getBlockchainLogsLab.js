'use strict';

const fs = require('fs');
const FabricClient = require('fabric-client');


async function setClient() {

    // Get arguments
    const startblock = Number(process.argv[2]);
    let endblock = Number(process.argv[3]);
    

	let client =  FabricClient.loadFromConfig('./log_extraction/connectionprofile.yaml');
	await client.initCredentialStores().then(async (nothing) => {
        await client.setUserContext({username:'admin', password:'adminpw'}).then(async (admin) => {
            // Get channel of client
            const channel = client.getChannel();

            // Get blockchain height and compare with startblock and endblock
            let blockchaininfo = await channel.queryInfo();
            let blockchainheight = blockchaininfo.height.toNumber();
            
            if(blockchainheight < startblock) {
                // If startblock smaller than endblock, return without retrieving data
                return;
            }
            else if(blockchainheight < endblock) {
                // Endblock maximum is limited by blockchain height
                endblock = blockchainheight - 1;
            }

            let current_tx_num = 0;

            //The specified blocks of the blockchain are parsed
            for (let index = startblock; index < (endblock + 1); index++) {
                var fileName = "./log_extraction/data/" + index + ".json";
                var jsonstr = "";

                try {
                    //Block queried from the blockchain
                    var block = await channel.queryBlock(index);

                    // Transactions are parsed to avoid writing and copying irrelevant data
                    let parsedTransactions = [];
                    // TODO: Need to parse differently if different transaction type due to different structure
                    for(let j=0; j<block.data.data.length; j++) {

                        const tx_type_string = block.data.data[j].payload.header.channel_header.typeString; // e.g. configuration update or endorser transaction

                        if(tx_type_string === 'CONFIG') {
                            parsedTransactions.push(
                                {
                                    tx_number: current_tx_num,
                                    tx_id: block.data.data[j].payload.header.channel_header.tx_id,
                                    creator: block.data.data[j].payload.header.signature_header.creator.Mspid,
                                    typeString: tx_type_string,
                                    block_number: index,
                                    tx_block_number: j,
                                    status: block.metadata.metadata[2][j],
                                }
                            );
                        }

                        // Else transaction is ENDORSER_TRANSACTION
                        else {
                            const tx_chaincode = block.data.data[j].payload.data.actions[0].payload.chaincode_proposal_payload.input.chaincode_spec;
                            const tx_rw_set = block.data.data[j].payload.data.actions[0].payload.action.proposal_response_payload.extension.results.ns_rwset;
                            
                            // Classify transactions: Read-only, write-only, update (read and write), range read, undefined (only emtpy sets)
                            let tx_class;
                            let readsNum = 0; let writesNum = 0; let rangeReadNum = 0;
                            for(let s= 0; s<tx_rw_set.length; s++) {
                                // Exclude _lifcycle or other system chaincode invocations
                                if(tx_rw_set[s].namespace === tx_chaincode.chaincode_id.name) {
                                    readsNum += tx_rw_set[s].rwset.reads.length;
                                    writesNum += tx_rw_set[s].rwset.writes.length;
                                    rangeReadNum += tx_rw_set[s].rwset.range_queries_info.length;
                                }
                            }
                            if(rangeReadNum > 0) {
                                tx_class = 'Range Query';
                            }
                            else if(readsNum > 0 && writesNum === 0) {
                                tx_class = 'Read-only';
                            }
                            else if(writesNum > 0 && readsNum === 0) {
                                tx_class = 'Write-only';
                            }
                            else if(writesNum > 0 && readsNum > 0) {
                                tx_class = 'Update';
                            }
                            else {
                                tx_class = 'Undefined';
                            }

                            const tx_endorsements = block.data.data[j].payload.data.actions[0].payload.action.endorsements;

                            parsedTransactions.push(
                                {
                                    tx_number: current_tx_num,
                                    tx_id: block.data.data[j].payload.header.channel_header.tx_id,
                                    creator: block.data.data[j].payload.header.signature_header.creator.Mspid,
                                    class: tx_class, 
                                    typeString: tx_type_string,
                                    block_number: index,
                                    tx_block_number: j,
                                    rw_set: tx_rw_set,
                                    chaincode_spec: {
                                        chaincode: tx_chaincode.chaincode_id.name,
                                        function: tx_chaincode.input.args[0].toString('utf8')
                                    },
                                    endorsements: tx_endorsements.map(e => e.endorser.Mspid),
                                    status: block.metadata.metadata[2][j],
                                }
                            );
                        }
                        current_tx_num += 1;
                    }

                    const jsonBlock = {
                        transactions: parsedTransactions
                    };

                    jsonstr = JSON.stringify(jsonBlock, null, 4)
                }
                catch(e) {
                    console.log("CAUGHT JSON LENGTH EXCEPTION")
                }
                //Blocks are written to the filesystem
                fs.writeFile(
                    fileName,
                    jsonstr,
                    function (err) {
                        if (err) {
                            console.error('Saving BLOCK failed');
                        }
                    }
                );
            }
            
            return channel;
        });	
	})
}

setClient()
  .then((channel) => { 
	  console.log('Client setup successful')

  })
  .then(() => { console.log('Client setup complete')});
