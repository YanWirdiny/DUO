// Renders the home screen's presentational components in jsdom.
import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// jsdom globals must exist before React DOM loads.
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
const g = globalThis as Record<string, unknown>;
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (!(key in globalThis)) g[key] = (dom.window as unknown as Record<string, unknown>)[key];
}
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.IS_REACT_ACT_ENVIRONMENT = true;

const { createElement } = await import("react");
// next/link needs the app router at runtime; a plain anchor is enough here.
mock.module("next/link", {
  defaultExport: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
});

const { render, screen, cleanup } = await import("@testing-library/react");
const { Trend } = await import("@/components/home/HomeCard");
const { WeekStrip } = await import("@/components/home/WeekStrip");
const { EffortCard } = await import("@/components/home/EffortCard");
const { ActivityTimeline } = await import("@/components/home/ActivityTimeline");
const { GymScoreCard } = await import("@/components/home/GymScoreCard");
const { HOME } = await import("@/lib/home");

afterEach(cleanup);

describe("Trend", () => {
  test("gain, loss and no change", () => {
    const { container } = render(
      createElement("div", null, createElement(Trend, { value: 20 }), createElement(Trend, { value: -15 }), createElement(Trend, { value: 0, suffix: "%" }))
    );
    const [up, down, flat] = container.querySelectorAll("span");
    assert.equal(up.textContent, "+20 ↑");
    assert.match(up.className, /text-brand/);
    assert.equal(down.textContent, "−15 ↓");
    assert.match(down.className, /text-ink(?!-)/);
    assert.equal(flat.textContent, "+0%");
    assert.match(flat.className, /text-ink-faint/);
  });
});

describe("WeekStrip", () => {
  test("colors each day by kind and labels it for screen readers", () => {
    render(
      createElement(WeekStrip, {
        days: [
          { date: "2026-10-12", kind: "rest" },
          { date: "2026-10-13", kind: "workout" },
          { date: "2026-10-14", kind: "today" },
        ],
      })
    );
    const items = screen.getAllByRole("listitem");
    assert.equal(items[0].getAttribute("aria-label"), "Monday, Oct 12, rest day");
    assert.equal(items[1].getAttribute("aria-label"), "Tuesday, Oct 13, workout day");
    assert.equal(items[2].getAttribute("aria-label"), "Wednesday, Oct 14, today");
    const circles = items.map((li) => li.querySelectorAll("span")[1]);
    assert.match(circles[0].className, /bg-ink/);
    assert.match(circles[1].className, /bg-brand/);
    assert.match(circles[2].className, /bg-today/);
    assert.equal(circles[1].textContent, "13");
    assert.equal(items[0].querySelector("span")!.textContent, "M");
  });
});

describe("EffortCard", () => {
  test("pads to a full row, scales to the tallest bar, highlights the newest", () => {
    const { container } = render(
      createElement(EffortCard, {
        effort: {
          bars: [
            { date: "2026-10-06", volume: 500 },
            { date: "2026-10-09", volume: 1 },
            { date: "2026-10-11", volume: 1000 },
          ],
          total: 12_400,
          growthPct: 8,
        },
      })
    );
    const chart = screen.getByRole("img");
    const fills = [...chart.children].map((track) => track.firstElementChild as HTMLElement);
    assert.equal(fills.length, HOME.EFFORT_BARS);
    assert.deepEqual(
      fills.map((f) => f.style.height),
      ["0%", "0%", "0%", "0%", "50%", "8%", "100%"]
    );
    assert.match(fills.at(-1)!.className, /bg-brand/);
    assert.match(fills.at(-2)!.className, /bg-ink/);
    assert.match(chart.getAttribute("aria-label")!, /last 3 sessions/);
    const labels = [...(chart.nextElementSibling as HTMLElement).children].map((l) => l.textContent);
    assert.deepEqual(labels, ["", "", "", "", "6", "9", "11"]);
    assert.match(container.textContent!, /12\.4k\s*lbs lifted\s*\+8% ↑/);
  });

  test("empty history and unknown growth", () => {
    const { container } = render(createElement(EffortCard, { effort: { bars: [], total: 0, growthPct: null } }));
    assert.equal(screen.getByRole("img").getAttribute("aria-label"), "No sessions logged yet");
    assert.doesNotMatch(container.textContent!, /%/);
  });

  test("a zero-volume session gets no fill, alone or beside others", () => {
    render(createElement(EffortCard, { effort: { bars: [{ date: "2026-10-06", volume: 0 }], total: 0, growthPct: null } }));
    const fills = [...screen.getByRole("img").children].map((t) => (t.firstElementChild as HTMLElement).style.height);
    assert.ok(fills.every((h) => h === "0%"));
    cleanup();

    const bars = [
      { date: "2026-10-06", volume: 0 },
      { date: "2026-10-08", volume: 100 },
    ];
    render(createElement(EffortCard, { effort: { bars, total: 100, growthPct: null } }));
    const mixed = [...screen.getByRole("img").children].map((t) => (t.firstElementChild as HTMLElement).style.height);
    assert.deepEqual(mixed.slice(-2), ["0%", "100%"]);
  });
});

describe("ActivityTimeline", () => {
  test("lists events with signed points", () => {
    render(
      createElement(ActivityTimeline, {
        events: [
          { id: "1", date: new Date("2026-10-10T00:00:00Z"), points: 10, reason: "Logged scheduled workout (streak: 4)" },
          { id: "2", date: new Date("2026-10-03T00:00:00Z"), points: -15, reason: "Missed a scheduled workout day" },
        ],
      })
    );
    const items = screen.getAllByRole("listitem");
    assert.match(items[0].textContent!, /Logged scheduled workout \(streak: 4\)Sat, Oct 10\+10/);
    assert.match(items[1].textContent!, /-15$/);
    assert.match(items[0].querySelector("span")!.className, /text-brand/);
    assert.match(items[1].querySelector("span")!.className, /text-ink/);
  });

  test("empty state", () => {
    render(createElement(ActivityTimeline, { events: [] }));
    assert.ok(screen.getByText(/Nothing yet/));
  });
});

describe("GymScoreCard", () => {
  test("links to today's log, switching to Edit once logged", () => {
    const props = { gymScore: 100, weekChange: 20, todayStr: "2026-10-14" };
    const { rerender } = render(createElement(GymScoreCard, { ...props, loggedToday: false }));
    const link = screen.getByRole("link");
    assert.equal(link.getAttribute("href"), "/log/2026-10-14");
    assert.equal(link.textContent, "Log");
    rerender(createElement(GymScoreCard, { ...props, loggedToday: true }));
    assert.equal(screen.getByRole("link").textContent, "Edit");
    assert.equal(screen.getByRole("link").getAttribute("aria-label"), "Edit today's workout log");
  });
});
