import * as THREE from 'three';
import { EARTH_RADIUS, SCALE, EARTH_ROTATION_RATE } from '../utils/constants.js';

let earth = null;

// Créer la Terre avec texture et axes
export function createEarth(scene) {
    const geometry = new THREE.SphereGeometry(EARTH_RADIUS * SCALE, 64, 64);

    const textureLoader = new THREE.TextureLoader();
    const earthTexture = textureLoader.load(
        'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg',
        undefined,
        undefined,
        (error) => console.error('Erreur lors du chargement de la texture:', error)
    );

    const material = new THREE.MeshPhongMaterial({ map: earthTexture, shininess: 5, specular: 0x333333 });

    earth = new THREE.Mesh(geometry, material);
    scene.add(earth);

    const axesHelper = new THREE.AxesHelper(EARTH_RADIUS * SCALE * 2);
    scene.add(axesHelper);

    addAxisLabels(scene);

    return earth;
}

// Ajouter les labels X, Y, Z aux axes
function addAxisLabels(scene) {
    const axisLength = EARTH_RADIUS * SCALE * 2;
    const labelOffset = axisLength * 1.1;

    function createTextSprite(text, color) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 64;
        canvas.height = 64;

        context.font = 'Bold 48px Arial';
        context.fillStyle = color;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, 32, 32);

        const texture = new THREE.CanvasTexture(canvas);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
        sprite.scale.set(2, 2, 1);
        return sprite;
    }

    const labelX = createTextSprite('X', '#ff0000');
    labelX.position.set(labelOffset, 0, 0);
    scene.add(labelX);

    const labelY = createTextSprite('Y', '#00ff00');
    labelY.position.set(0, labelOffset, 0);
    scene.add(labelY);

    const labelZ = createTextSprite('Z', '#0000ff');
    labelZ.position.set(0, 0, labelOffset);
    scene.add(labelZ);
}

// Faire tourner la Terre selon le speedFactor
export function rotateEarth(deltaTime, speedFactor) {
    if (earth) earth.rotation.y += EARTH_ROTATION_RATE * deltaTime * speedFactor;
}

// Créer le fond étoilé
export function createStars(scene) {
    const starsGeometry = new THREE.BufferGeometry();
    const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.1, sizeAttenuation: true });

    const starsVertices = [];
    for (let i = 0; i < 5000; i++) {
        starsVertices.push(
            (Math.random() - 0.5) * 2000,
            (Math.random() - 0.5) * 2000,
            (Math.random() - 0.5) * 2000
        );
    }

    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
    scene.add(new THREE.Points(starsGeometry, starsMaterial));
}
