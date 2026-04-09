import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SPEED_FACTORS, DEFAULT_SAMPLING_INTERVAL, DEFAULT_ORBITAL_PERIODS } from '../utils/constants.js';
import { createEarth, rotateEarth, createStars } from './earth.js';
import { createConstellation, updateSatellites, createISL, getOrbits, getLinks, getSatellites, getOrbitalPeriod, createNeighborLinks, updateNeighborLinks, getNeighborLinks, clearSceneObjects } from './constellation.js';
import { updateSatelliteGrid, highlightSatellite } from './grid.js';
import { addGroundStation, removeGroundStation, updateGroundStationList, updateGroundStations, toggleGroundScope, updateGroundSatelliteLinks, clearGroundSatelliteLinks, getGroundStations, getGroundStationMeshes, getStationTrackingState } from './groundStations.js';
import { showSatelliteInfo, closeSatelliteInfo, updateSelectedSatelliteInfo, getSelectedSatelliteIndex } from './ui.js';
import { handleStationsFileImport, handleConstellationFileImport } from './import.js';
import MetricsCollector from '../Metrics/metricsCollector.js';
import { downloadISLGSMininet } from '../Metrics/exporters.js';

let scene, camera, renderer, controls;
let simulationTime = 0;
let metricsCollector = null;

let params = {
    altitude: 550,
    inclination: 55,
    numSats: 24,
    numPlanes: 6,
    phase: 1,
    showOrbits: true,
    showLinks: false,
    showNeighborLinks: false,
    showGroundScope: false,
    animate: true,
    showGrid: true,
    speedFactor: 1,
    satelliteSize: 0.30
};

// Initialisation de la scène et des contrôles
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100000);
    camera.position.set(50, 30, 50);

    const container = document.getElementById('canvas-container');
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 10;
    controls.maxDistance = 200;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(50, 50, 50);
    scene.add(directionalLight);

    createEarth(scene);
    createStars(scene);
    createConstellation(scene, params);

    updateSatelliteGrid(params, (satIndex) => {
        highlightSatellite(satIndex, showSatelliteInfo);
    });

    window.addEventListener('resize', onWindowResize);

    setupControls();
    updateGroundStationList();

    metricsCollector = new MetricsCollector();
    setupMetricsControls();

    const samplingSlider = document.getElementById('sampling-interval');
    const samplingDisplay = document.getElementById('sampling-interval-value');
    const samplingEstimate = document.getElementById('sampling-samples-estimate');

    function updateSamplingEstimate() {
        const interval = parseInt(samplingSlider.value);
        const useTerrestrial = document.getElementById('period-terrestrial').checked;
        const orbitalPeriod = getOrbitalPeriod();
        const durationS = useTerrestrial ? 86164 : (orbitalPeriod > 0 ? orbitalPeriod * 60 : 5700);
        samplingEstimate.textContent = `~${Math.floor(durationS / interval)} échantillons/lien`;
    }

    samplingSlider.addEventListener('input', () => {
        samplingDisplay.textContent = samplingSlider.value;
        updateSamplingEstimate();
    });

    document.querySelectorAll('input[name="collection-period"]').forEach(r =>
        r.addEventListener('change', updateSamplingEstimate)
    );

    samplingDisplay.textContent = DEFAULT_SAMPLING_INTERVAL;
    updateSamplingEstimate();

    animate();
}

// Boucle d'animation principale
let lastTime = 0;
let frameCount = 0;
let fpsTime = 0;

function animate() {
    requestAnimationFrame(animate);

    const currentTime = performance.now();
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    frameCount++;
    fpsTime += deltaTime;
    if (fpsTime >= 1) {
        document.getElementById('fps').textContent = frameCount;
        frameCount = 0;
        fpsTime = 0;
    }

    if (params.animate) {
        updateSatellites(deltaTime, params.speedFactor);

        if (params.showNeighborLinks) updateNeighborLinks(scene);

        simulationTime += deltaTime * params.speedFactor;
        rotateEarth(deltaTime, params.speedFactor);
        updateGroundStations(deltaTime, params.speedFactor);
    }

    if (getSelectedSatelliteIndex() !== -1) updateSelectedSatelliteInfo(params);

    if (params.showGroundScope) {
        const satellites = getSatellites();
        updateGroundSatelliteLinks(scene, satellites, simulationTime);

        if (frameCount % 60 === 0) updateGroundStationList();
    }

    if (metricsCollector && metricsCollector.isCollecting) {
        metricsCollector.update(getSatellites(), simulationTime);
    }

    controls.update();
    renderer.render(scene, camera);
}

