# 🏁 Kart Tournament

A tiny, dependency-free web app for running a Mario Kart tournament for **8–20 players** at a party — built with plain HTML, CSS, and JavaScript. No frameworks, no build step, works from a phone.

## How it works

### Setup
- Pick how many racers with the **"How many racers?"** stepper (8–20), then
  name each one — or add/remove rows individually.
- Pick a character for each racer. Characters and images are fetched from the
  unofficial [Mario Kart Tour API](https://mario-kart-tour-api.herokuapp.com/api/drivers).
  The roster is **cached in `localStorage`**, and if the API is slow or
  unreachable the app falls back to a **built-in set of kart/racer icons**, so
  selection always works — even offline.
- Tweak the number of qualifying rounds (default **4**) and the points scheme
  (default **4 / 3 / 2 / 1** for 1st–4th).

### Qualifying rounds (points-based)
- Racers are split into races of **up to 4** (a remainder forms a smaller 2–3
  player race — never more than 4).
- **Round 1** groups randomly; **later rounds are Swiss-seeded** by current
  points, so racers of similar skill race each other and the field sorts itself.
- Enter each race's finishing order by tapping racers 1st→last; points are
  awarded automatically. A running leaderboard is always a tap away.
- After the set number of rounds, the **top 4 by points** advance.

### Final Four
- The top 4 race head-to-head one last time. **This race decides the official
  1st, 2nd, and 3rd place**, overriding the point standings for the podium.

### Celebration
- The top 3 are celebrated by name and character, each with a distinct message.
- Everyone else is ranked by points, each with an upbeat, tailored note.

## Persistence
All state (racers, points, round, race history, character choices) is
auto-saved to `localStorage` after every action — refresh or close the tab and
progress is kept. Use **Reset** / **Start a new tournament** to clear it.

## Running locally
It's fully static — just open `index.html`, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Tech
Vanilla JS / HTML / CSS only. No dependencies, no build tools.
