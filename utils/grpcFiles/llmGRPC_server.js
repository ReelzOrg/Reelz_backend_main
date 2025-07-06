import path from 'path';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

const PROTO_PATH = path.resolve(__dirname, '../../protos/llm_service.proto');

// Load the proto file (llm_service.proto)
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const llmProtoDescriptor = grpc.loadPackageDefinition(packageDefinition).llm;

// Stub Constructor
// llmProtoDescriptor.LLMService

// Service descriptor (which is used to create a server)
// llmProtoDescriptor.LLMService.service

// function getResponseFromLLM(call, callback) {
//   const chatReq = call.request; //{prompt, session_id, {role, content}[]}
// }

function getServer() {
  var server = new grpc.Server();
  // server.addService(llmProtoDescriptor.LLMService.service, {
  //   Generate: getResponseFromLLM
  // });
  return server;
}

if(require.main == module) {
  const server = getServer();
  server.bindAsync(
    '0.0.0.0:50051',
    grpc.ServerCredentials.createInsecure(),  //use insecure connections for local development
    (err, port) => {
      if(err) {
        console.log(err);
        return;
      }
      // server.start();
      console.log('Server running at http://0.0.0.0:' + port);
    }
  );
}