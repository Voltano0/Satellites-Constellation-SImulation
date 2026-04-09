import * as THREE from 'three';
import { EARTH_RADIUS, SCALE, EARTH_ROTATION_RATE, GROUND_STATION_SCOPE_ALTITUDE, GROUND_STATION_CONE_ANGLE, LINK_COLORS } from '../utils/constants.js';
import { checkLineOfSight } from '../utils/raytracing.js';
import { clearSceneObjects } from './constellation.js';

let groundStations = [];
let groundStationMeshes = [];
let groundScopeCones = [];
let groundSatelliteLinks = [];
let earthRotationAngle = 0;
let stationTrackingState = {};

// Convertir des coordonnées géographiques en position 3D (avec rotation terrestre)
function latLonToCartesian(lat, lon, altitude = 0, rotationOffset = 0) {
    const radius = (EARTH_RADIUS + altitude) * SCALE;
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180 + rotationOffset;

    return new THREE.Vector3(
        -radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
    );
}

// Convertir une position 3D en coordonnées géographiques
export function cartesianToLatLon(x, y, z) {
    const posX = x / SCALE;
    const posY = y / SCALE;
    const posZ = z / SCALE;

    const radius = Math.sqrt(posX * posX + posY * posY + posZ * posZ);
    const lat = 90 - (Math.acos(posY / radius) * 180 / Math.PI);

    let lon = Math.atan2(posZ, -posX) * 180 / Math.PI - 180;
    if (lon < -180) lon += 360;
    if (lon > 180) lon -= 360;

    return { lat, lon };
}

// Ajouter une station au sol via le formulaire
export function addGroundStation(scene) {
    const name = document.getElementById('station-name').value.trim();
    const lat = parseFloat(document.getElementById('station-lat').value);
    const lon = parseFloat(document.getElementById('station-lon').value);

    if (!name) { alert('Veuillez entrer un nom pour la station'); return; }
    if (isNaN(lat) || lat < -90 || lat > 90) { alert('Latitude invalide (doit être entre -90 et 90)'); return; }
    if (isNaN(lon) || lon < -180 || lon > 180) { alert('Longitude invalide (doit être entre -180 et 180)'); return; }

    const station = { id: groundStations.length, name, lat, lon };
    groundStations.push(station);
    createGroundStationMesh(scene, station);
    updateGroundStationList();

    document.getElementById('station-name').value = '';
    document.getElementById('station-lat').value = '';
    document.getElementById('station-lon').value = '';
}

// Ajouter une station au sol sans formulaire (import)
export function addGroundStationDirect(scene, name, lat, lon) {
    if (!name || typeof name !== 'string') { console.error('Nom de station invalide:', name); return false; }
    if (isNaN(lat) || lat < -90 || lat > 90) { console.error('Latitude invalide:', lat); return false; }
    if (isNaN(lon) || lon < -180 || lon > 180) { console.error('Longitude invalide:', lon); return false; }

    const station = { id: groundStations.length, name: name.trim(), lat: parseFloat(lat), lon: parseFloat(lon) };
    groundStations.push(station);
    createGroundStationMesh(scene, station);
    return true;
}

// Créer le mesh 3D d'une station au sol
function createGroundStationMesh(scene, station) {
    const position = latLonToCartesian(station.lat, station.lon, 0, earthRotationAngle);

    const geometry = new THREE.ConeGeometry(0.4, 0.8, 8);
    const material = new THREE.MeshPhongMaterial({
        color: 0xff6600, emissive: 0xff6600, emissiveIntensity: 0.5, shininess: 100
    });
    const cone = new THREE.Mesh(geometry, material);
    cone.position.copy(position);
    cone.lookAt(0, 0, 0);
    cone.rotateX(Math.PI / 2);

    const stationGroup = new THREE.Group();
    stationGroup.add(cone);
    stationGroup.userData = { stationId: station.id, lat: station.lat, lon: station.lon };

    scene.add(stationGroup);
    groundStationMeshes.push(stationGroup);

    createScopeCone(scene, station);
}

