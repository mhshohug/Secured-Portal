import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { apiRoutes } from './server/routes/apiRoutes';
import { setupSocketHandlers } from './server/socket/socketHandler';
import { logger } from './server/utils/logger';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // Mount API routes
  app.use('/api', apiRoutes);

  // Create HTTP server for Socket.IO
  const server = http.createServer(app);

  const io = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  setupSocketHandlers(io);

  // Vite middleware for development or static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    logger.info("Vite middleware mounted for development.");
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});
    logger.info("Static file serving enabled for production.");
  }
  
server.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server running on port ${PORT}`);
});
}

startServer().catch((err) => {
  logger.error("Failed to start server:", err);
});
