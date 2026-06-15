// Theme-aware chart colours. Charts are drawn on <canvas> so they can't use CSS
// variables directly — we map the current theme to soft grid/tick/legend colours.
// Light mode uses a low-opacity slate grid so the lines read as gentle guides
// instead of harsh black rules.
export type ThemeName = "dark" | "light";

export interface ChartColors {
  grid: string;
  tick: string;
  legend: string;
}

export function chartColors(theme: ThemeName): ChartColors {
  return theme === "light"
    ? { grid: "rgba(30,41,59,.07)", tick: "#7a828f", legend: "#3a424e" }
    : { grid: "#1e2733", tick: "#7d8896", legend: "#e6edf3" };
}

// Standard scales block built from the theme colours.
export function chartScales(c: ChartColors) {
  return {
    x: { grid: { color: c.grid }, ticks: { color: c.tick } },
    y: { grid: { color: c.grid }, ticks: { color: c.tick } },
  };
}
