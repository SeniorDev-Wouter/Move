# Features — Move

Move is an installable, no-backend PWA that nudges desk-bound users to take short exercise breaks
on a configurable interval, delivered by a retro Clippy-style assistant. Everything is stored
locally in the browser (`localStorage`) — there is no account, server, or sync.

## First run

A fresh visitor gets a ready-to-use setup with no configuration required: the built-in exercise
catalog, a default "Office-safe" loadout (no equipment, office context), context set to "office",
no owned equipment, a 30-minute interval and 5-minute snooze. Reminders **start paused** — a
prominent Start control is shown, and the retro window chrome is applied immediately.

## Starting / stopping reminders

Pressing **Start** requests notification permission (if not yet decided) and begins the reminder
timer. If permission is denied, the app still works — reminders show in-app only. **Stop** pauses
the timer. The running/paused state is not persisted, so reminders are always paused again after a
reload; every other setting survives.

## The assistant & reminders

A persistent Clippy-style character sits in the window and hosts every reminder in a retro yellow
speech balloon: the exercise name, its structured target ("12 reps" or "hold 30s"), form/how-to
instructions, and a placeholder image. A short retro "ding" plays when a reminder fires.

Each reminder offers four actions, available both inline (where the OS notification supports
action buttons) and in the in-app balloon:
- **Done** — marks the exercise completed and dismisses the reminder.
- **Skip** — dismisses the reminder without crediting it as done.
- **Snooze** — dismisses now and re-fires the same exercise after the configured snooze duration.
- **Shuffle** — swaps in a different eligible exercise immediately, without recording it as done or
  skipped.

Where the browser can't show inline notification actions (or notifications were never granted), a
plain notification still names the exercise; clicking it opens/focuses the app to the same
in-balloon actions. If the eligible pool is ever empty (e.g. after narrowing a loadout too far),
the assistant says so instead of firing a reminder — no ding, no notification — and automatically
resumes as soon as a non-empty loadout is active again.

Reminders only fire while at least one tab is open; the app cannot notify once fully closed
(no push server).

## Exercise catalog & tags

A curated set of built-in exercises ships with the app. Users can add their own custom exercises —
name, instructions, a reps-or-time target, an image, and tags.

Every exercise, piece of equipment, and location is described with **tags** from one shared,
user-extendable tag registry. Each tag has an axis — equipment, context (location), type,
intensity, duration, or other — chosen explicitly whenever a new tag is minted (adding an exercise,
tag rule, or context/equipment). Tag names are case/whitespace-normalized, so "Bands" and "bands"
are treated as the same tag.

## Context & equipment

A manual **context selector** (e.g. Office, Home, Outdoors — no GPS) constrains which exercises are
eligible: an exercise tagged for a different context is excluded, while an exercise with no context
tag at all is considered context-agnostic and always allowed. An **equipment checklist** records
what the user owns; any exercise requiring equipment the user doesn't have is excluded.

## Loadouts

A **loadout** is a named, saved filter: which tags an exercise must include (any of), must all
include, or must not include. Users keep a library of loadouts (e.g. "Office", "Home gym",
"Travel"), switch the active one at any time, and the eligible pool updates immediately.

## Export & import

A loadout can be exported to a single self-contained JSON file containing the loadout, every custom
exercise it currently matches, and every tag those exercises or the loadout's rules reference — so
it works standalone on another profile. Importing merges it in without duplicating or clobbering
existing exercises/loadouts/tags; if an incoming tag reuses a local tag name with a different axis,
the user chooses to keep the local tag or import it as a renamed one. Only an explicit export ever
leaves the device.

## Progress tracking

The app tracks full history and shows: a done count, a skipped/ignored count, and the current
day streak (consecutive calendar days with at least one completed exercise). A motivational
"Sitting breaks taken" figure is the same, honestly-labelled done count, citing real research
(Diaz et al., *Annals of Internal Medicine*, 2017); a secondary "≈ N active minutes" line is
clearly marked as a playful estimate, not a cited figure.

## Persistence & multi-tab behavior

All settings, loadouts, custom exercises, tags, and progress history auto-save to local storage and
survive a reload — nothing is ever lost by closing the tab. The app is safe to keep open in
multiple tabs at once: only one tab actively runs the reminder timer at a time, and edits made in
different tabs are reconciled automatically without conflicts.

## Installability

Move ships a web app manifest and service worker, so it can be installed as a standalone app and
continues to work offline once it has been loaded at least once.
