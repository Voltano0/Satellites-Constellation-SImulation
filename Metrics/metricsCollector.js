import ContactMetrics from './contactMetrics.js';
import ISLMetrics from './islMetrics.js';
import GSMetrics from './gsMetrics.js';
import { exportAllToCSV, downloadJSON, downloadSummary, downloadMininet } from './exporters.js';
import { DEFAULT_SAMPLING_INTERVAL, DEFAULT_ORBITAL_PERIODS, SIDEREAL_DAY_SECONDS } from '../utils/constants.js';

class MetricsCollector {
    constructor() {
        this.contactMetrics = new ContactMetrics();
        this.islMetrics = new ISLMetrics();
        this.gsMetrics = new GSMetrics();

        this.samplingInterval = DEFAULT_SAMPLING_INTERVAL;
        this.targetOrbitalPeriods = DEFAULT_ORBITAL_PERIODS;
        this.orbitalPeriod = 0;
        this.collectionMode = 'isl';

        this.includeGroundStations = false;
        this.useGroundTrackPeriod = false;
        this.groundStationsData = null;
        this.groundStationMeshes = null;
        this.getTrackingState = null;

        this.isCollecting = false;
        this.lastSampleTime = 0;
        this.collectionStartTime = 0;
        this.collectionDuration = 0;
        this.samplesCollected = 0;
        this.totalSamplesTarget = 0;
    }

    // Démarrer la collecte
    startCollection(orbitalPeriod, constellation = null, mode = 'isl', gsOptions = null) {
        if (this.isCollecting) {
            console.warn('Collection already in progress');
            return;
        }

        this.collectionMode = mode;
        this.orbitalPeriod = orbitalPeriod;

        this.includeGroundStations = gsOptions?.includeGroundStations || false;
        this.groundStationsData = gsOptions?.groundStations || [];
        this.groundStationMeshes = gsOptions?.groundStationMeshes || [];
        this.getTrackingState = gsOptions?.getTrackingState || null;
        this.useGroundTrackPeriod = gsOptions?.useGroundTrackPeriod || false;

        if (mode === 'isl') {
            this.islMetrics.reset();

            if (constellation) {
                this.islMetrics.generateISLPairs(
                    constellation.numSats,
                    constellation.numPlanes,
                    constellation.phase
                );
            }

            if (this.includeGroundStations && this.groundStationsData.length > 0) {
                this.gsMetrics.reset();
                this.gsMetrics.initializeGroundStations(this.groundStationsData);
            }

            if (this.useGroundTrackPeriod) {
                this.targetOrbitalPeriods = Math.ceil(SIDEREAL_DAY_SECONDS / (orbitalPeriod * 60));
            } else {
                this.targetOrbitalPeriods = 1;
            }
        } else {
            this.contactMetrics.reset();
            this.targetOrbitalPeriods = DEFAULT_ORBITAL_PERIODS;
        }

        this.collectionDuration = orbitalPeriod * 60 * this.targetOrbitalPeriods;
        this.totalSamplesTarget = Math.floor(this.collectionDuration / this.samplingInterval);

        this.isCollecting = true;
        this.lastSampleTime = 0;
        this.collectionStartTime = 0;
        this.samplesCollected = 0;
    }

    // Arrêter la collecte
    stopCollection() {
        if (!this.isCollecting) return;
        this.isCollecting = false;
    }

    // Mettre à jour la collecte (appelé dans la boucle d'animation)
    update(satellites, currentTime) {
        if (!this.isCollecting) return;

        if (this.collectionStartTime === 0) {
            this.collectionStartTime = currentTime;
            this.lastSampleTime = currentTime;

            if (this.collectionMode === 'isl') {
                this.islMetrics.setTimeOffset(currentTime);
                if (this.includeGroundStations) {
                    this.gsMetrics.setTimeOffset(currentTime);
                }
            } else {
                this.contactMetrics.setTimeOffset(currentTime);
            }
        }

        const elapsedTime = currentTime - this.collectionStartTime;

        if (elapsedTime >= this.collectionDuration) {
            this.stopCollection();
            this.onCollectionComplete();
            return;
        }

        while (currentTime - this.lastSampleTime >= this.samplingInterval) {
            this.lastSampleTime += this.samplingInterval;
            this.samplesCollected++;

            this.sample(satellites, this.lastSampleTime);
            this.updateProgressUI();

            if (this.samplesCollected >= this.totalSamplesTarget) break;
        }
    }

    // Prendre un échantillon de métriques
    sample(satellites, currentTime) {
        if (this.collectionMode === 'isl') {
            this.islMetrics.sampleISLLinks(satellites, currentTime);

            if (this.includeGroundStations && this.getTrackingState) {
                const trackingState = this.getTrackingState();
                this.gsMetrics.update(
                    trackingState,
                    this.groundStationMeshes,
                    satellites,
                    currentTime
                );
            }
        } else {
            this.contactMetrics.update(satellites, currentTime);
        }
    }

