import type { CompareRule } from '../../shared/protocol';

interface Submission { playerId: string; value: number; }

export class GameRunner {
  private submissions = new Map<string, number>();
  private participantSet: Set<string>;
  constructor(
    public readonly sessionId: string,
    private readonly participants: ReadonlyArray<string>,
    private readonly rule: CompareRule,
  ) {
    this.participantSet = new Set(participants);
  }

  submit(playerId: string, value: number): void {
    if (!this.participantSet.has(playerId)) throw new Error(`${playerId} not a participant`);
    if (this.submissions.has(playerId)) throw new Error(`duplicate submission from ${playerId}`);
    if (!Number.isFinite(value)) throw new Error('value must be finite');
    this.submissions.set(playerId, value);
  }

  isComplete(): boolean { return this.submissions.size === this.participants.length; }

  missingPlayers(): string[] {
    return this.participants.filter(p => !this.submissions.has(p));
  }

  resolve(): { loserId: string; results: Submission[] } {
    if (!this.isComplete()) throw new Error('not all players have submitted');
    const results: Submission[] = this.participants.map(p => ({ playerId: p, value: this.submissions.get(p)! }));
    const extremum = this.rule === 'max'
      ? Math.max(...results.map(r => r.value))
      : Math.min(...results.map(r => r.value));
    const tied = results.filter(r => r.value === extremum);
    const loser = tied[Math.floor(Math.random() * tied.length)]!;
    return { loserId: loser.playerId, results };
  }
}
