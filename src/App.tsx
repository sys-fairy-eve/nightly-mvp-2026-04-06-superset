import { useEffect, useState, useCallback, useRef } from 'react';
import { useAgentSimulator } from './useAgentSimulator';
import type { AgentSession } from './types';
import './app.css';

const STATUS_ICON: Record<string, string> = {
  spawning: '◌',
  active:   '●',
  idle:     '○',
  done:     '✓',
  error:    '✗',
};

const STATUS_CLASS: Record<string, string> = {
  spawning: 'status-spawning',
  active:   'status-active',
  idle:     'status-idle',
  done:     'status-done',
  error:    'status-error',
};

function elapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${String(s % 60).padStart(2, '0')}s`;
}

function AgentRow({ agent, selected, onClick }: { agent: AgentSession; selected: boolean; onClick: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (agent.status === 'spawning' || agent.status === 'active' || agent.status === 'idle') {
      const t = setInterval(() => tick(n => n + 1), 1000);
      return () => clearInterval(t);
    }
  }, [agent.status]);

  return (
    <div className={`agent-row ${selected ? 'selected' : ''}`} onClick={onClick}>
      <span className={`agent-status-dot ${STATUS_CLASS[agent.status]}`}>
        {STATUS_ICON[agent.status]}
      </span>
      <div className="agent-row-body">
        <div className="agent-row-top">
          <span className="agent-name">{agent.name}</span>
          <span className="agent-elapsed">{elapsed(Date.now() - agent.startedAt)}</span>
        </div>
        <div className="agent-row-branch">{agent.branch}</div>
        <div className="agent-row-task">{agent.task.length > 44 ? agent.task.slice(0, 44) + '…' : agent.task}</div>
        <div className="agent-row-meta">
          <span>{agent.model.replace('claude-', '').replace('-4-6', '').replace('-4-5', '')}</span>
          <span className="meta-sep">·</span>
          <span>{agent.tokens.toLocaleString()} tok</span>
          <span className="meta-sep">·</span>
          <span>{agent.toolCalls} calls</span>
        </div>
      </div>
    </div>
  );
}

function OutputPane({ agent }: { agent: AgentSession | undefined }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agent?.output.length]);

  if (!agent) {
    return (
      <div className="output-empty">
        <div className="output-empty-msg">
          <div className="output-empty-icon">⬡</div>
          <div>No agent selected</div>
          <div className="output-empty-hint">Press <kbd>N</kbd> to spawn a new agent</div>
        </div>
      </div>
    );
  }

  return (
    <div className="output-pane">
      <div className="output-header">
        <span className={`agent-status-dot ${STATUS_CLASS[agent.status]}`}>
          {STATUS_ICON[agent.status]}
        </span>
        <span className="output-agent-name">{agent.name}</span>
        <span className="output-sep">│</span>
        <span className="output-branch">{agent.branch}</span>
        <span className="output-sep">│</span>
        <span className="output-model">{agent.model}</span>
        <div className="output-header-spacer" />
        <span className="output-tok">{agent.tokens.toLocaleString()} tokens · {agent.toolCalls} tool calls</span>
      </div>
      <div className="output-body">
        {agent.output.length === 0 && (
          <div className="output-line dim">Initializing…</div>
        )}
        {agent.output.map(line => (
          <div key={line.id} className={`output-line ${line.kind}`}>
            {line.text || <span>&nbsp;</span>}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function NewAgentDialog({ onConfirm, onCancel }: { onConfirm: (task: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-title">⬡ Spawn new agent</div>
        <div className="dialog-label">Task description (leave blank for random demo task)</div>
        <input
          ref={inputRef}
          className="dialog-input"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="e.g. Add rate limiting to the API"
          onKeyDown={e => {
            if (e.key === 'Enter') onConfirm(value.trim());
            if (e.key === 'Escape') onCancel();
          }}
        />
        <div className="dialog-hint">↵ spawn &nbsp;·&nbsp; Esc cancel</div>
      </div>
    </div>
  );
}

export default function App() {
  const { agents, selected, setSelected, spawnAgent, killAgent, removeAgent } = useAgentSimulator();
  const [showNew, setShowNew] = useState(false);
  const [listIdx, setListIdx] = useState(0);

  useEffect(() => {
    const i = agents.findIndex(a => a.id === selected);
    if (i >= 0) setListIdx(i);
  }, [selected, agents]);

  const navigate = useCallback((dir: 1 | -1) => {
    if (agents.length === 0) return;
    const next = Math.max(0, Math.min(agents.length - 1, listIdx + dir));
    setListIdx(next);
    setSelected(agents[next].id);
  }, [agents, listIdx, setSelected]);

  const handleKill = useCallback(() => {
    const agent = agents.find(a => a.id === selected);
    if (!agent) return;
    if (agent.status === 'done' || agent.status === 'error') {
      removeAgent(agent.id);
    } else {
      killAgent(agent.id);
    }
  }, [agents, selected, killAgent, removeAgent]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showNew) return;
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setShowNew(true); }
      else if (e.key === 'k' || e.key === 'K') { e.preventDefault(); handleKill(); }
      else if (e.key === 'ArrowUp' || e.key === 'j') { e.preventDefault(); navigate(-1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); navigate(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showNew, handleKill, navigate]);

  const selectedAgent = agents.find(a => a.id === selected);

  const counts = {
    active: agents.filter(a => a.status === 'active' || a.status === 'spawning' || a.status === 'idle').length,
    done: agents.filter(a => a.status === 'done').length,
    error: agents.filter(a => a.status === 'error').length,
  };

  return (
    <div className="root">
      <div className="header">
        <span className="header-logo">⬡ SUPERSET</span>
        <span className="header-sep">│</span>
        <span className="header-subtitle">AI Agent IDE — parallel Claude Code session manager</span>
        <div className="header-spacer" />
        {counts.active > 0 && <span className="header-stat status-active">● {counts.active} running</span>}
        {counts.done > 0 && <span className="header-stat status-done">✓ {counts.done} done</span>}
        {counts.error > 0 && <span className="header-stat status-error">✗ {counts.error} error</span>}
      </div>

      <div className="main">
        <div className="sidebar">
          <div className="sidebar-header">
            <span>SESSIONS</span>
            <span className="sidebar-count">{agents.length}</span>
          </div>
          <div className="sidebar-list">
            {agents.length === 0 && (
              <div className="sidebar-empty">
                No active sessions.<br />
                Press <kbd>N</kbd> to spawn.
              </div>
            )}
            {agents.map((a, i) => (
              <AgentRow
                key={a.id}
                agent={a}
                selected={a.id === selected}
                onClick={() => { setSelected(a.id); setListIdx(i); }}
              />
            ))}
          </div>
          <div className="sidebar-footer">
            <button className="spawn-btn" onClick={() => setShowNew(true)}>
              + Spawn agent
            </button>
          </div>
        </div>

        <div className="content">
          <OutputPane agent={selectedAgent} />
        </div>
      </div>

      <div className="statusbar">
        <span className="key-hint"><kbd>N</kbd> new</span>
        <span className="key-hint"><kbd>K</kbd> kill / clear</span>
        <span className="key-hint"><kbd>↑↓</kbd> navigate</span>
        <div className="statusbar-spacer" />
        <span className="statusbar-info">git worktree isolation · mcp integration · claude code backend</span>
      </div>

      {showNew && (
        <NewAgentDialog
          onConfirm={(task) => { setShowNew(false); spawnAgent(task || undefined); }}
          onCancel={() => setShowNew(false)}
        />
      )}
    </div>
  );
}
