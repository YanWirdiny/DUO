# Duo: Issue Tickets

Tickets from the vibe-code review of the Duo gym buddy tracker (login, Today, Program, History, Info screens).

**Priority scale:** P0 = breaks trust or correctness, fix first. P1 = clearly visible problem. P2 = polish that makes it feel designed. P3 = nice to have.

## Summary

| ID | Title | Type | Priority |
|---|---|---|---|
| DUO-001 | History grid contradicts score and streak | Bug | P0 |
| DUO-002 | Both users show identical History grids | Bug | P0 |
| DUO-003 | Today card says no exercises but offers logging | Bug / UX | P1 |
| DUO-004 | Remove `maximum-scale=1` from viewport | Accessibility | P1 |
| DUO-005 | Orange box around active nav tab | Bug / UI | P1 |
| DUO-006 | `theme-color` is near-black on a white app | Bug | P1 |
| DUO-007 | Red is used for everything | Design | P1 |
| DUO-008 | Redesign History as one shared grid | Design | P1 |
| DUO-009 | Explain how Gym Score works | Feature / UX | P2 |
| DUO-010 | Inconsistent names for score and streak | Content | P2 |
| DUO-011 | Inconsistent "Not logged" status labels | Content | P2 |
| DUO-012 | Rewrite generic AI copy | Content | P2 |
| DUO-013 | "Disconnect buddy" needs destructive styling and a confirm | UX | P2 |
| DUO-014 | Restructure the Info tab | Information architecture | P2 |
| DUO-015 | Program page control clarity | UI | P2 |
| DUO-016 | Break up the card soup on Home | Design | P2 |
| DUO-017 | Simplify the login page | UX | P3 |
| DUO-018 | Vary the page header pattern | Design | P3 |
| DUO-019 | Custom domain and name check | Branding | P3 |
| DUO-020 | Rename logo asset | Chore | P3 |

---

## P0: Correctness

### DUO-001: History grid contradicts score and streak
**Type:** Bug | **Priority:** P0 | **Screens:** History, Today, Info

**Problem:** History shows roughly 24 attended sessions per user over 8 weeks (every Mon/Wed/Fri). Today and Info show Gym Score 0, streak 0, best 0, and Progress says no workouts logged. At least one of these is wrong.

**Likely cause:** History is rendering seeded mock data, or it is reading the weekly program schedule instead of actual workout logs.

**Acceptance criteria:**
- [ ] History, Gym Score, streak, best streak, and Progress all read from the same source of logged workouts.
- [ ] With zero logs, History shows an empty grid.
- [ ] Logging a workout updates all four places consistently.
- [ ] Any seed or mock data is removed from production.

### DUO-002: Both users show identical History grids
**Type:** Bug | **Priority:** P0 | **Screen:** History

**Problem:** Yan's and Lynn's grids are exactly the same pattern.

**Acceptance criteria:**
- [ ] Each grid is queried by that user's ID.
- [ ] Test: log a workout as one user only and confirm only their grid changes.

---

## P1: Visible problems

### DUO-003: Today card says no exercises but offers logging
**Type:** Bug / UX | **Priority:** P1 | **Screen:** Today

**Problem:** The card reads "No exercises added yet for this day" directly above a big "Log today's workout" button. It is unclear what gets logged. Monday is set as a gym day but has no exercises.

**Acceptance criteria:**
- [ ] If the day has no exercises, the primary action becomes "Add exercises" and links to that day on the Program page.
- [ ] If the day has exercises, list them on the card and keep "Log today's workout."
- [ ] Rest days show a rest-day state instead of a log button.

### DUO-004: Remove `maximum-scale=1` from viewport
**Type:** Accessibility | **Priority:** P1 | **Scope:** Global

**Problem:** The viewport meta tag disables pinch-to-zoom, which blocks low-vision users.

**Acceptance criteria:**
- [ ] Viewport is `width=device-width, initial-scale=1`.
- [ ] Pinch-to-zoom works on iOS Safari and Android Chrome.
- [ ] If inputs zoom on focus in iOS, fix it by setting input font size to at least 16px, not by disabling zoom.

