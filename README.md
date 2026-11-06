# F1 Tracker Pro

A Homey app that tracks the Formula 1 season and lets you build automations around every session — free practice, qualifying, sprint and race.

Made by Mark — [byhim.nl](https://www.byhim.nl)

---

## Features

### Flow triggers
Set up Advanced Flows that fire before any session type:
- **Starts in X minutes/hours** — for FP1, FP2, FP3, Qualifying, Sprint Qualifying, Sprint, Race and "next session"
- **Starts now** — fires at the moment a session begins (60-second grace window)
- **Race finished** — fires 2+ hours after race start once the winner is confirmed; includes `winner_name` and `winner_constructor` tokens

### Flow conditions
- Race today / sprint weekend / race this week
- Session within X time / any session today

### Flow actions
- Get next session / next race details (includes countdown string, circuit, country, city)
- Get driver standings top 2
- Get constructor standings top 2
- Get championship prediction (favourite, title chance, projected points)
- Force refresh API cache

### Dashboard widgets
| Widget | Description |
|---|---|
| F1 Countdown | Flip-clock countdown to the next race with race name and date |
| F1 Calendar | Full season schedule with sprint badges, past/upcoming styling and podium results |
| F1 Rijders / Drivers | Driver championship standings |
| F1 Constructeurs / Constructors | Constructor championship standings |
| F1 Rijders Podium | Visual podium — top 3 drivers |
| F1 Constructeurs Podium | Visual podium — top 3 constructors |
| F1 Title Odds Top 3 | Podium with the three most likely champions |
| F1 Championship Predictor | Title odds and projected points from 10,000 season simulations (drivers or constructors) |

### Upcoming Race device
Add the *Upcoming Race* device to expose the next GP name, circuit, location, round, weekend dates, every session start time, next session and countdown as device capabilities, for Dashboard Studio and other device-based dashboards.

### Logic variables (dashboard tiles)
Automatically synced on every refresh:
- `F1 Next Session Type`, `F1 Next GP Name`, `F1 Next Session Start (Local)`, `F1 Seconds Until Next Session`
- Per round: `F1 R{n} GP Name`, `Country`, `City`, `Circuit`, `FP1`, `FP2 or Sprint Qualifying`, `FP3 or Sprint`, `Qualifying`, `Race`, `Winner`

---

## App settings

| Setting | Default | Description |
|---|---|---|
| Season | current | Current or previous season |
| Cache duration | 6h | How long the race schedule is cached |
| Poll interval | 30s | How often flows are checked |
| Fast poll window | 10min | Switches to 5s polling when a session is near |

---

## Development

```bash
npm install
homey app validate
homey app run       # live on connected Homey with logging
homey app install   # install on connected Homey
```

Race data provided by [Jolpica](https://jolpi.ca/) (Ergast-compatible API).