    // Callback appelé à la fin de la collecte
    onCollectionComplete() {
        if (this.collectionMode === 'isl') {
            const islStats = this.islMetrics.getGlobalStats();
            console.log(`ISL links: ${islStats.totalISLLinks}, samples: ${islStats.totalSamples}`);
            console.log(`Latency — intra: ${islStats.avgLatencyIntraPlane_ms.toFixed(3)}ms, inter: ${islStats.avgLatencyInterPlane_ms.toFixed(3)}ms`);

            if (this.includeGroundStations) {
                const gsStats = this.gsMetrics.getGlobalStats();
                console.log(`GS: ${gsStats.totalGroundStations}, events: ${gsStats.totalEvents}, avg latency: ${gsStats.avgLatency_ms.toFixed(3)}ms`);
            }
        } else {
            const contactStats = this.contactMetrics.getStats();
            console.log(`Contacts: ${contactStats.totalContacts}, avg duration: ${contactStats.avgDuration.toFixed(2)}s`);
        }

        this.enableExportButtons();
    }

    // Mettre à jour la barre de progression
    updateProgressUI() {
        const progress = (this.samplesCollected / this.totalSamplesTarget) * 100;

        const progressBar = document.getElementById('collection-progress-bar');
        const progressText = document.getElementById('collection-progress-text');
        const samplesText = document.getElementById('samples-collected');

        if (progressBar) progressBar.style.width = `${progress.toFixed(1)}%`;
        if (progressText) progressText.textContent = `${progress.toFixed(1)}%`;
        if (samplesText) samplesText.textContent = `${this.samplesCollected} / ${this.totalSamplesTarget}`;

        const islProgressBar = document.getElementById('isl-progress-fill');
        const islProgressText = document.getElementById('isl-progress-text');

        if (islProgressBar) islProgressBar.style.width = `${progress.toFixed(1)}%`;
        if (islProgressText) islProgressText.textContent = `${progress.toFixed(1)}%`;

        if (this.collectionMode === 'isl') {
            const islStats = this.islMetrics.getGlobalStats();

            const islCountEl = document.getElementById('isl-links-count');
            const islSamplesEl = document.getElementById('isl-samples-count');
            const islAvgLatencyEl = document.getElementById('isl-avg-latency');

            if (islCountEl) islCountEl.textContent = islStats.totalISLLinks;
            if (islSamplesEl) islSamplesEl.textContent = this.samplesCollected;
            if (islAvgLatencyEl) islAvgLatencyEl.textContent = islStats.avgLatencyOverall_ms.toFixed(3);

            if (this.includeGroundStations) {
                const gsStats = this.gsMetrics.getGlobalStats();
                const gsStatsPanel = document.getElementById('gs-stats-panel');
                const gsCountEl = document.getElementById('gs-count');
                const gsEventsEl = document.getElementById('gs-events-count');
                const gsHandoversEl = document.getElementById('gs-handovers-count');

                if (gsStatsPanel) gsStatsPanel.style.display = 'block';
                if (gsCountEl) gsCountEl.textContent = gsStats.totalGroundStations;
                if (gsEventsEl) gsEventsEl.textContent = gsStats.totalEvents;
                if (gsHandoversEl) gsHandoversEl.textContent = gsStats.handoverEvents;
            }
        } else {
            const contactStats = this.contactMetrics.getStats();
            const islContactsEl = document.getElementById('isl-contacts-count');
            if (islContactsEl) islContactsEl.textContent = contactStats.activeContacts;
        }
    }

    // Activer le bouton d'export
    enableExportButtons() {
        const exportMininetBtn = document.getElementById('export-mininet-btn');
        if (exportMininetBtn) exportMininetBtn.disabled = false;
    }

    // Retourner la progression en pourcentage
    getProgress() {
        if (this.totalSamplesTarget === 0) return 0;
        return (this.samplesCollected / this.totalSamplesTarget) * 100;
    }

    exportJSON() { downloadJSON(this.contactMetrics); }
    exportCSV() { exportAllToCSV(this.contactMetrics, this.orbitalPeriod); }
    exportSummary() { downloadSummary(this.contactMetrics); }
    exportMininet(constellation) { downloadMininet(this.contactMetrics, constellation, this.orbitalPeriod); }

    getContactMetrics() { return this.contactMetrics; }
    getGSMetrics() { return this.gsMetrics; }
    hasGroundStations() { return this.includeGroundStations && this.groundStationsData.length > 0; }
}

export default MetricsCollector;
