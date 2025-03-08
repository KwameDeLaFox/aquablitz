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

// Enemy boat system variables
let enemyBoats = []; // Array to store enemy boats
const ENEMY_COUNT = 12; // Increased from 3 to 12 for open world
const ENEMY_SPEED = 120; // Base speed of enemy boats
const ENEMY_DETECTION_RANGE = 500; // Distance at which enemies detect the player
const ENEMY_ATTACK_RANGE = 300; // Distance at which enemies will attack the player
const ENEMY_TURN_SPEED = 1.0; // How fast enemies can turn
const ENEMY_HEALTH = 3; // Number of hits required to destroy an enemy boat
const WORLD_SIZE = 5000; // Half-width/length of the open world area

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
        
        // Create open world environment instead of track
        createOpenWorldEnvironment();
        console.log('Open world created');
        
        // Create enemy boats
        createEnemyBoats();
        console.log('Enemy boats created');
        
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
        
        // Add minimap
        createMinimap();
        
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

// Replace the track creation with open world environment
function createOpenWorldEnvironment() {
    try {
        console.log('Creating open world environment...');
        
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
        
        // Create ambient global lighting for open world
        const ambientWorldLight = new THREE.AmbientLight(0xffffff, 0.3);
        scene.add(ambientWorldLight);
        trackElements.push(ambientWorldLight);
        
        // Add directional light to simulate sun
        const sunLight = new THREE.DirectionalLight(0xffffcc, 1);
        sunLight.position.set(200, 500, 200);
        scene.add(sunLight);
        trackElements.push(sunLight);
        
        // Create scattered islands throughout the world
        const islandCount = 25; // More islands for open world
        for (let i = 0; i < islandCount; i++) {
            const islandX = (Math.random() - 0.5) * WORLD_SIZE * 2;
            const islandZ = (Math.random() - 0.5) * WORLD_SIZE * 2;
            createIsland(islandX, islandZ);
        }
        
        // Add some navigation buoys scattered around
        const buoyCount = 40;
        for (let i = 0; i < buoyCount; i++) {
            const buoyX = (Math.random() - 0.5) * WORLD_SIZE * 1.8;
            const buoyZ = (Math.random() - 0.5) * WORLD_SIZE * 1.8;
            
            // Alternate colors for variety
            const buoyColor = i % 2 === 0 ? 0xff3333 : 0x33ff33;
            createBuoy(buoyX, buoyZ, buoyColor);
        }
        
        // Create a "world boundary" visual indicator
        createWorldBoundary();
        
        // Set player position near center
        resetPlayerPosition();
        
        console.log('Open world created with:', {
            "Islands": islandCount,
            "Buoys": buoyCount,
            "World Size": WORLD_SIZE
        });
    } catch (error) {
        console.error('Error creating open world:', error);
    }
}

// Create a visual boundary for the world
function createWorldBoundary() {
    // Create a very large cylinder to mark the edge of the world
    const boundaryGeometry = new THREE.CylinderGeometry(WORLD_SIZE * 1.4, WORLD_SIZE * 1.4, 100, 64, 1, true);
    const boundaryMaterial = new THREE.MeshBasicMaterial({
        color: 0x0088ff,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide
    });
    
    const boundary = new THREE.Mesh(boundaryGeometry, boundaryMaterial);
    boundary.position.set(0, WATER_LEVEL + 50, 0);
    scene.add(boundary);
    trackElements.push(boundary);
    
    // Add some fog near the boundary
    scene.fog = new THREE.FogExp2(0xaaccff, 0.00008);
}

