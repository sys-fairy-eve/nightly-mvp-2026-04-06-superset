import { useState, useCallback, useRef, useEffect } from 'react';
import type { AgentSession, AgentStatus, OutputLine } from './types';

let idCounter = 0;
const uid = () => `${Date.now()}-${++idCounter}`;

const MODELS = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'];

const TASK_TEMPLATES = [
  'Refactor authentication middleware to use JWT instead of sessions',
  'Add unit tests for the payment processing module',
  'Implement rate limiting on all public API endpoints',
  'Migrate database schema: add user preferences table',
  'Fix race condition in websocket message handler',
  'Optimize image upload pipeline — reduce P95 latency by 40%',
  'Add OpenAPI spec generation to CI/CD pipeline',
  'Implement feature flag system for gradual rollouts',
  'Extract shared UI components into design system package',
  'Debug memory leak in background job processor',
];

const TOOL_SEQUENCES: Record<string, string[][]> = {
  refactor: [
    ['Read', 'src/middleware/auth.ts'],
    ['Read', 'src/middleware/session.ts'],
    ['Bash', 'npm install jsonwebtoken @types/jsonwebtoken'],
    ['Edit', 'src/middleware/auth.ts'],
    ['Write', 'src/middleware/jwt.ts'],
    ['Bash', 'npm test -- --grep auth'],
    ['Edit', 'src/routes/api.ts'],
  ],
  test: [
    ['Read', 'src/payments/processor.ts'],
    ['Bash', 'npm test -- --coverage'],
    ['Write', 'src/payments/processor.test.ts'],
    ['Bash', 'npm test -- src/payments/processor.test.ts'],
    ['Edit', 'src/payments/processor.test.ts'],
    ['Bash', 'npm test -- --coverage src/payments'],
  ],
  default: [
    ['Read', 'src/index.ts'],
    ['Bash', 'git log --oneline -10'],
    ['Glob', 'src/**/*.ts'],
    ['Grep', 'TODO|FIXME'],
    ['Edit', 'src/index.ts'],
    ['Bash', 'npm run build'],
    ['Bash', 'npm test'],
  ],
};

function pickToolSequence(task: string): string[][] {
  if (task.toLowerCase().includes('refactor') || task.toLowerCase().includes('migrate')) {
    return TOOL_SEQUENCES.refactor;
  }
  if (task.toLowerCase().includes('test')) {
    return TOOL_SEQUENCES.test;
  }
  return TOOL_SEQUENCES.default;
}

function randomBranch(task: string): string {
  const slug = task
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .split(' ')
    .slice(0, 4)
    .join('-');
  return `worktree/${slug}`;
}

function randomWorktree(branch: string): string {
  return `/tmp/worktrees/${branch.replace('worktree/', '')}`;
}

function makeLine(text: string, kind: OutputLine['kind']): OutputLine {
  return { id: uid(), text, kind, ts: Date.now() };
}

