import { createServer } from 'http';
import { Server } from 'socket.io';
import express from 'express';
import { registerSimulationHandlers } from './handlers/simulation-handler.js';
import { registerFlowHandlers } from './handlers/flow-handler.js';
import { handleTrafficInjection, getSimulationStatus } from './handlers/traffic-injection-handler.js';

const PORT = process.env.SIMULATION_SERVER_PORT || 3001;

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:8089',
  process.env.NEXT_DEPLOYED_URL,
  ...(process.env.ALLOWED_ORIGINS?.split(',') ?? []),
]
  .filter((origin): origin is string => typeof origin === 'string' && origin.trim().length > 0)
  .map((origin) => origin.trim())
  .filter((origin, index, arr) => arr.indexOf(origin) === index);

const app = express();
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

// REST API endpoints for Locust
app.post('/api/traffic/inject', handleTrafficInjection);
app.get('/api/simulation/:simulationId/status', getSimulationStatus);
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  registerSimulationHandlers(io, socket);
  registerFlowHandlers(io, socket);

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Simulation server running on port ${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(', ') || '(none)'}`);
  console.log(`- WebSocket: ws://localhost:${PORT}`);
  console.log(`- HTTP API: http://localhost:${PORT}/api/traffic/inject`);
  console.log(`- Health: http://localhost:${PORT}/health`);
});


