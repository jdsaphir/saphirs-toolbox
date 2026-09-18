// What the Settings panel should show, given a downloaded update and whatever
// the updater is doing right now.
//
// These are two different kinds of fact. A downloaded update is settled: it
// installs on quit whatever happens next, and no later check can undo it.
// Checking, failing, or finding the same release again are passing states of a
// single check. Keeping them in one variable meant every later check erased
// what we knew — the check began, 'ready' became 'checking', and each guard
// written to protect 'ready' was reading a state that had already been
// overwritten.
//
// So the pending update is kept apart and wins here, in one place, rather than
// being defended at each event.

import type { UpdateStatus } from './types';

// `ready` is the version waiting to install, or null when nothing is.
export function visibleStatus(ready: string | null, current: UpdateStatus): UpdateStatus {
  if (!ready) return current;
  // Downloading is the one thing allowed through: it means a newer release than
  // the pending one turned up, and its progress is worth watching. It replaces
  // `ready` once it finishes.
  if (current.state === 'downloading') return current;
  // No checkedAt: that field is when a check last completed, which a pending
  // download says nothing about, and the panel doesn't show a time here anyway.
  return { state: 'ready', version: ready };
}
