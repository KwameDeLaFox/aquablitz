import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water2.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Constants for game physics
const ACCELERATION = 800; // Units per second^2
const MAX_SPEED = 1000; // Units per second
const TURN_SPEED = 2.5; // Radians per second
const DRIFT_FACTOR = 1.5; // Multiplier for turn speed while drifting
const DRAG_COEFFICIENT = 0.95; // Air/water resistance (lower = more drag)
const NITRO_MULTIPLIER = 1.8; // Speed boost from nitro
const WATER_LEVEL = 0; // Y position of water surface

// Game state
let playerBoat;
let camera, scene, renderer;
let water;
let controls;
let clock;
let speed = 0;
let velocity = new THREE.Vector3();
let isDrifting = false;
let hasPowerUp = false;
let powerUpType = null;

// Multiplayer
const socket = io();
const otherPlayers = new Map();

// Initialize Three.js scene
function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x88ccff);
    scene.fog = new THREE.Fog(0x88ccff, 0, 5000);

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 20000);
    camera.position.set(0, 40, -100);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
    sunLight.position.set(0, 100, 0);
    scene.add(sunLight);

    // Water
    const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
    water = new Water(waterGeometry, {
        color: 0x0088ff,
        scale: 1,
        flowDirection: new THREE.Vector2(1, 1),
        textureWidth: 1024,
        textureHeight: 1024
    });
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_LEVEL;
    scene.add(water);

    // Temporary boat (box for now)
    const boatGeometry = new THREE.BoxGeometry(20, 10, 40);
    const boatMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
    playerBoat = new THREE.Mesh(boatGeometry, boatMaterial);
    playerBoat.position.set(0, 5, 0);
    scene.add(playerBoat);

    // Add a giant ramp
    createGiantRamp();

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.target.set(0, 5, 0);
    controls.update();

    // Clock for frame-independent movement
    clock = new THREE.Clock();

    // Event listeners
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Start button
    document.getElementById('start-btn').addEventListener('click', () => {
        document.getElementById('lobby').classList.add('hidden');
        socket.emit('playerJoin', {
            position: playerBoat.position.toArray(),
            rotation: playerBoat.rotation.toArray()
        });
    });
}

// Create the giant ramp for the "Oh Hell Yeah" moment
function createGiantRamp() {
    const rampGeometry = new THREE.BoxGeometry(100, 80, 200);
    const rampMaterial = new THREE.MeshPhongMaterial({ color: 0x666666 });
    const ramp = new THREE.Mesh(rampGeometry, rampMaterial);
    ramp.position.set(0, 40, 500); // Place the ramp ahead of start
    ramp.rotation.x = -Math.PI / 6; // Angle the ramp up
    scene.add(ramp);
}

// Handle window resizing
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Input handling
const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    drift: false,
    powerUp: false
};

function onKeyDown(event) {
    switch(event.code) {
        case 'KeyW':
        case 'ArrowUp':
            keys.forward = true;
            break;
        case 'KeyS':
        case 'ArrowDown':
            keys.backward = true;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            keys.left = true;
            break;
        case 'KeyD':
        case 'ArrowRight':
            keys.right = true;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            keys.drift = true;
            isDrifting = true;
            break;
        case 'Space':
            if (hasPowerUp) usePowerUp();
            break;
    }
}

function onKeyUp(event) {
    switch(event.code) {
        case 'KeyW':
        case 'ArrowUp':
            keys.forward = false;
            break;
        case 'KeyS':
        case 'ArrowDown':
            keys.backward = false;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            keys.left = false;
            break;
        case 'KeyD':
        case 'ArrowRight':
            keys.right = false;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            keys.drift = false;
            isDrifting = false;
            break;
    }
}

// Power-up logic
function usePowerUp() {
    if (powerUpType === 'nitro') {
        speed *= NITRO_MULTIPLIER;
        socket.emit('powerUpUsed', {
            type: 'nitro',
            position: playerBoat.position.toArray()
        });
    }
    hasPowerUp = false;
    powerUpType = null;
    document.getElementById('power-up').textContent = 'NO POWER-UP';
}

// Update game state
function update() {
    const delta = clock.getDelta();

    // Update boat physics
    if (keys.forward) {
        speed += ACCELERATION * delta;
    } else if (keys.backward) {
        speed -= ACCELERATION * delta;
    }

    // Apply drag
    speed *= DRAG_COEFFICIENT;
    speed = THREE.MathUtils.clamp(speed, -MAX_SPEED * 0.5, MAX_SPEED);

    // Update rotation
    if (keys.left) {
        playerBoat.rotation.y += TURN_SPEED * (isDrifting ? DRIFT_FACTOR : 1) * delta;
    }
    if (keys.right) {
        playerBoat.rotation.y -= TURN_SPEED * (isDrifting ? DRIFT_FACTOR : 1) * delta;
    }

    // Update velocity and position
    velocity.set(0, 0, speed * delta);
    velocity.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerBoat.rotation.y);
    playerBoat.position.add(velocity);

    // Keep boat above water
    playerBoat.position.y = Math.max(5, playerBoat.position.y);

    // Update camera target
    controls.target.copy(playerBoat.position);
    controls.update();

    // Update UI
    document.getElementById('speed-meter').textContent = `${Math.abs(Math.round(speed))} KPH`;

    // Send position update to server
    socket.emit('playerUpdate', {
        position: playerBoat.position.toArray(),
        rotation: playerBoat.rotation.toArray(),
        speed: speed,
        isDrifting: isDrifting
    });
}

// Multiplayer event handlers
socket.on('playersList', (players) => {
    document.getElementById('player-count').textContent = `Players: ${players.length}/8`;
    
    // Update other players
    players.forEach(player => {
        if (player.id !== socket.id) {
            if (!otherPlayers.has(player.id)) {
                // Create new boat for other player
                const boatGeometry = new THREE.BoxGeometry(20, 10, 40);
                const boatMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
                const boat = new THREE.Mesh(boatGeometry, boatMaterial);
                scene.add(boat);
                otherPlayers.set(player.id, boat);
            }
            // Update position
            const boat = otherPlayers.get(player.id);
            boat.position.fromArray(player.position);
            boat.rotation.fromArray(player.rotation);
        }
    });
});

socket.on('playerMove', (data) => {
    const boat = otherPlayers.get(data.id);
    if (boat) {
        boat.position.fromArray(data.position);
        boat.rotation.fromArray(data.rotation);
    }
});

socket.on('powerUpEffect', (data) => {
    // Add visual effect for power-up use
    if (data.type === 'nitro') {
        // TODO: Add nitro visual effect
    }
});

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    update();
    renderer.render(scene, camera);
}

// Start the game
init();
animate(); 