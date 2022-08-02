#!/usr/bin/env bash
set +ex

rm ./blockchain_data/log_extraction/data/*

node log_extraction/getBlockchainLogs.js $1 $2 false

logdir=$3
mkdir -p ./blockchain_data/log_store/$logdir && cp ./blockchain_data/log_extraction/data/* ./blockchain_data/log_store/$logdir
rm ./blockchain_data/log_extraction/data/*

set -ex
