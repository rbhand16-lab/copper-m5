// Module 5: the single agent has every tool and never hands off. Mock model,
// so no AI key.
import type { LanguageModelV4StreamPart as ModelStreamPart } from "@ai-sdk/provider";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { finalValue } from "@/lib/ai/live";
import { askCopper } from "@/lib/copper/assistant/ask";
import { toolCallsOf } from "@/lib/copper/assistant/progress";
import {
  copperTools,
  refundAgentTools,
  singleAgentTools,
} from "@/lib/copper/assistant/tools";
import { SINGLE_AGENT_INSTRUCTIONS } from "@/lib/copper/assistant/instructions";

let model: MockLanguageModelV4;
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => () => model,
}));

type StreamPart = Parameters<
  typeof convertArrayToReadableStream<ModelStreamPart>
>[0][number];

const usage = {
  inputTokens: {
    total: 500,
    noCache: 500,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 50, text: 50, reasoning: undefined },
};

const finish = (reason: "stop" | "tool-calls"): StreamPart => ({
  type: "finish",
  finishReason: { unified: reason, raw: undefined },
  usage,
});

const says = (text: string): StreamPart[] => [
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: text },
  { type: "text-end", id: "t1" },
  finish("stop"),
];

const calls = (toolName: string, input: unknown): StreamPart[] => [
  { type: "tool-input-start", id: "call-1", toolName },
  { type: "tool-input-end", id: "call-1" },
  {
    type: "tool-call",
    toolCallId: "call-1",
    toolName,
    input: JSON.stringify(input),
  },
  finish("tool-calls"),
];

function modelStreaming(...steps: StreamPart[][]) {
  let step = 0;
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream(steps[step++] ?? says("")),
    }),
  });
}

const desk = { limitUsd: 50, refunds: [] };

describe("single agent tools", () => {
  it("has Copper's tools and the refund tools, and no handoffs", () => {
    const names = Object.keys(singleAgentTools(desk));
    expect(names).toEqual(
      expect.arrayContaining([
        ...Object.keys(copperTools),
        "get_orders",
        "request_refund",
      ]),
    );
    expect(names).not.toContain("transfer_to_refund_agent");
    expect(names).not.toContain("transfer_to_copper");
  });

  it("leaves the Refund agent's own tools as they were", () => {
    expect(Object.keys(refundAgentTools(desk)).sort()).toEqual([
      "get_orders",
      "request_refund",
      "transfer_to_copper",
    ]);
  });

  it("tells the one agent to handle refunds itself", () => {
    expect(SINGLE_AGENT_INSTRUCTIONS).toContain("request_refund");
    expect(SINGLE_AGENT_INSTRUCTIONS).toContain("You are Copper");
  });
});

describe("askCopper in single mode", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
  });

  it("refunds an order without any handoff, and reports tokens and cost", async () => {
    model = modelStreaming(
      calls("request_refund", { orderId: "1001" }),
      says("Done: $7.99 is refunded."),
    );
    const { progress } = await askCopper({
      messages: [{ role: "user", content: "Refund order 1001" }],
      useTools: true,
      desk,
      mode: "single",
    });
    const final = await finalValue(progress);
    expect(final.status).toBe("done");
    expect(final.agent).toBe("copper");
    expect(final.steps.some((s) => s.type === "handoff")).toBe(false);
    expect(toolCallsOf(final).map((c) => c.name)).toEqual(["request_refund"]);
    expect(final.reply).toContain("$7.99");
    expect(final.stats?.agentCalls).toBe(1);
    expect(final.stats?.inputTokens).toBe(1000);
    expect(final.stats?.costUsd).toBeGreaterThan(0);
  });
});