### DUO-005: Orange box around active nav tab
**Type:** Bug / UI | **Priority:** P1 | **Component:** Bottom nav

**Problem:** The active tab has an orange/yellow outline that matches nothing else in the app. Likely a default focus ring or leftover style.

**Acceptance criteria:**
- [ ] Active state uses the app's own styling (icon and label color, optional indicator).
- [ ] Focus rings only appear for keyboard navigation (`:focus-visible`) and use a color from the palette.

### DUO-006: `theme-color` is near-black on a white app
**Type:** Bug | **Priority:** P1 | **Scope:** Global meta

**Problem:** `theme-color` is `#02010a`, left over from a dark template. The browser chrome does not match the white UI.

**Acceptance criteria:**
- [ ] `theme-color` matches the header background.
- [ ] Optional: separate light and dark values using `media="(prefers-color-scheme: ...)"` if dark mode is added later.

### DUO-007: Red is used for everything
**Type:** Design | **Priority:** P1 | **Scope:** Global

**Problem:** Logo, avatar, score, streak, main button, toggles, active tab, and the "Not logged" warning pill are all the same red. Red reads as error, so a big red "0" under Gym Score looks like a failure message.

**Acceptance criteria:**
- [ ] Define color roles in one place (tokens): primary action, success/logged, warning/not logged, neutral stats.
- [ ] Red is assigned one job only (for example: primary action).
- [ ] Stat numbers use a neutral color unless they carry meaning.
- [ ] "Not logged" uses a warning color distinct from the primary action.

### DUO-008: Redesign History as one shared grid
**Type:** Design | **Priority:** P1 | **Screen:** History | **Depends on:** DUO-001, DUO-002

**Problem:** Two separate, stacked GitHub-style grids fill the whole screen, and attendance uses black instead of the accent color. It does not show the "duo" aspect.

**Acceptance criteria:**
- [ ] One grid where each day shows whether you, your buddy, or both went (for example split cells or distinct fills).
- [ ] Fill colors come from the tokens defined in DUO-007.
- [ ] Legend explains the fills.
- [ ] Future days are visually distinct from missed days.

---

## P2: Polish

### DUO-009: Explain how Gym Score works
**Type:** Feature / UX | **Priority:** P2 | **Screens:** Today, Info

**Problem:** Gym Score has no visible rules, so the number means nothing.

**Acceptance criteria:**
- [ ] Decide the actual rules with your buddy (points per session, penalty for a missed day, bonus when both go, and so on).
- [ ] Show the rules in one line on the score card or behind a tap.
- [ ] Recent activity shows point changes (for example "+10 Session logged").

### DUO-010: Inconsistent names for score and streak
**Type:** Content | **Priority:** P2 | **Screens:** Today, Info

**Problem:** Home says "Gym Score," Info says "pts." Streak shows as a label on Home and "0 streak" on Info.

**Acceptance criteria:**
- [ ] One name for the score and one format for the streak, used everywhere.
- [ ] Icons for score and streak always have a text label or accessible name.

### DUO-011: Inconsistent "Not logged" status labels
**Type:** Content | **Priority:** P2 | **Screen:** Today

**Problem:** Your status says "Not logged," Lynn's says "Not logged yet."

**Acceptance criteria:**
- [ ] Same status component and text for both users.
- [ ] Status labels live in one shared constant.

### DUO-012: Rewrite generic AI copy
**Type:** Content | **Priority:** P2 | **Scope:** All screens

**Problem:** Copy uses stock AI phrasing and em dashes. Lines to replace:
- "Show up. Every time."
- "Track your sessions, keep your streak, and hold each other accountable."
- "Nothing yet — log a workout to start your journey."
- "Your progress and your gym buddy, all in one place."
- "Missed days cost you both — keep each other honest."
- "Welcome back" (login and home)
- Page title "Duo — Gym Buddy Tracker"

**Acceptance criteria:**
- [ ] Every line rewritten in your own voice (inside jokes with your buddy are fair game).
- [ ] No em dashes anywhere in the UI.
- [ ] No "journey," "all in one place," or similar stock phrases.

