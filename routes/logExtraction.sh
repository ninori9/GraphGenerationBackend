#!/usr/bin/env bash
set +ex

rm ./routes/log_extraction/data/*

kubectl exec hlf-peer--org1--peer0-0 -- sh -c "rm -rf log_extraction"
kubectl exec hlf-peer--org1--peer0-0 -- sh -c "rm -rf node_modules"
kubectl cp ./routes/log_extraction hlf-peer--org1--peer0-0:./
echo "Copied log extraction"
kubectl exec hlf-peer--org1--peer0-0 -- sh -c "apk update"
kubectl exec hlf-peer--org1--peer0-0 -- sh -c "apk add g++ make py3-pip"
kubectl exec hlf-peer--org1--peer0-0 -- sh -c "apk add npm"
kubectl exec hlf-peer--org1--peer0-0 -- sh -c "npm i fabric-client@1.4.20"
kubectl exec hlf-peer--org1--peer0-0 -- sh -c "node log_extraction/getBlockchainLogs.js $1 $2"
kubectl cp -c peer hlf-peer--org1--peer0-0:log_extraction/data ./routes/log_extraction/data/.
kubectl exec hlf-peer--org1--peer0-0 -- sh -c "rm -rf log_extraction"
kubectl exec hlf-peer--org1--peer0-0 -- sh -c "rm -rf node_modules"
logdir=$3
mkdir -p ./routes/log_store/$logdir && cp ./routes/log_extraction/data/* ./routes/log_store/$logdir
rm ./routes/log_extraction/data/*

set -ex
