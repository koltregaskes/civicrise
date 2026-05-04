# Civicrise

Modern city-building game project for Elusion Works.

This repo now contains the browser-first Civicrise prototype with the completed Phase 1 review slice plus multiple substantial Phase 2 systems tranches: multiple scenarios, milestone-unlocked planning layers, transit, district policies, dynamic civic crises, stronger progression, and deeper district tuning.

## Stack

- `Vite`
- `React`
- `TypeScript`
- `Canvas`

## Current scope

The current playable build includes:

- two handcrafted isometric district scenarios
- roads, residential, commercial, industrial, park, utility, and bulldoze tools
- milestone-unlocked transit stops
- milestone-unlocked district policies
- dynamic district crises tied to weak coverage and overloaded growth
- visible car traffic on connected roads
- money, happiness, service pressure, transit coverage, and milestone progression
- title screen, scenario picker, options, help, and local save/continue
- guided tutorial objectives for both the pilot and the larger Rivergate scenario

## Scripts

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run review:pack`
- `powershell -ExecutionPolicy Bypass -File ..\prepare-civicrise-local.ps1`

The production build outputs to `out/` so it works with the local workspace launcher flow.

## Review route

The normalized fast-entry browser review route is:

- `http://127.0.0.1:3000/?autostart=1&review=1`

Supported query params:

- `autostart=1`: boot straight into gameplay instead of the title screen
- `review=1`: load a deterministic paused review slice and skip save/load persistence
- `scenario=<id>`: optional scenario override such as `rivergate` or `north-quay`

The default review slice is a curated paused Rivergate city so reviewers land in a stable mid-game state without manual setup. Review mode intentionally ignores local save data so capture and verification runs do not overwrite an in-progress player district.

To refresh the shared evidence pack and contract files in `W:\Repos\_My Games\LOCAL-ONLY\captures\civicrise`, run:

- `npm run review:pack`

## Scenario notes

- `North Quay Pilot District`: compact first-review slice that proves the core city-builder loop
- `Rivergate Expansion`: larger Phase 2 map with longer progression, transit, and policy management
