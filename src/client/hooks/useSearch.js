'use strict';

const { useState } = require('react');
const { ROUTE } = require('../constants.js');

// useSearch - encapsulates search logic for SearchPanel
function useSearch(workspaceId) {
  const [searchMode, setSearchMode] = useState('exact');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [aiProgress, setAiProgress] = useState(null);
  const [aiStreamContent, setAiStreamContent] = useState('');
  const [indexBuilt, setIndexBuilt] = useState(true);
  const [searched, setSearched] = useState(false);
  const [fieldAssociations, setFieldAssociations] = useState(null);

  const handleSearch = async (query, searchType) => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setFieldAssociations(null);
    setAiProgress(null);
    setAiStreamContent('');
    setIndexBuilt(true);

    try {
      let data;
      if (searchMode === 'ai') {
        // 获取当前会话 ID（AI 搜索需要在 DSH 会话中调用）
        let currentSessionId = '';
        try {
          const ctx = window.__DSH_CTX__;
          if (ctx) {
            const uiWorkspace = ctx.get?.('uiWorkspace');
            if (uiWorkspace?.selection && typeof uiWorkspace.selection.getSnapshot === 'function') {
              const selection = uiWorkspace.selection.getSnapshot();
              if (selection?.sessionId) {
                currentSessionId = selection.sessionId;
              }
            }
          }
        } catch (e) {
          // 忽略错误
        }

        if (!currentSessionId) {
          throw new Error('AI 搜索需要在活跃的 DSH 会话中调用');
        }

        // AI search mode with SSE streaming
        const response = await fetch(`${ROUTE}/ai-search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, query, type: searchType, sessionId: currentSessionId }),
        });

        // Check if response is not OK (e.g., 503 for LLM not available)
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const processLine = (line) => {
          if (!line.startsWith('data: ')) return;
          try {
            const eventData = JSON.parse(line.slice(6));
            if (eventData.type === 'status') {
              setAiProgress(eventData.text);
            } else if (eventData.type === 'stream_delta') {
              setAiStreamContent(eventData.text);
            } else if (eventData.type === 'stream_end') {
              setAiStreamContent(eventData.text);
            } else if (eventData.type === 'done') {
              data = eventData;
            } else if (eventData.type === 'error') {
              throw new Error(eventData.error);
            }
          } catch (e) {
            if (e.message && e.message !== 'Failed to parse AI response') {
              console.error('SSE parse error:', e.message);
              throw e;
            }
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            processLine(line.trim());
          }
        }

        // Process any remaining data in buffer after stream ends
        if (buffer.trim()) {
          processLine(buffer.trim());
        }
      } else {
        // Exact search mode
        const res = await fetch(`${ROUTE}/search?workspaceId=${encodeURIComponent(workspaceId)}&q=${encodeURIComponent(query)}&type=${searchType}`);
        data = await res.json();

        // If searching for a field, also fetch field associations
        if (searchType === 'field' && data.results.length > 0) {
          try {
            const fieldRes = await fetch(`${ROUTE}/fields/${encodeURIComponent(query)}?workspaceId=${encodeURIComponent(workspaceId)}`);
            const fieldData = await fieldRes.json();
            if (fieldData.associations && fieldData.associations.length > 0) {
              setFieldAssociations(fieldData);
            }
          } catch (e) {
            console.error('Failed to fetch field associations:', e);
          }
        }
      }

      // Only update results if we got a valid response
      if (data) {
        setResults(data.results || []);
        if (data.indexBuilt !== undefined) {
          setIndexBuilt(data.indexBuilt);
        }
      } else if (searchMode !== 'ai') {
        // For exact search, data should always be set
        setResults([]);
        setIndexBuilt(false);
      }
      // For AI search, if data is undefined, it means we got an error
      // Don't update indexBuilt - keep the current state

      setSearched(true);
    } catch (e) {
      console.error('Search failed:', e);
      setError(e.message || '搜索失败');
      setSearched(true);
      // Don't reset indexBuilt on error - keep current state
    } finally {
      setLoading(false);
      setAiProgress(null);
      setAiStreamContent('');
    }
  };

  return {
    searchMode,
    setSearchMode,
    results,
    loading,
    error,
    aiProgress,
    aiStreamContent,
    indexBuilt,
    searched,
    fieldAssociations,
    handleSearch,
  };
}

module.exports = { useSearch };
