// Render-ownership lease — prevents the exact class of incident that
// already happened once this project: an external session running
// `rm -rf analysis/_master_chunks analysis/_test_output` while a different
// session's render was actively writing into that same shared directory.
// The root cause wasn't malice or a bad flag — it was every render job
// sharing ONE global temp directory with no record of who owns it. This
// file fixes the structural problem, not just the symptom: every render
// gets its OWN directory (analysis/_renders/<render-id>/chunks) and a
// lease file recording who's using it, so a cleanup step can refuse to
// touch a directory it doesn't own instead of blindly rm -rf'ing a shared
// root.
//
// Deliberately NOT wired into render_master.mjs in this pass — that file
// lives in the main `auuh` worktree, which has an active render running
// right now and must not be touched (see docs/render-concurrency-safety.md
// for the full incident writeup and the merge plan). This is the
// implementation + a harmless standalone test of the lease mechanism
// itself, ready to merge once the active render finishes.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const LEASE_FILENAME = ".render-lock.json";
const STALE_AFTER_SEC = 15 * 60; // no heartbeat in this long -> presumed dead, but still requires --force-stale-lock to act on

function nowIso() {
  return new Date().toISOString();
}

function safeGitCommit(cwd) {
  try {
    return execSync("git rev-parse HEAD", { cwd }).toString().trim();
  } catch {
    return null;
  }
}

function safeGitBranch(cwd) {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { cwd }).toString().trim();
  } catch {
    return null;
  }
}

/** commit SHA (short) + timestamp + random suffix — collision-proof enough for this use, and immediately tells a human which commit a render-id belongs to just by reading it. */
export function generateRenderId(cwd = process.cwd()) {
  const commit = (safeGitCommit(cwd) || "nocommit").slice(0, 10);
  const ts = Date.now();
  const rand = crypto.randomBytes(3).toString("hex");
  return `${commit}-${ts}-${rand}`;
}

export class RenderLease {
  /**
   * @param {object} opts
   * @param {string} opts.renderRoot base directory all render-ids live under, e.g. "analysis/_renders" — NEVER the render-id directory itself, and NEVER a legacy shared path like "analysis/_master_chunks"
   * @param {string} [opts.renderId] defaults to generateRenderId()
   * @param {string} [opts.renderType] e.g. "stress_test" | "farm_job" | "review_window" | "full_master"
   * @param {string} [opts.outputPath]
   */
  constructor({ renderRoot, renderId, renderType = "unknown", outputPath = null, cwd = process.cwd() }) {
    this.cwd = cwd;
    this.renderRoot = renderRoot;
    this.renderId = renderId || generateRenderId(cwd);
    this.renderType = renderType;
    this.outputPath = outputPath;
    this.dir = path.join(renderRoot, this.renderId);
    this.leasePath = path.join(this.dir, LEASE_FILENAME);
    this._acquired = false;
  }

  /** The directory THIS render owns — the only path any of this render's steps may ever write into or delete. */
  get chunksDir() {
    return path.join(this.dir, "chunks");
  }

  /** Creates renderRoot/renderId/, writes the lease file, and returns it. Throws if renderId already exists (collision — regenerate, don't overwrite). */
  acquire() {
    if (fs.existsSync(this.dir)) {
      throw new Error(`RenderLease: directory already exists for renderId ${this.renderId} (${this.dir}) — this should not happen with a fresh generateRenderId(); regenerate rather than reuse.`);
    }
    fs.mkdirSync(this.chunksDir, { recursive: true });
    const lease = {
      sessionId: process.env.CLAUDE_SESSION_ID || process.env.TERM_SESSION_ID || null,
      pid: process.pid,
      hostname: os.hostname(),
      gitWorktree: this.cwd,
      branch: safeGitBranch(this.cwd),
      commit: safeGitCommit(this.cwd),
      startedAt: nowIso(),
      heartbeatAt: nowIso(),
      renderType: this.renderType,
      outputPath: this.outputPath,
      tempDirectory: this.chunksDir,
    };
    fs.writeFileSync(this.leasePath, JSON.stringify(lease, null, 2));
    this._acquired = true;
    return lease;
  }

