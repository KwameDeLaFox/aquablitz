// Log that the game.js file is loaded
console.log('Aqua Blitz game.js loaded at', new Date().toISOString());

import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Constants for game physics
const ACCELERATION = 500; // Adjusted for better control
const MAX_SPEED = 500; // Balanced top speed
const TURN_SPEED = 1.8; // Adjusted for better turning
const DRIFT_FACTOR = 1.3; // Adjusted drift
const DRAG_COEFFICIENT = 0.98; // Drag for smooth deceleration
const NITRO_MULTIPLIER = 1.5; // Boost multiplier
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

// Projectile system variables
let projectiles = []; // Array to store active projectiles
const PROJECTILE_SPEED = 300; // Speed of projectiles
const PROJECTILE_LIFETIME = 3; // Seconds before projectile is removed
const PROJECTILE_COOLDOWN = 0.5; // Seconds between shots
let lastShotTime = 0; // Time of the last shot

// Multiplayer
const socket = io({
    transports: ['websocket'],
    path: '/socket.io'
});
const otherPlayers = new Map();

// Game keys mapping
const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    drift: false,
    powerUp: false
};

// Setup keyboard listeners at the top level
function setupKeyboardListeners() {
    document.addEventListener('keydown', function(event) {
        handleKeyDown(event);
    });
    
    document.addEventListener('keyup', function(event) {
        handleKeyUp(event);
    });
    
    console.log('Keyboard listeners set up');
}

// Handle keydown events
function handleKeyDown(event) {
    console.log('Key down:', event.code);
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
            break;
        case 'Space':
            keys.powerUp = true;
            usePowerUp();
            break;
        case 'KeyF': // Add shooting with F key
            fireProjectile();
            break;
    }
}

// Handle keyup events
function handleKeyUp(event) {
    console.log('Key up:', event.code);
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
            break;
        case 'Space':
            keys.powerUp = false;
            break;
    }
}

// Initialize the game when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing game...');
    setupKeyboardListeners();
    init();
});

// Initialize Three.js scene
function init() {
    try {
        console.log('Initializing scene...');
        
        // Create scene with brighter sky
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xaaccff); // Even lighter blue sky
        scene.fog = new THREE.FogExp2(0xaaccff, 0.0002); // Less dense fog
        
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
        
        // Define track boundary - helpful for debugging
        const trackBounds = new THREE.Box3(
            new THREE.Vector3(-raceCourseWidth/2, WATER_LEVEL, -trackLength/2),
            new THREE.Vector3(raceCourseWidth/2, WATER_LEVEL + 50, trackLength/2)
        );
        
        // Create transparent track area marker for better visibility without affecting visuals
        const trackAreaGeometry = new THREE.BoxGeometry(raceCourseWidth, 0.1, trackLength);
        const trackAreaMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xffffff, 
            transparent: true, 
            opacity: 0.05,
            depthWrite: false // Important to prevent z-fighting
        });
        
        const trackArea = new THREE.Mesh(trackAreaGeometry, trackAreaMaterial);
        trackArea.position.set(0, WATER_LEVEL + 0.1, 0); // Slightly above water
        scene.add(trackArea);
        trackElements.push(trackArea);
        
        // Create buoys to mark race course - using basic materials to avoid rendering issues
        const buoyCount = 30;
        const buoySpacing = trackLength / buoyCount;
        
        for (let i = 0; i < buoyCount; i++) {
            const z = buoySpacing * i - trackLength/2 + buoySpacing/2;
            
            // Left buoys (red)
            createBuoy(-raceCourseWidth/2, z, 0xff3333);
            
            // Right buoys (green)
            createBuoy(raceCourseWidth/2, z, 0x33ff33);
        }
        
        // Create start/finish line
        createStartFinishLine(-trackLength/2 + 100, raceCourseWidth);
        
        // Create checkpoints with basic materials
        const checkpointCount = 8;
        const checkpointSpacing = trackLength / checkpointCount;
        
        for (let i = 1; i < checkpointCount; i++) {
            createSimpleCheckpoint(0, checkpointSpacing * i - trackLength/2, raceCourseWidth);
        }
        
        // Add some islands for scenery (like VibeSail)
        // Keep islands away from the race course to prevent rendering issues
        for (let i = 0; i < 5; i++) {
            // Place islands far from track to avoid interference
            const xOffset = (Math.random() > 0.5 ? 1 : -1) * (raceCourseWidth + 200 + Math.random() * 1000);
            const zPos = (Math.random() - 0.5) * trackLength;
            createIsland(xOffset, zPos);
        }
        
        // Add subtle ambient light to track area instead of point lights
        const trackLight = new THREE.AmbientLight(0xffffff, 0.3);
        scene.add(trackLight);
        trackElements.push(trackLight);
        
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

