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

// Multiplayer
const socket = io({
    transports: ['websocket'],
    path: '/socket.io'
});
const otherPlayers = new Map();

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM content loaded');
    
    // Set up start button listener
    const startBtn = document.getElementById('start-btn');
    const lobby = document.getElementById('lobby');
    const speedMeter = document.getElementById('speed-meter');
    
    if (!startBtn) {
        console.error('Start button not found!');
        return;
    }
    
    console.log('Start button found, adding click listener');
    
    // Track all currently pressed keys
    const pressedKeys = new Set();
    
    // Add a direct keyboard test that directly updates speed
    window.addEventListener('keydown', function(e) {
        console.log('Direct keydown test:', e.key);
        
        // Add key to pressed keys set
        pressedKeys.add(e.key);
        
        // Process all currently pressed keys
        processKeys(pressedKeys, speedMeter);
    });
    
    window.addEventListener('keyup', function(e) {
        console.log('Direct keyup test:', e.key);
        
        // Remove key from pressed keys set
        pressedKeys.delete(e.key);
    });
    
    // Process all currently pressed keys
    function processKeys(pressedKeys, speedMeter) {
        // Check for forward/backward movement
        if (pressedKeys.has('ArrowUp') || pressedKeys.has('w') || pressedKeys.has('W')) {
            // Gradually increase speed
            speed = Math.min(speed + 25, 300); // Reduced max speed and increment
            speedMeter.textContent = `DIRECT: ${Math.round(speed)} KPH`;
            speedMeter.style.color = 'red';
            
            // Move boat forward
            if (playerBoat) {
                const forwardVector = new THREE.Vector3(0, 0, 1);
                forwardVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerBoat.rotation.y);
                forwardVector.multiplyScalar(3); // Reduced movement increment
                playerBoat.position.add(forwardVector);
            }
        }
        
        if (pressedKeys.has('ArrowDown') || pressedKeys.has('s') || pressedKeys.has('S')) {
            // Gradually decrease speed
            speed = Math.max(speed - 25, -150); // Reduced max reverse speed and decrement
            speedMeter.textContent = `REVERSE: ${Math.abs(Math.round(speed))} KPH`;
            speedMeter.style.color = 'orange';
            
            // Move boat backward
            if (playerBoat) {
                const backwardVector = new THREE.Vector3(0, 0, -1);
                backwardVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerBoat.rotation.y);
                backwardVector.multiplyScalar(1.5); // Reduced movement increment
                playerBoat.position.add(backwardVector);
            }
        }
        
        // Check for turning
        if (pressedKeys.has('ArrowLeft') || pressedKeys.has('a') || pressedKeys.has('A')) {
            if (playerBoat) {
                playerBoat.rotation.y += 0.03; // Reduced rotation increment
                if (!speedMeter.textContent.includes('TURNING')) {
                    speedMeter.textContent += ' TURNING LEFT';
                }
                speedMeter.style.color = 'blue';
            }
        }
        
        if (pressedKeys.has('ArrowRight') || pressedKeys.has('d') || pressedKeys.has('D')) {
            if (playerBoat) {
                playerBoat.rotation.y -= 0.03; // Reduced rotation increment
                if (!speedMeter.textContent.includes('TURNING')) {
                    speedMeter.textContent += ' TURNING RIGHT';
                }
                speedMeter.style.color = 'green';
            }
        }
        
        // Update camera to follow boat
        if (playerBoat && camera && controls) {
            controls.target.lerp(playerBoat.position, 0.05);
            const idealCameraPosition = new THREE.Vector3(
                playerBoat.position.x - Math.sin(playerBoat.rotation.y) * 200,
                100 + Math.sin(Date.now() * 0.001) * 5,
                playerBoat.position.z - Math.cos(playerBoat.rotation.y) * 200
            );
            camera.position.lerp(idealCameraPosition, 0.03);
            controls.update();
            
            // Render the scene
            if (renderer && scene) {
                renderer.render(scene, camera);
            }
        }
    }
    
    // Set up an animation loop for smooth keyboard handling
    let keyboardAnimationId = null;
    
    function animateKeyboardInput() {
        if (pressedKeys.size > 0) {
            processKeys(pressedKeys, speedMeter);
        }
        keyboardAnimationId = requestAnimationFrame(animateKeyboardInput);
    }
    
    // Start the keyboard animation loop
    animateKeyboardInput();
    
    startBtn.addEventListener('click', () => {
        console.log('Start button clicked');
        isGameStarted = true;
        lobby.classList.add('hidden');
        
        // Initialize the game
        console.log('Initializing game...');
        init();
        
        // Start animation loop if not already started
        console.log('Starting animation loop...');
        requestAnimationFrame(animate);
        
        // Join multiplayer session
        console.log('Joining multiplayer session...');
        socket.emit('playerJoin', {
            position: playerBoat.position.toArray(),
            rotation: playerBoat.rotation.toArray()
        });
    });
});

