import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

export interface StorageMountInfo {
  dataDir: string;
  mountPoint: string;
  fsType: string;
  isPersistentMount: boolean;
  mountSource: string;
}

export interface StorageInstanceSafetyReport {
  isProduction: boolean;
  isCloudRun: boolean;
  singleInstanceConfirmed: boolean;
  allowEphemeralOverride: boolean;
  configuredMaxInstances: number | null;
  mount: StorageMountInfo;
  safeForProduction: boolean;
  mustRefuseStartup: boolean;
  reasons: string[];
  requiredHostingConfig: string[];
}

export interface InstanceLockRecord {
  instanceId: string;
  pid: number;
  hostname: string;
  startedAt: string;
  heartbeatAt: string;
}

const EPHEMERAL_FS_TYPES = new Set(['overlay', 'overlayfs', 'tmpfs', 'ramfs', 'squashfs']);
const LOCK_STALE_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 10_000;

let activeLockPath: string | null = null;
let activeInstanceId: string | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;

export function resolveCallbridgeDataDir(): string {
  const custom = (process.env.CALLBRIDGE_DATA_DIR || '').trim();
  return custom ? path.resolve(custom) : path.join(process.cwd(), 'data');
}

/**
 * Inspects /proc/mounts (Linux) to determine whether the data directory sits on
 * a dedicated persistent volume mount vs an ephemeral container root overlay/tmpfs.
 */
export function inspectDataDirMount(dataDir: string = resolveCallbridgeDataDir()): StorageMountInfo {
  const resolved = path.resolve(dataDir);
  const fallback: StorageMountInfo = {
    dataDir: resolved,
    mountPoint: '/',
    fsType: 'unknown',
    isPersistentMount: false,
    mountSource: 'unknown',
  };

  try {
    if (!fs.existsSync('/proc/mounts')) {
      return fallback;
    }
    const raw = fs.readFileSync('/proc/mounts', 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim().length > 0);
    let bestMountPoint = '';
    let bestFsType = 'unknown';
    let bestSource = 'unknown';

    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 3) continue;
      const [source, mountPoint, fsType] = parts;
      const normalizedMount = mountPoint === '/' ? '/' : mountPoint.replace(/\/+$/, '');
      const matches =
        normalizedMount === '/' ||
        resolved === normalizedMount ||
        resolved.startsWith(`${normalizedMount}/`);
      if (matches && normalizedMount.length >= bestMountPoint.length) {
        bestMountPoint = normalizedMount;
        bestFsType = fsType;
        bestSource = source;
      }
    }

    if (!bestMountPoint) {
      return fallback;
    }

    const isEphemeralFs = EPHEMERAL_FS_TYPES.has(bestFsType.toLowerCase());
    const isRootOverlay = bestMountPoint === '/' && isEphemeralFs;
    // A dedicated volume mounted at /data or /app/.../data (non-root) or a non-ephemeral block/network filesystem
    const isPersistentMount = !isEphemeralFs && !isRootOverlay;

    return {
      dataDir: resolved,
      mountPoint: bestMountPoint,
      fsType: bestFsType,
      isPersistentMount,
      mountSource: bestSource,
    };
  } catch {
    return fallback;
  }
}

