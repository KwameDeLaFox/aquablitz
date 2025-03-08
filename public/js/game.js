// Log that the game.js file is loaded
console.log('Aqua Blitz game.js loaded at', new Date().toISOString());

import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Constants for game physics
const ACCELERATION = 1000; // Reduced for more comfortable acceleration
const MAX_SPEED = 800; // Reduced top speed
const TURN_SPEED = 2.5; // Reduced for more comfortable turning
const DRIFT_FACTOR = 1.5; // Reduced drift
const DRAG_COEFFICIENT = 0.98; // Same drag for smooth movement
const NITRO_MULTIPLIER = 1.8; // Reduced boost
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

// Game variables
let scene, camera, renderer, controls, water, playerBoat;
let velocity = new THREE.Vector3();
let acceleration = new THREE.Vector3();
let gameStarted = false;
let startTime = 0;
let clock = new THREE.Clock();
let deltaTime = 0;
let isNitroActive = false;
let nitroStartTime = 0;
let pressedKeys = {};
let trackElements = [];
let barriers = [];
let checkpoints = [];
let boostPads = [];
let waterJets = [];
let hazards = [];
let trackLights = [];
let debugMode = true; // Enable debugging

// Multiplayer
const socket = io({
    transports: ['websocket'],
    path: '/socket.io'
});
const otherPlayers = new Map();

// Initialize the game when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing game...');
    init();
});

// Initialize Three.js scene
function init() {
    try {
        console.log('Initializing scene...');
        
        // Create scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x001133); // Dark blue sky like VibeSail
        scene.fog = new THREE.FogExp2(0x001133, 0.0005);
        
        // Create camera
        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 20000);
        camera.position.set(0, 100, -250);
        camera.lookAt(0, 0, 0);
        
        // Create renderer with antialiasing
        renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: false,
            powerPreference: "high-performance"
        });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.8;
        document.body.appendChild(renderer.domElement);
        
        console.log('Renderer created and added to DOM');
        
        // Create basic lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
        scene.add(ambientLight);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(500, 500, -500);
        dirLight.castShadow = true;
        scene.add(dirLight);
        
        console.log('Lighting created');
        
        // Create simple water
        const waterGeometry = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE);
        water = new Water(
            waterGeometry,
            {
                textureWidth: 1024,
                textureHeight: 1024,
                waterNormals: new THREE.TextureLoader().load('textures/waternormals.jpg', function (texture) {
                    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                    texture.repeat.set(10, 10); // More repeating pattern like VibeSail
                }),
                sunDirection: new THREE.Vector3(0.5, 0.5, 0),
                sunColor: 0xffffff,
                waterColor: 0x0066aa, // Brighter blue like VibeSail
                distortionScale: 3.5,
                fog: scene.fog !== undefined,
                alpha: 0.9
            }
        );
        water.rotation.x = -Math.PI / 2;
        water.position.y = WATER_LEVEL;
        scene.add(water);
        
        console.log('Water created');
        
        // Create sky
        const sky = new Sky();
        sky.scale.setScalar(10000);
        scene.add(sky);
        
        const skyUniforms = sky.material.uniforms;
        skyUniforms['turbidity'].value = 10;
        skyUniforms['rayleigh'].value = 2;
        skyUniforms['mieCoefficient'].value = 0.005;
        skyUniforms['mieDirectionalG'].value = 0.8;
        
        const parameters = {
            elevation: 15, // Higher sun elevation like VibeSail
            azimuth: 180
        };
        
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        
        function updateSun() {
            const phi = THREE.MathUtils.degToRad(90 - parameters.elevation);
            const theta = THREE.MathUtils.degToRad(parameters.azimuth);
            dirLight.position.setFromSphericalCoords(1000, phi, theta);
            sky.material.uniforms['sunPosition'].value.copy(dirLight.position);
            water.material.uniforms['sunDirection'].value.copy(dirLight.position).normalize();
            scene.environment = pmremGenerator.fromScene(sky).texture;
        }
        updateSun();
        
        console.log('Sky created');
        
        // Create player boat
        createPlayerBoat();
        console.log('Player boat created');
        
        // Create simple controls
        controls = new OrbitControls(camera, renderer.domElement);
        controls.maxPolarAngle = Math.PI * 0.495;
        controls.minDistance = 100;
        controls.maxDistance = 1000;
        controls.enabled = false; // Start with controls disabled
        
        // Create simplified track
        createSimplifiedTrack();
        console.log('Track created');
        
        // Event listeners
        window.addEventListener('resize', onWindowResize);
        
        document.addEventListener('keydown', function (event) {
            pressedKeys[event.code] = true;
        });
        
        document.addEventListener('keyup', function (event) {
            pressedKeys[event.code] = false;
        });
        
        // Add UI event listeners
        document.getElementById('start-btn').addEventListener('click', function () {
            document.getElementById('lobby').classList.add('hidden');
            // Enable controls after starting
            gameStarted = true;
            startTime = Date.now();
            resetPlayerPosition();
        });
        
        // Start animation loop
        console.log('Starting animation loop...');
        clock = new THREE.Clock();
        animate();
        
        // Add manual update button for testing
        addManualUpdateButton();
        
        console.log('Initialization complete');
    } catch (error) {
        console.error('Error during initialization:', error);
        document.body.innerHTML = `
            <div style="color: white; padding: 20px; font-family: Arial, sans-serif;">
                <h1>Error Initializing Game</h1>
                <p>${error.message}</p>
                <pre>${error.stack}</pre>
                <button onclick="location.reload()">Reload</button>
            </div>
        `;
    }
}