// Initialize Three.js scene
function init() {
    // Create the scene
    scene = new THREE.Scene();
    
    // Add fog for atmospheric effect and distance cue
    scene.fog = new THREE.FogExp2(0x0080ff, 0.00025);
    
    // Create camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 20000);
    camera.position.set(0, 100, -250);
    camera.lookAt(0, 0, 0);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.5;
    document.body.appendChild(renderer.domElement);
    
    // Create directional light (sun)
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(500, 500, -500);
    sun.castShadow = true;
    scene.add(sun);
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 2.5);
    scene.add(ambientLight);
    
    // Water
    const waterGeometry = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE);
    water = new Water(
        waterGeometry,
        {
            textureWidth: 1024,
            textureHeight: 1024,
            waterNormals: new THREE.TextureLoader().load('textures/waternormals.jpg', function (texture) {
                texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            }),
            sunDirection: new THREE.Vector3(),
            sunColor: 0xffffff,
            waterColor: 0x00aaff,
            distortionScale: WATER_DISTORTION_SCALE,
            fog: scene.fog !== undefined,
            alpha: WATER_ALPHA
        }
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_LEVEL;
    scene.add(water);
    
    // Sky
    const sky = new Sky();
    sky.scale.setScalar(10000);
    scene.add(sky);
    
    const skyUniforms = sky.material.uniforms;
    skyUniforms['turbidity'].value = 10;
    skyUniforms['rayleigh'].value = 2;
    skyUniforms['mieCoefficient'].value = 0.005;
    skyUniforms['mieDirectionalG'].value = 0.8;
    
    const parameters = {
        elevation: 10,
        azimuth: 180
    };
    
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    
    function updateSun() {
        const phi = THREE.MathUtils.degToRad(90 - parameters.elevation);
        const theta = THREE.MathUtils.degToRad(parameters.azimuth);
        sun.position.setFromSphericalCoords(1000, phi, theta);
        sky.material.uniforms['sunPosition'].value.copy(sun.position);
        water.material.uniforms['sunDirection'].value.copy(sun.position).normalize();
        scene.environment = pmremGenerator.fromScene(sky).texture;
    }
    updateSun();
    
    // Add orbit controls for debugging
    controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 100;
    controls.maxDistance = 1000;
    controls.enabled = false; // Start with controls disabled
    
    // Create player boat
    createPlayerBoat();
    
    // Create the race track immediately
    createBoatRacingTrack();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    
    // Handle keyboard input
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
        controls.enabled = false;
        gameStarted = true;
        startTime = Date.now();
        resetPlayerPosition();
    });
    
    // For smoother movement
    requestAnimationFrame(animate);
    
    // Add the manual update button for testing
    addManualUpdateButton();
}

