import { PLANE_COLORS } from '../utils/constants.js';
import { getSatellites } from './constellation.js';

let satelliteGrid = [];

// Distance angulaire entre deux RAAN
function calculateOrbitDistance(raan1, raan2) {
    const diff = Math.abs(raan1 - raan2);
    return Math.min(diff, 360 - diff);
}

// Ordonner les plans orbitaux par plus proche voisin pour minimiser les sauts entre colonnes
function orderOrbitsOptimally(numPlanes) {
    const raanValues = [];
    for (let p = 0; p < numPlanes; p++) {
        raanValues.push({ planeIndex: p, raan: (p * 360) / numPlanes });
    }

    if (numPlanes <= 1) return raanValues;

    const ordered = [raanValues[0]];
    const remaining = raanValues.slice(1);

    while (remaining.length > 0) {
        const last = ordered[ordered.length - 1];
        let minDist = Infinity;
        let minIndex = 0;

        for (let i = 0; i < remaining.length; i++) {
            const dist = calculateOrbitDistance(last.raan, remaining[i].raan);
            if (dist < minDist) { minDist = dist; minIndex = i; }
        }

        ordered.push(remaining[minIndex]);
        remaining.splice(minIndex, 1);
    }

    return ordered;
}

// Construire et afficher la grille des satellites
export function updateSatelliteGrid(params, highlightSatelliteCallback) {
    if (!params.showGrid) {
        document.getElementById('grid-view').style.display = 'none';
        return;
    }

    document.getElementById('grid-view').style.display = 'block';

    const { numPlanes, numSats } = params;
    const satsPerPlane = Math.floor(numSats / numPlanes);
    const extraSats = numSats % numPlanes;
    const maxSatsPerPlane = satsPerPlane + (extraSats > 0 ? 1 : 0);

    const orderedOrbits = orderOrbitsOptimally(numPlanes);

    const satsInPlane = [];
    let satIndexOffset = 0;
    for (let p = 0; p < numPlanes; p++) {
        const satsInThisPlane = satsPerPlane + (p < extraSats ? 1 : 0);
        satsInPlane[p] = { count: satsInThisPlane, startIndex: satIndexOffset };
        satIndexOffset += satsInThisPlane;
    }

    satelliteGrid = [];
    for (let row = 0; row < maxSatsPerPlane; row++) {
        const gridRow = [];
        for (let col = 0; col < numPlanes; col++) {
            const planeIndex = orderedOrbits[col].planeIndex;
            const planeInfo = satsInPlane[planeIndex];

            if (row < planeInfo.count) {
                gridRow.push({
                    satelliteIndex: planeInfo.startIndex + row,
                    planeIndex,
                    color: PLANE_COLORS[planeIndex % PLANE_COLORS.length],
                    isEmpty: false
                });
            } else {
                gridRow.push({ satelliteIndex: -1, planeIndex, color: 0x333333, isEmpty: true });
            }
        }
        satelliteGrid.push(gridRow);
    }

    const gridContainer = document.getElementById('grid-container');
    gridContainer.innerHTML = '';
    gridContainer.style.gridTemplateColumns = `repeat(${numPlanes}, 30px)`;

    for (let row = 0; row < maxSatsPerPlane; row++) {
        for (let col = 0; col < numPlanes; col++) {
            const cell = satelliteGrid[row][col];
            const cellDiv = document.createElement('div');
            cellDiv.className = 'grid-cell' + (cell.isEmpty ? ' empty' : '');
            cellDiv.style.backgroundColor = '#' + cell.color.toString(16).padStart(6, '0');

            if (!cell.isEmpty) {
                cellDiv.textContent = cell.satelliteIndex;
                cellDiv.title = `Satellite ${cell.satelliteIndex}\nPlan orbital ${cell.planeIndex}\nPosition dans plan: ${row}`;
                cellDiv.addEventListener('click', () => highlightSatelliteCallback(cell.satelliteIndex));
            }

            gridContainer.appendChild(cellDiv);
        }
    }

    const legend = document.getElementById('grid-legend');
    legend.innerHTML = '<div style="margin-bottom: 8px;"><strong>Plans orbitaux:</strong></div>';

    for (let col = 0; col < numPlanes; col++) {
        const planeIndex = orderedOrbits[col].planeIndex;
        const color = PLANE_COLORS[planeIndex % PLANE_COLORS.length];
        const raan = orderedOrbits[col].raan.toFixed(1);
        const satCount = satsInPlane[planeIndex].count;

        const legendItem = document.createElement('div');
        legendItem.className = 'legend-item';
        legendItem.innerHTML = `
            <div class="legend-color" style="background-color: #${color.toString(16).padStart(6, '0')}"></div>
            <span>Col ${col}: Plan ${planeIndex} (${satCount} sats, RAAN: ${raan}°)</span>
        `;
        legend.appendChild(legendItem);
    }

    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = 'margin-top:10px; font-size:10px; color:#888';
    infoDiv.textContent = `Grille: ${maxSatsPerPlane} lignes × ${numPlanes} colonnes`;
    legend.appendChild(infoDiv);
}

// Mettre en surbrillance un satellite dans la vue 3D
export function highlightSatellite(satIndex, onSelect) {
    const satellites = getSatellites();
    if (satIndex >= satellites.length) return;

    satellites.forEach(sat => {
        sat.material.emissiveIntensity = 0.3;
        sat.scale.set(1, 1, 1);
    });

    satellites[satIndex].material.emissiveIntensity = 1.0;
    satellites[satIndex].scale.set(2, 2, 2);

    if (onSelect) onSelect(satIndex);
}
