/**
 * Sync state manager
 * Persists active sync tasks and sync history per requirement directory
 * Stored in requirement's sync-logs directory alongside sync-generated files
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { log } from './logger.js';

// In-memory cache: requirementKey -> state
const stateCache = new Map();
// Requirement path cache: requirementKey -> requirementPath
const requirementPathCache = new Map();

/**
 * Generate a unique key for a requirement
 */
function getRequirementKey(workspaceId, requirementId) {
  return `${workspaceId}:${requirementId}`;
}

/**
 * Get state file path for a requirement
 */
function getStateFile(requirementPath) {
  return join(requirementPath, 'sync-logs', '.sync-state.json');
}

/**
 * Load state from disk for a specific requirement
 */
export async function loadState(workspaceId, requirementId, requirementPath) {
  if (!workspaceId || !requirementId || !requirementPath) {
    log.state.warn('loadState called without required parameters');
    return;
  }

  const key = getRequirementKey(workspaceId, requirementId);
  
  // Cache the requirement path
  requirementPathCache.set(key, requirementPath);

  // Check if already cached - avoid repeated disk reads
  if (stateCache.has(key)) {
    return stateCache.get(key);
  }

  try {
    const stateFile = getStateFile(requirementPath);
    if (existsSync(stateFile)) {
      const content = await readFile(stateFile, 'utf8');
      const state = JSON.parse(content);
      stateCache.set(key, state);
      log.state.info(`Loaded sync state for ${key}: ${state.history.length} history items`);
    } else {
      // Initialize empty state
      stateCache.set(key, { activeSync: null, history: [] });
    }
  } catch (e) {
    log.state.warn(`Failed to load sync state for ${key}: ${e.message}`);
    stateCache.set(key, { activeSync: null, history: [] });
  }
  
  return stateCache.get(key);
}

/**
 * Save state to disk for a specific requirement
 */
async function saveState(key) {
  if (!key) return;

  const requirementPath = requirementPathCache.get(key);
  if (!requirementPath) {
    log.state.warn(`Cannot save state: requirement path not cached for ${key}`);
    return;
  }

  try {
    const state = stateCache.get(key);
    if (!state) return;

    // Ensure sync-logs directory exists
    const syncLogsDir = join(requirementPath, 'sync-logs');
    if (!existsSync(syncLogsDir)) {
      await mkdir(syncLogsDir, { recursive: true });
    }

    const stateFile = getStateFile(requirementPath);
    const tempFile = stateFile + '.tmp';
    
    // Atomic write: write to temp file first, then rename
    await writeFile(tempFile, JSON.stringify(state, null, 2), 'utf8');
    
    // Rename is atomic on most filesystems
    const { rename } = await import('fs/promises');
    await rename(tempFile, stateFile);
  } catch (e) {
    log.state.error(`Failed to save sync state for ${key}: ${e.message}`);
  }
}

/**
 * Get state for a requirement (loads if not cached)
 */
async function getState(key) {
  if (!stateCache.has(key)) {
    const requirementPath = requirementPathCache.get(key);
    if (requirementPath) {
      // Extract workspaceId and requirementId from key
      const [workspaceId, requirementId] = key.split(':');
      await loadState(workspaceId, requirementId, requirementPath);
    } else {
      // No path cached, return empty state
      return { activeSync: null, history: [] };
    }
  }
  return stateCache.get(key) || { activeSync: null, history: [] };
}

/**
 * Get active sync task
 * This function will attempt to load state from disk if not cached
 */
export async function getActiveSync(workspaceId, requirementId) {
  const key = getRequirementKey(workspaceId, requirementId);
  
  // 如果缓存中没有，尝试从磁盘加载
  if (!stateCache.has(key)) {
    // 需要找到 requirement 路径
    // 这个信息需要从外部传入或者从工作区配置中查找
    // 暂时返回 null，让调用者处理
    log.state.info(`getActiveSync: state not cached for ${key}, need to load from disk`);
    
    // 尝试从可能的路径加载
    // 这里需要知道 workspace 的路径和 docs 目录结构
    // 由于没有这些信息，返回 null
    return null;
  }
  
  const state = await getState(key);
  return state.activeSync;
}

/**
 * Set active sync task
 */
export async function setActiveSync(sync, requirementPath) {
  if (!sync?.workspaceId || !sync?.requirementId) {
    log.state.warn('setActiveSync called without required fields');
    return;
  }

  const key = getRequirementKey(sync.workspaceId, sync.requirementId);
  
  // Cache the requirement path if provided
  if (requirementPath) {
    requirementPathCache.set(key, requirementPath);
  }

  const state = await getState(key);
  state.activeSync = sync;
  await saveState(key);
}

/**
 * Clear active sync and add to history
 */
export async function completeSync(syncId) {
  // Find which requirement this sync belongs to
  let targetKey = null;
  let completedSync = null;

  for (const [key, state] of stateCache.entries()) {
    if (state.activeSync && state.activeSync.id === syncId) {
      targetKey = key;
      completedSync = { ...state.activeSync };
      break;
    }
  }

  if (!targetKey) {
    return;
  }

  completedSync.completedAt = Date.now();
  
  const state = stateCache.get(targetKey);
  // Add to history (keep last 50)
  state.history.unshift(completedSync);
  if (state.history.length > 50) {
    state.history = state.history.slice(0, 50);
  }
  
  // Clear active
  state.activeSync = null;
  
  await saveState(targetKey);
  log.state.info(`Sync ${syncId} completed and added to history for ${targetKey}`);
}

/**
 * Update active sync progress
 */
export async function updateSyncProgress(syncId, updates) {
  // Find which requirement this sync belongs to
  for (const [key, state] of stateCache.entries()) {
    if (state.activeSync && state.activeSync.id === syncId) {
      Object.assign(state.activeSync, updates);
      await saveState(key);
      return;
    }
  }
}

/**
 * Get sync history for a requirement
 */
export async function getSyncHistory(workspaceId, requirementId) {
  const key = getRequirementKey(workspaceId, requirementId);
  const state = await getState(key);
  return state.history;
}

/**
 * Get specific sync from history
 */
export async function getSyncById(syncId, workspaceId, requirementId) {
  const key = getRequirementKey(workspaceId, requirementId);
  const state = await getState(key);
  
  // Check active first
  if (state.activeSync && state.activeSync.id === syncId) {
    return state.activeSync;
  }
  // Check history
  return state.history.find(s => s.id === syncId);
}

/**
 * Delete sync from history
 */
export async function deleteSyncFromHistory(syncId, workspaceId, requirementId) {
  const key = getRequirementKey(workspaceId, requirementId);
  const state = await getState(key);
  state.history = state.history.filter(s => s.id !== syncId);
  await saveState(key);
}