// Create more diverse and realistic islands
function createIsland(x, z) {
    // Randomly determine island size
    const islandSize = Math.random() * 150 + 50;
    const islandHeight = Math.random() * 60 + 20;
    
    // Create main island body
    const islandGeometry = new THREE.CylinderGeometry(
        islandSize * 0.7, // Top radius (smaller for sloped beach)
        islandSize,       // Bottom radius
        islandHeight,
        12,               // Segments
        3                 // Height segments
    );
    
    // Choose from a variety of island types
    let islandMaterial;
    const islandType = Math.floor(Math.random() * 3);
    
    if (islandType === 0) {
        // Sandy beach island
        islandMaterial = new THREE.MeshStandardMaterial({
            color: 0xddddbb,
            roughness: 0.9
        });
    } else if (islandType === 1) {
        // Rocky island
        islandMaterial = new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.7
        });
    } else {
        // Grassy island
        islandMaterial = new THREE.MeshStandardMaterial({
            color: 0x447755,
            roughness: 0.8
        });
    }
    
    const island = new THREE.Mesh(islandGeometry, islandMaterial);
    island.position.set(x, WATER_LEVEL - 5, z);
    scene.add(island);
    trackElements.push(island);
    barriers.push(island); // Add to barriers for collision
    
    // Add some vegetation or features based on island type
    const featureCount = Math.floor(Math.random() * 8) + 3;
    
    for (let i = 0; i < featureCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * islandSize * 0.6;
        const featureX = x + Math.cos(angle) * distance;
        const featureZ = z + Math.sin(angle) * distance;
        
        if (islandType === 0 || islandType === 2) {
            // Add trees to sandy or grassy islands
            createTree(featureX, featureZ);
        } else {
            // Add rocks to rocky islands
            createRock(featureX, featureZ);
        }
    }
    
    // Add a structure to some islands
    if (Math.random() > 0.7) {
        createIslandStructure(x, z, islandSize);
    }
}

// Create a rock formation
function createRock(x, z) {
    const rockSize = Math.random() * 10 + 5;
    const rockGeometry = new THREE.DodecahedronGeometry(rockSize, 1);
    const rockMaterial = new THREE.MeshStandardMaterial({
        color: 0x777777,
        roughness: 0.9
    });
    
    const rock = new THREE.Mesh(rockGeometry, rockMaterial);
    rock.position.set(x, WATER_LEVEL + rockSize/2, z);
    rock.rotation.x = Math.random() * Math.PI;
    rock.rotation.y = Math.random() * Math.PI;
    rock.rotation.z = Math.random() * Math.PI;
    scene.add(rock);
    trackElements.push(rock);
}

