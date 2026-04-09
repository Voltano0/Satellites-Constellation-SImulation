import * as THREE from 'three';
import { EARTH_RADIUS, SCALE, PLANE_COLORS, LINK_COLORS } from '../utils/constants.js';
import { checkLineOfSight } from '../utils/raytracing.js';
import { calculateAngularVelocity, calculateOrbitalVelocity, calculateOrbitalPeriod } from '../utils/orbital-math.js';

let satellites = [];
let orbits = [];
let links = [];
let neighborLinks = [];
let currentOrbitalPeriod = 0;

// Supprimer des objets Three.js de la scène
export function clearSceneObjects(scene, objects) {
    objects.forEach(obj => scene.remove(obj));
    objects.length = 0;
}

export { calculateAngularVelocity, calculateOrbitalVelocity, calculateOrbitalPeriod };

// Calculer la position 3D d'un satellite depuis ses paramètres orbitaux
export function getSatellitePosition(altitude, inclination, raan, trueAnomaly) {
    const radius = (EARTH_RADIUS + altitude) * SCALE;
    const incRad = inclination * Math.PI / 180;
    const raanRad = raan * Math.PI / 180;
    const taRad = trueAnomaly * Math.PI / 180;

    const x_orbital = radius * Math.cos(taRad);
    const z_orbital = radius * Math.sin(taRad);

    const x = x_orbital * Math.cos(raanRad) - z_orbital * Math.cos(incRad) * Math.sin(raanRad);
    const y = z_orbital * Math.sin(incRad);
    const z = x_orbital * Math.sin(raanRad) + z_orbital * Math.cos(incRad) * Math.cos(raanRad);

    return new THREE.Vector3(x, y, z);
}

// Créer une orbite elliptique visible
function createOrbit(altitude, inclination, raan, color = 0x444444) {
    const points = [];
    const numPoints = 128;

    for (let i = 0; i <= numPoints; i++) {
        const trueAnomaly = (i / numPoints) * 360;
        points.push(getSatellitePosition(altitude, inclination, raan, trueAnomaly));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 });

    return new THREE.Line(geometry, material);
}

// Générer une constellation Walker Delta
export function createConstellation(scene, params) {
    clearSceneObjects(scene, satellites);
    clearSceneObjects(scene, orbits);
    clearSceneObjects(scene, links);

    const { altitude, inclination, numSats, numPlanes, phase, satelliteSize } = params;
    const satsPerPlane = Math.floor(numSats / numPlanes);
    const extraSats = numSats % numPlanes;

    const angularVelocity = calculateAngularVelocity(altitude);
    const orbitalVelocity = calculateOrbitalVelocity(altitude);
    const orbitalPeriod = calculateOrbitalPeriod(altitude);
    currentOrbitalPeriod = orbitalPeriod;

    document.getElementById('notation').textContent = `${numSats}/${numPlanes}/${phase}`;
    document.getElementById('satsPerPlane').textContent = `${satsPerPlane}${extraSats > 0 ? '-' + (satsPerPlane + 1) : ''}`;
    document.getElementById('orbitalRadius').textContent = (EARTH_RADIUS + altitude).toFixed(0);
    document.getElementById('orbitalVelocity').textContent = orbitalVelocity.toFixed(2);
    document.getElementById('orbitalPeriod').textContent = orbitalPeriod.toFixed(1);

    for (let p = 0; p < numPlanes; p++) {
        const raan = (p * 360) / numPlanes;
        const satsInThisPlane = satsPerPlane + (p < extraSats ? 1 : 0);
        const planeColor = PLANE_COLORS[p % PLANE_COLORS.length];

        if (params.showOrbits) {
            const orbit = createOrbit(altitude, inclination, raan, planeColor);
            scene.add(orbit);
            orbits.push(orbit);
        }

        for (let s = 0; s < satsInThisPlane; s++) {
            const trueAnomaly = (s * 360) / satsInThisPlane + (p * phase * 360) / numSats;

            const satGeometry = new THREE.SphereGeometry(satelliteSize || 0.3, 16, 16);
            const satMaterial = new THREE.MeshPhongMaterial({
                color: planeColor,
                emissive: planeColor,
                emissiveIntensity: 0.3,
                shininess: 100
            });
            const satellite = new THREE.Mesh(satGeometry, satMaterial);

            satellite.userData = {
                altitude,
                inclination,
                raan,
                trueAnomaly,
                angularVelocity,
                index: satellites.length
            };

            satellite.position.copy(getSatellitePosition(altitude, inclination, raan, trueAnomaly));
            scene.add(satellite);
            satellites.push(satellite);
        }
    }

    if (params.showLinks) createISL(scene, params);

    return satellites;
}