  /** Call periodically (e.g. once per chunk) while the render runs — a stale lease is exactly what lets a well-meaning cleanup step assume a directory is abandoned when it isn't. */
  heartbeat() {
    if (!this._acquired) throw new Error("RenderLease.heartbeat() called before acquire()");
    const lease = readLease(this.leasePath);
    lease.heartbeatAt = nowIso();
    fs.writeFileSync(this.leasePath, JSON.stringify(lease, null, 2));
  }

  /** Releases the lease file (NOT the chunks — a finished render's output is a deliverable, not garbage; deleting output is a separate, explicit decision, never implicit in "done rendering"). */
  release() {
    if (fs.existsSync(this.leasePath)) fs.rmSync(this.leasePath);
    this._acquired = false;
  }

  /**
   * The ONLY sanctioned destructive operation this class exposes: deletes
   * THIS render's own chunksDir, and only after confirming (a) the lease
   * file still matches this instance's renderId/pid and (b) either the
   * lease is fresh (this process still owns it) or the caller explicitly
   * passed --force-stale-lock via `forceStale: true`. Never deletes
   * renderRoot itself, never deletes a sibling render-id directory.
   */
  destroyOwnChunks({ forceStale = false } = {}) {
    const status = checkLeaseStatus(this.leasePath);
    if (status.state === "missing") {
      throw new Error(`RenderLease: no lease file at ${this.leasePath} — refusing to delete a directory with no ownership record. If this is genuinely orphaned, delete it manually after confirming no process is using it.`);
    }
    if (status.state === "alive" && status.lease.pid !== process.pid) {
      throw new Error(`RenderLease: lease at ${this.leasePath} is ALIVE and owned by a different pid (${status.lease.pid}, heartbeat ${status.lease.heartbeatAt}) — refusing to delete. This is exactly the incident this class exists to prevent.`);
    }
    if (status.state === "stale" && !forceStale) {
      throw new Error(`RenderLease: lease at ${this.leasePath} is STALE (last heartbeat ${status.lease.heartbeatAt}, ${status.ageSec.toFixed(0)}s ago) but forceStale was not passed. Pass { forceStale: true } (the --force-stale-lock equivalent) only after confirming the process (pid ${status.lease.pid}, host ${status.lease.hostname}) is genuinely dead.`);
    }
    fs.rmSync(this.chunksDir, { recursive: true, force: true });
    this.release();
  }
}

function readLease(leasePath) {
  return JSON.parse(fs.readFileSync(leasePath, "utf8"));
}

/**
 * Read-only status check — safe to call from anywhere, never mutates
 * anything. Returns { state: "missing" | "alive" | "stale", lease?, ageSec? }.
 */
export function checkLeaseStatus(leasePath, staleAfterSec = STALE_AFTER_SEC) {
  if (!fs.existsSync(leasePath)) return { state: "missing" };
  const lease = readLease(leasePath);
  const ageSec = (Date.now() - new Date(lease.heartbeatAt).getTime()) / 1000;
  return { state: ageSec > staleAfterSec ? "stale" : "alive", lease, ageSec };
}

/** Lists every render-id under renderRoot with its lease status — the read-only "what's running" view analysis/render_lease_status.mjs exposes as a CLI. */
export function listRenders(renderRoot) {
  if (!fs.existsSync(renderRoot)) return [];
  return fs
    .readdirSync(renderRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const renderId = e.name;
      const leasePath = path.join(renderRoot, renderId, LEASE_FILENAME);
      return { renderId, ...checkLeaseStatus(leasePath) };
    });
}

export { LEASE_FILENAME, STALE_AFTER_SEC };
