import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';

// Constants for game physics
const ACCELERATION = 800; // Units per second^2
const MAX_SPEED = 1000; // Units per second
const TURN_SPEED = 2.5; // Radians per second
const DRIFT_FACTOR = 1.5; // Multiplier for turn speed while drifting
const DRAG_COEFFICIENT = 0.95; // Air/water resistance (lower = more drag)
const NITRO_MULTIPLIER = 1.8; // Speed boost from nitro
const WATER_LEVEL = 0; // Y position of water surface

// Update water constants
const WATER_NORMAL_SCALE = 8; // Increased for more pronounced waves
const WATER_DISTORTION_SCALE = 4.5; // More distortion
const WATER_ALPHA = 0.8; // Slight transparency
const WATER_SIZE = 10000;

// Add these for foam effects
const FOAM_FACTOR = 0.8;
const WAVE_SPEED = 1.2;

// Track constants
const TRACK_WIDTH = 200;
const BARRIER_HEIGHT = 30;
const CHECKPOINT_COUNT = 8;

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

// Track state
let trackPoints = [];
let trackBarriers = [];
let checkpoints = [];
let currentCheckpoint = 0;
let lapCount = 0;

// Multiplayer
const socket = io({
    transports: ['websocket'],
    path: '/socket.io'
});
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
    const waterGeometry = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, 512, 512);
    const textureLoader = new THREE.TextureLoader();
    
    const waterNormals = textureLoader.load('textures/waternormals.jpg');
    waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
    waterNormals.repeat.set(6, 6); // More wave repetition
    
    water = new Water(waterGeometry, {
        textureWidth: 1024,
        textureHeight: 1024,
        waterNormals: waterNormals,
        sunDirection: new THREE.Vector3(),
        sunColor: 0xffffff,
        waterColor: 0x0066cc, // Brighter blue
        distortionScale: WATER_DISTORTION_SCALE,
        fog: scene.fog !== undefined,
        alpha: WATER_ALPHA,
        size: 4
    });
    
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_LEVEL;
    scene.add(water);

    // Add sky
    const sky = new Sky();
    sky.scale.setScalar(10000);
    scene.add(sky);

    const skyUniforms = sky.material.uniforms;
    skyUniforms['turbidity'].value = 8;
    skyUniforms['rayleigh'].value = 1.5;
    skyUniforms['mieCoefficient'].value = 0.005;
    skyUniforms['mieDirectionalG'].value = 0.7;

    const sun = new THREE.Vector3();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);

    const phi = THREE.MathUtils.degToRad(88);
    const theta = THREE.MathUtils.degToRad(180);
    sun.setFromSphericalCoords(1, phi, theta);

    sky.material.uniforms['sunPosition'].value.copy(sun);
    water.material.uniforms['sunDirection'].value.copy(sun).normalize();

    scene.environment = pmremGenerator.fromScene(sky).texture;

    // Temporary boat (box for now)
    const boatGeometry = new THREE.BoxGeometry(20, 10, 40);
    const boatMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
    playerBoat = new THREE.Mesh(boatGeometry, boatMaterial);
    playerBoat.position.set(0, 5, 0);
    scene.add(playerBoat);

    // Create the Neon Lagoon track
    createNeonLagoonTrack();

    // Update initial boat position
    playerBoat.position.set(0, 5, 0);

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