// Create track by loading a GLTF model
function createBoatRacingTrack() {
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
    
    console.log("Creating boat racing track...");
    
    // Track dimensions and parameters
    const trackLength = 10000;
    const trackWidth = 500; // Wider for boat racing
    const waterChannelWidth = 300; // Water channel in the middle
    const sideWidth = (trackWidth - waterChannelWidth) / 2;
    
    // Create the main water channel (slightly raised above the main water)
    const waterChannelGeometry = new THREE.BoxGeometry(waterChannelWidth, 3, trackLength);
    const waterChannelMaterial = new THREE.MeshStandardMaterial({
        color: 0x0088ff,
        metalness: 0.9,
        roughness: 0.1,
        emissive: 0x003366,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.8
    });
    
    const waterChannel = new THREE.Mesh(waterChannelGeometry, waterChannelMaterial);
    waterChannel.position.set(0, WATER_LEVEL + 1.5, 0); // Slightly above the main water
    scene.add(waterChannel);
    trackElements.push(waterChannel);
    
    // Create side platforms (docks/piers)
    const leftPlatformGeometry = new THREE.BoxGeometry(sideWidth, 5, trackLength);
    const rightPlatformGeometry = new THREE.BoxGeometry(sideWidth, 5, trackLength);
    
    const platformMaterial = new THREE.MeshStandardMaterial({
        color: 0x885533, // Wood color
        roughness: 0.8,
        metalness: 0.1
    });
    
    const leftPlatform = new THREE.Mesh(leftPlatformGeometry, platformMaterial);
    leftPlatform.position.set(-waterChannelWidth/2 - sideWidth/2, WATER_LEVEL + 2.5, 0);
    scene.add(leftPlatform);
    trackElements.push(leftPlatform);
    
    const rightPlatform = new THREE.Mesh(rightPlatformGeometry, platformMaterial);
    rightPlatform.position.set(waterChannelWidth/2 + sideWidth/2, WATER_LEVEL + 2.5, 0);
    scene.add(rightPlatform);
    trackElements.push(rightPlatform);
    
    // Create buoys/markers along the water channel
    const buoyCount = 40;
    const buoySpacing = trackLength / buoyCount;
    
    for (let i = 0; i < buoyCount; i++) {
        // Left buoys
        createBuoy(-waterChannelWidth/2 + 10, buoySpacing * i - trackLength/2 + buoySpacing/2, 0xff3333);
        
        // Right buoys
        createBuoy(waterChannelWidth/2 - 10, buoySpacing * i - trackLength/2 + buoySpacing/2, 0x33ff33);
    }
    
    // Create checkpoints
    const checkpointCount = 8;
    const checkpointSpacing = trackLength / checkpointCount;
    
    for (let i = 0; i < checkpointCount; i++) {
        createWaterCheckpoint(0, checkpointSpacing * i - trackLength/2 + checkpointSpacing/2, waterChannelWidth);
    }
    
    // Create boost pads
    const boostPadCount = 12;
    const boostPadSpacing = trackLength / boostPadCount;
    
    for (let i = 0; i < boostPadCount; i++) {
        // Alternate sides for boost pads
        const xPos = (i % 2 === 0) ? -waterChannelWidth/4 : waterChannelWidth/4;
        createBoostPad(xPos, boostPadSpacing * i - trackLength/2 + boostPadSpacing/2);
    }
    
    // Create water jets/fountains as obstacles
    const waterJetCount = 6;
    const waterJetSpacing = trackLength / waterJetCount;
    
    for (let i = 0; i < waterJetCount; i++) {
        // Place water jets in the middle, alternating slightly left and right
        const xPos = (i % 2 === 0) ? -30 : 30;
        createWaterJet(xPos, waterJetSpacing * i - trackLength/2 + waterJetSpacing/3);
    }
    
    // Add decorative elements (docked boats, buildings, etc.)
    for (let i = 0; i < 15; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const xPos = side * (waterChannelWidth/2 + sideWidth/2);
        const zPos = (trackLength / 15) * i - trackLength/2 + trackLength/30;
        createDockDecoration(xPos, zPos, side);
    }
    
    // Add lighting
    addTrackLighting(trackLength, waterChannelWidth, sideWidth);
    
    // Set player position
    resetPlayerPosition();
    
    console.log("Boat racing track created with:", {
        "Track Elements": trackElements.length,
        "Barriers": barriers.length,
        "Checkpoints": checkpoints.length,
        "Boost Pads": boostPads.length,
        "Water Jets": waterJets.length
    });
}

// Helper functions for track elements
function createBuoy(x, z, color) {
    // Create buoy base (floating part)
    const buoyGeometry = new THREE.CylinderGeometry(5, 5, 4, 16);
    const buoyMaterial = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.5,
        metalness: 0.2,
        emissive: color,
        emissiveIntensity: 0.5
    });
    
    const buoy = new THREE.Mesh(buoyGeometry, buoyMaterial);
    buoy.position.set(x, WATER_LEVEL + 2, z);
    scene.add(buoy);
    trackElements.push(buoy);
    barriers.push(buoy); // So boats can collide with it
    
    // Add pole on top
    const poleGeometry = new THREE.CylinderGeometry(1, 1, 15, 8);
    const poleMaterial = new THREE.MeshStandardMaterial({
        color: 0xbbbbbb,
        roughness: 0.5
    });
    
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.set(x, WATER_LEVEL + 11.5, z);
    scene.add(pole);
    trackElements.push(pole);
    
    // Add light on top of pole
    const lightGeometry = new THREE.SphereGeometry(2, 16, 16);
    const lightMaterial = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 1.0,
        transparent: true,
        opacity: 0.9
    });
    
    const light = new THREE.Mesh(lightGeometry, lightMaterial);
    light.position.set(x, WATER_LEVEL + 20, z);
    scene.add(light);
    trackElements.push(light);
    
    // Add actual point light
    const pointLight = new THREE.PointLight(color, 1, 50);
    pointLight.position.set(x, WATER_LEVEL + 20, z);
    scene.add(pointLight);
    trackElements.push(pointLight);
    trackLights.push(pointLight);
}

