// ============================================================
// Aye Aye Trader — Built-in note templates (presets)
// These are NEVER stored in the DB — they always ship with the
// app. Users can't delete them; they can only copy from them.
// Blocks are BlockNote document JSON.
// ============================================================

import type { NoteTemplate } from "@/types/journal";

function h(level: 1 | 2 | 3, text: string) {
  return {
    type: "heading",
    props: { level },
    content: [{ type: "text", text, styles: {} }],
  };
}
function p(text: string, styles: Record<string, any> = {}) {
  return {
    type: "paragraph",
    content: text ? [{ type: "text", text, styles }] : [],
  };
}
function bullet(text: string) {
  return {
    type: "bulletListItem",
    content: [{ type: "text", text, styles: {} }],
  };
}
function numbered(text: string) {
  return {
    type: "numberedListItem",
    content: [{ type: "text", text, styles: {} }],
  };
}
function check(text: string, checked = false) {
  return {
    type: "checkListItem",
    props: { checked },
    content: [{ type: "text", text, styles: {} }],
  };
}
function divider() {
  return { type: "paragraph", content: [] };
}

export const BUILTIN_TEMPLATES: NoteTemplate[] = [
  // ── 1. Morning Prep ────────────────────────────────────────
  {
    id: "builtin-morning-prep",
    name: "Morning Prep",
    description: "Pre-market routine — bias, key levels, setups to watch, rules for the day",
    builtIn: true,
    blocks: [
      h(1, "Morning Prep"),
      divider(),

      h(2, "Macro context"),
      bullet("Overnight news / economic calendar:"),
      bullet("Futures gap: "),
      bullet("VIX / market regime: "),
      divider(),

      h(2, "Key levels"),
      bullet("Prior day high / low: "),
      bullet("POC / VAH / VAL: "),
      bullet("GEX walls: "),
      bullet("Weekly / monthly pivots: "),
      divider(),

      h(2, "Bias"),
      p("Directional lean and why:"),
      divider(),

      h(2, "Setups to watch"),
      numbered("Setup 1: "),
      numbered("Setup 2: "),
      numbered("Setup 3: "),
      divider(),

      h(2, "Rules for today"),
      check("Max loss limit: $"),
      check("Max trades: "),
      check("No trading first 15 minutes"),
      check("Walk away after 2 losses"),
      divider(),

      h(2, "Mindset check"),
      p("How am I feeling going in?"),
    ],
  },

  // ── 2. Post-Session Review ─────────────────────────────────
  {
    id: "builtin-post-session",
    name: "Post-Session Review",
    description: "End-of-day debrief — what happened, what worked, what to fix",
    builtIn: true,
    blocks: [
      h(1, "Post-Session Review"),
      divider(),

      h(2, "Session summary"),
      bullet("Net P&L: $"),
      bullet("Trades taken: "),
      bullet("Win rate: "),
      bullet("Best trade: "),
      bullet("Worst trade: "),
      divider(),

      h(2, "What went well"),
      p(""),
      divider(),

      h(2, "What went wrong"),
      p(""),
      divider(),

      h(2, "Rule breaks"),
      check("Followed max loss limit"),
      check("Followed max trade count"),
      check("Took only A/B grade setups"),
      check("No revenge trading"),
      check("Walked away when plan said to"),
      divider(),

      h(2, "Biggest lesson today"),
      p(""),
      divider(),

      h(2, "Fix for tomorrow"),
      numbered(""),
    ],
  },

  // ── 3. Weekly Plan ─────────────────────────────────────────
  {
    id: "builtin-weekly-plan",
    name: "Weekly Plan",
    description: "Sunday prep — macro themes, key events, weekly goals",
    builtIn: true,
    blocks: [
      h(1, "Weekly Plan"),
      divider(),

      h(2, "Week at a glance"),
      bullet("Key economic events:"),
      bullet("Fed speakers:"),
      bullet("Earnings that move markets:"),
      bullet("Seasonal / options expiry notes:"),
      divider(),

      h(2, "Macro theme"),
      p("What is the market narrative this week?"),
      divider(),

      h(2, "Weekly bias"),
      bullet("Bias: "),
      bullet("Invalidation: "),
      bullet("Key support: "),
      bullet("Key resistance: "),
      divider(),

      h(2, "Performance goals (process, not P&L)"),
      check("Take only A+ and A grade setups"),
      check("Log every trade same day"),
      check("No oversizing — stick to planned size"),
      check("Post-session review each day"),
      divider(),

      h(2, "Focus for the week"),
      p("One thing to work on:"),
      divider(),

      h(2, "Setups on watch"),
      numbered(""),
      numbered(""),
    ],
  },

  // ── 4. Eval Gauntlet Prep ──────────────────────────────────
  {
    id: "builtin-eval-prep",
    name: "Eval Gauntlet Prep",
    description: "Pre-eval checklist and game plan for a prop firm evaluation",
    builtIn: true,
    blocks: [
      h(1, "Eval Gauntlet Prep"),
      divider(),

      h(2, "Eval parameters"),
      bullet("Firm / account: "),
      bullet("Starting balance: $"),
      bullet("Profit target: $"),
      bullet("Max drawdown: $"),
      bullet("Drawdown type: "),
      bullet("Daily loss limit: $"),
      divider(),

      h(2, "My edge summary"),
      p("What is the one setup I trade best? Why does it work?"),
      divider(),

      h(2, "Size plan"),
      bullet("Starting contract size: "),
      bullet("Scale up only when: "),
      bullet("Scale back if: "),
      divider(),

      h(2, "Non-negotiable rules"),
      check("Never exceed daily loss limit"),
      check("Walk away after 2 consecutive losses"),
      check("Max trades per day: "),
      check("No trading around major news unless planned"),
      check("No averaging into losers"),
      divider(),

      h(2, "Mental game"),
      p("What kills my evals? What am I committing to do differently this time?"),
      divider(),

      h(2, "Timeline"),
      bullet("Target pass date: "),
      bullet("Trades per week: "),
      bullet("Expected duration: "),
    ],
  },

  // ── 5. Playbook Entry ──────────────────────────────────────
  {
    id: "builtin-playbook",
    name: "Playbook Entry",
    description: "Document a new setup — entry rules, confluences, examples",
    builtIn: true,
    blocks: [
      h(1, "Playbook Entry"),
      divider(),

      h(2, "Setup name"),
      p(""),
      divider(),

      h(2, "What is this setup?"),
      p("One paragraph: what is happening in the market that creates this opportunity?"),
      divider(),

      h(2, "Entry criteria (all must be present)"),
      check(""),
      check(""),
      check(""),
      check(""),
      divider(),

      h(2, "Grading"),
      bullet("A+ = all criteria + "),
      bullet("A  = core criteria + "),
      bullet("B  = partial — take smaller size or skip"),
      divider(),

      h(2, "Entry"),
      bullet("Trigger: "),
      bullet("Entry style: "),
      bullet("Size: "),
      divider(),

      h(2, "Stop"),
      bullet("Stop placement: "),
      bullet("Max stop: $"),
      divider(),

      h(2, "Target"),
      bullet("First target: "),
      bullet("Runner target: "),
      bullet("Expected R: "),
      divider(),

      h(2, "Market conditions where this works"),
      p(""),
      divider(),

      h(2, "Market conditions where this FAILS"),
      p(""),
      divider(),

      h(2, "Examples"),
      numbered("Date + description: "),
      numbered("Date + description: "),
    ],
  },
];
