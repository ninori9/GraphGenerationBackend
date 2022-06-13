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

            //The complete blockchain is parsed
            for (let index = startblock; index < (endblock + 1); index++) {
                var fileName = "./log_extraction/data/" + index + ".json";
                var jsonstr = "";
                try {
                    //Blocks are queried from the blockchain
                    jsonstr = JSON.stringify((await channel.queryBlock(index)), null, 4)
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