// Create a simplified buoy inspired by VibeSail - using basic materials
function createBuoy(x, z, color) {
    // Use simple geometry and basic material for better performance
    const buoyGeometry = new THREE.CylinderGeometry(3, 3, 6, 8);
    const buoyMaterial = new THREE.MeshBasicMaterial({
        color: color
    });
    
    const buoy = new THREE.Mesh(buoyGeometry, buoyMaterial);
    buoy.position.set(x, WATER_LEVEL + 3, z);
    scene.add(buoy);
    trackElements.push(buoy);
    barriers.push(buoy);
    
    // Add simple pole
    const poleGeometry = new THREE.CylinderGeometry(0.5, 0.5, 10, 8);
    const poleMaterial = new THREE.MeshBasicMaterial({
        color: 0xdddddd
    });
    
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.set(x, WATER_LEVEL + 11, z);
    scene.add(pole);
    trackElements.push(pole);
    
    // Use simpler light with limited radius
    const pointLight = new THREE.PointLight(color, 0.3, 30);
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

// Update camera position to follow the boat while ensuring camera stays above water
function updateCameraPosition() {
    if (playerBoat) {
        // Position camera behind boat, looking ahead
        const distance = 150;
        const minHeight = 50; // Minimum camera height to prevent underwater view
        
        // Calculate ideal camera position - behind and above the boat
        const idealPosition = new THREE.Vector3(
            playerBoat.position.x,
            Math.max(playerBoat.position.y + minHeight, WATER_LEVEL + minHeight), // Ensure camera stays well above water
            playerBoat.position.z - distance
        );
        
        // Smoothly move camera towards ideal position
        camera.position.lerp(idealPosition, 0.1);
        
        // Calculate a look-at point ahead of the boat
        const lookAtVector = new THREE.Vector3(0, 0, 200);
        lookAtVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerBoat.rotation.y);
        const lookAtPoint = new THREE.Vector3(
            playerBoat.position.x + lookAtVector.x,
            playerBoat.position.y + 10,
            playerBoat.position.z + lookAtVector.z
        );
        
        // Create a new vector to gradually adjust camera's look-at point
        if (!camera.userData.lookAtPoint) {
            camera.userData.lookAtPoint = lookAtPoint.clone();
        } else {
            camera.userData.lookAtPoint.lerp(lookAtPoint, 0.1);
        }
        
        // Look at the interpolated point
        camera.lookAt(camera.userData.lookAtPoint);
        
        // Update orbit controls if enabled
        if (controls && controls.enabled) {
            controls.target.copy(playerBoat.position);
            controls.update();
        }
        
        // Ensure camera is never underwater
        if (camera.position.y < WATER_LEVEL + 20) {
            camera.position.y = WATER_LEVEL + 20;
        }
    }
}

