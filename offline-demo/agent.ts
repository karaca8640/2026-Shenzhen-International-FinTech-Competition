import {clock, addDays, dayDifference, localDate} from './clock';
import type {AgentStep, Case, Tool} from './src/refundpath/types';

export interface ToolCall {tool: Tool; purpose?: 'refund'|'follow_up'|'internal_complaint'|'external_complaint'}
export interface PlannerContext {case: Case; phase: 'inspect'|'act'; today: string}
export interface AgentPlanner {readonly label: string; plan(context: PlannerContext): Promise<ToolCall[]>}
export interface ToolRuntime {beginStep?(): void; execute(c: Case, call: ToolCall): AgentStep; record(c: Case, step: AgentStep): void}
export class ScriptedPlanner implements AgentPlanner {
  readonly label = 'Deterministic scripted planner · no LLM or remote API';
  async plan({case:c, phase, today}: PlannerContext): Promise<ToolCall[]> {
    // Clock changes do not reopen a completed historical payment/receipt record.
    if(c.status==='Resolved')return phase==='inspect'?[{tool:'check_receipt'}]:[];
    if (phase==='inspect') return ['scan_untrusted_instructions','extract_documents','check_recipient_authority','calculate_refund','compute_deadline'].map(tool=>({tool:tool as Tool}));
    if (c.provider_report) return [{tool:'check_receipt'}];
    if (c.submitted_at) {
      if (c.internal_complaint_at && dayDifference(today,localDate(c.internal_complaint_at))>=20) return [{tool:'escalate',purpose:'external_complaint'},{tool:'simulate_submission',purpose:'external_complaint'}];
      if (c.analysis?.deadline && today>c.analysis.deadline.date) return [{tool:'escalate',purpose:'internal_complaint'},{tool:'simulate_submission',purpose:'internal_complaint'}];
      if (today>=addDays(localDate(c.submitted_at),14)) return [{tool:'draft_request',purpose:'follow_up'},{tool:'simulate_submission',purpose:'follow_up'}];
      return [];
    }
    return [{tool:'draft_request',purpose:'refund'},{tool:'simulate_submission',purpose:'refund'}];
  }
}
export class Agent {
  constructor(readonly planner: AgentPlanner, private runtime: ToolRuntime) {}
  async run(c: Case): Promise<AgentStep[]> {
    const steps: AgentStep[]=[];
    for (const phase of ['inspect','act'] as const) {
      const calls = await this.planner.plan({case:c, phase, today:clock.today(c.details.timezone)});
      for (const call of calls) { this.runtime.beginStep?.(); const step=this.runtime.execute(c,call); this.runtime.record(c,step); steps.push(step); }
    }
    c.agent_steps=steps; return steps;
  }
}
