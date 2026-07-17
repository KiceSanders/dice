interface PendingAction {
  scope: object;
  blocksKoozie: boolean;
  timer: NodeJS.Timeout | null;
}

/**
 * Cancellable delayed actions. Ordinary rolls may overlap when the same player
 * immediately picks the koozie back up; terminal and special rolls separately
 * expose that the koozie must stay parked.
 */
export class DelayedActions {
  private readonly actions = new Map<number, PendingAction>();
  private nextId = 1;

  get pending(): boolean {
    return this.actions.size > 0;
  }

  pendingFor(scope: object): boolean {
    return [...this.actions.values()].some((action) => action.scope === scope);
  }

  koozieBlockedFor(scope: object): boolean {
    return [...this.actions.values()].some(
      (action) => action.scope === scope && action.blocksKoozie,
    );
  }

  arm(scope: object, blocksKoozie: boolean): number {
    const id = this.nextId++;
    this.actions.set(id, { scope, blocksKoozie, timer: null });
    return id;
  }

  releaseAfter(id: number, delayMs: number, action: () => void): void {
    const pending = this.actions.get(id);
    if (!pending) throw new Error('delayed action is not armed');
    if (delayMs <= 0) {
      this.actions.delete(id);
      action();
      return;
    }
    pending.timer = setTimeout(() => {
      this.actions.delete(id);
      action();
    }, delayMs);
    pending.timer.unref?.();
  }

  cancel(): void {
    for (const action of this.actions.values()) {
      if (action.timer) clearTimeout(action.timer);
    }
    this.actions.clear();
  }
}