// Créer les liens Inter-Satellite (ISL)
export function createISL(scene, params) {
    clearSceneObjects(scene, links);

    const { numPlanes, numSats, phase } = params;
    const satsPerPlane = Math.floor(numSats / numPlanes);
    const extraSats = numSats % numPlanes;

    const planeInfo = [];
    let satIndexOffset = 0;
    for (let p = 0; p < numPlanes; p++) {
        const satsInThisPlane = satsPerPlane + (p < extraSats ? 1 : 0);
        planeInfo.push({ startIndex: satIndexOffset, count: satsInThisPlane });
        satIndexOffset += satsInThisPlane;
    }

    for (let p = 0; p < numPlanes; p++) {
        const currentPlane = planeInfo[p];
        for (let s = 0; s < currentPlane.count; s++) {
            const satIndex = currentPlane.startIndex + s;
            const nextSatIndex = currentPlane.startIndex + ((s + 1) % currentPlane.count);
            const link = createLink(satellites[satIndex], satellites[nextSatIndex], LINK_COLORS.ISL_INTRA_PLANE);
            scene.add(link);
            links.push(link);
        }
    }

    const phaseOffset = Math.round(phase);
    for (let p = 0; p < numPlanes; p++) {
        const currentPlane = planeInfo[p];
        const nextPlane = planeInfo[(p + 1) % numPlanes];
        for (let s = 0; s < currentPlane.count; s++) {
            const satIndex = currentPlane.startIndex + s;
            const adjacentSatIndexInPlane = (s - phaseOffset + nextPlane.count) % nextPlane.count;
            const adjacentSatIndex = nextPlane.startIndex + adjacentSatIndexInPlane;
            const link = createLink(satellites[satIndex], satellites[adjacentSatIndex], LINK_COLORS.ISL_INTER_PLANE);
            scene.add(link);
            links.push(link);
        }
    }
}

// Créer un lien visuel entre deux satellites
function createLink(sat1, sat2, color) {
    const points = [sat1.position, sat2.position];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 });
    const link = new THREE.Line(geometry, material);
    link.userData = { sat1, sat2 };
    return link;
}

// Créer les liens voisins basés sur la visibilité instantanée
export function createNeighborLinks(scene) {
    clearSceneObjects(scene, neighborLinks);
    for (let i = 0; i < satellites.length; i++) {
        for (let j = i + 1; j < satellites.length; j++) {
            if (checkLineOfSight(satellites[i], satellites[j])) {
                const link = createLink(satellites[i], satellites[j], LINK_COLORS.NEIGHBOR);
                scene.add(link);
                neighborLinks.push(link);
            }
        }
    }
}

// Recalculer les liens voisins à chaque frame
export function updateNeighborLinks(scene) {
    clearSceneObjects(scene, neighborLinks);
    for (let i = 0; i < satellites.length; i++) {
        for (let j = i + 1; j < satellites.length; j++) {
            if (checkLineOfSight(satellites[i], satellites[j])) {
                const link = createLink(satellites[i], satellites[j], LINK_COLORS.NEIGHBOR);
                scene.add(link);
                neighborLinks.push(link);
            }
        }
    }
}

// Mettre à jour les positions des satellites et des liens ISL
export function updateSatellites(deltaTime, speedFactor) {
    const acceleratedDeltaTime = deltaTime * speedFactor;

    satellites.forEach(satellite => {
        const { altitude, inclination, raan, angularVelocity } = satellite.userData;
        const angularVelocityDegPerSec = angularVelocity * (180 / Math.PI);
        satellite.userData.trueAnomaly += angularVelocityDegPerSec * acceleratedDeltaTime;

        if (satellite.userData.trueAnomaly > 360) satellite.userData.trueAnomaly -= 360;

        satellite.position.copy(getSatellitePosition(altitude, inclination, raan, satellite.userData.trueAnomaly));
    });

    links.forEach(link => {
        const { sat1, sat2 } = link.userData;
        const positions = link.geometry.attributes.position.array;
        positions[0] = sat1.position.x; positions[1] = sat1.position.y; positions[2] = sat1.position.z;
        positions[3] = sat2.position.x; positions[4] = sat2.position.y; positions[5] = sat2.position.z;
        link.geometry.attributes.position.needsUpdate = true;
    });
}

export function getSatellites() { return satellites; }
export function getOrbits() { return orbits; }
export function getLinks() { return links; }
export function getNeighborLinks() { return neighborLinks; }
export function getOrbitalPeriod() { return currentOrbitalPeriod; }
