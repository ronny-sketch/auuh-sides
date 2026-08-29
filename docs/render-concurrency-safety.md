# Render Concurrency Safety

## The incident this exists to prevent (already happened once)

Session A was running a 60-second 4K stress render in the main `auuh`
worktree, writing into the shared `analysis/_master_chunks/` directory
(per `render_master.mjs`'s hardcoded `CHUNK_DIR = "analysis/_master_chunks"`
constant). Session B — a separate, independent session in the same
worktree — started a different render job and, as part of its own normal
startup sequence, ran:

```
rm -rf analysis/_master_chunks analysis/_test_output
```

This is completely reasonable code in isolation (a render script clearing
its own output directory before a clean run) — the failure was
architectural, not a bad line of code: **there was no way for Session B's
cleanup step to know Session A's render was using that same directory
right now.** Session A's ~4GB, ~40-minutes-of-progress output was deleted
mid-render. Session A had to discover this after the fact by noticing the
file and its owning processes had simply vanished from `ps`.

## Root cause

One global, unowned temp directory (`analysis/_master_chunks`) shared by
every render invocation, with no record of "who is using this right now."
Any cleanup step anywhere is one `rm -rf` away from destroying another
session's in-progress work, and there is no way to check first.

## The fix: `src/render/RenderLease.js`

Implemented and unit-tested in this pass (harmless temp directories only —
**not** applied to the live `render_master.mjs` in the main worktree,
which stays untouched while its render is active; this is the
implementation, ready to merge once that render finishes).

### The model

1. **Every render gets its own directory.** Never
   `analysis/_master_chunks` for everything — instead
   `analysis/_renders/<render-id>/chunks`. Two concurrent renders
   physically cannot collide, because they're never in the same directory.
2. **A render-id is `<commitSHA(10)>-<timestamp>-<random>`** — collision-
   proof, and a human can tell which commit produced any given render-id
   just by reading its name.
3. **A lease file (`.render-lock.json`) records ownership**: sessionId,
   pid, hostname, git worktree path, branch, commit, startedAt,
   heartbeatAt, renderType, outputPath, tempDirectory — everything needed
   to answer "is this still running, and by whom" without guessing from
   `ps` output.
4. **No render script may `rm -rf` a shared root.** `RenderLease` doesn't
   even expose a method that CAN delete `renderRoot` itself or a sibling
   render-id's directory — `destroyOwnChunks()` is hardcoded to only ever
   touch `this.chunksDir`, the one directory this specific lease instance
   owns.
5. **Ownership is validated before any deletion.** `destroyOwnChunks()`
   reads the lease file fresh at delete-time and throws (refuses) if:
   - there is no lease file at all (an unowned/unrecorded directory —
     could be a leftover from before this system existed; delete
     manually after confirming, this class won't do it blindly), or
   - the lease is **alive** (heartbeat within the last 15 minutes) and
     owned by a **different pid** than the caller — this is the EXACT
     incident above, now structurally impossible to repeat through this
     API, or
   - the lease is **stale** (no heartbeat in 15+ minutes) but the caller
     didn't pass `{ forceStale: true }` — the `--force-stale-lock`
     equivalent. A stale lease usually means a crashed process, but
     "usually" isn't good enough for a destructive action — it requires
     an explicit, named override, not a default.
6. **Never automatically kills another renderer.** There is no
   process-killing code anywhere in `RenderLease.js` — it only ever
   refuses a destructive filesystem action or requires an explicit
   override; it never reaches out and terminates a PID it found stale.
   A human decides that, using the pid/hostname the lease file already
   recorded.
7. **A render's own output is never implicitly garbage.** `release()`
   (called when a render finishes normally) only removes the lease file,
   not the chunks directory — a finished render's output is a
   deliverable. Deleting it is always a separate, explicit
   `destroyOwnChunks()` call, never a side effect of "the render is done."

### Verified behavior (this pass's tests — `analysis/_renders_test*`, all cleaned up after)

- `acquire()` creates `renderRoot/<id>/chunks/` and writes a valid lease.
- `heartbeat()` updates `heartbeatAt` in place.
- `checkLeaseStatus()` correctly reports `alive` immediately after a
  heartbeat and `stale` once `heartbeatAt` is old (tested by
  backdating a lease file's `heartbeatAt` by 20 minutes).
- `destroyOwnChunks()` **correctly refused** when the lease file's `pid`
  was rewritten to simulate a foreign owner — this is the specific
  scenario that caused the real incident, and it is now blocked.
- `destroyOwnChunks()` **correctly refused** a stale-but-same-pid lease
  without `forceStale: true`, and succeeded once it was passed.
- `analysis/render_lease_status.mjs` correctly lists an acquired lease's
  full ownership record (pid, host, commit, render type, output path,
  heartbeat age) — read-only, mutates nothing.

## What this does NOT do (scoped deliberately)

- Does not touch `render_master.mjs`, `analysis/_master_chunks`, or
  anything in the main `auuh` worktree — that worktree has an active
  render right now and per this session's instructions is completely
  off-limits.
- Does not retrofit the existing farm scripts from the previous session
  (`create_render_plan.mjs`/`assemble_render_farm.mjs`, built in the main
  worktree before this journey branch existed) — those still assume a
  single shared chunk directory per plan. Migrating them to `RenderLease`
  is the merge-time follow-up below, not done here.
- Does not kill, signal, or otherwise touch any other process.

## Merge plan (once the active main-worktree render finishes)

1. In the main worktree: change `render_master.mjs`'s hardcoded
   `CHUNK_DIR = "analysis/_master_chunks"` to accept a `RenderLease`
   (or at minimum a `--render-id`/`--chunks-dir` flag), acquiring a lease
   at startup and heartbeating once per chunk.
2. Update `create_render_plan.mjs`'s `outputChunk` path generation to live
   under `analysis/_renders/<planRenderId>/chunks/` instead of the
   already-existing `analysis/_farm_chunks/` convention from the previous
   session's work — same ownership fix applies to farm jobs, which are
   exactly the multi-process-touching-shared-state case this class is
   built for.
3. Any future manual `rm -rf` of a render's temp output should go through
   `RenderLease.destroyOwnChunks()` (or at minimum, a human should run
   `analysis/render_lease_status.mjs` first) instead of a bare shell
   command — that one habit change is what actually prevents a repeat.