### DUO-013: "Disconnect buddy" needs destructive styling and a confirm
**Type:** UX | **Priority:** P2 | **Screen:** Info

**Problem:** A destructive action is styled as plain text inside the main buddy card, with no confirmation.

**Acceptance criteria:**
- [ ] Moved to a settings area or the bottom of the page, separate from stats.
- [ ] Styled as destructive (warning color, clear label).
- [ ] Confirmation dialog that explains what happens to shared history and score.

### DUO-014: Restructure the Info tab
**Type:** Information architecture | **Priority:** P2 | **Screen:** Info, bottom nav

**Problem:** "Info" is a junk-drawer name for what is actually Progress plus Buddy, and the buddy card duplicates the one on Home.

**Acceptance criteria:**
- [ ] Rename the tab to what it holds (for example "Progress").
- [ ] Remove the duplicate buddy card, or give the Info version extra detail Home does not have (history together, head-to-head stats).
- [ ] Tab icon matches the new name.

### DUO-015: Program page control clarity
**Type:** UI | **Priority:** P2 | **Screen:** Program

**Problem:** The "+" add-exercise button is so faint it looks disabled. Each day has both a toggle and a chevron, so two controls per row. Sunday is cut off above the nav.

**Acceptance criteria:**
- [ ] "+" button meets WCAG contrast (3:1 for UI components) and looks tappable.
- [ ] Rest days cannot be expanded, or tapping the row does the obvious thing, so the chevron is not a second competing control.
- [ ] Page has enough bottom padding that Sunday is fully visible above the nav.
- [ ] Added exercises appear in a list under the day with edit and delete.

### DUO-016: Break up the card soup on Home
**Type:** Design | **Priority:** P2 | **Screen:** Today

**Problem:** Every section is the same white rounded card with the same border and shadow, stacked with equal weight.

**Acceptance criteria:**
- [ ] Today's workout is the visual hero of the page.
- [ ] Buddy status becomes a compact strip instead of a full card.
- [ ] Score and streak are grouped with less visual weight than the workout.
- [ ] At least one layout choice that is not a plain stacked card.

---

## P3: Nice to have

### DUO-017: Simplify the login page
**Type:** UX | **Priority:** P3 | **Screen:** Login

**Problem:** A private two-person app has a marketing hero on its login page, while practical pieces are missing.

**Acceptance criteria:**
- [ ] Remove the hero section, or replace it with something personal.
- [ ] Add a password reset path (even a manual one).
- [ ] Heading does not assume a returning user.

### DUO-018: Vary the page header pattern
**Type:** Design | **Priority:** P3 | **Scope:** All tabs

**Problem:** Every page opens with the same big title plus gray one-line subtitle.

**Acceptance criteria:**
- [ ] Drop subtitles that add nothing.
- [ ] Each page's top section shows something useful (for example Program shows "3 gym days a week").

### DUO-019: Custom domain and name check
**Type:** Branding | **Priority:** P3

**Problem:** App runs on the default Railway subdomain `duo-production-d303`, and "Duo" plus a flame streak sits very close to Duolingo's branding.

**Acceptance criteria:**
- [ ] Decide whether to keep the name.
- [ ] Point a custom domain or cleaner subdomain at the app.

### DUO-020: Rename logo asset
**Type:** Chore | **Priority:** P3

**Problem:** Logo lives at `/icons/logoGym.png`, which does not follow a clear naming convention.

**Acceptance criteria:**
- [ ] Rename to a consistent convention (for example `/icons/logo.png` or `logo-192.png`) and update all references, including the manifest.
- [ ] Provide the sizes the web app manifest needs.

---

## Suggested order

1. DUO-001 and DUO-002 (fix the data so every number is trustworthy)
2. DUO-003, DUO-004, DUO-005, DUO-006 (quick visible fixes)
3. DUO-007, then DUO-008 (color tokens first, then History redesign on top)
4. DUO-009 through DUO-016
5. DUO-017 through DUO-020
