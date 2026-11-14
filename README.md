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

- a Charter Review campaign: pass North Quay, then Rivergate, or lose the charter if either review fails
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

## How to finish

From the title screen, choose **Charter Review**. The goal is stated there and again in the opening banner: pass North Quay, then Rivergate. A district is won by meeting every target on its final review milestone. The milestone bar follows the weakest target, so it fills only when residents, happiness, treasury, services, and traffic are all met. A district is lost if the treasury stays negative, if happiness collapses, or if a developed district stops short of the current milestone and does not recover before the recovery review closes. While that review is open, the milestone panel counts down the days left. Meeting the targets still passes the milestone. If the shortfall is population, new housing restarts the window and a real climb in residents stands it down. After North Quay passes, choose **Next district**. Winning Rivergate wins the charter. Losing either chapter fails the charter. **Retry chapter** restarts the current district. A chapter 2 retry keeps the carried grant, 20% of the treasury from the district that was just passed. A chapter 1 retry returns to that scenario's starting treasury. **New charter** starts the campaign again. **Back to title** leaves the run.

Single districts are still available from **New City** or **Scenarios**. Those end on that district alone.