// Handle window resizing
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Update function for game logic
function update(deltaTime) {
    try {
        // Process keyboard input for boat movement
        processBoatMovement(deltaTime);
        
        // Update projectiles
        updateProjectiles(deltaTime);
        
        // Apply water height to boat
        const time = performance.now() * 0.001;
        const waveHeight = Math.sin(time * 0.5 + playerBoat.position.x * 0.01) * 0.5 + 
                          Math.sin(time * 1.0 + playerBoat.position.z * 0.01) * 0.5;
        playerBoat.position.y = WATER_LEVEL + 5 + waveHeight;
        
        // Make the boat pitch based on speed and turn amount
        const pitchAmount = velocity.z * 0.0001;
        const rollAmount = velocity.x * 0.0005;
        playerBoat.rotation.x = Math.max(-0.1, Math.min(0.1, -pitchAmount));
        playerBoat.rotation.z = Math.max(-0.2, Math.min(0.2, -rollAmount));
        
        // Update camera to follow player
        updateCameraPosition();
        
        // Update speed display
        const speed = velocity.length();
        document.getElementById('speed-meter').textContent = `${Math.round(speed)} KPH`;
        
        // Check for checkpoint collisions
        checkpoints.forEach(checkpoint => {
            if (checkpoint.object.material) {
                const distance = playerBoat.position.distanceTo(checkpoint.position);
                if (distance < 50) {
                    if (!checkpoint.passed) {
                        checkpoint.passed = true;
                        console.log('Checkpoint passed!');
                        
                        // Visual feedback
                        if (checkpoint.object.material) {
                            checkpoint.object.material.emissive = new THREE.Color(0xffff00);
                            checkpoint.object.material.emissiveIntensity = 0.5;
                        }
                    }
                }
            }
        });
        
        // Check for buoy collisions (simplified)
        barriers.forEach(barrier => {
            if (barrier && barrier.position) {
                const distance = playerBoat.position.distanceTo(barrier.position);
                if (distance < 20) {
                    // Collision response - bounce back slightly
                    const direction = new THREE.Vector3();
                    direction.subVectors(playerBoat.position, barrier.position).normalize();
                    velocity.add(direction.multiplyScalar(100));
                }
            }
        });
    } catch (error) {
        console.error('Error in update function:', error, error.stack);
    }
}

// Process boat movement based on keyboard input
function processBoatMovement(deltaTime) {
    // Acceleration based on input
    acceleration.set(0, 0, 0);
    
    if (keys.forward) {
        // Forward acceleration in the direction the boat is facing
        const forwardAccel = new THREE.Vector3(0, 0, ACCELERATION * deltaTime);
        forwardAccel.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerBoat.rotation.y);
        acceleration.add(forwardAccel);
        console.log('Accelerating forward');
    }
    
    if (keys.backward) {
        // Backward acceleration (braking) in the opposite direction
        const backwardAccel = new THREE.Vector3(0, 0, -ACCELERATION * 0.5 * deltaTime);
        backwardAccel.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerBoat.rotation.y);
        acceleration.add(backwardAccel);
        console.log('Braking/reversing');
    }
    
    // Apply drag (more when not accelerating)
    const dragFactor = (keys.forward || keys.backward) ? DRAG_COEFFICIENT : 0.95;
    velocity.multiplyScalar(dragFactor);
    
    // Add acceleration to velocity
    velocity.add(acceleration);
    
    // Limit maximum speed
    const currentSpeed = velocity.length();
    if (currentSpeed > MAX_SPEED) {
        velocity.multiplyScalar(MAX_SPEED / currentSpeed);
    }
    
    // Handle turning
    if (keys.left) {
        // Turn left (positive rotation around Y axis)
        const turnAmount = TURN_SPEED * deltaTime * (keys.drift ? DRIFT_FACTOR : 1);
        playerBoat.rotation.y += turnAmount;
        console.log('Turning left');
        
        // Add a slight sideways velocity component when turning
        const sideForce = new THREE.Vector3(turnAmount * 100, 0, 0);
        sideForce.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerBoat.rotation.y);
        velocity.add(sideForce);
    }
    
    if (keys.right) {
        // Turn right (negative rotation around Y axis)
        const turnAmount = TURN_SPEED * deltaTime * (keys.drift ? DRIFT_FACTOR : 1);
        playerBoat.rotation.y -= turnAmount;
        console.log('Turning right');
        
        // Add a slight sideways velocity component when turning
        const sideForce = new THREE.Vector3(-turnAmount * 100, 0, 0);
        sideForce.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerBoat.rotation.y);
        velocity.add(sideForce);
    }
    
    // Apply nitro boost if active
    if (isNitroActive) {
        const boostTime = (Date.now() - nitroStartTime) / 1000; // seconds
        if (boostTime < 3) { // 3 second boost
            // Apply boost in the direction the boat is facing
            const boostAccel = new THREE.Vector3(0, 0, ACCELERATION * NITRO_MULTIPLIER * deltaTime);
            boostAccel.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerBoat.rotation.y);
            velocity.add(boostAccel);
        } else {
            isNitroActive = false;
        }
    }
    
    // Update boat position based on velocity
    playerBoat.position.add(velocity.clone().multiplyScalar(deltaTime));
}