// Create the Neon Lagoon track
function createNeonLagoonTrack() {
    // Define track path points (x, z coordinates)
    const trackPath = [
        { x: 0, z: 0 },
        { x: 300, z: 200 },
        { x: 600, z: 0 },
        { x: 800, z: -400 },
        { x: 400, z: -800 },
        { x: -200, z: -600 },
        { x: -400, z: -200 },
        { x: -200, z: 200 }
    ];

    trackPoints = trackPath;

    // Create glowing barriers
    const barrierMaterial = new THREE.MeshPhongMaterial({
        color: 0x00ff88,
        emissive: 0x00ff88,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.8
    });

    // Create track barriers
    for (let i = 0; i < trackPath.length; i++) {
        const start = trackPath[i];
        const end = trackPath[(i + 1) % trackPath.length];

        // Calculate barrier positions
        const direction = new THREE.Vector2(end.x - start.x, end.z - start.z).normalize();
        const normal = new THREE.Vector2(-direction.y, direction.x);
        const length = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.z - start.z, 2));

        // Create outer barriers
        const barrierGeometry = new THREE.BoxGeometry(length, BARRIER_HEIGHT, 5);
        const leftBarrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
        const rightBarrier = new THREE.Mesh(barrierGeometry.clone(), barrierMaterial);

        // Position barriers
        const angle = Math.atan2(direction.y, direction.x);
        const midX = (start.x + end.x) / 2;
        const midZ = (start.z + end.z) / 2;

        leftBarrier.position.set(
            midX + normal.x * TRACK_WIDTH/2,
            BARRIER_HEIGHT/2,
            midZ + normal.y * TRACK_WIDTH/2
        );
        rightBarrier.position.set(
            midX - normal.x * TRACK_WIDTH/2,
            BARRIER_HEIGHT/2,
            midZ - normal.y * TRACK_WIDTH/2
        );

        leftBarrier.rotation.y = angle;
        rightBarrier.rotation.y = angle;

        scene.add(leftBarrier);
        scene.add(rightBarrier);
        trackBarriers.push(leftBarrier, rightBarrier);
    }

    // Create checkpoints
    const checkpointMaterial = new THREE.MeshPhongMaterial({
        color: 0xff3366,
        transparent: true,
        opacity: 0.3
    });

    for (let i = 0; i < trackPath.length; i++) {
        const start = trackPath[i];
        const end = trackPath[(i + 1) % trackPath.length];
        const direction = new THREE.Vector2(end.x - start.x, end.z - start.z).normalize();
        const midX = (start.x + end.x) / 2;
        const midZ = (start.z + end.z) / 2;

        const checkpointGeometry = new THREE.BoxGeometry(5, BARRIER_HEIGHT * 1.5, TRACK_WIDTH);
        const checkpoint = new THREE.Mesh(checkpointGeometry, checkpointMaterial);
        
        checkpoint.position.set(midX, BARRIER_HEIGHT/2, midZ);
        checkpoint.rotation.y = Math.atan2(direction.y, direction.x);
        
        scene.add(checkpoint);
        checkpoints.push(checkpoint);
    }

    // Add ramps at specific points
    addRamps(trackPath);
}

// Add ramps to the track
function addRamps(trackPath) {
    const rampMaterial = new THREE.MeshPhongMaterial({
        color: 0x3366ff,
        emissive: 0x3366ff,
        emissiveIntensity: 0.3
    });

    // Add ramps at specific track segments
    const rampPositions = [2, 5]; // Indices of track segments to add ramps
    
    rampPositions.forEach(index => {
        const start = trackPath[index];
        const end = trackPath[(index + 1) % trackPath.length];
        const midX = (start.x + end.x) / 2;
        const midZ = (start.z + end.z) / 2;

        const rampGeometry = new THREE.BoxGeometry(80, 40, TRACK_WIDTH * 0.8);
        const ramp = new THREE.Mesh(rampGeometry, rampMaterial);
        
        ramp.position.set(midX, 20, midZ);
        ramp.rotation.x = -Math.PI / 8; // Angle the ramp up
        
        scene.add(ramp);
    });
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

    // Add wake effect when moving
    if (Math.abs(speed) > 100) {
        water.material.uniforms['distortionScale'].value = 
            WATER_DISTORTION_SCALE + (Math.abs(speed) / MAX_SPEED) * FOAM_FACTOR;
    } else {
        water.material.uniforms['distortionScale'].value = WATER_DISTORTION_SCALE;
    }

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

    // Check if passed through checkpoint
    const nextCheckpoint = checkpoints[currentCheckpoint];
    const checkpointPos = nextCheckpoint.position;
    const distanceToCheckpoint = new THREE.Vector2(
        playerBoat.position.x - checkpointPos.x,
        playerBoat.position.z - checkpointPos.z
    ).length();

    if (distanceToCheckpoint < TRACK_WIDTH/2) {
        currentCheckpoint = (currentCheckpoint + 1) % checkpoints.length;
        if (currentCheckpoint === 0) {
            lapCount++;
            console.log(`Lap ${lapCount} completed!`);
        }
    }
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
    
    // Update water
    water.material.uniforms['time'].value += delta * WAVE_SPEED;
    
    // Make waves higher in the direction of boat movement
    if (Math.abs(speed) > 100) {
        const boatDir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), playerBoat.rotation.y);
        water.material.uniforms['distortionScale'].value += 
            Math.abs(speed) / MAX_SPEED * boatDir.z * FOAM_FACTOR;
    }
    
    update();
    renderer.render(scene, camera);
}

// Start the game
init();
animate(); 