function createWaterCheckpoint(x, z, width) {
    const checkpointGeometry = new THREE.PlaneGeometry(width, 60);
    const checkpointMaterial = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        emissive: 0xffff00,
        emissiveIntensity: 0.5
    });
    
    const checkpoint = new THREE.Mesh(checkpointGeometry, checkpointMaterial);
    checkpoint.rotation.x = Math.PI / 2;
    checkpoint.position.set(x, WATER_LEVEL + 30, z);
    scene.add(checkpoint);
    trackElements.push(checkpoint);
    checkpoints.push({
        object: checkpoint,
        position: new THREE.Vector3(x, WATER_LEVEL, z),
        passed: false
    });
    
    // Add arches for the checkpoint
    const archHeight = 80;
    const archWidth = width + 40;
    
    const leftPillarGeometry = new THREE.CylinderGeometry(5, 5, archHeight, 16);
    const rightPillarGeometry = new THREE.CylinderGeometry(5, 5, archHeight, 16);
    const topArchGeometry = new THREE.CylinderGeometry(3, 3, archWidth, 16);
    
    const pillarMaterial = new THREE.MeshStandardMaterial({
        color: 0xdddddd,
        roughness: 0.5,
        metalness: 0.5
    });
    
    // Left pillar
    const leftPillar = new THREE.Mesh(leftPillarGeometry, pillarMaterial);
    leftPillar.position.set(x - width/2 - 20, WATER_LEVEL + archHeight/2, z);
    scene.add(leftPillar);
    trackElements.push(leftPillar);
    
    // Right pillar
    const rightPillar = new THREE.Mesh(rightPillarGeometry, pillarMaterial);
    rightPillar.position.set(x + width/2 + 20, WATER_LEVEL + archHeight/2, z);
    scene.add(rightPillar);
    trackElements.push(rightPillar);
    
    // Top arch
    const topArch = new THREE.Mesh(topArchGeometry, pillarMaterial);
    topArch.rotation.z = Math.PI / 2;
    topArch.position.set(x, WATER_LEVEL + archHeight, z);
    scene.add(topArch);
    trackElements.push(topArch);
    
    // Add checkpoint number
    const checkpointNumber = checkpoints.length;
    
    // Add checkpoint light
    const checkpointLight = new THREE.PointLight(0xffff00, 2, 100);
    checkpointLight.position.set(x, WATER_LEVEL + archHeight/2, z);
    scene.add(checkpointLight);
    trackElements.push(checkpointLight);
    trackLights.push(checkpointLight);
}

function createBoostPad(x, z) {
    const boostPadGeometry = new THREE.BoxGeometry(30, 1, 50);
    const boostPadMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x00ffff,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.7
    });
    
    const boostPad = new THREE.Mesh(boostPadGeometry, boostPadMaterial);
    boostPad.position.set(x, WATER_LEVEL + 2, z);
    scene.add(boostPad);
    trackElements.push(boostPad);
    boostPads.push({
        object: boostPad,
        position: new THREE.Vector3(x, WATER_LEVEL, z),
        activated: false
    });
    
    // Add boost pad light
    const boostLight = new THREE.PointLight(0x00ffff, 2, 50);
    boostLight.position.set(x, WATER_LEVEL + 5, z);
    scene.add(boostLight);
    trackElements.push(boostLight);
    trackLights.push(boostLight);
}

function createWaterJet(x, z) {
    // Base of the water jet
    const baseGeometry = new THREE.CylinderGeometry(15, 20, 8, 16);
    const baseMaterial = new THREE.MeshStandardMaterial({
        color: 0x666666,
        roughness: 0.8
    });
    
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.set(x, WATER_LEVEL - 2, z);
    scene.add(base);
    trackElements.push(base);
    
    // Jet water column (animated in update)
    const jetGeometry = new THREE.CylinderGeometry(5, 10, 50, 16);
    const jetMaterial = new THREE.MeshStandardMaterial({
        color: 0x00aaff,
        transparent: true,
        opacity: 0.7,
        emissive: 0x0055aa,
        emissiveIntensity: 0.5
    });
    
    const jet = new THREE.Mesh(jetGeometry, jetMaterial);
    jet.position.set(x, WATER_LEVEL + 25, z);
    scene.add(jet);
    trackElements.push(jet);
    waterJets.push({
        object: jet,
        basePosition: new THREE.Vector3(x, WATER_LEVEL + 25, z),
        height: 50,
        phase: Math.random() * Math.PI * 2
    });
    
    // Add water jet as a hazard for collision detection
    hazards.push(jet);
    
    // Add water jet light
    const jetLight = new THREE.PointLight(0x00aaff, 1.5, 70);
    jetLight.position.set(x, WATER_LEVEL + 25, z);
    scene.add(jetLight);
    trackElements.push(jetLight);
    trackLights.push(jetLight);
}