// Create player boat based on VibeSail style
function createPlayerBoat() {
    try {
        console.log('Creating player boat...');
        
        // Create boat hull
        const boatGeometry = new THREE.BoxGeometry(20, 10, 40);
        const boatMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xffffff, 
            metalness: 0.1,
            roughness: 0.5
        });
        playerBoat = new THREE.Mesh(boatGeometry, boatMaterial);
        playerBoat.position.set(0, WATER_LEVEL + 5, 0);
        scene.add(playerBoat);
        
        // Add sail (vertical part)
        const sailGeometry = new THREE.BoxGeometry(2, 30, 20);
        const sailMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x3366ff, 
            metalness: 0.1,
            roughness: 0.2
        });
        const sail = new THREE.Mesh(sailGeometry, sailMaterial);
        sail.position.set(0, 25, -5);
        playerBoat.add(sail);
        
        // Add boat details
        const cabinGeometry = new THREE.BoxGeometry(15, 8, 15);
        const cabinMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xdddddd,
            metalness: 0.2,
            roughness: 0.6
        });
        const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
        cabin.position.set(0, 10, 5);
        playerBoat.add(cabin);
        
        // Add wake effect
        const wakeGeometry = new THREE.PlaneGeometry(30, 100);
        const wakeMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        const wake = new THREE.Mesh(wakeGeometry, wakeMaterial);
        wake.rotation.x = Math.PI / 2;
        wake.position.set(0, -5, 30);
        playerBoat.add(wake);
        
        // Position player at start
        resetPlayerPosition();
        
        console.log('Player boat created successfully');
    } catch (error) {
        console.error('Error creating player boat:', error);
    }
}

// Create a simplified track inspired by VibeSail's minimalist style
function createSimplifiedTrack() {
    try {
        console.log('Creating simplified track...');
        
        // Clear any existing track elements
        if (trackElements) {
            trackElements.forEach(element => scene.remove(element));
        }
        
        trackElements = [];
        barriers = [];
        checkpoints = [];
        boostPads = [];
        waterJets = [];
        hazards = [];
        trackLights = [];
        
        // Track parameters
        const trackLength = 10000;
        const raceCourseWidth = 300;
        
        // Create buoys to mark race course
        const buoyCount = 30;
        const buoySpacing = trackLength / buoyCount;
        
        // Create buoys on both sides
        for (let i = 0; i < buoyCount; i++) {
            const z = buoySpacing * i - trackLength/2 + buoySpacing/2;
            
            // Left buoys (red)
            createBuoy(-raceCourseWidth/2, z, 0xff3333);
            
            // Right buoys (green)
            createBuoy(raceCourseWidth/2, z, 0x33ff33);
        }
        
        // Create start/finish line
        createStartFinishLine(-trackLength/2 + 100, raceCourseWidth);
        
        // Create checkpoints
        const checkpointCount = 8;
        const checkpointSpacing = trackLength / checkpointCount;
        
        for (let i = 1; i < checkpointCount; i++) {
            createSimpleCheckpoint(0, checkpointSpacing * i - trackLength/2, raceCourseWidth);
        }
        
        // Add some islands for scenery (like VibeSail)
        for (let i = 0; i < 5; i++) {
            const xPos = (Math.random() - 0.5) * 2000;
            const zPos = (Math.random() - 0.5) * trackLength;
            createIsland(xPos, zPos);
        }
        
        // Add subtle directional light markers
        for (let i = 0; i < 10; i++) {
            const z = (trackLength / 10) * i - trackLength/2;
            const dirMarker = new THREE.PointLight(0x3388ff, 0.5, 1000);
            dirMarker.position.set(0, 50, z);
            scene.add(dirMarker);
            trackElements.push(dirMarker);
            trackLights.push(dirMarker);
        }
        
        // Set player position
        resetPlayerPosition();
        
        console.log('Track created with:', {
            "Elements": trackElements.length,
            "Buoys": barriers.length,
            "Checkpoints": checkpoints.length
        });
    } catch (error) {
        console.error('Error creating track:', error);
    }
}

