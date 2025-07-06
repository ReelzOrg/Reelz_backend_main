import path from 'path';
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";

const PROTO_PATH = path.resolve(__dirname, '../../protos/llm_service.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const llmProtoDescriptor = grpc.loadPackageDefinition(packageDefinition).llm;

const client = new llmProtoDescriptor.LLMService('localhost:50051', grpc.credentials.createInsecure());

export async function llmChatClient(req, res) {
  let sessionId = req.body.sessionId;
  const grpcRequest = {
    prompt: req.body.prompt,
    model: req.body.model || 'gemma3:4b',
    session_id: sessionId,
    // We are not handling the chat histiry here, it will be handled in the python server
    // history: req.body.history ? req.body.history.map(msg => ({role: msg.role, content: msg.content})) : []
  };

  // Set up streaming response for the web client
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Session-ID': sessionId // Send session ID back to client (or don't)
  });

  try {
    //we will be getting a streaming response
    const call = await client.LLMChat(grpcRequest);

    call.on("data", (response) => {
      res.write(`data: ${JSON.stringify(response)}\n\n`);
    });

    call.on("end", () => {
      res.end();
      console.log(`[Node.js Gateway] gRPC stream for session ${sessionId} ended.`);
    });

    call.on("error", (error) => {
      console.error(`[Node.js Gateway] gRPC stream error for session ${sessionId}:`, error);
      res.write(`data: ${JSON.stringify({ error: `LLM service error: ${error.details || error.message}` })}\n\n`);
      res.end();
    });
  } catch (error) {
    console.error('Error in gRPC call:', error);
    res.status(500).json({ error: 'Failed to connect to gRPC server' });
  }
}