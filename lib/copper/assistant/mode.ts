// Module 5: how the support desk is staffed.
// "multi": Copper plus the Refund agent, with a handoff (Module 4).
// "single": one agent with every tool and no handoff.
// The golden-set evaluation runs both (npm run eval:compare); DEFAULT_MODE is
// the one we ship, chosen from those results (see docs/architecture.md).

export type SupportMode = "multi" | "single";

export const SUPPORT_MODES: SupportMode[] = ["multi", "single"];

export const DEFAULT_MODE: SupportMode = "multi";
