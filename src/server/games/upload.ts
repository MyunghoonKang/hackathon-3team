import multer from 'multer';

export function createUploader(gamesDir: string) {
  return multer({
    storage: multer.diskStorage({
      destination: gamesDir,
      filename: (_req, file, cb) => {
        const safe = file.originalname.replace(/[/\\]/g, '_');
        if (!safe.endsWith('.html')) return cb(new Error('html only'), '');
        cb(null, safe);
      },
    }),
    limits: { fileSize: 256 * 1024 }, // 256KB
    fileFilter: (_req, file, cb) => {
      cb(null, file.mimetype === 'text/html' || file.originalname.endsWith('.html'));
    },
  });
}
