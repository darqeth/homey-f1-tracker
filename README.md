# Homey F1 Tracker (Jolpica)
Homey community app for Formula 1 schedule tracking using Jolpica Ergast-compatible API.

## Quick start
- `npm install`
- `homey app validate`
- `homey app run`

## API
Uses `https://api.jolpi.ca/ergast/f1/{season}/races.json` where season can be `current` or a year.

## Flow cards
Triggers for session start countdowns and “starts now”, conditions like “race today”, and actions like “force refresh”.

## Dashboards
This app syncs Homey Logic variables (per round + next session). Add them as *Logic* tiles in Homey Dashboards.