function createDockDecoration(x, z, side) {
    // Random selection of decoration type
    const decorType = Math.floor(Math.random() * 3);
    
    if (decorType === 0) {
        // Docked boat
        createDockedBoat(x + (side * 40), z);
    } else if (decorType === 1) {
        // Small building/hut
        createDockBuilding(x + (side * 30), z);
    } else {
        // Lighting pole
        createLightingPole(x + (side * 20), z);
    }
}

function createDockedBoat(x, z) {
    // Boat hull
    const hullGeometry = new THREE.BoxGeometry(20, 10, 40);
    const hullMaterial = new THREE.MeshStandardMaterial({
        color: Math.random() > 0.5 ? 0x3366ff : 0xff6633,
        roughness: 0.7
    });
    
    const hull = new THREE.Mesh(hullGeometry, hullMaterial);
    hull.position.set(x, WATER_LEVEL + 5, z);
    scene.add(hull);
    trackElements.push(hull);
    
    // Boat cabin
    const cabinGeometry = new THREE.BoxGeometry(15, 12, 20);
    const cabinMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.6
    });
    
    const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
    cabin.position.set(x, WATER_LEVEL + 16, z - 5);
    scene.add(cabin);
    trackElements.push(cabin);
}

function createDockBuilding(x, z) {
    // Building base
    const baseGeometry = new THREE.BoxGeometry(40, 30, 40);
    const baseMaterial = new THREE.MeshStandardMaterial({
        color: 0xdddddd,
        roughness: 0.8
    });
    
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.set(x, WATER_LEVEL + 15, z);
    scene.add(base);
    trackElements.push(base);
    
    // Building roof
    const roofGeometry = new THREE.ConeGeometry(30, 20, 4);
    const roofMaterial = new THREE.MeshStandardMaterial({
        color: 0xff3333,
        roughness: 0.8
    });
    
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(x, WATER_LEVEL + 40, z);
    roof.rotation.y = Math.PI / 4;
    scene.add(roof);
    trackElements.push(roof);
    
    // Small window
    const windowGeometry = new THREE.PlaneGeometry(10, 10);
    const windowMaterial = new THREE.MeshStandardMaterial({
        color: 0x88ccff,
        roughness: 0.2,
        metalness: 0.8,
        emissive: 0x88ccff,
        emissiveIntensity: 0.5,
        side: THREE.DoubleSide
    });
    
    const window = new THREE.Mesh(windowGeometry, windowMaterial);
    window.position.set(x, WATER_LEVEL + 15, z + 20.1);
    scene.add(window);
    trackElements.push(window);
}

function createLightingPole(x, z) {
    // Pole
    const poleGeometry = new THREE.CylinderGeometry(2, 2, 50, 8);
    const poleMaterial = new THREE.MeshStandardMaterial({
        color: 0x444444,
        roughness: 0.8
    });
    
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.set(x, WATER_LEVEL + 25, z);
    scene.add(pole);
    trackElements.push(pole);
    
    // Light fixture
    const fixtureGeometry = new THREE.CylinderGeometry(5, 8, 8, 16);
    const fixtureMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.5
    });
    
    const fixture = new THREE.Mesh(fixtureGeometry, fixtureMaterial);
    fixture.position.set(x, WATER_LEVEL + 46, z);
    scene.add(fixture);
    trackElements.push(fixture);
    
    // Add light
    const light = new THREE.PointLight(0xffffaa, 1, 100);
    light.position.set(x, WATER_LEVEL + 46, z);
    scene.add(light);
    trackElements.push(light);
    trackLights.push(light);
}

function addTrackLighting(trackLength, waterChannelWidth, sideWidth) {
    // Add ambient track lighting
    const ambientTrackLight = new THREE.AmbientLight(0x222233, 1.5);
    scene.add(ambientTrackLight);
    trackElements.push(ambientTrackLight);
    
    // Add spotlight at start/finish
    const startLight = new THREE.SpotLight(0xffffff, 2, 300, Math.PI / 6, 0.5);
    startLight.position.set(0, WATER_LEVEL + 100, -trackLength/2);
    startLight.target.position.set(0, WATER_LEVEL, -trackLength/2 + 50);
    scene.add(startLight);
    scene.add(startLight.target);
    trackElements.push(startLight);
    trackLights.push(startLight);
}

