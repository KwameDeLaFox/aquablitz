import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';

// Constants for game physics
const ACCELERATION = 2000; // Increased for more responsive acceleration
const MAX_SPEED = 1500; // Increased top speed
const TURN_SPEED = 3.5; // Increased for tighter turns
const DRIFT_FACTOR = 2.0; // More pronounced drift
const DRAG_COEFFICIENT = 0.98; // Less drag for smoother movement
const NITRO_MULTIPLIER = 2.0; // Bigger boost
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
const TRACK_CONSTANTS = {
    WIDTH: 200,
    BARRIER_HEIGHT: 40,
    RAMP_HEIGHT: 60,
    BOOST_PAD_LENGTH: 100,
    WATER_JET_FORCE: 2000
};

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
let isGameStarted = false;

// Track state
let trackPoints = [];
let trackBarriers = [];
let checkpoints = [];
let currentCheckpoint = 0;
let lapCount = 0;

// Track state additions
let boostPads = [];
let waterJets = [];
let hazards = [];
let trackLights = [];

// Multiplayer
const socket = io({
    transports: ['websocket'],
    path: '/socket.io'
});
const otherPlayers = new Map();

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
    // Set up start button listener
    const startBtn = document.getElementById('start-btn');
    const lobby = document.getElementById('lobby');
    
    startBtn.addEventListener('click', () => {
        isGameStarted = true;
        lobby.classList.add('hidden');
        init();
        animate();
    });
});

// Initialize Three.js scene
function init() {
    try {
        // Create clock
        clock = new THREE.Clock();
        
        // Scene setup with error handling
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x001133);
        scene.fog = new THREE.Fog(0x001133, 1000, 4000);

        // Camera
        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 20000);
        camera.position.set(0, 100, -200);
        camera.lookAt(0, 0, 0);

        // Renderer
        renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true,
            powerPreference: "high-performance"
        });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.5;
        document.body.appendChild(renderer.domElement);

        // Basic lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(100, 100, 100);
        scene.add(directionalLight);

        // Add temporary ground plane for visibility
        const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
        const groundMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x006622,
            roughness: 0.8,
            metalness: 0.2
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        scene.add(ground);

        // Add temporary player boat
        const boatGeometry = new THREE.BoxGeometry(20, 10, 40);
        const boatMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff88 });
        playerBoat = new THREE.Mesh(boatGeometry, boatMaterial);
        playerBoat.position.y = 5;
        scene.add(playerBoat);

        // Add OrbitControls for debugging
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        
        // Handle window resize
        window.addEventListener('resize', onWindowResize, false);
        
        console.log('Three.js scene initialized successfully');
    } catch (error) {
        console.error('Error initializing Three.js scene:', error);
    }
}

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
    event.preventDefault(); // Prevent default browser actions
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

// Create the Neon Surge track
function createNeonLagoonTrack() {
    // Define a more exciting track path with tight turns and straights
    const trackPath = [
        { x: 0, z: 0 }, // Start line
        { x: 400, z: 100 }, // First gentle curve
        { x: 800, z: 400 }, // Lead into first tunnel
        { x: 1000, z: 800 }, // Sharp turn after tunnel
        { x: 600, z: 1200 }, // S-curve start
        { x: 200, z: 1000 }, // S-curve middle
        { x: -200, z: 1200 }, // S-curve end
        { x: -600, z: 800 }, // Approach to mega ramp
        { x: -400, z: 400 }, // Final stretch
        { x: -200, z: 200 } // Back to start
    ];

    trackPoints = trackPath;

    // Create the track base (glowing water channel)
    createWaterChannel(trackPath);
    
    // Add neon barriers with dynamic lighting
    createNeonBarriers(trackPath);
    
    // Add interactive elements
    addBoostPads(trackPath);
    addWaterJets(trackPath);
    addHazards(trackPath);
    
    // Add the mega ramp near the end
    createMegaRamp(trackPath[7], trackPath[8]); // Position between points 7 and 8
    
    // Add checkpoints with neon effects
    createCheckpoints(trackPath);
    
    // Add ambient lighting and effects
    createAmbientEffects(trackPath);
}

function createWaterChannel(trackPath) {
    // Create a glowing water channel effect
    const channelGeometry = new THREE.PlaneGeometry(TRACK_CONSTANTS.WIDTH, TRACK_CONSTANTS.WIDTH);
    const channelMaterial = new THREE.MeshPhongMaterial({
        color: 0x0044ff,
        emissive: 0x0033aa,
        transparent: true,
        opacity: 0.6
    });

    for (let i = 0; i < trackPath.length; i++) {
        const start = trackPath[i];
        const end = trackPath[(i + 1) % trackPath.length];
        const segment = new THREE.Mesh(channelGeometry, channelMaterial);
        
        // Position and rotate segment
        const direction = new THREE.Vector2(end.x - start.x, end.z - start.z);
        const length = direction.length();
        segment.scale.x = length / TRACK_CONSTANTS.WIDTH;
        
        segment.position.set(
            (start.x + end.x) / 2,
            WATER_LEVEL + 0.1,
            (start.z + end.z) / 2
        );
        
        segment.rotation.y = Math.atan2(direction.y, direction.x);
        segment.rotation.x = -Math.PI / 2;
        
        scene.add(segment);
    }
}