// Créer le cône de visibilité d'une station
function createScopeCone(scene, station) {
    const position = latLonToCartesian(station.lat, station.lon, 0, earthRotationAngle);

    const coneHeight = GROUND_STATION_SCOPE_ALTITUDE * SCALE;
    const halfAngle = GROUND_STATION_CONE_ANGLE * Math.PI / 180;
    const coneRadius = Math.tan(halfAngle) * coneHeight;

    const geometry = new THREE.ConeGeometry(coneRadius, coneHeight, 32, 1, true);
    const material = new THREE.MeshBasicMaterial({
        color: 0x00ff00, transparent: true, opacity: 0.2,
        side: THREE.DoubleSide, wireframe: false, depthWrite: false
    });

    const cone = new THREE.Mesh(geometry, material);
    const direction = position.clone().normalize();
    cone.position.copy(position).add(direction.clone().multiplyScalar(coneHeight / 2));
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction);
    cone.visible = false;
    cone.userData = { stationId: station.id };

    scene.add(cone);
    groundScopeCones.push(cone);
}

// Mettre à jour les positions des stations au sol (rotation terrestre)
export function updateGroundStations(deltaTime, speedFactor) {
    earthRotationAngle += EARTH_ROTATION_RATE * deltaTime * speedFactor;

    groundStationMeshes.forEach(mesh => {
        const newPosition = latLonToCartesian(mesh.userData.lat, mesh.userData.lon, 0, earthRotationAngle);
        const cone = mesh.children[0];
        cone.position.copy(newPosition);
        cone.lookAt(0, 0, 0);
        cone.rotateX(Math.PI / 2);
    });
}

// Afficher ou masquer les cônes de visibilité
export function toggleGroundScope(visible) {
    groundScopeCones.forEach(cone => cone.visible = visible);
}

// Créer un lien visuel entre une station et un satellite
function createGroundSatelliteLink(stationPosition, satellitePosition) {
    const geometry = new THREE.BufferGeometry().setFromPoints([stationPosition, satellitePosition]);
    const material = new THREE.LineBasicMaterial({ color: LINK_COLORS.GROUND_SATELLITE, transparent: true, opacity: 0.6 });
    return new THREE.Line(geometry, material);
}

// Calculer l'angle d'élévation entre une station et un satellite
function calculateElevation(stationPosition, satellitePosition) {
    const toSatellite = satellitePosition.clone().sub(stationPosition);
    const stationToCenter = stationPosition.clone().normalize().multiplyScalar(-1);
    const cosAngle = toSatellite.normalize().dot(stationToCenter);
    return Math.acos(cosAngle) * 180 / Math.PI - 90;
}

// Trouver le satellite avec la meilleure élévation pour une station
function findBestSatellite(stationPosition, satellites, minElevation = 25) {
    let bestSatellite = null;
    let bestElevation = minElevation;

    const stationObj = { position: stationPosition.clone() };

    satellites.forEach((satellite, index) => {
        if (checkLineOfSight(stationObj, satellite)) {
            const elevation = calculateElevation(stationPosition, satellite.position);
            if (elevation > bestElevation) { bestElevation = elevation; bestSatellite = index; }
        }
    });

    return { satelliteIndex: bestSatellite, elevation: bestElevation };
}

// Mettre à jour les liens dynamiques entre stations et satellites (avec handover)
export function updateGroundSatelliteLinks(scene, satellites, currentTime = 0) {
    clearSceneObjects(scene, groundSatelliteLinks);

    const MIN_ELEVATION = 10;
    const HANDOVER_HYSTERESIS = 15;
    const MIN_HANDOVER_INTERVAL = 10;

    groundStationMeshes.forEach(stationMesh => {
        const stationId = stationMesh.userData.stationId;
        const stationPosition = stationMesh.children[0].position;

        if (!stationTrackingState[stationId]) {
            stationTrackingState[stationId] = { trackedSatelliteIndex: null, lastHandoverTime: -MIN_HANDOVER_INTERVAL };
        }

        const trackingState = stationTrackingState[stationId];
        const trackedIndex = trackingState.trackedSatelliteIndex;
        const stationObj = { position: stationPosition.clone() };

        let currentSatValid = false;
        let currentElevation = 0;

        if (trackedIndex !== null && satellites[trackedIndex]) {
            if (checkLineOfSight(stationObj, satellites[trackedIndex])) {
                currentElevation = calculateElevation(stationPosition, satellites[trackedIndex].position);
                currentSatValid = currentElevation >= MIN_ELEVATION;
            }
        }

        const best = findBestSatellite(stationPosition, satellites, MIN_ELEVATION);
        let targetSatellite = trackedIndex;
        const timeSinceLastHandover = currentTime - trackingState.lastHandoverTime;

        if (!currentSatValid || trackedIndex === null) {
            targetSatellite = best.satelliteIndex;
            if (best.satelliteIndex !== null && best.satelliteIndex !== trackedIndex) {
                trackingState.lastHandoverTime = currentTime;
                console.log(`Station ${stationId}: Handover to sat${best.satelliteIndex} (elev: ${best.elevation.toFixed(1)}°)`);
            }
        } else if (best.satelliteIndex !== null && best.satelliteIndex !== trackedIndex) {
            if (best.elevation - currentElevation > HANDOVER_HYSTERESIS && timeSinceLastHandover >= MIN_HANDOVER_INTERVAL) {
                targetSatellite = best.satelliteIndex;
                trackingState.lastHandoverTime = currentTime;
                console.log(`Station ${stationId}: Handover sat${trackedIndex}→sat${best.satelliteIndex} (${currentElevation.toFixed(1)}°→${best.elevation.toFixed(1)}°)`);
            }
        }

        trackingState.trackedSatelliteIndex = targetSatellite;

        if (targetSatellite !== null && satellites[targetSatellite]) {
            const link = createGroundSatelliteLink(stationPosition, satellites[targetSatellite].position);
            link.userData = { stationId, satelliteIndex: targetSatellite };
            scene.add(link);
            groundSatelliteLinks.push(link);

            updateScopeOrientation(stationId, stationPosition, satellites[targetSatellite].position);
        }
    });
}

