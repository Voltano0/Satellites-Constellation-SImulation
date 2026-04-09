# LEO Constellation Simulation

Interactive 3D simulation of a Walker Delta LEO satellite constellation. Computes orbital mechanics, detects inter-satellite links (ISL) via line-of-sight, manages ground station contacts, and exports the topology/latency timeseries as JSON for use by the emulation pipeline.

## Structure

```
simulation/
├── index.html              # Entry point — open this in a browser
├── package.json            # npm config (type: module + three.js) — only needed for verify_simulation.js
├── package-lock.json       # Lockfile for npm install
├── verify_simulation.js    # Test suite for orbital mechanics (run with Node.js)
├── js/                     # ES modules
│   ├── main.js             # Scene initialization, animation loop, event wiring
│   ├── constellation.js    # Orbital mechanics, satellite positions, ISL detection
│   ├── earth.js            # 3D Earth model and rotation
│   ├── groundStations.js   # GS placement, tracking, dynamic links
│   ├── grid.js             # 2D satellite grid visualization
│   ├── ui.js               # Info panels and settings UI
│   └── import.js           # File import handlers (JSON constellation, CSV stations)
├── Metrics/                # Data collection and export
│   ├── metricsCollector.js # Orchestrates ISL/GS contact sampling
│   ├── contactMetrics.js   # Per-contact visibility and latency
│   ├── islMetrics.js       # ISL latency timeseries
│   ├── gsMetrics.js        # GS event timeseries (connect/handover/disconnect)
│   └── exporters.js        # Export to JSON/CSV/Mininet formats
├── utils/
│   ├── constants.js        # Global constants (physics, scale, colors)
│   ├── orbital-math.js     # Orbital period, angular/orbital velocity
│   └── raytracing.js       # Line-of-sight checks, distance calculations
└── constellations_presets/ # Constellation parameter presets
```

## Running in the Browser

```bash
python3 -m http.server 8080
# then open http://localhost:8080

```
## Verifying the Simulation (Node.js tests)

`verify_simulation.js` is a standalone test suite.
Node.js is required (v20+) because it needs to resolve ES module imports locally (the browser uses CDN; Node.js does not).

```bash
# Install three.js locally (one-time)
npm install

# Run the tests
node verify_simulation.js
```

The output shows pass/fail counts per block. On failure, the expected vs. actual values and tolerance are printed.

> `package.json` and `package-lock.json` exist solely for this — they declare `"type": "module"` (so Node treats `.js` files as ES modules) and the `three` dependency. They are **not** needed to run the browser simulation.

## Notes

1. Set constellation parameters (altitude, inclination, number of satellites/planes) in the UI.
2. Place ground stations on the globe (or import a CSV).
3. Click **"Collect Data"** — the simulation samples contacts over several orbital periods.
4. Click **"Download Mininet JSON"** to export the file (`mininet_isl_gs_timeseries_*.json`).

This JSON file is the input to the emulation pipeline.

## Output JSON Format

The exported file contains:
- `metadata` — constellation parameters, sampling interval, number of orbital periods
- `topology` — satellite list, ground station list
- `islLinks` — each ISL with a `timeSeries` of latency samples (ms) at fixed intervals
- `gsLinks` — per-GS events (`connect`, `handover`, `disconnect`) with latency timelines