function createNeonBarriers(trackPath) {
    // Create glowing neon barriers with dynamic lighting
    const barrierMaterial = new THREE.MeshPhongMaterial({
        color: 0x00ff88,
        emissive: 0x00ff88,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.9
    });

    for (let i = 0; i < trackPath.length; i++) {
        const start = trackPath[i];
        const end = trackPath[(i + 1) % trackPath.length];
        
        // Calculate barrier positions
        const direction = new THREE.Vector2(end.x - start.x, end.z - start.z).normalize();
        const normal = new THREE.Vector2(-direction.y, direction.x);
        const length = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.z - start.z, 2));

        // Create barriers with neon trim
        const barrierGeometry = new THREE.BoxGeometry(length, TRACK_CONSTANTS.BARRIER_HEIGHT, 5);
        const leftBarrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
        const rightBarrier = new THREE.Mesh(barrierGeometry.clone(), barrierMaterial);

        // Add neon trim lights
        const trimLight = new THREE.PointLight(0x00ff88, 0.5, 50);
        trimLight.position.set(
            (start.x + end.x) / 2,
            TRACK_CONSTANTS.BARRIER_HEIGHT,
            (start.z + end.z) / 2
        );
        scene.add(trimLight);
        trackLights.push(trimLight);

        // Position barriers
        const angle = Math.atan2(direction.y, direction.x);
        const midX = (start.x + end.x) / 2;
        const midZ = (start.z + end.z) / 2;

        leftBarrier.position.set(
            midX + normal.x * TRACK_CONSTANTS.WIDTH/2,
            TRACK_CONSTANTS.BARRIER_HEIGHT/2,
            midZ + normal.y * TRACK_CONSTANTS.WIDTH/2
        );
        rightBarrier.position.set(
            midX - normal.x * TRACK_CONSTANTS.WIDTH/2,
            TRACK_CONSTANTS.BARRIER_HEIGHT/2,
            midZ - normal.y * TRACK_CONSTANTS.WIDTH/2
        );

        leftBarrier.rotation.y = angle;
        rightBarrier.rotation.y = angle;

        scene.add(leftBarrier);
        scene.add(rightBarrier);
        trackBarriers.push(leftBarrier, rightBarrier);
    }
}

function createMegaRamp(startPoint, endPoint) {
    // Create the mega ramp with dramatic lighting
    const rampMaterial = new THREE.MeshPhongMaterial({
        color: 0x3366ff,
        emissive: 0x3366ff,
        emissiveIntensity: 0.6,
        metalness: 0.7,
        roughness: 0.3
    });

    const rampGeometry = new THREE.BoxGeometry(TRACK_CONSTANTS.WIDTH * 0.8, TRACK_CONSTANTS.RAMP_HEIGHT, TRACK_CONSTANTS.WIDTH);
    const ramp = new THREE.Mesh(rampGeometry, rampMaterial);

    // Position the ramp
    const direction = new THREE.Vector2(
        endPoint.x - startPoint.x,
        endPoint.z - startPoint.z
    ).normalize();

    ramp.position.set(
        startPoint.x + direction.x * 100,
        TRACK_CONSTANTS.RAMP_HEIGHT/2,
        startPoint.z + direction.y * 100
    );

    // Angle the ramp for dramatic jumps
    ramp.rotation.x = -Math.PI / 6;
    ramp.rotation.y = Math.atan2(direction.y, direction.x);

    // Add dramatic lighting
    const rampLight1 = new THREE.SpotLight(0x3366ff, 2);
    rampLight1.position.set(
        ramp.position.x + 50,
        TRACK_CONSTANTS.RAMP_HEIGHT * 2,
        ramp.position.z
    );
    rampLight1.target = ramp;

    const rampLight2 = new THREE.SpotLight(0xff3366, 2);
    rampLight2.position.set(
        ramp.position.x - 50,
        TRACK_CONSTANTS.RAMP_HEIGHT * 2,
        ramp.position.z
    );
    rampLight2.target = ramp;

    scene.add(ramp);
    scene.add(rampLight1);
    scene.add(rampLight2);
    trackLights.push(rampLight1, rampLight2);
}

function addBoostPads(trackPath) {
    const boostGeometry = new THREE.PlaneGeometry(TRACK_CONSTANTS.BOOST_PAD_LENGTH, TRACK_CONSTANTS.WIDTH * 0.3);
    const boostMaterial = new THREE.MeshPhongMaterial({
        color: 0xff3366,
        emissive: 0xff3366,
        transparent: true,
        opacity: 0.7
    });

    // Add boost pads at strategic points
    [1, 3, 5, 7].forEach(index => {
        const point = trackPath[index];
        const nextPoint = trackPath[(index + 1) % trackPath.length];
        
        const boostPad = new THREE.Mesh(boostGeometry, boostMaterial);
        const direction = new THREE.Vector2(
            nextPoint.x - point.x,
            nextPoint.z - point.z
        ).normalize();

        boostPad.position.set(
            point.x + direction.x * 50,
            WATER_LEVEL + 0.2,
            point.z + direction.y * 50
        );
        boostPad.rotation.x = -Math.PI / 2;
        boostPad.rotation.y = Math.atan2(direction.y, direction.x);

        scene.add(boostPad);
        boostPads.push(boostPad);
    });
}

