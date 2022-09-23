'use strict';

// Example transactions for demonstration purposes
function exampleTransactions() { 
    const transactions = [
        {
            tx_number: 0,
            tx_id: "b6b0593e3dcd1818bc2f63fdb21fbc0062610bada76b8472f9b1cc412436ac7f",
            creator: "Org1MSP",
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
                chaincode: "simplesupplychain",
                function: [
                    80,
                    117,
                    115,
                    104,
                    65,
                    83,
                    78
                ].toString('utf8')
            },
            endorsements: ["Org1MSP", "Org2MSP"],
            status: 11
        },
        {
            tx_number: 1,
            tx_id: "f50e4b086c43aa1c8cba91a66f37b8a85414e3edbc758a8e72db906c73ba5e76",
            creator: "Org1MSP",
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
                chaincode: "simplesupplychain",
                function: [
                    80,
                    117,
                    115,
                    104,
                    65,
                    83,
                    78
                ].toString('utf8')
            },
            endorsements: ["Org1MSP", "Org2MSP"],
            status: 0
        },
        {
            tx_number: 2,
            tx_id: "a4027bcfa477f1b5793fd011734aa295bb5bae60e384df1995a6d2b5c858290a",
            creator: "Org1MSP",
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
                chaincode: "simplesupplychain",
                function: [
                    80,
                    117,
                    115,
                    104,
                    65,
                    83,
                    78
                ].toString('utf8')
            },
            endorsements: ["Org1MSP", "Org2MSP"],
            status: 0
        },
        {
            tx_number: 3,
            tx_id: "3c50a3ed31a4e9f5c58818d65cabe7f57471a2bc9cfef6876a0a6466478a8875",
            creator: "Org1MSP",
            class: "Update",
            typeString: "ENDORSER_TRANSACTION",
            block_number: 15,
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
                chaincode: "simplesupplychain",
                function: [
                    80,
                    117,
                    115,
                    104,
                    65,
                    83,
                    78
                ].toString('utf8')
            },
            endorsements: ["Org1MSP", "Org2MSP"],
            status: 12
        },
        {
            tx_number: 4,
            tx_id: "4ccbb77ec80e7e0d29e70214dd1981b37151be0fa55a402a505fea0004328b10",
            creator: "Org1MSP",
            class: "Update",
            typeString: "ENDORSER_TRANSACTION",
            block_number: 15,
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
                chaincode: "simplesupplychain",
                function: [
                    80,
                    117,
                    115,
                    104,
                    65,
                    83,
                    78
                ].toString('utf8')
            },
            endorsements: ["Org1MSP", "Org2MSP"],
            status: 11
        },
        {
            tx_number: 5,
            tx_id: "e3d8738a410d5ab0461d3ff9d58cd966dfff35a5f2f78adfc67bf0c5ee5f2afe",
            creator: "Org1MSP",
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
                chaincode: "simplesupplychain",
                function: [
                    80,
                    117,
                    115,
                    104,
                    65,
                    83,
                    78
                ].toString('utf8')
            },
            endorsements: ["Org1MSP", "Org2MSP"],
            status: 0
        },
    ];
    return transactions;
}

module.exports = { exampleTransactions };