// Create structures on some islands
function createIslandStructure(x, z, islandSize) {
    const structureType = Math.floor(Math.random() * 3);
    
    if (structureType === 0) {
        // Lighthouse
        const towerHeight = 70;
        const towerRadius = 10;
        
        // Tower
        const towerGeometry = new THREE.CylinderGeometry(towerRadius-2, towerRadius, towerHeight, 16);
        const towerMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.7
        });
        
        const tower = new THREE.Mesh(towerGeometry, towerMaterial);
        tower.position.set(x, WATER_LEVEL + towerHeight/2 + 10, z);
        scene.add(tower);
        trackElements.push(tower);
        
        // Top lantern
        const lanternGeometry = new THREE.CylinderGeometry(towerRadius+2, towerRadius-2, 10, 16);
        const lanternMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.9
        });
        
        const lantern = new THREE.Mesh(lanternGeometry, lanternMaterial);
        lantern.position.set(x, WATER_LEVEL + towerHeight + 15, z);
        scene.add(lantern);
        trackElements.push(lantern);
        
        // Add light
        const beaconLight = new THREE.PointLight(0xff9900, 1, 300);
        beaconLight.position.set(x, WATER_LEVEL + towerHeight + 15, z);
        scene.add(beaconLight);
        trackElements.push(beaconLight);
        trackLights.push(beaconLight);
        
    } else if (structureType === 1) {
        // Dock/pier
        const pierLength = islandSize * 0.8;
        const pierWidth = 15;
        
        const pierGeometry = new THREE.BoxGeometry(pierWidth, 5, pierLength);
        const pierMaterial = new THREE.MeshStandardMaterial({
            color: 0x885533,
            roughness: 0.8
        });
        
        // Choose a random angle for the pier
        const angle = Math.random() * Math.PI * 2;
        const pierX = x + Math.cos(angle) * (islandSize * 0.4);
        const pierZ = z + Math.sin(angle) * (islandSize * 0.4);
        
        const pier = new THREE.Mesh(pierGeometry, pierMaterial);
        pier.position.set(pierX, WATER_LEVEL + 2.5, pierZ);
        pier.rotation.y = angle;
        scene.add(pier);
        trackElements.push(pier);
        
        // Add some posts
        const postCount = 6;
        for (let i = 0; i < postCount; i++) {
            const postGeometry = new THREE.CylinderGeometry(2, 2, 10, 8);
            const post = new THREE.Mesh(postGeometry, pierMaterial);
            
            const offset = (i / (postCount-1) - 0.5) * pierLength;
            const postX = pierX + Math.sin(angle) * offset;
            const postZ = pierZ - Math.cos(angle) * offset;
            
            post.position.set(postX, WATER_LEVEL + 5, postZ);
            scene.add(post);
            trackElements.push(post);
        }
        
    } else {
        // Small settlement
        const buildingCount = Math.floor(Math.random() * 3) + 2;
        
        for (let i = 0; i < buildingCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * islandSize * 0.5;
            const buildingX = x + Math.cos(angle) * distance;
            const buildingZ = z + Math.sin(angle) * distance;
            
            const buildingWidth = Math.random() * 15 + 20;
            const buildingDepth = Math.random() * 15 + 20;
            const buildingHeight = Math.random() * 10 + 15;
            
            // Main building
            const buildingGeometry = new THREE.BoxGeometry(buildingWidth, buildingHeight, buildingDepth);
            const buildingMaterial = new THREE.MeshStandardMaterial({
                color: Math.random() > 0.5 ? 0xdddddd : 0xddbbaa,
                roughness: 0.8
            });
            
            const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
            building.position.set(buildingX, WATER_LEVEL + buildingHeight/2 + 10, buildingZ);
            building.rotation.y = Math.random() * Math.PI;
            scene.add(building);
            trackElements.push(building);
            
            // Roof
            const roofGeometry = new THREE.ConeGeometry(Math.sqrt(buildingWidth*buildingWidth + buildingDepth*buildingDepth)/2, 10, 4);
            const roofMaterial = new THREE.MeshStandardMaterial({
                color: 0xaa3333,
                roughness: 0.8
            });
            
            const roof = new THREE.Mesh(roofGeometry, roofMaterial);
            roof.position.set(buildingX, WATER_LEVEL + buildingHeight + 15, buildingZ);
            roof.rotation.y = Math.random() * Math.PI / 2;
            scene.add(roof);
            trackElements.push(roof);
        }
    }
}