export function useAgentSimulator() {
  const [agents, setAgents] = useState<AgentSession[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const timers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const pushLine = useCallback((id: string, line: OutputLine) => {
    setAgents(prev =>
      prev.map(a =>
        a.id === id
          ? { ...a, output: [...a.output.slice(-200), line], tokens: a.tokens + Math.floor(Math.random() * 120 + 20) }
          : a
      )
    );
  }, []);

  const setStatus = useCallback((id: string, status: AgentStatus) => {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, status } : a));
  }, []);

  const runAgent = useCallback((agent: AgentSession) => {
    const tools = pickToolSequence(agent.task);
    let step = 0;

    pushLine(agent.id, makeLine(`Initializing worktree at ${agent.worktreePath}`, 'system'));
    pushLine(agent.id, makeLine(`Branch: ${agent.branch}`, 'dim'));
    pushLine(agent.id, makeLine(`Model: ${agent.model}`, 'dim'));

    const spawningTimer = setTimeout(() => {
      setStatus(agent.id, 'active');
      pushLine(agent.id, makeLine('', 'dim'));
      pushLine(agent.id, makeLine(`Task: ${agent.task}`, 'info'));
      pushLine(agent.id, makeLine('', 'dim'));
      pushLine(agent.id, makeLine('Analyzing codebase...', 'info'));

      const interval = setInterval(() => {
        if (step >= tools.length) {
          clearInterval(interval);
          timers.current.delete(agent.id);

          const succeeded = Math.random() > 0.12;
          if (succeeded) {
            pushLine(agent.id, makeLine('', 'dim'));
            pushLine(agent.id, makeLine('✓ Task completed successfully', 'result'));
            pushLine(agent.id, makeLine(`  ${Math.floor(Math.random() * 8 + 2)} files changed, ${Math.floor(Math.random() * 300 + 50)} insertions`, 'dim'));
            pushLine(agent.id, makeLine(`  Branch ready to merge: ${agent.branch}`, 'dim'));
            setStatus(agent.id, 'done');
          } else {
            pushLine(agent.id, makeLine('', 'dim'));
            pushLine(agent.id, makeLine('✗ Task failed: test suite did not pass', 'error'));
            pushLine(agent.id, makeLine('  Review output above for details', 'dim'));
            setStatus(agent.id, 'error');
          }
          return;
        }

        const [tool, arg] = tools[step];
        step++;

        setAgents(prev =>
          prev.map(a =>
            a.id === agent.id ? { ...a, toolCalls: a.toolCalls + 1 } : a
          )
        );
        pushLine(agent.id, makeLine(`  ⚡ ${tool}(${arg ? `"${arg}"` : ''})`, 'tool'));

        // Occasional result snippet
        if (Math.random() > 0.5) {
          const snippets: Record<string, string> = {
            Read: `    → ${Math.floor(Math.random() * 200 + 20)} lines read`,
            Bash: `    → exit 0 (${Math.floor(Math.random() * 800 + 100)}ms)`,
            Glob: `    → ${Math.floor(Math.random() * 40 + 5)} files matched`,
            Grep: `    → ${Math.floor(Math.random() * 12)} matches`,
            Edit: `    → patch applied`,
            Write: `    → file written`,
          };
          if (snippets[tool]) {
            pushLine(agent.id, makeLine(snippets[tool], 'dim'));
          }
        }

        // Occasionally go idle between bursts
        if (step % 3 === 0 && step < tools.length) {
          setStatus(agent.id, 'idle');
          setTimeout(() => setStatus(agent.id, 'active'), 600 + Math.random() * 800);
        }
      }, 900 + Math.random() * 700);

      timers.current.set(agent.id, interval);
    }, 600 + Math.random() * 400);

    timers.current.set(`${agent.id}:spawn`, spawningTimer as unknown as ReturnType<typeof setInterval>);
  }, [pushLine, setStatus]);

  const spawnAgent = useCallback((task?: string) => {
    const t = task || TASK_TEMPLATES[Math.floor(Math.random() * TASK_TEMPLATES.length)];
    const branch = randomBranch(t);
    const agent: AgentSession = {
      id: uid(),
      name: `agent-${String(idCounter).padStart(2, '0')}`,
      branch,
      task: t,
      model: MODELS[Math.floor(Math.random() * MODELS.length)],
      status: 'spawning',
      startedAt: Date.now(),
      output: [],
      tokens: 0,
      toolCalls: 0,
      worktreePath: randomWorktree(branch),
    };
    setAgents(prev => [agent, ...prev]);
    setSelected(agent.id);
    runAgent(agent);
    return agent.id;
  }, [runAgent]);

  const killAgent = useCallback((id: string) => {
    const t = timers.current.get(id);
    const ts = timers.current.get(`${id}:spawn`);
    if (t) { clearInterval(t); timers.current.delete(id); }
    if (ts) { clearInterval(ts); timers.current.delete(`${id}:spawn`); }
    setAgents(prev => prev.map(a =>
      a.id === id
        ? { ...a, status: 'error', output: [...a.output, makeLine('  ✗ Killed by user', 'error')] }
        : a
    ));
  }, []);

  const removeAgent = useCallback((id: string) => {
    killAgent(id);
    setAgents(prev => prev.filter(a => a.id !== id));
    setSelected(prev => prev === id ? null : prev);
  }, [killAgent]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timers.current.forEach(t => clearInterval(t));
    };
  }, []);

  // Auto-select first agent
  useEffect(() => {
    setAgents(prev => {
      if (prev.length > 0 && !selected) {
        setSelected(prev[0].id);
      }
      return prev;
    });
  }, [agents.length, selected]);

  return { agents, selected, setSelected, spawnAgent, killAgent, removeAgent };
}
