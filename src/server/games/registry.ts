import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { watch as chokidarWatch, type FSWatcher } from 'chokidar';
import { EventEmitter } from 'node:events';
import { GameMetaSchema } from '../../shared/protocol';
import type { GameMeta } from '../../shared/protocol';

interface Options { dir: string; watch?: boolean; }

// GameMeta + filename (registry 내부 확장)
export interface GameEntry extends GameMeta {
  filename: string;
}

const META_RE = /<meta\s+name=["']game:([a-zA-Z-]+)["']\s+content=["']([^"']*)["']/g;

export class GameRegistry extends EventEmitter {
  private byId = new Map<string, GameEntry>();
  private watcher?: FSWatcher;
  private scanTimer?: ReturnType<typeof setTimeout>;
  constructor(private opts: Options) { super(); }

  async scan(): Promise<void> {
    const files = (await readdir(this.opts.dir)).filter(f => f.endsWith('.html') && !f.startsWith('_'));
    this.byId.clear();
    for (const f of files) {
      const meta = await this.parseFile(f);
      if (meta) {
        this.byId.set(meta.id, meta);
        this.emit('added', meta);
      }
    }
  }

  private async parseFile(filename: string): Promise<GameEntry | null> {
    const html = await readFile(join(this.opts.dir, filename), 'utf8');
    const raw: Record<string, string> = {};
    for (const m of html.matchAll(META_RE)) raw[m[1]!] = m[2]!;

    const draft = {
      id: basename(filename, '.html'),
      filename,
      title: raw['title'],
      minPlayers: Number(raw['min-players']),
      maxPlayers: Number(raw['max-players']),
      description: raw['description'] ?? '',
      compare: raw['compare'],
      mode: raw['mode'],
    };
    const parsed = GameMetaSchema.safeParse(draft);
    if (!parsed.success) {
      console.warn(`[registry] skip ${filename}: ${parsed.error.message}`);
      return null;
    }
    return parsed.data as GameEntry;
  }

  list(): GameEntry[] { return [...this.byId.values()]; }
  get(id: string): GameEntry | undefined { return this.byId.get(id); }

  startWatching(): void {
    if (!this.opts.watch) return;
    const debouncedScan = () => {
      clearTimeout(this.scanTimer);
      this.scanTimer = setTimeout(() => this.scan(), 200);
    };
    this.watcher = chokidarWatch(this.opts.dir, { ignoreInitial: true });
    this.watcher.on('add', debouncedScan);
    this.watcher.on('change', debouncedScan);
    this.watcher.on('unlink', debouncedScan);
  }

  async stop(): Promise<void> { await this.watcher?.close(); }
}