// Create a simplified buoy inspired by VibeSail
function createBuoy(x, z, color) {
    const buoyGeometry = new THREE.CylinderGeometry(3, 3, 6, 8);
    const buoyMaterial = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.7,
        metalness: 0.2,
        emissive: color,
        emissiveIntensity: 0.3
    });
    
    const buoy = new THREE.Mesh(buoyGeometry, buoyMaterial);
    buoy.position.set(x, WATER_LEVEL + 3, z);
    scene.add(buoy);
    trackElements.push(buoy);
    barriers.push(buoy);
    
    // Add simple pole
    const poleGeometry = new THREE.CylinderGeometry(0.5, 0.5, 10, 8);
    const poleMaterial = new THREE.MeshStandardMaterial({
        color: 0xdddddd,
        roughness: 0.5
    });
    
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.set(x, WATER_LEVEL + 11, z);
    scene.add(pole);
    trackElements.push(pole);
    
    // Add light on top
    const pointLight = new THREE.PointLight(color, 0.5, 50);
    pointLight.position.set(x, WATER_LEVEL + 16, z);
    scene.add(pointLight);
    trackElements.push(pointLight);
    trackLights.push(pointLight);
}

// Create start/finish line
function createStartFinishLine(z, width) {
    // Create flags
    const flagHeight = 40;
    
    // Left flag
    const leftFlagGeometry = new THREE.CylinderGeometry(1, 1, flagHeight, 8);
    const flagMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.5
    });
    
    const leftFlag = new THREE.Mesh(leftFlagGeometry, flagMaterial);
    leftFlag.position.set(-width/2 - 10, WATER_LEVEL + flagHeight/2, z);
    scene.add(leftFlag);
    trackElements.push(leftFlag);
    
    // Right flag
    const rightFlag = new THREE.Mesh(leftFlagGeometry, flagMaterial);
    rightFlag.position.set(width/2 + 10, WATER_LEVEL + flagHeight/2, z);
    scene.add(rightFlag);
    trackElements.push(rightFlag);
    
    // Banner
    const bannerGeometry = new THREE.BoxGeometry(width + 30, 10, 2);
    const bannerMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.5,
        emissive: 0x333333,
        emissiveIntensity: 0.2
    });
    
    const banner = new THREE.Mesh(bannerGeometry, bannerMaterial);
    banner.position.set(0, WATER_LEVEL + flagHeight, z);
    scene.add(banner);
    trackElements.push(banner);
    
    // Add as a checkpoint
    checkpoints.push({
        object: banner,
        position: new THREE.Vector3(0, WATER_LEVEL, z),
        passed: false
    });
    
    // Add light
    const light = new THREE.PointLight(0xffffff, 1, 100);
    light.position.set(0, WATER_LEVEL + flagHeight, z);
    scene.add(light);
    trackElements.push(light);
    trackLights.push(light);
}

// Create simplified checkpoint
function createSimpleCheckpoint(x, z, width) {
    // Just create two vertical poles with a light connecting them
    const poleHeight = 25;
    const poleGeometry = new THREE.CylinderGeometry(1, 1, poleHeight, 8);
    const poleMaterial = new THREE.MeshStandardMaterial({
        color: 0xffcc00,
        roughness: 0.5
    });
    
    // Left pole
    const leftPole = new THREE.Mesh(poleGeometry, poleMaterial);
    leftPole.position.set(x - width/2, WATER_LEVEL + poleHeight/2, z);
    scene.add(leftPole);
    trackElements.push(leftPole);
    
    // Right pole
    const rightPole = new THREE.Mesh(poleGeometry, poleMaterial);
    rightPole.position.set(x + width/2, WATER_LEVEL + poleHeight/2, z);
    scene.add(rightPole);
    trackElements.push(rightPole);
    
    // Checkpoint indicator (invisible plane)
    const checkpointGeometry = new THREE.PlaneGeometry(width, 30);
    const checkpointMaterial = new THREE.MeshBasicMaterial({
        color: 0xffcc00,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide
    });
    
    const checkpoint = new THREE.Mesh(checkpointGeometry, checkpointMaterial);
    checkpoint.rotation.x = Math.PI / 2;
    checkpoint.position.set(x, WATER_LEVEL + 15, z);
    scene.add(checkpoint);
    trackElements.push(checkpoint);
    
    // Add to checkpoints array
    checkpoints.push({
        object: checkpoint,
        position: new THREE.Vector3(x, WATER_LEVEL, z),
        passed: false
    });
    
    // Add light
    const light = new THREE.PointLight(0xffcc00, 0.8, 100);
    light.position.set(x, WATER_LEVEL + poleHeight, z);
    scene.add(light);
    trackElements.push(light);
    trackLights.push(light);
}

