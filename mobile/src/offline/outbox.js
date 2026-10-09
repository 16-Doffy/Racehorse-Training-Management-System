// The outbox: writes a groom makes without a connection wait here, in storage, and go out when the
// connection is back. Plain JavaScript with its storage and its senders passed in, so it can be
// tested without a phone.
//
//   submit()  tries to send now; a dead connection puts the write in the outbox instead of losing it.
//   flush()   sends what is waiting, oldest first, for one user. It stops at the first dead
//             connection (the rest would fail the same way) and keeps order.
//
// A write the server refuses (wrong state, outside its time window…) is not retried: it moves to
// `failures` with the server's reason, so the groom is told rather than left to wonder.

export const OUTBOX_KEY = 'rtms.outbox.v1';
// A write is tried at most this many times against a server that answers with an error; a dead
// connection does not count, it is simply waited out.
export const MAX_SERVER_ERRORS = 5;
export const WRITE_TIMEOUT_MS = 15000;

/** True when the request never got an answer: no signal, a dropped link, or a timeout. */
export const isNetworkError = (err) => !!err && err.isNetworkError === true;

const idFrom = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function createOutbox({ storage, handlers, now = () => Date.now(), makeId = idFrom }) {
  let state = { items: [], failures: [] };
  const listeners = new Set();
  let flushing = null;

  const emit = () => listeners.forEach((fn) => fn(state));
  const persist = async () => {
    try {
      await storage.setItem(OUTBOX_KEY, JSON.stringify(state));
    } catch {
      // Storage full or unavailable: the outbox still works for this session.
    }
  };
  const commit = async (next) => {
    state = next;
    emit();
    await persist();
  };

  async function load() {
    try {
      const raw = await storage.getItem(OUTBOX_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.items)) {
        state = { items: parsed.items, failures: Array.isArray(parsed.failures) ? parsed.failures : [] };
      }
    } catch {
      // A damaged file means starting empty, not crashing on launch.
    }
    emit();
    return state;
  }

  const enqueue = (type, args, meta, attempts = 0) => {
    const item = { id: makeId(), type, args, userId: meta.userId, label: meta.label, horseName: meta.horseName, taskId: meta.taskId, createdAt: now(), attempts };
    return commit({ ...state, items: [...state.items, item] }).then(() => item);
  };

  /**
   * Send now, or queue if there is no connection. Returns `{ queued: true }` when it was queued;
   * an error from the server (not the network) is thrown so the screen can show it.
   */
  async function submit(type, rawArgs, meta) {
    const handler = handlers[type];
    if (!handler) throw new Error(`Unknown outbox type: ${type}`);
    // When the groom did it and which action it is, fixed now: a write sent later (no signal) still
    // records the time of the tap, and a resend of the same action is recognised by the server.
    const args = { ...rawArgs, performedAt: rawArgs.performedAt || new Date(now()).toISOString(), clientOpId: rawArgs.clientOpId || makeId() };

    // Older writes for this user go first: "done" must not overtake "I've seen it".
    if (state.items.some((i) => i.userId === meta.userId)) {
      await enqueue(type, args, meta);
      flush(meta.userId);
      return { queued: true };
    }

    try {
      const result = await handler.send(args, { timeout: WRITE_TIMEOUT_MS });
      return { queued: false, result };
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      // The request may have reached the server before the link dropped, so it counts as tried once.
      await enqueue(type, args, meta, 1);
      return { queued: true };
    }
  }

  let rerun = false;
  function flush(userId) {
    // A flush already running was started before whatever just changed (a connection that came
    // back, a write that was added), so run once more when it ends instead of handing back its result.
    if (flushing) {
      rerun = true;
      return flushing.then((outcome) => {
        if (!rerun) return outcome;
        rerun = false;
        return flush(userId);
      });
    }
    flushing = (async () => {
      const outcome = { sent: 0, failed: 0, offline: false };
      for (const item of [...state.items]) {
        if (item.userId !== userId) continue;
        const handler = handlers[item.type];
        const drop = (failure) =>
          commit({
            items: state.items.filter((i) => i.id !== item.id),
            failures: failure ? [...state.failures, { id: item.id, type: item.type, label: item.label, horseName: item.horseName, message: failure, at: now() }] : state.failures,
          });
        const bump = () => commit({ ...state, items: state.items.map((i) => (i.id === item.id ? { ...i, attempts: i.attempts + 1 } : i)) });

        try {
          await handler.send(item.args, { timeout: WRITE_TIMEOUT_MS });
          await drop(null);
          outcome.sent += 1;
        } catch (err) {
          if (isNetworkError(err)) {
            outcome.offline = true;
            await bump();
            break;
          }
          // An earlier try may have gone through unnoticed (answer lost): ask before calling it a failure.
          if (item.attempts > 0 && handler.alreadyDone) {
            try {
              if (await handler.alreadyDone(item.args)) {
                await drop(null);
                outcome.sent += 1;
                continue;
              }
            } catch (checkErr) {
              if (isNetworkError(checkErr)) {
                outcome.offline = true;
                break;
              }
            }
          }
          const serverDown = (err.status || 0) >= 500;
          if (serverDown && item.attempts + 1 < MAX_SERVER_ERRORS) {
            await bump();
            break; // keep order; try again on the next flush
          }
          await drop(err.message || 'Máy chủ từ chối thao tác này.');
          outcome.failed += 1;
        }
      }
      return outcome;
    })().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  const dismissFailure = (id) => commit({ ...state, failures: state.failures.filter((f) => f.id !== id) });

  return {
    load,
    submit,
    flush,
    dismissFailure,
    getState: () => state,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
