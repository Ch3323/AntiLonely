let currentUnreadCount: number | null = null;
const listeners = new Set<() => void>();

export function getUnreadCountSnapshot(): number | null {
  return currentUnreadCount;
}

export function setUnreadCountSnapshot(next: number | null): void {
  if (currentUnreadCount === next) return;
  currentUnreadCount = next;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeUnreadCount(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function syncServerUnreadCount(input: {
  signedIn: boolean | null;
  count: number | undefined;
  shownBefore: boolean;
  prevCount: number | undefined;
}): { shouldFetchInitial: boolean } {
  if (input.signedIn === false) {
    setUnreadCountSnapshot(null);
    return { shouldFetchInitial: false };
  }
  const isNewServerCount =
    !input.shownBefore || input.prevCount !== input.count;
  if (typeof input.count === "number") {
    if (isNewServerCount) {
      setUnreadCountSnapshot(input.count);
    }
    return { shouldFetchInitial: false };
  }
  return {
    shouldFetchInitial: currentUnreadCount === null,
  };
}