// Create island for scenery (inspired by VibeSail's minimal islands)
function createIsland(x, z) {
    // Base island
    const islandGeometry = new THREE.CylinderGeometry(Math.random() * 100 + 50, Math.random() * 150 + 100, 20, 16);
    const islandMaterial = new THREE.MeshStandardMaterial({
        color: 0xddddbb,
        roughness: 0.9
    });
    
    const island = new THREE.Mesh(islandGeometry, islandMaterial);
    island.position.set(x, WATER_LEVEL - 5, z);
    scene.add(island);
    trackElements.push(island);
    
    // Add some vegetation
    if (Math.random() > 0.5) {
        const treeCount = Math.floor(Math.random() * 5) + 1;
        
        for (let i = 0; i < treeCount; i++) {
            const treeAngle = Math.random() * Math.PI * 2;
            const treeDistance = Math.random() * 50;
            const treeX = x + Math.cos(treeAngle) * treeDistance;
            const treeZ = z + Math.sin(treeAngle) * treeDistance;
            
            createTree(treeX, treeZ);
        }
    }
}

// Create simple tree
function createTree(x, z) {
    const trunkGeometry = new THREE.CylinderGeometry(2, 3, 30, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({
        color: 0x885533,
        roughness: 0.8
    });
    
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.set(x, WATER_LEVEL + 15, z);
    scene.add(trunk);
    trackElements.push(trunk);
    
    const topGeometry = new THREE.ConeGeometry(10, 20, 8);
    const topMaterial = new THREE.MeshStandardMaterial({
        color: 0x227722,
        roughness: 0.8
    });
    
    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.position.set(x, WATER_LEVEL + 40, z);
    scene.add(top);
    trackElements.push(top);
}

function resetPlayerPosition() {
    if (playerBoat) {
        // Position at the start of the track
        playerBoat.position.set(0, WATER_LEVEL + 5, -4500);
        playerBoat.rotation.y = 0;
        
        // Reset physics
        velocity.set(0, 0, 0);
        acceleration.set(0, 0, 0);
        
        // Update camera
        updateCameraPosition();
    }
}

function updateCameraPosition() {
    if (playerBoat) {
        // Position camera behind boat, looking ahead
        const distance = 150;
        const height = 70;
        
        camera.position.set(
            playerBoat.position.x,
            playerBoat.position.y + height,
            playerBoat.position.z - distance
        );
        
        // Look at the boat with slight offset forward
        camera.lookAt(
            playerBoat.position.x,
            playerBoat.position.y + 10,
            playerBoat.position.z + 50
        );
        
        if (controls) {
            controls.target.copy(playerBoat.position);
            controls.update();
        }
    }
}

// Handle window resizing
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Keyboard controls
const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    drift: false,
    powerUp: false
};

// Set up keyboard event listeners
window.addEventListener('keydown', function(event) {
    console.log('Global keydown:', event.key);
    switch(event.key) {
        case 'w':
        case 'W':
        case 'ArrowUp':
            keys.forward = true;
            break;
        case 's':
        case 'S':
        case 'ArrowDown':
            keys.backward = true;
            break;
        case 'a':
        case 'A':
        case 'ArrowLeft':
            keys.left = true;
            break;
        case 'd':
        case 'D':
        case 'ArrowRight':
            keys.right = true;
            break;
        case 'Shift':
            keys.drift = true;
            break;
        case ' ':
            keys.powerUp = true;
            break;
    }
});