// Orienter le cône de visibilité vers le satellite tracké
function updateScopeOrientation(stationId, stationPosition, satellitePosition) {
    const scopeCone = groundScopeCones.find(cone => cone.userData.stationId === stationId);
    if (!scopeCone) return;

    const toSatellite = satellitePosition.clone().sub(stationPosition).normalize();
    const coneHeight = GROUND_STATION_SCOPE_ALTITUDE * SCALE;
    scopeCone.position.copy(stationPosition).add(toSatellite.clone().multiplyScalar(coneHeight / 2));
    scopeCone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), toSatellite);
}

// Supprimer tous les liens ground-satellite de la scène
export function clearGroundSatelliteLinks(scene) {
    clearSceneObjects(scene, groundSatelliteLinks);
}

// Supprimer une station au sol
export function removeGroundStation(scene, stationId) {
    const index = groundStations.findIndex(s => s.id === stationId);
    if (index === -1) return;

    const meshIndex = groundStationMeshes.findIndex(m => m.userData.stationId === stationId);
    if (meshIndex !== -1) { scene.remove(groundStationMeshes[meshIndex]); groundStationMeshes.splice(meshIndex, 1); }

    const coneIndex = groundScopeCones.findIndex(c => c.userData.stationId === stationId);
    if (coneIndex !== -1) { scene.remove(groundScopeCones[coneIndex]); groundScopeCones.splice(coneIndex, 1); }

    groundStations.splice(index, 1);
    updateGroundStationList();
}

// Mettre à jour la liste des stations dans l'UI
export function updateGroundStationList() {
    const listContainer = document.getElementById('station-list');
    listContainer.innerHTML = '';

    if (groundStations.length === 0) {
        listContainer.innerHTML = '<div style="color: #888; font-size: 11px; padding: 10px;">Aucune station</div>';
        return;
    }

    groundStations.forEach(station => {
        const trackingState = stationTrackingState[station.id];
        const trackedSat = trackingState?.trackedSatelliteIndex;
        const trackingInfo = trackedSat !== null && trackedSat !== undefined
            ? `<span style="color: #00ff00; font-size: 10px;">📡 Tracking sat${trackedSat}</span>`
            : '<span style="color: #888; font-size: 10px;">⏸ No satellite</span>';

        const item = document.createElement('div');
        item.className = 'station-item';
        item.innerHTML = `
            <div>
                <strong>${station.name}</strong><br>
                <span style="color: #888;">${station.lat.toFixed(2)}°, ${station.lon.toFixed(2)}°</span><br>
                ${trackingInfo}
            </div>
            <button class="delete-btn" onclick="removeGroundStation(${station.id})">×</button>
        `;
        listContainer.appendChild(item);
    });
}

// Calculer la distance entre une station et un satellite en km
export function calculateGSToSatelliteDistance(stationPosition, satellitePosition) {
    const dx = (stationPosition.x - satellitePosition.x) / SCALE;
    const dy = (stationPosition.y - satellitePosition.y) / SCALE;
    const dz = (stationPosition.z - satellitePosition.z) / SCALE;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function getGroundStations() { return groundStations; }
export function getGroundStationMeshes() { return groundStationMeshes; }
export function getStationTrackingState() { return stationTrackingState; }