function resetPlayerPosition() {
    if (playerBoat) {
        // Position near the center of the world
        playerBoat.position.set(0, WATER_LEVEL + 5, 0);
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

// Update function for game logic - add world boundary checks
function update(deltaTime) {
    try {
        // Process keyboard input for boat movement
        processBoatMovement(deltaTime);
        
        // Update projectiles
        updateProjectiles(deltaTime);
        
        // Update enemy boats
        updateEnemyBoats(deltaTime);
        
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
        
        // Update minimap
        updateMinimap();
        
        // Apply world boundary limits - slow down near edges
        const distanceFromCenter = new THREE.Vector2(playerBoat.position.x, playerBoat.position.z).length();
        if (distanceFromCenter > WORLD_SIZE * 0.9) {
            // Apply resistance force proportional to how close to boundary
            const boundaryFactor = (distanceFromCenter - WORLD_SIZE * 0.9) / (WORLD_SIZE * 0.1);
            velocity.multiplyScalar(1 - boundaryFactor * 0.1);
            
            // Apply force pushing back towards center
            const pushBackDirection = new THREE.Vector3(-playerBoat.position.x, 0, -playerBoat.position.z).normalize();
            velocity.add(pushBackDirection.multiplyScalar(boundaryFactor * 10 * deltaTime));
            
            // Visual warning when near boundary
            if (distanceFromCenter > WORLD_SIZE * 0.95) {
                const minimap = document.getElementById('minimap');
                if (minimap) {
                    minimap.style.borderColor = '#ff0000';
                    minimap.style.boxShadow = '0 0 10px #ff0000';
                }
            } else {
                const minimap = document.getElementById('minimap');
                if (minimap) {
                    minimap.style.borderColor = 'white';
                    minimap.style.boxShadow = 'none';
                }
            }
        }
        
        // Update speed display
        const speed = velocity.length();
        document.getElementById('speed-meter').textContent = `${Math.round(speed)} KPH`;
        
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
        
        // Check for collisions with enemy boats
        enemyBoats.forEach(enemy => {
            if (!enemy.isDestroyed && enemy.boat) {
                const distance = playerBoat.position.distanceTo(enemy.boat.position);
                if (distance < 40) { // Collision threshold for boats
                    // Collision response - bounce away from each other
                    const direction = new THREE.Vector3();
                    direction.subVectors(playerBoat.position, enemy.boat.position).normalize();
                    velocity.add(direction.multiplyScalar(150)); // Strong bounce
                    
                    // Also damage the player (could be implemented later)
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
        let hasCollided = false;
        for (const barrier of barriers) {
            if (barrier && barrier.position && !projectile.hasCollided) {
                const distance = projectile.object.position.distanceTo(barrier.position);
                if (distance < 10) { // Collision threshold
                    // Mark as collided
                    projectile.hasCollided = true;
                    hasCollided = true;
                    
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
        
        // If already collided with barrier, skip enemy checks
        if (hasCollided) continue;
        
        // Check for collisions with enemy boats
        for (const enemy of enemyBoats) {
            if (!projectile.hasCollided && !enemy.isDestroyed && enemy.boat) {
                const distance = projectile.object.position.distanceTo(enemy.boat.position);
                if (distance < 25) { // Larger collision threshold for boats
                    // Mark as collided
                    projectile.hasCollided = true;
                    
                    // Create explosion effect
                    createExplosion(projectile.object.position);
                    
                    // Process hit on enemy
                    hitEnemyBoat(enemy, projectile);
                    
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

// Create enemy boats at different positions
function createEnemyBoats() {
    // Clear any existing enemy boats
    enemyBoats.forEach(enemy => {
        if (enemy.boat) {
            scene.remove(enemy.boat);
        }
    });
    enemyBoats = [];
    
    // Create enemy boats with different colors and positions
    const enemyColors = [0xff0000, 0x0000ff, 0xaa00aa, 0xff8800, 0x00aaaa, 0xffaa00]; // More variety
    
    for (let i = 0; i < ENEMY_COUNT; i++) {
        // Create enemy boat
        const boatGeometry = new THREE.BoxGeometry(20, 10, 40);
        const boatMaterial = new THREE.MeshStandardMaterial({ 
            color: enemyColors[i % enemyColors.length], 
            metalness: 0.2,
            roughness: 0.4,
            emissive: enemyColors[i % enemyColors.length], 
            emissiveIntensity: 0.3
        });
        
        const enemyBoat = new THREE.Mesh(boatGeometry, boatMaterial);
        
        // Distribute enemies throughout the world
        const spawnDistance = Math.random() * WORLD_SIZE * 0.8; // Within 80% of world boundary
        const spawnAngle = Math.random() * Math.PI * 2;
        const spawnX = Math.cos(spawnAngle) * spawnDistance;
        const spawnZ = Math.sin(spawnAngle) * spawnDistance;
        
        enemyBoat.position.set(spawnX, WATER_LEVEL + 5, spawnZ);
        enemyBoat.rotation.y = Math.random() * Math.PI * 2; // Random initial rotation
        
        // Add a sail to make it look like a boat
        const sailGeometry = new THREE.BoxGeometry(2, 25, 15);
        const sailMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xffffff, 
            roughness: 0.3
        });
        const sail = new THREE.Mesh(sailGeometry, sailMaterial);
        sail.position.set(0, 20, -5);
        enemyBoat.add(sail);
        
        // Add enemy boat to scene
        scene.add(enemyBoat);
        
        // Create enemy boat data object
        const enemyData = {
            boat: enemyBoat,
            health: ENEMY_HEALTH,
            velocity: new THREE.Vector3(0, 0, 0),
            acceleration: new THREE.Vector3(0, 0, 0),
            state: 'patrolling', // patrolling, chasing, attacking
            patrolPoint: new THREE.Vector3(
                spawnX + (Math.random() - 0.5) * 400,
                WATER_LEVEL + 5,
                spawnZ + (Math.random() - 0.5) * 400
            ),
            patrolDirection: 1,
            nextPatrolChange: Date.now() + 5000 + Math.random() * 5000, // 5-10 seconds
            lastDamageTime: 0,
            isDestroyed: false
        };
        
        // Add enemy boat to array
        enemyBoats.push(enemyData);
    }
    
    console.log(`${enemyBoats.length} enemy boats created`);
}

// Update enemy boats AI and movement
function updateEnemyBoats(deltaTime) {
    // Update each enemy boat
    for (let i = enemyBoats.length - 1; i >= 0; i--) {
        const enemy = enemyBoats[i];
        
        // Skip updating destroyed enemies
        if (enemy.isDestroyed) continue;
        
        // Apply wave motion to enemy boats (just like player boat)
        const time = performance.now() * 0.001;
        const waveHeight = Math.sin(time * 0.5 + enemy.boat.position.x * 0.01) * 0.5 + 
                          Math.sin(time * 1.0 + enemy.boat.position.z * 0.01) * 0.5;
        enemy.boat.position.y = WATER_LEVEL + 5 + waveHeight;
        
        // Calculate distance to player
        const distanceToPlayer = enemy.boat.position.distanceTo(playerBoat.position);
        
        // Determine AI state based on distance to player
        if (distanceToPlayer < ENEMY_ATTACK_RANGE) {
            enemy.state = 'attacking';
        } else if (distanceToPlayer < ENEMY_DETECTION_RANGE) {
            enemy.state = 'chasing';
        } else {
            enemy.state = 'patrolling';
        }
        
        // AI behavior based on state
        if (enemy.state === 'patrolling') {
            // Move towards patrol point
            const directionToPatrol = new THREE.Vector3().subVectors(enemy.patrolPoint, enemy.boat.position).normalize();
            
            // Calculate target rotation (the direction we want to face)
            const targetRotation = Math.atan2(directionToPatrol.x, directionToPatrol.z);
            
            // Rotate towards target direction
            const rotationDiff = normalizeAngle(targetRotation - enemy.boat.rotation.y);
            enemy.boat.rotation.y += Math.sign(rotationDiff) * Math.min(Math.abs(rotationDiff), ENEMY_TURN_SPEED * deltaTime);
            
            // Move forward in boat's direction
            const forwardVector = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), enemy.boat.rotation.y);
            enemy.boat.position.add(forwardVector.multiplyScalar(ENEMY_SPEED * 0.7 * deltaTime));
            
            // Check if we've reached the patrol point
            if (enemy.boat.position.distanceTo(enemy.patrolPoint) < 50 || Date.now() > enemy.nextPatrolChange) {
                // Choose a new patrol point
                enemy.patrolPoint = new THREE.Vector3(
                    (Math.random() - 0.5) * 600,
                    WATER_LEVEL + 5,
                    enemy.boat.position.z + (Math.random() - 0.5) * 600
                );
                enemy.nextPatrolChange = Date.now() + 5000 + Math.random() * 5000; // 5-10 seconds
            }
        } else if (enemy.state === 'chasing' || enemy.state === 'attacking') {
            // Chase the player - calculate direction to player
            const directionToPlayer = new THREE.Vector3().subVectors(playerBoat.position, enemy.boat.position).normalize();
            
            // Calculate target rotation to face player
            const targetRotation = Math.atan2(directionToPlayer.x, directionToPlayer.z);
            
            // Rotate towards player
            const rotationDiff = normalizeAngle(targetRotation - enemy.boat.rotation.y);
            enemy.boat.rotation.y += Math.sign(rotationDiff) * Math.min(Math.abs(rotationDiff), ENEMY_TURN_SPEED * deltaTime);
            
            // Move forward in boat's direction
            const forwardVector = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), enemy.boat.rotation.y);
            const speed = enemy.state === 'attacking' ? ENEMY_SPEED : ENEMY_SPEED * 0.9;
            enemy.boat.position.add(forwardVector.multiplyScalar(speed * deltaTime));
            
            // If in attacking range, maybe shoot at player (later feature)
        }
        
        // Apply boat pitch and roll based on movement
        const pitchAmount = Math.sin(time * 2) * 0.04;
        const rollAmount = Math.sin(time * 1.5) * 0.05;
        enemy.boat.rotation.x = Math.max(-0.1, Math.min(0.1, pitchAmount));
        enemy.boat.rotation.z = Math.max(-0.2, Math.min(0.2, rollAmount));
        
        // Flash red when recently damaged
        const timeSinceDamage = Date.now() - enemy.lastDamageTime;
        if (timeSinceDamage < 300) { // Flash for 300ms
            const flash = Math.sin(timeSinceDamage / 30) > 0;
            enemy.boat.material.emissiveIntensity = flash ? 1.0 : 0.3;
        } else {
            enemy.boat.material.emissiveIntensity = 0.3;
        }
    }
}

// Normalize angle to be between -PI and PI
function normalizeAngle(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
}

// Handle enemy boat being hit by projectile
function hitEnemyBoat(enemy, projectile) {
    // Update last damage time for visual effect
    enemy.lastDamageTime = Date.now();
    
    // Reduce enemy health
    enemy.health--;
    
    // Check if enemy is destroyed
    if (enemy.health <= 0 && !enemy.isDestroyed) {
        destroyEnemyBoat(enemy);
    }
}

// Destroy an enemy boat with visual effects
function destroyEnemyBoat(enemy) {
    enemy.isDestroyed = true;
    
    // Create large explosion effect
    createLargeExplosion(enemy.boat.position);
    
    // Make the boat sink slowly
    const startPosition = enemy.boat.position.clone();
    const startTime = Date.now();
    const sinkDuration = 3000; // 3 seconds to sink
    
    // Animate sinking
    const animateSinking = function() {
        const elapsedTime = Date.now() - startTime;
        const progress = Math.min(elapsedTime / sinkDuration, 1.0);
        
        if (progress >= 1.0) {
            // Remove boat after sinking
            scene.remove(enemy.boat);
            return;
        }
        
        // Sink and tilt the boat
        enemy.boat.position.y = startPosition.y - progress * 20; // Sink 20 units down
        enemy.boat.rotation.x = progress * Math.PI / 3; // Tilt forward
        enemy.boat.rotation.z = progress * (Math.random() > 0.5 ? 1 : -1) * Math.PI / 4; // Tilt to side
        
        // Fade out boat material
        if (enemy.boat.material) {
            enemy.boat.material.opacity = 1 - progress;
            enemy.boat.material.transparent = true;
        }
        
        // Continue animation
        requestAnimationFrame(animateSinking);
    };
    
    // Start sinking animation
    animateSinking();
}

// Create a larger explosion effect for boat destruction
function createLargeExplosion(position) {
    // Create multiple explosion effects at slightly different positions
    for (let i = 0; i < 5; i++) {
        const offsetX = (Math.random() - 0.5) * 15;
        const offsetY = (Math.random() - 0.5) * 5 + 5;
        const offsetZ = (Math.random() - 0.5) * 15;
        
        const explosionPos = new THREE.Vector3(
            position.x + offsetX,
            position.y + offsetY,
            position.z + offsetZ
        );
        
        // Delay each explosion slightly
        setTimeout(() => {
            createExplosion(explosionPos);
        }, i * 100);
    }
    
    // Create a central larger explosion
    const explosionGeometry = new THREE.SphereGeometry(2, 8, 8);
    const explosionMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff5500, 
        transparent: true,
        opacity: 0.8
    });
    
    const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
    explosion.position.copy(position);
    explosion.position.y += 10; // Higher explosion
    scene.add(explosion);
    
    // Add bright light
    const explosionLight = new THREE.PointLight(0xff5500, 3, 100);
    explosionLight.position.copy(explosion.position);
    scene.add(explosionLight);
    
    // Animate explosion
    const startTime = Date.now();
    const expandAndFade = function() {
        const elapsedTime = (Date.now() - startTime) / 1000; // seconds
        
        if (elapsedTime > 1.0) {
            // Remove explosion after 1 second
            scene.remove(explosion);
            scene.remove(explosionLight);
            return;
        }
        
        // Scale up explosion
        const scale = 1 + elapsedTime * 20;
        explosion.scale.set(scale, scale, scale);
        
        // Fade out explosion
        explosion.material.opacity = 0.8 * (1 - elapsedTime);
        explosionLight.intensity = 3 * (1 - elapsedTime);
        
        // Continue animation
        requestAnimationFrame(expandAndFade);
    };
    
    // Start animation
    expandAndFade();
}

// Create a simple minimap
function createMinimap() {
    const minimap = document.createElement('div');
    minimap.id = 'minimap';
    minimap.style.position = 'absolute';
    minimap.style.bottom = '20px';
    minimap.style.right = '20px';
    minimap.style.width = '150px';
    minimap.style.height = '150px';
    minimap.style.backgroundColor = 'rgba(0, 100, 170, 0.5)';
    minimap.style.border = '2px solid white';
    minimap.style.borderRadius = '50%';
    minimap.style.overflow = 'hidden';
    
    document.body.appendChild(minimap);
    
    // Player marker
    const playerMarker = document.createElement('div');
    playerMarker.id = 'player-marker';
    playerMarker.style.position = 'absolute';
    playerMarker.style.width = '6px';
    playerMarker.style.height = '6px';
    playerMarker.style.backgroundColor = 'white';
    playerMarker.style.borderRadius = '50%';
    playerMarker.style.transform = 'translate(-50%, -50%)';
    minimap.appendChild(playerMarker);
    
    // Enemy markers container
    const enemyMarkersContainer = document.createElement('div');
    enemyMarkersContainer.id = 'enemy-markers';
    minimap.appendChild(enemyMarkersContainer);
}

// Update minimap with current positions
function updateMinimap() {
    const minimap = document.getElementById('minimap');
    if (!minimap) return;
    
    const minimapSize = 150;
    const worldScale = minimapSize / (WORLD_SIZE * 2);
    
    // Update player marker
    const playerMarker = document.getElementById('player-marker');
    if (playerMarker && playerBoat) {
        // Calculate position relative to minimap
        const playerX = (playerBoat.position.x + WORLD_SIZE) * worldScale;
        const playerZ = (playerBoat.position.z + WORLD_SIZE) * worldScale;
        
        playerMarker.style.left = `${playerX}px`;
        playerMarker.style.top = `${playerZ}px`;
    }
    
    // Update or create enemy markers
    const enemyMarkersContainer = document.getElementById('enemy-markers');
    if (enemyMarkersContainer) {
        // Clear previous markers
        enemyMarkersContainer.innerHTML = '';
        
        // Create markers for each enemy
        enemyBoats.forEach((enemy, index) => {
            if (enemy.isDestroyed || !enemy.boat) return;
            
            const marker = document.createElement('div');
            marker.className = 'enemy-marker';
            marker.style.position = 'absolute';
            marker.style.width = '4px';
            marker.style.height = '4px';
            marker.style.backgroundColor = 'red';
            marker.style.borderRadius = '50%';
            marker.style.transform = 'translate(-50%, -50%)';
            
            // Calculate position relative to minimap
            const enemyX = (enemy.boat.position.x + WORLD_SIZE) * worldScale;
            const enemyZ = (enemy.boat.position.z + WORLD_SIZE) * worldScale;
            
            marker.style.left = `${enemyX}px`;
            marker.style.top = `${enemyZ}px`;
            
            enemyMarkersContainer.appendChild(marker);
        });
    }
} 