window.addEventListener('keyup', function(event) {
    console.log('Global keyup:', event.key);
    switch(event.key) {
        case 'w':
        case 'W':
        case 'ArrowUp':
            keys.forward = false;
            break;
        case 's':
        case 'S':
        case 'ArrowDown':
            keys.backward = false;
            break;
        case 'a':
        case 'A':
        case 'ArrowLeft':
            keys.left = false;
            break;
        case 'd':
        case 'D':
        case 'ArrowRight':
            keys.right = false;
            break;
        case 'Shift':
            keys.drift = false;
            break;
        case ' ':
            keys.powerUp = false;
            break;
    }
});

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
function update(deltaTime) {
    try {
        // Process keyboard input
        processKeys(pressedKeys, document.getElementById('speed-meter'));
        
        // Apply physics
        playerBoat.position.add(velocity.clone().multiplyScalar(deltaTime));
        
        // Make the boat pitch based on speed and turn amount
        const pitchAmount = velocity.z * 0.0001;
        const rollAmount = velocity.x * 0.0005;
        playerBoat.rotation.x = Math.max(-0.1, Math.min(0.1, -pitchAmount));
        playerBoat.rotation.z = Math.max(-0.2, Math.min(0.2, -rollAmount));
        
        // Apply water height to boat
        const time = performance.now() * 0.001;
        const waveHeight = Math.sin(time * 0.5 + playerBoat.position.x * 0.01) * 0.5 + 
                          Math.sin(time * 1.0 + playerBoat.position.z * 0.01) * 0.5;
        playerBoat.position.y = WATER_LEVEL + 5 + waveHeight;
        
        // Update camera to follow player
        updateCameraPosition();
        
        // Check for checkpoint collisions
        checkpoints.forEach(checkpoint => {
            const distance = playerBoat.position.distanceTo(checkpoint.position);
            if (distance < 50) {
                if (!checkpoint.passed) {
                    checkpoint.passed = true;
                    console.log('Checkpoint passed!');
                    
                    // Visual feedback
                    checkpoint.object.material.emissive = new THREE.Color(0xffff00);
                    checkpoint.object.material.emissiveIntensity = 0.5;
                }
            }
        });
        
        // Check for buoy collisions (simplified)
        barriers.forEach(barrier => {
            const distance = playerBoat.position.distanceTo(barrier.position);
            if (distance < 20) {
                // Collision response - bounce back slightly
                const direction = new THREE.Vector3();
                direction.subVectors(playerBoat.position, barrier.position).normalize();
                velocity.add(direction.multiplyScalar(100));
            }
        });
    } catch (error) {
        console.error('Error in update function:', error);
    }
}

// Add a manual update button to the UI
function addManualUpdateButton() {
    const updateButton = document.createElement('button');
    updateButton.id = 'manual-update';
    updateButton.textContent = 'MANUAL UPDATE';
    updateButton.style.position = 'absolute';
    updateButton.style.top = '70px';
    updateButton.style.left = '10px';
    updateButton.style.zIndex = '1000';
    updateButton.style.padding = '5px';
    updateButton.style.backgroundColor = '#ff0000';
    updateButton.style.color = 'white';
    updateButton.style.border = 'none';
    updateButton.style.borderRadius = '5px';
    updateButton.style.cursor = 'pointer';
    
    updateButton.addEventListener('click', function() {
        console.log('Manual update button clicked');
        
        // Force boat to move forward
        if (playerBoat) {
            // Gradually increase speed
            speed = Math.min(speed + 50, 300); // Reduced max speed
            const forwardVector = new THREE.Vector3(0, 0, 1);
            forwardVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerBoat.rotation.y);
            forwardVector.multiplyScalar(3); // Reduced movement increment
            playerBoat.position.add(forwardVector);
            
            // Update HUD
            const speedMeter = document.getElementById('speed-meter');
            speedMeter.textContent = `MANUAL: ${Math.round(speed)} KPH`;
            speedMeter.style.color = 'purple';
            
            console.log('Manually moved boat to:', playerBoat.position);
        }
    });
    
    document.body.appendChild(updateButton);
}

// Call this after DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    addManualUpdateButton();
});

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
    try {
        requestAnimationFrame(animate);
        
        // Calculate delta time for smooth movement
        deltaTime = clock.getDelta();
        
        // Update water
        water.material.uniforms['time'].value += deltaTime * WAVE_SPEED;
        
        // Update game state
        if (gameStarted) {
            update(deltaTime);
        }
        
        // Render scene
        renderer.render(scene, camera);
    } catch (error) {
        console.error('Error in animation loop:', error);
    }
}

// Start animation loop immediately (will wait for game start)
console.log('Starting animation loop...');
requestAnimationFrame(animate); 