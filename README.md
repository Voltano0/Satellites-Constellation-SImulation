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

## Sampling Interval

The sampling interval is configurable from 5 s to 300 s. The default of **20 s** is a good compromise for a collection over one **orbital period** (~90 min):

| Criterion | Analysis |
|---|---|
| Angular displacement | ~1.5° per sample at 550 km — captures the inter-plane ISL distance variation (~30% amplitude over one orbit) |
| Sample count | ~285 samples/link per orbit → sufficient fidelity, manageable file size |
| GS handover | Handover events typically last 30–120 s; 20 s captures them unambiguously |

For a **terrestrial period (24h)** collection, 20 s produces ~4,320 samples per link, which can result in very large files. Using **60 s** (1,440 samples/link) or **120 s** (720 samples/link) is recommended depending on the required precision.

## Minimum Satellites per Orbital Plane (ISL)

For ISL links between adjacent satellites in the same plane to not pass through the Earth, the distance from the Earth's center to the chord must be at least equal to Earth's radius:

```
r · cos(π/n) ≥ R_Earth
⟹  n_min = ⌈ π / arccos(R_Earth / (R_Earth + h)) ⌉
```

where `r = R_Earth + h` is the orbital radius and `n` is the number of satellites in the plane.

The simulation also enforces a maximum ISL distance of **5,000 km** (`MAX_ISL_DISTANCE` in `constants.js`). At higher altitudes this becomes the binding constraint, since the wider orbit produces longer chords between adjacent satellites.

| Altitude | n_min (Earth occlusion) | n_min (chord ≤ 5,000 km) | **Effective n_min** | Resulting chord |
|---|---|---|---|---|
| 300 km  | 11 | 9  | **11** | 3,759 km |
| 400 km  | 10 | 9  | **10** | 4,185 km |
| 550 km  | 8  | 9  | **9**  | 4,734 km |
| 600 km  | 8  | 9  | **9**  | 4,768 km |
| 800 km  | 7  | 9  | **9**  | 4,905 km |
| 1,000 km | 6 | 10 | **10** | 4,556 km |
| 1,200 km | 6 | 10 | **10** | 4,679 km |
| 2,000 km | 5 | 11 | **11** | 4,717 km |

Below ~500 km the geometric (occlusion) constraint is dominant. Above that, the 5,000 km ISL distance limit sets the minimum. In practice, adding 1–2 satellites per plane beyond the minimum provides a safety margin against orbital perturbations.

