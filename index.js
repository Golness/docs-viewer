import { readdir, readFile, writeFile, stat, realpath } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';

const ROUTE = '/docs-viewer';
const MAX_DEPTH = 10;
const STATS_CACHE_TTL = 30000; // 30 seconds
const CONFIG_FILE = join(import.meta.dirname, 'config.json');
const MAX_BODY_SIZE = 1024; // 1KB limit for config body

// Simple in-memory cache for stats
const statsCache = new Map();

async function loadConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      const text = await readFile(CONFIG_FILE, 'utf8');
      return JSON.parse(text);
    }
  } catch {
    // Fall through to default
  }
  return { docsDir: 'docs' };
}

async function saveConfig(config) {
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  statsCache.clear(); // Clear cache when config changes
}

function getCachedStats(key) {
  const entry = statsCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > STATS_CACHE_TTL) {
    statsCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedStats(key, data) {
  statsCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Check if child path is inside parent path (safe version)
 */
function isInside(parent, child) {
  const resolvedParent = resolve(parent);
  const resolvedChild = resolve(child);

  // On Windows, normalize to lowercase for comparison
  const normalizedParent = process.platform === 'win32'
    ? resolvedParent.toLowerCase()
    : resolvedParent;
  const normalizedChild = process.platform === 'win32'
    ? resolvedChild.toLowerCase()
    : resolvedChild;

  // Use path.relative to check relationship
  const rel = relative(normalizedParent, normalizedChild);

  // If relative path starts with '..' or is absolute, child is outside parent
  return rel && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Walk docs directory and collect files with given extension
 * Includes symbolic link protection and depth limit
 */
async function walkDocs(root, ext, maxDepth = MAX_DEPTH) {
  const results = [];
  const visited = new Set(); // Track visited real paths to prevent circular symlinks
  const stack = [{ dir: root, depth: 0 }];

  while (stack.length) {
    const { dir, depth } = stack.pop();

    if (depth > maxDepth) continue;

    // Get real path to detect symlinks
    let realDir;
    try {
      realDir = await realpath(dir);
    } catch {
      continue; // Skip inaccessible directories
    }

    // Check if we've already visited this real path
    if (visited.has(realDir)) continue;
    visited.add(realDir);

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue; // Skip inaccessible directories
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);

      if (entry.isDirectory()) {
        stack.push({ dir: full, depth: depth + 1 });
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(ext)) {
        // Verify the file is inside root
        if (!isInside(root, full)) continue;

        const info = await stat(full).catch(() => null);
        results.push({
          path: full,
          relative: full.slice(resolve(root).length + 1),
          name: entry.name,
          size: info?.size ?? 0,
        });
      }
    }
  }

  results.sort((a, b) => a.relative.localeCompare(b.relative));
  return results;
}

function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

export const inject = ['workspaceRegistry', 'webServer'];

export function apply(ctx) {
  const registry = ctx.workspaceRegistry;
  const webServer = ctx.webServer;

  const disposers = [];

  const routes = [
    {
      kind: 'exact',
      path: `${ROUTE}/config`,
      async handler(req, res) {
        if (req.method === 'GET') {
          const config = await loadConfig();
          res.writeHead(200, {
            'content-type': 'application/json',
            'cache-control': 'no-store, no-cache, must-revalidate',
            'pragma': 'no-cache',
          });
          res.end(JSON.stringify(config));
          return;
        }
        if (req.method === 'POST') {
          let body = '';
          let size = 0;
          req.on('data', chunk => {
            size += chunk.length;
            if (size > MAX_BODY_SIZE) {
              json(res, { error: 'Request body too large' }, 413);
              req.destroy();
              return;
            }
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const newConfig = JSON.parse(body);
              // Validate docsDir is a relative path
              if (!newConfig.docsDir || typeof newConfig.docsDir !== 'string') {
                json(res, { error: 'docsDir must be a non-empty string' }, 400);
                return;
              }
              if (isAbsolute(newConfig.docsDir) || newConfig.docsDir.includes('..')) {
                json(res, { error: 'docsDir must be a relative path without ..' }, 400);
                return;
              }
              await saveConfig(newConfig);
              // Verify the save worked
              const verify = await loadConfig();
              json(res, verify);
            } catch (e) {
              json(res, { error: 'Invalid JSON' }, 400);
            }
          });
          return;
        }
        res.writeHead(405); res.end();
      },
    },
    {
      kind: 'exact',
      path: `${ROUTE}/workspaces`,
      handler(req, res) {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        const workspaces = registry.list();
        const items = workspaces.map((w) => ({ id: w.id, title: w.title || w.id, path: w.path }));
        json(res, items);
      },
    },
    {
      kind: 'exact',
      path: `${ROUTE}/stats`,
      async handler(req, res) {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }

        const config = await loadConfig();
        // Include docsDir in cache key to invalidate when directory changes
        const cacheKey = `all-workspaces:${config.docsDir}`;
        const cached = getCachedStats(cacheKey);
        if (cached) {
          json(res, cached);
          return;
        }

        const workspaces = registry.list();
        const stats = [];

        for (const w of workspaces) {
          const docsRoot = resolve(w.path, config.docsDir);
          let mdCount = 0, htmlCount = 0, exists = false;

          try {
            const info = await stat(docsRoot);
            if (info.isDirectory()) {
              exists = true;
              const items = await walkDocs(docsRoot, '.md');
              mdCount = items.length;
              const htmlItems = await walkDocs(docsRoot, '.html');
              htmlCount = htmlItems.length;
            }
          } catch {
            // docs directory doesn't exist or is inaccessible
          }

          stats.push({ workspaceId: w.id, title: w.title || w.id, mdCount, htmlCount, exists });
        }

        // Cache the result
        setCachedStats(cacheKey, stats);
        json(res, stats);
      },
    },
    {
      kind: 'exact',
      path: `${ROUTE}/list`,
      async handler(req, res) {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        const url = new URL(req.url, 'http://localhost');
        const workspaceId = url.searchParams.get('workspaceId');
        const ext = (url.searchParams.get('ext') || '.md').toLowerCase();

        if (ext !== '.md' && ext !== '.html') {
          json(res, { error: 'ext must be .md or .html' }, 400);
          return;
        }

        const workspaces = registry.list();
        const workspace = workspaceId ? workspaces.find((w) => w.id === workspaceId) : null;

        if (!workspace) {
          json(res, { error: 'workspace not found' }, 404);
          return;
        }

        const config = await loadConfig();
        const docsRoot = resolve(workspace.path, config.docsDir);
        let docsStat;

        try {
          docsStat = await stat(docsRoot);
        } catch {
          json(res, { items: [], docsRoot, exists: false });
          return;
        }

        if (!docsStat.isDirectory()) {
          json(res, { items: [], docsRoot, exists: false });
          return;
        }

        const items = await walkDocs(docsRoot, ext);
        json(res, { items, docsRoot, exists: true, workspace: workspace.id });
      },
    },
    {
      kind: 'exact',
      path: `${ROUTE}/read`,
      async handler(req, res) {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        const url = new URL(req.url, 'http://localhost');
        const workspaceId = url.searchParams.get('workspaceId');
        const rel = url.searchParams.get('path') || '';

        const workspaces = registry.list();
        const workspace = workspaceId ? workspaces.find((w) => w.id === workspaceId) : null;

        if (!workspace) {
          json(res, { error: 'workspace not found' }, 404);
          return;
        }

        const config = await loadConfig();
        const docsRoot = resolve(workspace.path, config.docsDir);
        const target = resolve(docsRoot, rel);

        // Security check: ensure target is inside docs root
        if (!isInside(docsRoot, target)) {
          json(res, { error: 'path outside docs' }, 400);
          return;
        }

        let info;
        try {
          info = await stat(target);
        } catch {
          json(res, { error: 'not found' }, 404);
          return;
        }

        if (!info.isFile()) {
          json(res, { error: 'not a file' }, 400);
          return;
        }

        const lower = target.toLowerCase();
        if (!lower.endsWith('.md') && !lower.endsWith('.html')) {
          json(res, { error: 'unsupported file type' }, 400);
          return;
        }

        const text = await readFile(target, 'utf8');
        json(res, { text, path: target });
      },
    },
  ];

  for (const route of routes) {
    try {
      const dispose = webServer.register(route);
      disposers.push(dispose);
    } catch (err) {
      if (!String(err.message).includes('duplicate')) {
        throw err;
      }
    }
  }

  return () => {
    for (const dispose of disposers) {
      dispose();
    }
    // Clear cache on dispose
    statsCache.clear();
  };
}
