/**
 * 配置管理模块
 * 负责配置的加载、保存和自动默认值设置
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const CONFIG_FILE = join(import.meta.dirname, '../../config.json');

/**
 * 加载配置文件
 * @returns {Promise<Object>} 配置对象
 */
export async function loadConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      const text = await readFile(CONFIG_FILE, 'utf8');
      return JSON.parse(text);
    }
  } catch {
    // Fall through to default
  }
  return { docsDir: 'docs', workspaceId: null, developerName: null, requirementId: null };
}

/**
 * 保存配置文件
 * @param {Object} config - 配置对象
 */
export async function saveConfig(config) {
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * 自动设置默认配置
 * @param {Object} config - 当前配置
 * @param {Object} registry - 工作区注册表
 * @returns {Promise<Object>} 更新后的配置
 */
export async function autoDefaultConfig(config, registry) {
  const workspaces = registry.list();
  if (workspaces.length === 0) return config;

  // Auto-select first workspace if not set
  if (!config.workspaceId || !workspaces.find(w => w.id === config.workspaceId)) {
    config.workspaceId = workspaces[0].id;
  }

  // Auto-select first developer if not set
  const workspace = workspaces.find(w => w.id === config.workspaceId);
  if (workspace) {
    const docsRoot = resolve(workspace.path, config.docsDir || 'docs');
    try {
      const entries = await readdir(docsRoot, { withFileTypes: true });
      const devDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));
      if (devDirs.length > 0 && !config.developerName) {
        config.developerName = devDirs[0].name;
      }

      // Auto-select first requirement if not set
      if (config.developerName) {
        const devPath = join(docsRoot, config.developerName);
        const reqEntries = await readdir(devPath, { withFileTypes: true });
        const reqDirs = reqEntries.filter(e => e.isDirectory() && /^(\d{4}-\d{2}-\d{2})-(.+)$/.test(e.name));
        if (reqDirs.length > 0 && !config.requirementId) {
          config.requirementId = reqDirs[0].name;
        }
      }
    } catch {
      // Ignore errors
    }
  }

  return config;
}