// Redimensionnement de la fenêtre
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Contrôles de l'interface utilisateur
function setupControls() {
    const sliders = ['altitude', 'inclination', 'phase'];
    sliders.forEach(id => {
        const slider = document.getElementById(id);
        const display = document.getElementById(`${id}-value`);

        slider.addEventListener('input', (e) => {
            params[id] = parseFloat(e.target.value);
            display.textContent = e.target.value;
        });
    });

    const numSatsSlider = document.getElementById('numSats');
    const numSatsDisplay = document.getElementById('numSats-value');
    const numPlanesSlider = document.getElementById('numPlanes');
    const numPlanesDisplay = document.getElementById('numPlanes-value');
    const phaseSlider = document.getElementById('phase');
    const phaseDisplay = document.getElementById('phase-value');

    function adjustNumSatsToMultiple(numSats, numPlanes) {
        const satsPerPlane = Math.round(numSats / numPlanes);
        return Math.max(numPlanes, satsPerPlane * numPlanes);
    }

    function updateNumSatsDisplay(numSats, numPlanes) {
        numSatsDisplay.textContent = `${numSats} (${numSats / numPlanes} sat/plan)`;
    }

    function updatePhaseMax(numPlanes) {
        const maxPhase = numPlanes - 1;
        phaseSlider.max = maxPhase;

        if (params.phase > maxPhase) {
            params.phase = maxPhase;
            phaseSlider.value = maxPhase;
            phaseDisplay.textContent = maxPhase;
        }
    }

    updatePhaseMax(params.numPlanes);
    updateNumSatsDisplay(params.numSats, params.numPlanes);

    numSatsSlider.addEventListener('input', (e) => {
        const adjustedNumSats = adjustNumSatsToMultiple(parseFloat(e.target.value), params.numPlanes);
        params.numSats = adjustedNumSats;
        numSatsSlider.value = adjustedNumSats;
        updateNumSatsDisplay(adjustedNumSats, params.numPlanes);
    });

    numPlanesSlider.addEventListener('input', (e) => {
        const numPlanes = parseFloat(e.target.value);
        params.numPlanes = numPlanes;
        numPlanesDisplay.textContent = e.target.value;

        updatePhaseMax(numPlanes);

        const adjustedNumSats = adjustNumSatsToMultiple(params.numSats, numPlanes);
        params.numSats = adjustedNumSats;
        numSatsSlider.value = adjustedNumSats;
        updateNumSatsDisplay(adjustedNumSats, numPlanes);
    });

    const speedSlider = document.getElementById('speedFactor');
    const speedDisplay = document.getElementById('speedFactor-value');

    speedSlider.addEventListener('input', (e) => {
        params.speedFactor = SPEED_FACTORS[parseInt(e.target.value)];
        speedDisplay.textContent = params.speedFactor;
    });

    const satelliteSizeSlider = document.getElementById('satelliteSize');
    const satelliteSizeDisplay = document.getElementById('satelliteSize-value');

    satelliteSizeSlider.addEventListener('input', (e) => {
        params.satelliteSize = parseFloat(e.target.value);
        satelliteSizeDisplay.textContent = params.satelliteSize.toFixed(2);

        getSatellites().forEach(sat => {
            sat.scale.set(1, 1, 1);
            sat.geometry.dispose();
            sat.geometry = new THREE.SphereGeometry(params.satelliteSize, 16, 16);
        });
    });

    document.getElementById('showOrbits').addEventListener('change', (e) => {
        params.showOrbits = e.target.checked;
        getOrbits().forEach(orbit => orbit.visible = e.target.checked);
    });

    document.getElementById('showLinks').addEventListener('change', (e) => {
        params.showLinks = e.target.checked;
        if (e.target.checked) {
            createISL(scene, params);
        } else {
            clearSceneObjects(scene, getLinks());
        }
    });

    document.getElementById('showNeighborLinks').addEventListener('change', (e) => {
        params.showNeighborLinks = e.target.checked;
        if (e.target.checked) {
            createNeighborLinks(scene);
        } else {
            clearSceneObjects(scene, getNeighborLinks());
        }
    });

    document.getElementById('showGroundScope').addEventListener('change', (e) => {
        params.showGroundScope = e.target.checked;
        toggleGroundScope(e.target.checked);
        if (!e.target.checked) clearGroundSatelliteLinks(scene);
    });

    document.getElementById('animate').addEventListener('change', (e) => {
        params.animate = e.target.checked;
    });

    document.getElementById('showGrid').addEventListener('change', (e) => {
        params.showGrid = e.target.checked;
        document.getElementById('grid-view').style.display = e.target.checked ? 'block' : 'none';
        if (e.target.checked) {
            updateSatelliteGrid(params, (satIndex) => {
                highlightSatellite(satIndex, showSatelliteInfo);
            });
        }
    });

    document.getElementById('showMetricsPanel').addEventListener('change', (e) => {
        document.getElementById('metrics-panel').style.display = e.target.checked ? 'block' : 'none';
    });

    document.getElementById('showGroundStationsPanel').addEventListener('change', (e) => {
        document.getElementById('ground-stations').style.display = e.target.checked ? 'block' : 'none';
    });

    document.getElementById('updateBtn').addEventListener('click', () => {
        createConstellation(scene, params);
        updateSatelliteGrid(params, (satIndex) => {
            highlightSatellite(satIndex, showSatelliteInfo);
        });
    });
}

