// Vérification de visibilité entre satellites (occlusion terrestre)
import * as THREE from 'three';
import { EARTH_RADIUS, SCALE, MAX_ISL_DISTANCE, VISIBILITY_CACHE_LIFETIME } from './constants.js';

const visibilityCache = new Map();

// Vérifier si deux satellites ont une ligne de vue directe
export function checkLineOfSight(sat1, sat2, currentTime = null) {
    const pos1 = sat1.position;
    const pos2 = sat2.position;

    const distance = pos1.distanceTo(pos2);
    if (distance > MAX_ISL_DISTANCE * SCALE) return false;

    if (currentTime !== null) {
        const sat1Index = sat1.userData?.index ?? sat1.name;
        const sat2Index = sat2.userData?.index ?? sat2.name;
        const cacheKey = `${Math.min(sat1Index, sat2Index)}-${Math.max(sat1Index, sat2Index)}`;

        const cached = visibilityCache.get(cacheKey);
        if (cached && (currentTime - cached.time) < VISIBILITY_CACHE_LIFETIME) return cached.visible;

        const visible = performRaycast(pos1, pos2, distance);
        visibilityCache.set(cacheKey, { visible, time: currentTime });
        return visible;
    }

    return performRaycast(pos1, pos2, distance);
}

// Effectuer le raycasting pour vérifier l'occlusion terrestre
function performRaycast(pos1, pos2, distance) {
    const midpoint = new THREE.Vector3().addVectors(pos1, pos2).multiplyScalar(0.5);
    const earthRadiusScaled = EARTH_RADIUS * SCALE;

    if (midpoint.length() > earthRadiusScaled * 1.1) {
        if (pos1.dot(pos2) > 0) return true;
    }

    const direction = new THREE.Vector3().subVectors(pos2, pos1).normalize();
    const raycaster = new THREE.Raycaster(pos1, direction, 0, distance);
    const earthSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), earthRadiusScaled);

    return !raycaster.ray.intersectsSphere(earthSphere);
}

// Calculer la distance 3D entre deux satellites en kilomètres
export function calculateDistance(sat1, sat2) {
    const pos1 = sat1.position;
    const pos2 = sat2.position;
    const dx = (pos1.x - pos2.x) / SCALE;
    const dy = (pos1.y - pos2.y) / SCALE;
    const dz = (pos1.z - pos2.z) / SCALE;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Vider le cache de visibilité
export function clearVisibilityCache() {
    visibilityCache.clear();
}
