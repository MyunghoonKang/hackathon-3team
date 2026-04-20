import express from 'express';
import { createServer } from 'node:http';
import { Server as IOServer } from 'socket.io';

const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

const httpServer = createServer(app);
new IOServer(httpServer, {
  cors: { origin: 'http://localhost:5173' },
});

const port = Number(process.env.PORT ?? 3000);
httpServer.listen(port, () => {
  console.log(`[server] listening on :${port}`);
});