// Contrôles du panneau de collecte de métriques
function setupMetricsControls() {
    const startBtn = document.getElementById('start-collection-btn');
    const exportMininetBtn = document.getElementById('export-mininet-btn');
    const progressDiv = document.getElementById('collection-progress');

    startBtn.addEventListener('click', () => {
        if (!metricsCollector.isCollecting) {
            const orbitalPeriod = getOrbitalPeriod();
            if (orbitalPeriod === 0) {
                alert('Veuillez créer une constellation d\'abord.');
                return;
            }

            const constellation = {
                numSats: params.numSats,
                numPlanes: params.numPlanes,
                phase: params.phase,
                altitude: params.altitude,
                inclination: params.inclination
            };

            const groundStations = getGroundStations();
            const useTerrestrialPeriod = document.getElementById('period-terrestrial').checked;
            metricsCollector.samplingInterval = parseInt(document.getElementById('sampling-interval').value);

            const gsOptions = {
                includeGroundStations: groundStations.length > 0,
                groundStations: groundStations,
                groundStationMeshes: getGroundStationMeshes(),
                getTrackingState: getStationTrackingState,
                useGroundTrackPeriod: useTerrestrialPeriod
            };

            if (gsOptions.includeGroundStations && !params.showGroundScope) {
                params.showGroundScope = true;
                document.getElementById('showGroundScope').checked = true;
                toggleGroundScope(true);
            }

            metricsCollector.startCollection(orbitalPeriod, constellation, 'isl', gsOptions);
            startBtn.textContent = 'Collecte en cours...';
            startBtn.disabled = true;
            exportMininetBtn.disabled = true;
            progressDiv.style.display = 'block';
        }
    });

    const originalOnComplete = metricsCollector.onCollectionComplete.bind(metricsCollector);
    metricsCollector.onCollectionComplete = function() {
        originalOnComplete();
        startBtn.textContent = 'Démarrer la collecte';
        startBtn.disabled = false;
        exportMininetBtn.disabled = false;
    };

    exportMininetBtn.addEventListener('click', () => {
        const constellation = {
            numSats: params.numSats,
            numPlanes: params.numPlanes,
            phase: params.phase,
            altitude: params.altitude,
            inclination: params.inclination
        };
        downloadISLGSMininet(
            metricsCollector.islMetrics,
            metricsCollector.gsMetrics,
            constellation,
            getOrbitalPeriod(),
            getGroundStations(),
            metricsCollector.collectionDuration,
            metricsCollector.targetOrbitalPeriods,
            metricsCollector.samplingInterval
        );
    });
}

window.handleStationsFileImport = (event) => handleStationsFileImport(event, scene);
window.handleConstellationFileImport = (event) => handleConstellationFileImport(event, scene, params);
window.addGroundStation = () => addGroundStation(scene);
window.removeGroundStation = (stationId) => removeGroundStation(scene, stationId);
window.closeSatelliteInfo = closeSatelliteInfo;

init();
