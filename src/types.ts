export type AgentStatus = 'spawning' | 'active' | 'idle' | 'done' | 'error';

export interface AgentSession {
  id: string;
  name: string;
  branch: string;
  task: string;
  model: string;
  status: AgentStatus;
  startedAt: number;
  output: OutputLine[];
  tokens: number;
  toolCalls: number;
  worktreePath: string;
}

export interface OutputLine {
  id: string;
  text: string;
  kind: 'info' | 'tool' | 'result' | 'error' | 'dim' | 'system';
  ts: number;
}