// Use power-up function
function usePowerUp() {
    console.log('Using power-up');
    
    // Activate nitro boost
    isNitroActive = true;
    nitroStartTime = Date.now();
    
    // Visual feedback
    document.getElementById('power-up').textContent = "NITRO BOOST!";
    
    // Reset after 3 seconds
    setTimeout(() => {
        document.getElementById('power-up').textContent = "NO POWER-UP";
    }, 3000);
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

// Make sure the water animation doesn't cause rendering issues
function updateWater(deltaTime) {
    if (water && water.material) {
        water.material.uniforms['time'].value += deltaTime * WAVE_SPEED;
        
        // Ensure water stays at WATER_LEVEL
        water.position.y = WATER_LEVEL;
        
        // Limit distortion to prevent visual glitches
        const maxDistortion = 5.0;
        water.material.uniforms['distortionScale'].value = 
            Math.min(WATER_DISTORTION_SCALE, maxDistortion);
    }
}

// Update animate function to include water update
function animate() {
    try {
        requestAnimationFrame(animate);
        
        // Calculate delta time for smooth movement
        deltaTime = clock.getDelta();
        
        // Update water with separate function
        updateWater(deltaTime);
        
        // Update game state
        if (gameStarted) {
            update(deltaTime);
            
            // Adjust fog density based on player position
            // Reduce fog when inside track area for better visibility
            if (scene && scene.fog && playerBoat) {
                const trackWidth = 300;
                const trackLength = 10000;
                
                // Check if player is in track bounds
                const isInTrackX = Math.abs(playerBoat.position.x) < trackWidth/2;
                const isInTrackZ = Math.abs(playerBoat.position.z) < trackLength/2;
                
                if (isInTrackX && isInTrackZ) {
                    // Inside track - reduce fog for better visibility
                    scene.fog.density = 0.0001;
                } else {
                    // Outside track - normal fog
                    scene.fog.density = 0.0002;
                }
                
                // Ensure fog color always matches sky color
                if (scene.background) {
                    scene.fog.color.copy(scene.background);
                }
            }
        }
        
        // Render scene with clear sky background
        renderer.render(scene, camera);
    } catch (error) {
        console.error('Error in animation loop:', error);
    }
}

// Start animation loop immediately (will wait for game start)
console.log('Starting animation loop...');
requestAnimationFrame(animate);

// Create a projectile from the boat
function fireProjectile() {
    // Check cooldown to prevent rapid firing
    const currentTime = Date.now() / 1000; // Current time in seconds
    if (currentTime - lastShotTime < PROJECTILE_COOLDOWN) {
        return; // Still in cooldown
    }
    
    // Update last shot time
    lastShotTime = currentTime;
    
    // Create projectile geometry and material
    const projectileGeometry = new THREE.SphereGeometry(3, 8, 8); // Small sphere
    const projectileMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff00ff, // Bright magenta color for visibility
        emissive: 0xff00ff,
        emissiveIntensity: 1.0
    });
    
    // Create projectile mesh
    const projectile = new THREE.Mesh(projectileGeometry, projectileMaterial);
    
    // Position projectile at the front of the boat
    // Calculate position in front of the boat based on boat's orientation
    const frontOffset = new THREE.Vector3(0, 0, 30); // 30 units in front of boat
    frontOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerBoat.rotation.y);
    
    projectile.position.set(
        playerBoat.position.x + frontOffset.x,
        playerBoat.position.y + 5, // Slightly above the boat
        playerBoat.position.z + frontOffset.z
    );
    
    // Set projectile's direction based on boat's orientation
    const direction = new THREE.Vector3(0, 0, 1); // Forward direction
    direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerBoat.rotation.y);
    
    // Add projectile to scene
    scene.add(projectile);
    
    // Add to projectiles array with metadata
    projectiles.push({
        object: projectile,
        direction: direction,
        creationTime: currentTime,
        hasCollided: false
    });
    
    // Add visual effect - light
    const projectileLight = new THREE.PointLight(0xff00ff, 1, 50);
    projectileLight.position.copy(projectile.position);
    scene.add(projectileLight);
    
    // Add light to projectile object for reference
    projectile.userData.light = projectileLight;
    
    // Add sound effect (if available)
    // playSound('shoot');
    
    console.log('Projectile fired!', projectiles.length, 'active projectiles');
}

