# Single agent vs two agents (Module 5, Part 4)

The same 20 golden questions, graded by the same AI judge (Gemini through
`lib/ai/call.ts`), run on both ways of staffing the support desk. Run it again
with `npm run eval:compare`; the raw tables are written to
`evals/results/compare.md`.

- **Two agents (multi):** Copper answers products, prices, stock and policy
  questions. Refunds are handed to the Refund agent, which has the refund tools.
- **One agent (single):** one agent with all seven tools and no handoff.

## Results

One run each, 2026-11-19, model `gemini-3.5-flash-lite`.

| | Two agents | One agent |
|---|---|---|
| Questions | 20 | 20 |
| Pass rate | 95% | 100% |
| Mean judge score (0 to 1) | 0.95 | 1.00 |
| Critical failures | 0 | 0 |
| Mean cost per question | $0.00235 | $0.00209 |
| Total cost | $0.0471 | $0.0419 |
| Mean time | 3.8 s | 3.2 s |
| Slowest 10% (p90) | 5.5 s | 4.5 s |
| Mean tokens | 3333 | 3316 |
| Agent calls per question | 1.45 | 1.00 |
| Failed question | `mixed-refund-and-price` | none |

Both runs are Langfuse dataset runs on the dataset `copper-golden-set`, so they
can be compared side by side there (Experiments > the two runs). Each answer
has the scores `judge_score`, `judge_pass`, `tools_ok`, `cost_usd`,
`latency_s` and `tokens`, and a trace with the agent, its tool calls, tokens,
cost and time.

## What the failure shows

"Please refund order 1001, and also tell me how much a Copper Home costs."

Copper hands off to the Refund agent. The Refund agent refunds the order and
hands back, because the price is not its job. Copper then hands back to the
Refund agent again. The two agents bounce until the handoff limit (2) stops
them and the customer gets the generic error. A request that needs both agents
in one message is the weak spot of a handoff design. The single agent has every
tool, so it answers both parts in one pass.

## Trade-offs

| | Two agents | One agent |
|---|---|---|
| Quality on this golden set | One failure (mixed requests) | No failures |
| Cost and speed | About 12% more cost, 19% slower | Cheaper and faster |
| Tool isolation | Copper never holds the refund tools | Copper also holds `request_refund` |
| Prompts | Short and focused, one job each | One longer prompt with both jobs |
| Failure modes | Handoff loops and ping-pong | A bigger tool menu to choose from |

The refund decision itself is code in `lib/copper/orders.ts` in both designs,
so neither agent can approve a refund over the limit. All 9 critical safety
and refund questions passed on both.

## Decision: ship the two agents

`DEFAULT_MODE` in `lib/copper/assistant/mode.ts` stays `"multi"`. The reasons
are about risk, not about this run's score:

- Keeping the refund tools away from the open-ended Q&A agent is a safety
  property the golden set can't fully measure. A customer can say anything to
  Copper, and Copper can't refund anything.
- The one failure is a known, narrow case (a refund and a product question in
  one message). The next fix is in the handoff, not in dropping the design.

What would change the decision: the single agent kept its 100% over repeated
runs and a larger golden set, and the mixed-request failure in the two-agent
design stays unfixed. `mode: "single"` is already built and tested
(`tests/single-agent.test.ts`), so switching is one line plus updating the
Module 4 handoff tests.

## Limits of this comparison

- 20 questions and one run per design. Gemini answers vary, so a 5-point gap
  is one question.
- The judge is the same model family as the agents and can favor its own style.
  The tool checks (`mustCall`, `mustNotCall`) and the critical flags don't
  depend on the judge.
- Only single-turn questions. Long conversations, and handoffs across several
  turns, aren't covered.
