import { Router } from 'express';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { GameRegistry } from '../games/registry';
import { createUploader } from '../games/upload';

export function gamesRouter(registry: GameRegistry, gamesDir: string): Router {
  const router = Router();
  const upload = createUploader(gamesDir);

  router.get('/', (_req, res) => res.json(registry.list()));

  router.post('/', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file missing' });
    await registry.scan();
    const added = registry.list().find(g => g.filename === req.file!.filename);
    if (!added) {
      await unlink(join(gamesDir, req.file.filename)).catch(() => {});
      return res.status(422).json({ error: 'invalid game (missing required meta)' });
    }
    res.status(201).json(added);
  });

  return router;
}
