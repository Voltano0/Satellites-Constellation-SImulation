import { SPEED_OF_LIGHT, SCALE } from '../utils/constants.js';

// Collecte des métriques des liens Inter-Satellite (ISL) permanents
class ISLMetrics {
    constructor() {
        this.islPairs = [];
        this.islSamples = new Map();
        this.islStats = new Map();
        this.timeOffset = 0;
    }

    // Réinitialiser toutes les métriques
    reset() {
        this.islPairs = [];
        this.islSamples.clear();
        this.islStats.clear();
        this.timeOffset = 0;
    }

    // Définir le décalage de temps de référence
    setTimeOffset(offset) {
        this.timeOffset = offset;
    }

    // Générer les paires ISL à partir de la topologie Walker Delta
    generateISLPairs(numSats, numPlanes, phase) {
        this.islPairs = [];
        this.islSamples.clear();
        this.islStats.clear();

        const satsPerPlane = Math.floor(numSats / numPlanes);
        const extraSats = numSats % numPlanes;

        const planeInfo = [];
        let satIndexOffset = 0;
        for (let p = 0; p < numPlanes; p++) {
            const satsInThisPlane = satsPerPlane + (p < extraSats ? 1 : 0);
            planeInfo.push({ startIndex: satIndexOffset, count: satsInThisPlane, plane: p });
            satIndexOffset += satsInThisPlane;
        }

        for (let p = 0; p < numPlanes; p++) {
            const currentPlane = planeInfo[p];
            for (let s = 0; s < currentPlane.count; s++) {
                const satA = currentPlane.startIndex + s;
                const satB = currentPlane.startIndex + ((s + 1) % currentPlane.count);
                const pair = { satA: Math.min(satA, satB), satB: Math.max(satA, satB), type: 'intra-plane', planeA: p, planeB: p };
                this.islPairs.push(pair);
                this.islSamples.set(this._getPairKey(pair.satA, pair.satB), []);
            }
        }

        const phaseOffset = Math.round(phase);
        const seenInter = new Set();

        for (let p = 0; p < numPlanes; p++) {
            const currentPlane = planeInfo[p];
            const nextPlane = planeInfo[(p + 1) % numPlanes];

            for (let s = 0; s < currentPlane.count; s++) {
                const satA = currentPlane.startIndex + s;
                const adjacentSatIndexInPlane = (s - phaseOffset + nextPlane.count) % nextPlane.count;
                const satB = nextPlane.startIndex + adjacentSatIndexInPlane;

                const canonA = Math.min(satA, satB);
                const canonB = Math.max(satA, satB);
                const key = this._getPairKey(canonA, canonB);

                if (seenInter.has(key)) continue;
                seenInter.add(key);

                const pair = { satA: canonA, satB: canonB, type: 'inter-plane', planeA: p, planeB: (p + 1) % numPlanes };
                this.islPairs.push(pair);
                this.islSamples.set(key, []);
            }
        }

        console.log(`Generated ${this.islPairs.length} ISL pairs (${this._countByType('intra-plane')} intra-plane, ${this._countByType('inter-plane')} inter-plane)`);
    }

    // Échantillonner distances et latences de tous les liens ISL
    sampleISLLinks(satellites, currentTime) {
        const relativeTime = currentTime - this.timeOffset;

        for (const pair of this.islPairs) {
            const sat1 = satellites[pair.satA];
            const sat2 = satellites[pair.satB];

            if (!sat1 || !sat2) { console.warn(`Satellites ${pair.satA} or ${pair.satB} not found`); continue; }

            const distance_km = this._calculateDistance(sat1, sat2);
            const latency_ms = (distance_km / SPEED_OF_LIGHT) * 1000;
            const key = this._getPairKey(pair.satA, pair.satB);

            this.islSamples.get(key).push({ timestamp: relativeTime, distance_km, latency_ms });
        }
    }

    // Calculer les statistiques pour tous les liens ISL
    computeStats() {
        const stats = [];

        for (const pair of this.islPairs) {
            const key = this._getPairKey(pair.satA, pair.satB);
            const samples = this.islSamples.get(key) || [];

            if (samples.length === 0) { console.warn(`No samples for ISL ${pair.satA} <-> ${pair.satB}`); continue; }

            const distances = samples.map(s => s.distance_km);
            const latencies = samples.map(s => s.latency_ms);

            const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
            const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
            const varianceLatency = this._calculateVariance(latencies, avgLatency);

            stats.push({
                satA: pair.satA, satB: pair.satB,
                type: pair.type, planeA: pair.planeA, planeB: pair.planeB,
                samples: samples.length,
                minDistance_km: Math.min(...distances),
                maxDistance_km: Math.max(...distances),
                avgDistance_km: avgDistance,
                minLatency_ms: Math.min(...latencies),
                maxLatency_ms: Math.max(...latencies),
                avgLatency_ms: avgLatency,
                varianceLatency_ms: varianceLatency,
                stdDevLatency_ms: Math.sqrt(varianceLatency)
            });
        }

        return stats;
    }

    // Retourner tous les échantillons pour l'export
    getAllSamples() {
        return this.islPairs.map(pair => ({
            satA: pair.satA, satB: pair.satB,
            type: pair.type, planeA: pair.planeA, planeB: pair.planeB,
            samples: this.islSamples.get(this._getPairKey(pair.satA, pair.satB)) || []
        }));
    }

    // Retourner les statistiques globales
    getGlobalStats() {
        const stats = this.computeStats();

        if (stats.length === 0) {
            return { totalISLLinks: 0, intraPlaneLinks: 0, interPlaneLinks: 0, totalSamples: 0, avgLatencyIntraPlane_ms: 0, avgLatencyInterPlane_ms: 0, avgLatencyOverall_ms: 0 };
        }

        const intraPlaneStats = stats.filter(s => s.type === 'intra-plane');
        const interPlaneStats = stats.filter(s => s.type === 'inter-plane');

        return {
            totalISLLinks: stats.length,
            intraPlaneLinks: intraPlaneStats.length,
            interPlaneLinks: interPlaneStats.length,
            totalSamples: stats.reduce((sum, s) => sum + s.samples, 0),
            avgLatencyIntraPlane_ms: intraPlaneStats.length > 0 ? intraPlaneStats.reduce((sum, s) => sum + s.avgLatency_ms, 0) / intraPlaneStats.length : 0,
            avgLatencyInterPlane_ms: interPlaneStats.length > 0 ? interPlaneStats.reduce((sum, s) => sum + s.avgLatency_ms, 0) / interPlaneStats.length : 0,
            avgLatencyOverall_ms: stats.reduce((sum, s) => sum + s.avgLatency_ms, 0) / stats.length
        };
    }

    // Calculer la distance 3D entre deux satellites
    _calculateDistance(sat1, sat2) {
        const pos1 = sat1.position;
        const pos2 = sat2.position;
        const dx = (pos1.x - pos2.x) / SCALE;
        const dy = (pos1.y - pos2.y) / SCALE;
        const dz = (pos1.z - pos2.z) / SCALE;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    // Générer une clé unique pour une paire de satellites
    _getPairKey(satA, satB) {
        return `${Math.min(satA, satB)}-${Math.max(satA, satB)}`;
    }

    // Compter les paires d'un type donné
    _countByType(type) {
        return this.islPairs.filter(pair => pair.type === type).length;
    }

    // Calculer la variance d'un tableau de valeurs
    _calculateVariance(values, mean) {
        if (values.length === 0) return 0;
        return values.map(v => Math.pow(v - mean, 2)).reduce((a, b) => a + b, 0) / values.length;
    }
}

export default ISLMetrics;