export function evaluateStorageAndInstanceSafety(
  env: NodeJS.ProcessEnv = process.env,
  dataDir: string = resolveCallbridgeDataDir()
): StorageInstanceSafetyReport {
  const isProduction = env.NODE_ENV === 'production';
  const isCloudRun = Boolean(env.K_SERVICE || env.K_REVISION || env.K_CONFIGURATION);
  const singleInstanceConfirmed = (env.CALLBRIDGE_SINGLE_INSTANCE_CONFIRMED || '').trim().toLowerCase() === 'true';
  const allowEphemeralOverride = (env.CALLBRIDGE_ALLOW_EPHEMERAL_STORAGE || '').trim().toLowerCase() === 'true';

  const rawMaxInstances = (env.CALLBRIDGE_MAX_INSTANCES || env.CLOUD_RUN_MAX_INSTANCES || '').trim();
  const parsedMaxInstances = rawMaxInstances ? parseInt(rawMaxInstances, 10) : NaN;
  const configuredMaxInstances = Number.isFinite(parsedMaxInstances) ? parsedMaxInstances : null;

  const mount = inspectDataDirMount(dataDir);
  const reasons: string[] = [];
  let mustRefuseStartup = false;

  if (configuredMaxInstances !== null && configuredMaxInstances > 1) {
    reasons.push(
      `Multi-instance configuration detected (max_instances=${configuredMaxInstances}). Local JSON storage (data/callbridge_db.json) and in-memory queue/capacity locks cannot safely operate across multiple instances.`
    );
    mustRefuseStartup = true;
  }

  if (!mount.isPersistentMount) {
    reasons.push(
      `Data directory (${mount.dataDir}) is mounted on ephemeral filesystem (${mount.fsType} at ${mount.mountPoint}), not a persistent disk/volume. Container restarts or redeployments will erase queue state, provider call mappings, and billing history.`
    );
  }

  if (isCloudRun && !singleInstanceConfirmed) {
    reasons.push(
      'Cloud Run environment detected without CALLBRIDGE_SINGLE_INSTANCE_CONFIRMED=true. Default Cloud Run autoscaling and request-based CPU throttling break local JSON state and background calling queues.'
    );
  }

  if (isProduction) {
    if (isCloudRun && !singleInstanceConfirmed) {
      mustRefuseStartup = true;
    }
    if (isCloudRun && !mount.isPersistentMount && !allowEphemeralOverride) {
      mustRefuseStartup = true;
    }
  }

  const requiredHostingConfig = [
    'Single always-on instance: --min-instances=1 --max-instances=1 (never scale > 1 while using local JSON storage)',
    'Always-allocated CPU for background queue execution: --no-cpu-throttling (or CPU always allocated)',
    `Mounted persistent volume at ${mount.dataDir} (e.g. Cloud Run NFS/Filestore volume or persistent GCE VM disk, NOT container overlay)`,
    'Set CALLBRIDGE_SINGLE_INSTANCE_CONFIRMED=true once single-instance + persistent disk + always-on CPU are configured',
    'Set VAPI_WEBHOOK_SECRET in production so inbound Vapi/Twilio webhooks authenticate fail-closed',
  ];

  const safeForProduction =
    !mustRefuseStartup &&
    mount.isPersistentMount &&
    (configuredMaxInstances === null || configuredMaxInstances <= 1) &&
    (!isCloudRun || singleInstanceConfirmed);

  return {
    isProduction,
    isCloudRun,
    singleInstanceConfirmed,
    allowEphemeralOverride,
    configuredMaxInstances,
    mount,
    safeForProduction,
    mustRefuseStartup,
    reasons,
    requiredHostingConfig,
  };
}

function isProcessAliveOnSameHost(record: InstanceLockRecord): boolean {
  if (record.hostname !== os.hostname()) {
    return true; // Different host/container sharing the same volume — rely on heartbeat freshness
  }
  try {
    process.kill(record.pid, 0);
    return true;
  } catch (err: any) {
    return err?.code === 'EPERM';
  }
}

/**
 * Acquires a single-instance lease lockfile in data/.callbridge-instance.lock.
 * If another active instance holds a fresh heartbeat on the same data directory,
 * refuses startup to prevent split-brain JSON corruption and duplicate outbound calls.
 */
export function acquireSingleInstanceLock(
  dataDir: string = resolveCallbridgeDataDir(),
  options?: { staleMs?: number; instanceId?: string }
): { acquired: true; lockPath: string; instanceId: string } | { acquired: false; reason: string; holder: InstanceLockRecord } {
  const staleMs = options?.staleMs ?? LOCK_STALE_MS;
  const instanceId = options?.instanceId || `inst_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  const lockPath = path.join(path.resolve(dataDir), '.callbridge-instance.lock');

  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  } catch {
    // Directory creation will be handled below if needed
  }

  if (fs.existsSync(lockPath)) {
    try {
      const raw = fs.readFileSync(lockPath, 'utf8');
      const existing = JSON.parse(raw) as InstanceLockRecord;
      const lastBeatMs = Date.parse(existing.heartbeatAt || existing.startedAt || '');
      const ageMs = Number.isFinite(lastBeatMs) ? Date.now() - lastBeatMs : Infinity;
      const isDifferentInstance = existing.instanceId && existing.instanceId !== instanceId;
      const isFresh = ageMs >= 0 && ageMs < staleMs;
      const alive = isProcessAliveOnSameHost(existing);

      if (isDifferentInstance && isFresh && alive) {
        return {
          acquired: false,
          holder: existing,
          reason: `Another active CallBridge instance (${existing.instanceId}, pid=${existing.pid}, host=${existing.hostname}, heartbeatAgeMs=${Math.round(ageMs)}) already holds the single-instance lock on ${dataDir}. Refusing multi-instance startup.`,
        };
      }

      console.warn('[INSTANCE_LOCK_STALE_RECOVERED]', {
        previousInstanceId: existing.instanceId,
        previousPid: existing.pid,
        previousHost: existing.hostname,
        ageMs: Number.isFinite(ageMs) ? Math.round(ageMs) : 'unknown',
      });
    } catch {
      // Corrupt lock file; safe to replace
    }
  }

  const now = new Date().toISOString();
  const record: InstanceLockRecord = {
    instanceId,
    pid: process.pid,
    hostname: os.hostname(),
    startedAt: now,
    heartbeatAt: now,
  };

  const tmpPath = `${lockPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(record, null, 2), 'utf8');
  fs.renameSync(tmpPath, lockPath);

  activeLockPath = lockPath;
  activeInstanceId = instanceId;

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }
  heartbeatTimer = setInterval(() => {
    refreshInstanceLockHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);
  if (typeof heartbeatTimer.unref === 'function') {
    heartbeatTimer.unref();
  }

  return { acquired: true, lockPath, instanceId };
}