// Update projectiles in the game loop
function updateProjectiles(deltaTime) {
    const currentTime = Date.now() / 1000; // Current time in seconds
    
    // Update each projectile
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const projectile = projectiles[i];
        
        // Move projectile forward in its direction
        projectile.object.position.x += projectile.direction.x * PROJECTILE_SPEED * deltaTime;
        projectile.object.position.z += projectile.direction.z * PROJECTILE_SPEED * deltaTime;
        
        // Make projectile bob slightly up and down for visual effect
        projectile.object.position.y = playerBoat.position.y + 5 + Math.sin(currentTime * 5) * 1;
        
        // Update projectile light position
        if (projectile.object.userData.light) {
            projectile.object.userData.light.position.copy(projectile.object.position);
        }
        
        // Check for projectile lifetime
        if (currentTime - projectile.creationTime > PROJECTILE_LIFETIME) {
            // Remove projectile
            scene.remove(projectile.object);
            // Remove light
            if (projectile.object.userData.light) {
                scene.remove(projectile.object.userData.light);
            }
            // Remove from array
            projectiles.splice(i, 1);
            continue;
        }
        
        // Check for collisions with barriers
        for (const barrier of barriers) {
            if (barrier && barrier.position && !projectile.hasCollided) {
                const distance = projectile.object.position.distanceTo(barrier.position);
                if (distance < 10) { // Collision threshold
                    // Mark as collided
                    projectile.hasCollided = true;
                    
                    // Create explosion effect
                    createExplosion(projectile.object.position);
                    
                    // Remove projectile
                    scene.remove(projectile.object);
                    // Remove light
                    if (projectile.object.userData.light) {
                        scene.remove(projectile.object.userData.light);
                    }
                    // Remove from array
                    projectiles.splice(i, 1);
                    break;
                }
            }
        }
    }
}

// Create an explosion effect at the given position
function createExplosion(position) {
    // Create particle system for explosion
    const explosionGeometry = new THREE.SphereGeometry(1, 4, 4);
    const explosionMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff5500, 
        transparent: true,
        opacity: 0.8
    });
    
    // Create explosion mesh
    const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
    explosion.position.copy(position);
    scene.add(explosion);
    
    // Add light
    const explosionLight = new THREE.PointLight(0xff5500, 2, 50);
    explosionLight.position.copy(position);
    scene.add(explosionLight);
    
    // Animate explosion
    const startTime = Date.now();
    const expandAndFade = function() {
        const elapsedTime = (Date.now() - startTime) / 1000; // seconds
        
        if (elapsedTime > 0.5) {
            // Remove explosion after 0.5 seconds
            scene.remove(explosion);
            scene.remove(explosionLight);
            return;
        }
        
        // Scale up explosion
        const scale = 1 + elapsedTime * 10;
        explosion.scale.set(scale, scale, scale);
        
        // Fade out explosion
        explosion.material.opacity = 0.8 * (1 - elapsedTime * 2);
        explosionLight.intensity = 2 * (1 - elapsedTime * 2);
        
        // Continue animation
        requestAnimationFrame(expandAndFade);
    };
    
    // Start animation
    expandAndFade();
} 