function resetPlayerPosition() {
    if (playerBoat) {
        // Position the player at the start of the track
        playerBoat.position.set(0, WATER_LEVEL + 15, -4500);
        playerBoat.rotation.y = 0;
        
        // Reset player physics
        velocity.set(0, 0, 0);
        acceleration.set(0, 0, 0);
        
        // Update camera
        updateCameraPosition();
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
            isDrifting = true;
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
            isDrifting = false;
            break;
        case ' ':
            keys.powerUp = false;
            if (hasPowerUp) usePowerUp();
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
function update() {
    try {
        const delta = clock.getDelta();
        const speedMeter = document.getElementById('speed-meter');

        // Log current state
        console.log('Update - Keys:', 
            keys.forward ? 'Forward' : '', 
            keys.backward ? 'Backward' : '', 
            keys.left ? 'Left' : '', 
            keys.right ? 'Right' : '',
            'Speed:', Math.round(speed)
        );

        // More responsive boat physics with smoother acceleration
        if (keys.forward) {
            // Smoother acceleration
            speed += ACCELERATION * delta * 0.2; // Further reduced for smoother acceleration
            console.log('Accelerating, new speed:', Math.round(speed));
            // Direct update of HUD for testing
            speedMeter.textContent = `FORWARD: ${Math.abs(Math.round(speed))} KPH`;
            speedMeter.style.color = 'lime';
        } else if (keys.backward) {
            // Smoother braking
            speed -= ACCELERATION * delta * 0.15; // Further reduced for smoother braking
            console.log('Braking, new speed:', Math.round(speed));
            // Direct update of HUD for testing
            speedMeter.textContent = `BACKWARD: ${Math.abs(Math.round(speed))} KPH`;
            speedMeter.style.color = 'orange';
        } else {
            // Smoother deceleration
            speed *= 0.99; // Even less aggressive deceleration
            // Direct update of HUD for testing
            speedMeter.textContent = `COASTING: ${Math.abs(Math.round(speed))} KPH`;
        }

        // Apply drag and speed limits
        speed *= DRAG_COEFFICIENT;
        speed = THREE.MathUtils.clamp(speed, -MAX_SPEED * 0.4, MAX_SPEED);

        // Smoother turning with less aggressive rotation
        const turnMultiplier = Math.abs(speed) / MAX_SPEED; // Turn better at higher speeds
        
        // Store previous rotation for smooth interpolation
        const prevRotation = playerBoat.rotation.y;
        
        if (keys.left) {
            // Smoother turning
            const targetRotation = prevRotation + TURN_SPEED * (isDrifting ? DRIFT_FACTOR : 1) * delta * (turnMultiplier + 0.2);
            // Use lerp for smoother rotation
            playerBoat.rotation.y = THREE.MathUtils.lerp(prevRotation, targetRotation, 0.3); // Reduced lerp factor
            console.log('Turning left, rotation:', playerBoat.rotation.y);
            // Update HUD for turning
            speedMeter.textContent += ' TURNING LEFT';
        }
        if (keys.right) {
            // Smoother turning
            const targetRotation = prevRotation - TURN_SPEED * (isDrifting ? DRIFT_FACTOR : 1) * delta * (turnMultiplier + 0.2);
            // Use lerp for smoother rotation
            playerBoat.rotation.y = THREE.MathUtils.lerp(prevRotation, targetRotation, 0.3); // Reduced lerp factor
            console.log('Turning right, rotation:', playerBoat.rotation.y);
            // Update HUD for turning
            speedMeter.textContent += ' TURNING RIGHT';
        }

        // Update velocity and position with smoother physics
        velocity.set(0, 0, speed * delta);
        velocity.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerBoat.rotation.y);
        
        // Smoother banking with less aggressive tilt
        const bankAmount = (keys.left ? 1 : (keys.right ? -1 : 0)) * Math.abs(speed) / MAX_SPEED * 0.08; // Further reduced
        // Lerp for smoother rotation transitions with higher factor
        playerBoat.rotation.z = THREE.MathUtils.lerp(playerBoat.rotation.z, bankAmount, 0.03);
        
        // Store previous position for logging
        const prevPosition = playerBoat.position.clone();
        
        // Calculate target position
        const targetPosition = prevPosition.clone().add(velocity);
        
        // Use lerp for smoother position updates
        playerBoat.position.lerp(targetPosition, 0.6); // Reduced factor for smoother movement
        
        console.log('Boat moved from', 
            prevPosition.x.toFixed(2), 
            prevPosition.y.toFixed(2), 
            prevPosition.z.toFixed(2), 
            'to', 
            playerBoat.position.x.toFixed(2), 
            playerBoat.position.y.toFixed(2), 
            playerBoat.position.z.toFixed(2)
        );

        // Smoother bobbing effect
        const bobHeight = Math.sin(Date.now() * 0.0008) * 0.15; // Further reduced frequency and amplitude
        playerBoat.position.y = THREE.MathUtils.lerp(playerBoat.position.y, 5 + bobHeight, 0.03);

        // Camera follows boat more smoothly with increased lerp factor
        controls.target.lerp(playerBoat.position, 0.02); // Further reduced for smoother following
        
        // Position camera behind boat with smoother transitions
        const idealCameraPosition = new THREE.Vector3(
            playerBoat.position.x - Math.sin(playerBoat.rotation.y) * 200,
            100 + Math.sin(Date.now() * 0.0003) * 2, // Even slower vertical movement
            playerBoat.position.z - Math.cos(playerBoat.rotation.y) * 200
        );
        
        camera.position.lerp(idealCameraPosition, 0.015); // Further reduced for smoother camera movement
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
        if (checkpoints.length > 0 && currentCheckpoint < checkpoints.length) {
            const nextCheckpoint = checkpoints[currentCheckpoint];
            if (nextCheckpoint) {
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
        }
        
        // Handle endless track - teleport back to start if reached the end
        if (playerBoat.position.z > 4900) { // Near the end of the track
            console.log('Reached end of track, teleporting back to start');
            // Fade out
            const fadeOverlay = document.createElement('div');
            fadeOverlay.style.position = 'absolute';
            fadeOverlay.style.top = '0';
            fadeOverlay.style.left = '0';
            fadeOverlay.style.width = '100%';
            fadeOverlay.style.height = '100%';
            fadeOverlay.style.backgroundColor = 'black';
            fadeOverlay.style.opacity = '0';
            fadeOverlay.style.transition = 'opacity 1s';
            fadeOverlay.style.zIndex = '1001';
            document.body.appendChild(fadeOverlay);
            
            // Fade in
            setTimeout(() => {
                fadeOverlay.style.opacity = '1';
                
                // Teleport after fade
                setTimeout(() => {
                    playerBoat.position.z = -4900; // Back to start
                    
                    // Fade out
                    setTimeout(() => {
                        fadeOverlay.style.opacity = '0';
                        
                        // Remove overlay
                        setTimeout(() => {
                            document.body.removeChild(fadeOverlay);
                        }, 1000);
                    }, 500);
                }, 1000);
            }, 0);
        }

        // Animate water jets
        waterJets.forEach(jet => {
            const time = Date.now() * 0.001;
            const height = 40 + Math.sin(time + jet.phase) * 20;
            
            // Update jet height and position
            jet.object.scale.y = height / 50;
            jet.object.position.y = jet.basePosition.y + (height - 50) / 2;
            
            // Update corresponding light
            const lightIndex = trackElements.indexOf(jet.object) + 1;
            if (lightIndex < trackElements.length && trackLights.includes(trackElements[lightIndex])) {
                trackElements[lightIndex].position.y = jet.basePosition.y + height / 2;
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
    
    // Add a smooth movement button
    const smoothButton = document.createElement('button');
    smoothButton.id = 'smooth-move';
    smoothButton.textContent = 'SMOOTH MOVE';
    smoothButton.style.position = 'absolute';
    smoothButton.style.top = '110px';
    smoothButton.style.left = '10px';
    smoothButton.style.zIndex = '1000';
    smoothButton.style.padding = '5px';
    smoothButton.style.backgroundColor = '#00aa00';
    smoothButton.style.color = 'white';
    smoothButton.style.border = 'none';
    smoothButton.style.borderRadius = '5px';
    smoothButton.style.cursor = 'pointer';
    
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
    
    // Add smooth movement with animation
    let smoothMoveInterval = null;
    let smoothPathPoints = [];
    let currentPathIndex = 0;
    let isMovingSmooth = false;
    
    // Create a figure-8 path for smooth movement
    function createSmoothPath() {
        smoothPathPoints = [];
        const centerX = playerBoat.position.x;
        const centerZ = playerBoat.position.z;
        const radius = 300; // Increased radius for a larger path
        
        // Create a figure-8 path with 200 points
        for (let i = 0; i < 200; i++) {
            const t = i / 200 * Math.PI * 4; // 2 full loops
            const x = centerX + radius * Math.sin(t);
            const z = centerZ + radius * Math.sin(t * 2) * 0.5; // Figure-8 pattern
            smoothPathPoints.push(new THREE.Vector3(x, playerBoat.position.y, z));
        }
        
        currentPathIndex = 0;
    }
    
    smoothButton.addEventListener('click', function() {
        console.log('Smooth move button clicked');
        
        // Toggle smooth movement
        if (isMovingSmooth) {
            // Stop smooth movement
            if (smoothMoveInterval) {
                clearInterval(smoothMoveInterval);
                smoothMoveInterval = null;
            }
            isMovingSmooth = false;
            smoothButton.textContent = 'SMOOTH MOVE';
            smoothButton.style.backgroundColor = '#00aa00';
            return;
        }
        
        // Start smooth movement
        isMovingSmooth = true;
        smoothButton.textContent = 'STOP SMOOTH';
        smoothButton.style.backgroundColor = '#aa0000';
        
        // Create a smooth path
        createSmoothPath();
        
        // Clear any existing interval
        if (smoothMoveInterval) {
            clearInterval(smoothMoveInterval);
        }
        
        // Set up smooth movement
        smoothMoveInterval = setInterval(function() {
            if (playerBoat && smoothPathPoints.length > 0) {
                // Get next point on path
                const targetPoint = smoothPathPoints[currentPathIndex];
                currentPathIndex = (currentPathIndex + 1) % smoothPathPoints.length;
                
                // Calculate direction to next point
                const direction = new THREE.Vector3().subVectors(targetPoint, playerBoat.position).normalize();
                
                // Calculate rotation to face direction
                const targetRotation = Math.atan2(direction.x, direction.z);
                
                // Smoothly rotate towards target rotation
                const rotationDiff = targetRotation - playerBoat.rotation.y;
                // Normalize the rotation difference to be between -PI and PI
                const normalizedRotationDiff = ((rotationDiff + Math.PI) % (Math.PI * 2)) - Math.PI;
                playerBoat.rotation.y += normalizedRotationDiff * 0.05; // Reduced rotation speed
                
                // Gradually increase speed
                speed = Math.min(speed + 3, 200); // Reduced max speed and increment
                
                // Move towards target point
                playerBoat.position.lerp(targetPoint, 0.03); // Reduced lerp factor for slower movement
                
                // Update HUD
                const speedMeter = document.getElementById('speed-meter');
                speedMeter.textContent = `SMOOTH: ${Math.round(speed)} KPH`;
                speedMeter.style.color = 'cyan';
                
                // Update camera
                if (camera && controls) {
                    controls.target.lerp(playerBoat.position, 0.03);
                    const idealCameraPosition = new THREE.Vector3(
                        playerBoat.position.x - Math.sin(playerBoat.rotation.y) * 200,
                        100 + Math.sin(Date.now() * 0.0005) * 3,
                        playerBoat.position.z - Math.cos(playerBoat.rotation.y) * 200
                    );
                    camera.position.lerp(idealCameraPosition, 0.02);
                    controls.update();
                }
                
                // Render the scene
                if (renderer && scene && camera) {
                    renderer.render(scene, camera);
                }
            }
        }, 16); // ~60fps
    });
    
    document.body.appendChild(updateButton);
    document.body.appendChild(smoothButton);
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
    requestAnimationFrame(animate);
    
    // Update a counter in the UI to show the animation loop is running
    const frameCounter = document.createElement('div');
    frameCounter.id = 'frame-counter';
    frameCounter.style.position = 'absolute';
    frameCounter.style.top = '40px';
    frameCounter.style.left = '10px';
    frameCounter.style.color = 'yellow';
    frameCounter.style.fontFamily = 'monospace';
    
    if (!document.getElementById('frame-counter')) {
        document.body.appendChild(frameCounter);
    }
    
    const counter = document.getElementById('frame-counter');
    if (counter) {
        counter.textContent = `Frame: ${Date.now()}`;
    }
    
    if (!isGameStarted) {
        console.log('Game not started yet, waiting...');
        return;
    }
    
    try {
        // Log the current state of the keys
        console.log('Keys state:', 
            keys.forward ? 'Forward ' : '', 
            keys.backward ? 'Backward ' : '', 
            keys.left ? 'Left ' : '', 
            keys.right ? 'Right ' : '',
            keys.drift ? 'Drift ' : ''
        );
        
        const delta = clock.getDelta();
        
        // Update water
        water.material.uniforms['time'].value += delta * WAVE_SPEED;
        
        // Make waves higher in the direction of boat movement
        if (Math.abs(speed) > 100) {
            const boatDir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), playerBoat.rotation.y);
            water.material.uniforms['distortionScale'].value = 
                WATER_DISTORTION_SCALE + (Math.abs(speed) / MAX_SPEED * boatDir.z * FOAM_FACTOR);
        } else {
            water.material.uniforms['distortionScale'].value = WATER_DISTORTION_SCALE;
        }
        
        // Update boat position and camera
        update();
        
        // Render the scene
        renderer.render(scene, camera);
    } catch (error) {
        console.error('Error in animation loop:', error);
    }
}

// Start animation loop immediately (will wait for game start)
console.log('Starting animation loop...');
requestAnimationFrame(animate); 