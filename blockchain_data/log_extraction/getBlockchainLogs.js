'use strict';

const fs = require('fs');
const FabricClient = require('fabric-client');



async function setClient() {

    // Get arguments
    const startblock = Number(process.argv[2]);
    let endblock = Number(process.argv[3]);

    console.log('startblock', startblock);
    console.log('endblock', endblock);

	let client =  FabricClient.loadFromConfig('./log_extraction/connectionprofile.yaml');
	await client.initCredentialStores().then(async (nothing) => {
        await client.setUserContext({username:'admin', password:'adminpw'}).then(async (admin) => {
            // Get channel of client
            const channel = client.getChannel();

            // Get blockchain height and compare with startblock and endblock
            let blockchaininfo = await channel.queryInfo();
            let blockchainheight = blockchaininfo.height;
            
            if(blockchainheight < startblock) {
                // Set endblock to startblock -> skip loop, no files will be written
                endblock = startblock;
            }
            else if(blockchainheight < endblock) {
                // Endblock maximum is limited by blockchain height
                endblock = blockchainheight;
            }

            let current_tx_num = 1;

            //The specified blocks of the blockchain are parsed
            for (let index = startblock; index < (endblock + 1); index++) {
                var fileName = "./log_extraction/data/" + index + ".json";
                var jsonstr = "";

                try {
                    //Block queried from the blockchain
                    var block = await channel.queryBlock(index);

                    // Transactions are parsed to avoid writing and copying irrelevant data
                    let parsedTransactions = [];
                    for(let j=0; j<block.data.data.length; j++) {
                        parsedTransactions.push(
                            {
                                tx_number: current_tx_num,
                                tx_id: block.data.data[j].payload.header.channel_header.tx_id,
                                type: block.data.data[j].payload.header.channel_header.typeString,
                                block_number: index,
                                proposal_response_result: block.data.data[j].payload.data.actions[0].payload.action.proposal_response_payload.extension.results,
                                status: block.metadata.metadata[2][j],
                            }
                        );
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