import { Router } from 'express';
import type { SessionManager } from '../session/manager';

export function sessionsRouter(mgr: SessionManager): Router {
  const r = Router();
  r.get('/:code', (req, res) => {
    const s = mgr.getByRoomCode(req.params.code!);
    if (!s) return res.status(404).json({ error: 'not found' });
    res.json(s);
  });
  return r;
}
