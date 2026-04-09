import { SPEED_OF_LIGHT, SCALE } from '../utils/constants.js';

// Collecte des métriques des liens Ground Station <-> Satellite
class GSMetrics {
    constructor() {
        this.groundStations = [];
        this.events = [];
        this.timeline = new Map();
        this.timeOffset = 0;
        this.lastTrackingState = {};
    }

    // Réinitialiser toutes les métriques
    reset() {
        this.groundStations = [];
        this.events = [];
        this.timeline.clear();
        this.timeOffset = 0;
        this.lastTrackingState = {};
    }

    // Définir le décalage de temps de référence
    setTimeOffset(offset) {
        this.timeOffset = offset;
    }

    // Initialiser les ground stations
    initializeGroundStations(stations) {
        this.groundStations = stations.map(gs => ({
            id: `gs${gs.id}`, name: gs.name, lat: gs.lat, lon: gs.lon
        }));

        for (const gs of this.groundStations) {
            this.timeline.set(gs.id, []);
        }
    }

    // Détecter les événements de connexion/handover/déconnexion et échantillonner les latences
    update(trackingState, stationMeshes, satellites, currentTime) {
        const relativeTime = currentTime - this.timeOffset;

        for (const [stationId, state] of Object.entries(trackingState)) {
            const gsId = `gs${stationId}`;
            const currentSat = state.trackedSatelliteIndex;
            const previousState = this.lastTrackingState[stationId];
            const previousSat = previousState?.trackedSatelliteIndex;

            const stationMesh = stationMeshes.find(m => m.userData.stationId === parseInt(stationId));
            if (!stationMesh) continue;

            const stationPosition = stationMesh.children[0].position;

            if (previousSat === null || previousSat === undefined) {
                if (currentSat !== null && currentSat !== undefined) {
                    const latency = this._calculateLatency(stationPosition, satellites[currentSat]);
                    this.events.push({ t: relativeTime, gsId, action: 'connect', satId: currentSat, latency_ms: latency });
                    this._initTimelineEntry(gsId, currentSat, relativeTime, latency);
                }
            } else if (currentSat !== previousSat) {
                if (currentSat === null || currentSat === undefined) {
                    this.events.push({ t: relativeTime, gsId, action: 'disconnect', satId: previousSat });
                    this._finalizeTimelineEntry(gsId, previousSat, relativeTime);
                } else {
                    const latency = this._calculateLatency(stationPosition, satellites[currentSat]);
                    this.events.push({ t: relativeTime, gsId, action: 'handover', fromSatId: previousSat, toSatId: currentSat, latency_ms: latency });
                    this._finalizeTimelineEntry(gsId, previousSat, relativeTime);
                    this._initTimelineEntry(gsId, currentSat, relativeTime, latency);
                }
            }

            if (currentSat !== null && currentSat !== undefined) {
                const latency = this._calculateLatency(stationPosition, satellites[currentSat]);
                this._addSample(gsId, currentSat, relativeTime, latency);
            }
        }

        this.lastTrackingState = JSON.parse(JSON.stringify(trackingState));
    }

    // Initialiser une entrée timeline pour un nouveau lien GS-satellite
    _initTimelineEntry(gsId, satId, time, latency) {
        const entries = this.timeline.get(gsId) || [];
        entries.push({ satId, startTime: time, endTime: null, samples: [{ t: time, latency_ms: latency }] });
        this.timeline.set(gsId, entries);
    }

    // Finaliser une entrée timeline
    _finalizeTimelineEntry(gsId, satId, endTime) {
        const entries = this.timeline.get(gsId) || [];
        const currentEntry = entries.find(e => e.satId === satId && e.endTime === null);
        if (currentEntry) currentEntry.endTime = endTime;
    }

    // Ajouter un échantillon de latence à la timeline active
    _addSample(gsId, satId, time, latency) {
        const entries = this.timeline.get(gsId) || [];
        const currentEntry = entries.find(e => e.satId === satId && e.endTime === null);
        if (currentEntry) {
            const lastSample = currentEntry.samples[currentEntry.samples.length - 1];
            if (!lastSample || lastSample.t !== time) {
                currentEntry.samples.push({ t: time, latency_ms: latency });
            }
        }
    }

    // Calculer la latence entre une station et un satellite
    _calculateLatency(stationPosition, satellite) {
        if (!satellite) return 0;
        const satPosition = satellite.position;
        const dx = (stationPosition.x - satPosition.x) / SCALE;
        const dy = (stationPosition.y - satPosition.y) / SCALE;
        const dz = (stationPosition.z - satPosition.z) / SCALE;
        return (Math.sqrt(dx * dx + dy * dy + dz * dz) / SPEED_OF_LIGHT) * 1000;
    }

    // Retourner les événements triés par temps
    getEvents() {
        return this.events.sort((a, b) => a.t - b.t);
    }

    // Retourner le timeline formaté pour l'export
    getTimeline() {
        const result = [];
        for (const [gsId, entries] of this.timeline) {
            for (const entry of entries) {
                result.push({ gsId, satId: entry.satId, startTime: entry.startTime, endTime: entry.endTime, samples: entry.samples });
            }
        }
        return result;
    }

    // Retourner les statistiques globales
    getGlobalStats() {
        const events = this.getEvents();
        const timeline = this.getTimeline();

        const connectEvents = events.filter(e => e.action === 'connect').length;
        const handoverEvents = events.filter(e => e.action === 'handover').length;
        const disconnectEvents = events.filter(e => e.action === 'disconnect').length;

        let totalSamples = 0;
        let totalLatency = 0;
        for (const entry of timeline) {
            for (const sample of entry.samples) { totalSamples++; totalLatency += sample.latency_ms; }
        }

        return {
            totalGroundStations: this.groundStations.length,
            totalEvents: events.length,
            connectEvents, handoverEvents, disconnectEvents,
            totalSamples,
            avgLatency_ms: totalSamples > 0 ? totalLatency / totalSamples : 0
        };
    }

    // Retourner la liste des ground stations
    getGroundStations() { return this.groundStations; }
}

export default GSMetrics;
