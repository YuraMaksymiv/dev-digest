import { InMemoryTransport, type JSONRPCMessage, type McpServer } from '@modelcontextprotocol/server';

export interface RpcSession {
  request(method: string, params?: Record<string, unknown>): Promise<Record<string, any>>;
  notifications: Record<string, any>[];
  close(): Promise<void>;
}

/** Minimal JSON-RPC client over the SDK's in-memory transport (legacy initialize handshake). */
export async function connectInMemory(server: McpServer): Promise<RpcSession> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);

  const pending = new Map<number, (msg: Record<string, any>) => void>();
  const notifications: Record<string, any>[] = [];
  clientSide.onmessage = (message: JSONRPCMessage) => {
    const msg = message as Record<string, any>;
    if (typeof msg.id === 'number' && ('result' in msg || 'error' in msg)) pending.get(msg.id)?.(msg);
    else if (msg.method) notifications.push(msg);
  };
  await clientSide.start();

  let nextId = 1;
  const request: RpcSession['request'] = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, (msg) => (msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)));
      void clientSide.send({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) } as JSONRPCMessage);
    });

  await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '0.0.0' },
  });
  await clientSide.send({ jsonrpc: '2.0', method: 'notifications/initialized' } as JSONRPCMessage);

  return { request, notifications, close: () => clientSide.close() };
}
