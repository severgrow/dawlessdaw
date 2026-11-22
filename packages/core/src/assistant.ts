/**
 * AssistantTool extension point — no AI dependency in v0.1.
 * Hosts may register tools later; the core never requires an LLM.
 */
export interface AssistantToolContext {
  getFocusDeviceId(): string | null;
  listDeviceIds(): string[];
  isSimulation(): boolean;
}

export interface AssistantTool {
  id: string;
  name: string;
  description: string;
  /** Execute returns a plain result object; never streams model tokens. */
  execute(args: Record<string, unknown>, ctx: AssistantToolContext): Promise<unknown> | unknown;
}

export class AssistantToolRegistry {
  private tools = new Map<string, AssistantTool>();

  register(tool: AssistantTool): void {
    this.tools.set(tool.id, tool);
  }

  unregister(id: string): void {
    this.tools.delete(id);
  }

  list(): AssistantTool[] {
    return [...this.tools.values()];
  }

  get(id: string): AssistantTool | undefined {
    return this.tools.get(id);
  }

  async run(
    id: string,
    args: Record<string, unknown>,
    ctx: AssistantToolContext,
  ): Promise<unknown> {
    const tool = this.tools.get(id);
    if (!tool) throw new Error(`Unknown AssistantTool: ${id}`);
    return tool.execute(args, ctx);
  }
}