export function refreshInstanceLockHeartbeat(): void {
  if (!activeLockPath || !activeInstanceId) return;
  try {
    const raw = fs.existsSync(activeLockPath) ? fs.readFileSync(activeLockPath, 'utf8') : null;
    if (raw) {
      const parsed = JSON.parse(raw) as InstanceLockRecord;
      if (parsed.instanceId && parsed.instanceId !== activeInstanceId) {
        console.error('[INSTANCE_LOCK_LOST] Another instance took over the lock file.');
        return;
      }
      parsed.heartbeatAt = new Date().toISOString();
      const tmp = `${activeLockPath}.${process.pid}.hb.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(parsed, null, 2), 'utf8');
      fs.renameSync(tmp, activeLockPath);
    }
  } catch {
    // Non-fatal heartbeat write warning
  }
}

export function releaseSingleInstanceLock(lockPathOverride?: string, instanceIdOverride?: string): void {
  if (heartbeatTimer && !lockPathOverride) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  const targetPath = lockPathOverride || activeLockPath;
  const targetId = instanceIdOverride || activeInstanceId;
  if (!targetPath) return;

  try {
    if (fs.existsSync(targetPath)) {
      const raw = fs.readFileSync(targetPath, 'utf8');
      const parsed = JSON.parse(raw) as InstanceLockRecord;
      if (!targetId || parsed.instanceId === targetId) {
        fs.unlinkSync(targetPath);
      }
    }
  } catch {
    // Non-fatal cleanup error
  } finally {
    if (!lockPathOverride) {
      activeLockPath = null;
      activeInstanceId = null;
    }
  }
}

/**
 * Enforces single-instance & persistence safety at server startup.
 * Throws a fatal Error if unsafe multi-instance operation or unconfirmed ephemeral
 * production Cloud Run deployment is detected.
 */
export function enforceStartupStorageAndInstanceSafety(
  env: NodeJS.ProcessEnv = process.env,
  dataDir: string = resolveCallbridgeDataDir()
): StorageInstanceSafetyReport {
  const report = evaluateStorageAndInstanceSafety(env, dataDir);

  if (report.mustRefuseStartup) {
    console.error('[STORAGE_INSTANCE_SAFETY_REFUSED]', {
      reasons: report.reasons,
      mount: report.mount,
      requiredHostingConfig: report.requiredHostingConfig,
    });
    throw new Error(
      `Refusing unsafe CallBridge startup: ${report.reasons.join(' ')} Required hosting configuration: ${report.requiredHostingConfig.join(' | ')}`
    );
  }

  const lockResult = acquireSingleInstanceLock(dataDir);
  if (!lockResult.acquired) {
    console.error('[UNSAFE_MULTI_INSTANCE_DETECTED]', {
      reason: lockResult.reason,
      holder: lockResult.holder,
    });
    throw new Error(`Refusing unsafe multi-instance startup: ${lockResult.reason}`);
  }

  if (!report.safeForProduction) {
    console.warn('[STORAGE_SAFETY_WARNING]', {
      mode: report.isProduction ? 'production' : 'development',
      isCloudRun: report.isCloudRun,
      mount: report.mount,
      reasons: report.reasons,
    });
  }

  return report;
}