function addWaterJets(trackPath) {
    // Add water jets at tight turns
    [2, 4, 6].forEach(index => {
        const point = trackPath[index];
        const jetGeometry = new THREE.CylinderGeometry(2, 5, 20, 8);
        const jetMaterial = new THREE.MeshPhongMaterial({
            color: 0x0088ff,
            transparent: true,
            opacity: 0.6
        });

        const jet = new THREE.Mesh(jetGeometry, jetMaterial);
        jet.position.set(point.x, WATER_LEVEL, point.z);
        
        scene.add(jet);
        waterJets.push(jet);
    });
}

function addHazards(trackPath) {
    // Add floating hazards
    const hazardGeometry = new THREE.SphereGeometry(5, 8, 8);
    const hazardMaterial = new THREE.MeshPhongMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 0.5
    });

    [2, 5, 7].forEach(index => {
        const point = trackPath[index];
        const hazard = new THREE.Mesh(hazardGeometry, hazardMaterial);
        
        hazard.position.set(
            point.x + (Math.random() - 0.5) * TRACK_CONSTANTS.WIDTH * 0.5,
            WATER_LEVEL + 5,
            point.z + (Math.random() - 0.5) * TRACK_CONSTANTS.WIDTH * 0.5
        );
        
        scene.add(hazard);
        hazards.push(hazard);
    });
}

// Update game state
function update() {
    const delta = clock.getDelta();

    // More responsive boat physics
    if (keys.forward) {
        speed += ACCELERATION * delta;
    } else if (keys.backward) {
        speed -= ACCELERATION * delta * 0.7; // Slower reverse speed
    } else {
        // Natural deceleration when no input
        speed *= 0.95;
    }

    // Apply drag and speed limits
    speed *= DRAG_COEFFICIENT;
    speed = THREE.MathUtils.clamp(speed, -MAX_SPEED * 0.4, MAX_SPEED);

    // Sharper turning when moving
    const turnMultiplier = Math.abs(speed) / MAX_SPEED; // Turn better at higher speeds
    if (keys.left) {
        playerBoat.rotation.y += TURN_SPEED * (isDrifting ? DRIFT_FACTOR : 1) * delta * (turnMultiplier + 0.5);
    }
    if (keys.right) {
        playerBoat.rotation.y -= TURN_SPEED * (isDrifting ? DRIFT_FACTOR : 1) * delta * (turnMultiplier + 0.5);
    }

    // Update velocity and position with better physics
    velocity.set(0, 0, speed * delta);
    velocity.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerBoat.rotation.y);
    
    // Add slight banking when turning
    const bankAmount = (keys.left ? 1 : (keys.right ? -1 : 0)) * Math.abs(speed) / MAX_SPEED * 0.3;
    playerBoat.rotation.z = bankAmount;
    
    playerBoat.position.add(velocity);

    // Keep boat above water with bobbing effect
    const bobHeight = Math.sin(Date.now() * 0.003) * 0.5;
    playerBoat.position.y = Math.max(5 + bobHeight, playerBoat.position.y);

    // Camera follows boat more smoothly
    controls.target.lerp(playerBoat.position, 0.1);
    camera.position.lerp(
        new THREE.Vector3(
            playerBoat.position.x - Math.sin(playerBoat.rotation.y) * 200,
            100,
            playerBoat.position.z - Math.cos(playerBoat.rotation.y) * 200
        ),
        0.1
    );
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

    if (distanceToCheckpoint < TRACK_CONSTANTS.WIDTH/2) {
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
    const delta = clock.getDelta();
    
    // Animate water
    water.material.uniforms['time'].value += delta * WAVE_SPEED;
    
    // Animate boost pads
    boostPads.forEach(pad => {
        pad.material.emissiveIntensity = 0.5 + Math.sin(Date.now() * 0.005) * 0.3;
    });

    // Animate water jets
    waterJets.forEach(jet => {
        jet.scale.y = 1 + Math.sin(Date.now() * 0.003) * 0.3;
    });

    // Animate hazards
    hazards.forEach(hazard => {
        hazard.position.y = WATER_LEVEL + 5 + Math.sin(Date.now() * 0.002) * 2;
        hazard.rotation.y += delta;
    });

    // Animate neon lights
    trackLights.forEach(light => {
        light.intensity = 0.5 + Math.sin(Date.now() * 0.003) * 0.2;
    });
    
    update();
    renderer.render(scene, camera);
}

// Start the game
init();
animate(); 