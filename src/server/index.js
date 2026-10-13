/**
 * ReqHub 插件入口
 * 重构后的模块化架构
 */

import { createConfigRoutes } from './routes/config-routes.js';
import { createTreeRoutes } from './routes/tree-routes.js';
import { createAnalyzeRoutes } from './routes/analyze-routes.js';
import { createSearchRoutes } from './routes/search-routes.js';
import { createSyncRoutes } from './routes/sync-routes.js';
import { createTemplateRoutes } from './routes/template-routes.js';
import { log, getLogs, clearLogs, getLogLevels, getLogTags } from './logger.js';
import { json } from './utils.js';
import { setSkillsService } from './prompts.js';

export const inject = ['workspaceRegistry', 'webServer', 'llm', 'sessions', 'skills', 'agents', 'agentPresets', 'sessionQuery', 'subagents', 'sessionProjections'];

export function apply(ctx) {
  const { workspaceRegistry, webServer, llm, sessions, skills, agents, agentPresets, sessionQuery, subagents, sessionProjections } = ctx;

  // 设置 skills 服务到 prompts 模块
  setSkillsService(skills);

  log.startup.info('ReqHub 插件启动 (模块化架构 - Subagent 统一委托)');
  log.startup.debug('可用服务', { 
    hasSessions: !!sessions,
    hasSkills: !!skills,
    hasLlm: !!llm,
    hasAgents: !!agents,
    hasAgentPresets: !!agentPresets,
    hasSessionQuery: !!sessionQuery,
    hasSubagents: !!subagents,
    hasSessionProjections: !!sessionProjections
  });

  const disposers = [];

  // 创建所有路由
  const routes = [
    // 配置相关
    ...createConfigRoutes(workspaceRegistry, llm),
    
    // 文档树相关
    ...createTreeRoutes(workspaceRegistry),
    
    // AI 分析相关（传入 ctx 用于 subagent）
    ...createAnalyzeRoutes(workspaceRegistry, llm, sessions, agents, agentPresets, sessionQuery, ctx),
    
    // 搜索相关（传入 agents 和 ctx 用于 subagent）
    ...createSearchRoutes(workspaceRegistry, llm, agents, ctx),
    
    // 文档同步相关（传入 agents 和 ctx 用于 subagent）
    ...createSyncRoutes(workspaceRegistry, llm, sessions, agents, ctx),
    
    // 模板生成相关（传入 agents 和 ctx 用于 subagent）
    ...createTemplateRoutes(workspaceRegistry, llm, agents, ctx),
    
    // 日志相关
    {
      kind: 'exact',
      path: '/req-hub/logs',
      handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }
        json(res, { logs: getLogs() });
      }
    },
    {
      kind: 'exact',
      path: '/req-hub/logs/clear',
      handler(req, res) {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end();
          return;
        }
        clearLogs();
        log.startup.info('日志已清空');
        json(res, { success: true });
      }
    },
    // 日志元数据接口
    {
      kind: 'exact',
      path: '/req-hub/logs/meta',
      handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }
        json(res, { 
          levels: getLogLevels(),
          tags: getLogTags()
        });
      }
    },
    // Skills 列表接口
    {
      kind: 'exact',
      path: '/req-hub/skills',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }

        const url = new URL(req.url, 'http://localhost');
        const workspaceId = url.searchParams.get('workspaceId');
        const sessionId = url.searchParams.get('sessionId');

        if (!skills) {
          json(res, { skills: [], error: 'skills 服务不可用' });
          return;
        }

        try {
          // 获取 cwd（用于工作区相关的技能）
          let cwd = undefined;
          if (workspaceId) {
            const workspaces = workspaceRegistry.list();
            const workspace = workspaces.find(w => w.id === workspaceId);
            if (workspace) {
              cwd = workspace.path;
            }
          }

          // 默认使用全局 skills 服务
          let skillRegistry = skills;
          let scope = undefined;
          
          // 如果有 sessionId，参考 SessionSkillCatalog 的逻辑获取技能
          if (sessionId && sessionQuery && agents && agentPresets) {
            try {
              // 1. 获取会话信息
              const observation = await sessionQuery.observeSession(sessionId);
              if (observation?.projections) {
                // 从会话获取 cwd
                if (!cwd) {
                  cwd = observation.header.cwd;
                }
                
                // 从会话获取 agentPreset
                const agentPreset = observation.projections.values.agentPreset ?? undefined;
                
                // 2. 尝试从活跃 agent 获取 scoped skills
                const live = agents.get(sessionId);
                let scoped = live ? agentPresets.serviceFor(live, 'skills') : undefined;
                
                // 3. 如果没有活跃 agent，尝试从 preset 获取 scope
                if (!scoped && agentPreset) {
                  try {
                    const lease = await agentPresets.acquireScope(agentPreset);
                    if (lease) {
                      scope = lease.key;
                      // 注意：lease 需要在使用后释放，但我们这里直接返回结果，
                      // 所以在异步操作完成后会自动释放
                    }
                  } catch (e) {
                    // preset 不可用，回退到全局
                  }
                } else if (scoped) {
                  skillRegistry = scoped;
                  scope = live;
                }
              }
            } catch (e) {
              log.startup.warn(`Failed to get session skills: ${e.message}`);
            }
          }
          
          log.startup.debug(`Fetching skills list`, { cwd, sessionId, scoped: skillRegistry !== skills });
          
          const skillsList = await skillRegistry.list(cwd ? { cwd, scope } : { scope });
          
          // 过滤出 user-invocable 的技能
          const userSkills = skillsList.filter(s => s.invocation.userInvocable);
          
          log.startup.debug(`Skills list result`, { 
            count: userSkills.length
          });
          
          json(res, { 
            skills: userSkills.map(s => ({
              name: s.name,
              description: s.description,
              whenToUse: s.whenToUse,
              source: s.source,
              modelInvocable: s.invocation.modelInvocable,
              userInvocable: s.invocation.userInvocable
            })),
            debug: {
              cwd,
              workspaceId,
              sessionId,
              scoped: skillRegistry !== skills
            }
          });
        } catch (e) {
          log.startup.error(`获取 skills 失败: ${e.message}`, { stack: e.stack });
          json(res, { skills: [], error: e.message }, 500);
        }
      }
    },
    // Skill 内容接口
    {
      kind: 'exact',
      path: '/req-hub/skill-content',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end();
          return;
        }

        const url = new URL(req.url, 'http://localhost');
        const skillName = url.searchParams.get('name');
        const workspaceId = url.searchParams.get('workspaceId');
        const sessionId = url.searchParams.get('sessionId');

        if (!skillName) {
          json(res, { error: 'missing skill name' }, 400);
          return;
        }

        if (!skills) {
          json(res, { error: 'skills 服务不可用' }, 500);
          return;
        }

        try {
          // 获取 cwd
          let cwd = undefined;
          if (workspaceId) {
            const workspaces = workspaceRegistry.list();
            const workspace = workspaces.find(w => w.id === workspaceId);
            if (workspace) {
              cwd = workspace.path;
            }
          }

          // 默认使用全局 skills 服务
          let skillRegistry = skills;
          let scope = undefined;
          
          // 如果有 sessionId，使用与 skills 列表相同的逻辑
          if (sessionId && sessionQuery && agents && agentPresets) {
            try {
              const observation = await sessionQuery.observeSession(sessionId);
              if (observation?.projections) {
                if (!cwd) {
                  cwd = observation.header.cwd;
                }
                
                const agentPreset = observation.projections.values.agentPreset ?? undefined;
                
                const live = agents.get(sessionId);
                let scoped = live ? agentPresets.serviceFor(live, 'skills') : undefined;
                
                if (!scoped && agentPreset) {
                  try {
                    const lease = await agentPresets.acquireScope(agentPreset);
                    if (lease) {
                      scope = lease.key;
                    }
                  } catch (e) {
                    // preset 不可用，回退到全局
                  }
                } else if (scoped) {
                  skillRegistry = scoped;
                  scope = live;
                }
              }
            } catch (e) {
              log.startup.warn(`Failed to get session skills: ${e.message}`);
            }
          }

          const skill = await skillRegistry.get(skillName, cwd ? { cwd, scope } : { scope });
          if (!skill) {
            json(res, { error: `skill "${skillName}" not found` }, 404);
            return;
          }

          json(res, { 
            name: skill.name,
            description: skill.description,
            content: skill.content,
            provider: skill.provider
          });
        } catch (e) {
          log.startup.error(`获取 skill 内容失败: ${e.message}`);
          json(res, { error: e.message }, 500);
        }
      }
    }
  ];

  // 注册所有路由
  for (const route of routes) {
    try {
      const dispose = webServer.register(route);
      disposers.push(dispose);
    } catch (err) {
      if (!String(err.message).includes('duplicate')) {
        log.startup.error(`路由注册失败: ${err.message}`);
      }
    }
  }

  log.startup.info(`已注册 ${routes.length} 个路由`);

  // 返回清理函数
  return () => {
    for (const dispose of disposers) {
      dispose();
    }
    log.startup.info('ReqHub 插件卸载');
  };
}