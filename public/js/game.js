// Log that the game.js file is loaded
console.log('Aqua Blitz game.js loaded at', new Date().toISOString());

import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';

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
    try {
        console.log('Initializing scene...');
        
        // Scene setup
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x001133); // Darker background
        scene.fog = new THREE.Fog(0x001133, 1000, 4000);

        // Camera
        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 20000);
        camera.position.set(0, 100, -200); // Higher and further back
        camera.lookAt(0, 0, 0);

        // Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.5; // Reduce overall brightness
        document.body.appendChild(renderer.domElement);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3); // Reduced ambient light
        scene.add(ambientLight);
        
        const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
        sunLight.position.set(100, 100, 100);
        sunLight.castShadow = true;
        scene.add(sunLight);

        // Add point lights for the track
        const pointLight1 = new THREE.PointLight(0x00ff88, 1, 1000);
        pointLight1.position.set(0, 50, 0);
        scene.add(pointLight1);

        const pointLight2 = new THREE.PointLight(0x0088ff, 1, 1000);
        pointLight2.position.set(400, 50, -400);
        scene.add(pointLight2);

        // Water
        const waterGeometry = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, 512, 512);
        const textureLoader = new THREE.TextureLoader();
        
        const waterNormals = textureLoader.load('textures/waternormals.jpg', function(texture) {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(6, 6);
        });
        
        water = new Water(waterGeometry, {
            textureWidth: 512,
            textureHeight: 512,
            waterNormals: waterNormals,
            sunDirection: new THREE.Vector3(0.5, 0.5, 0),
            sunColor: 0xffffff,
            waterColor: 0x001e0f,
            distortionScale: WATER_DISTORTION_SCALE,
            fog: scene.fog !== undefined
        });
        
        water.rotation.x = -Math.PI / 2;
        water.position.y = WATER_LEVEL;
        scene.add(water);

        // Add sky
        const sky = new Sky();
        sky.scale.setScalar(10000);
        scene.add(sky);

        const skyUniforms = sky.material.uniforms;
        skyUniforms['turbidity'].value = 10;
        skyUniforms['rayleigh'].value = 2;
        skyUniforms['mieCoefficient'].value = 0.005;
        skyUniforms['mieDirectionalG'].value = 0.8;

        const sun = new THREE.Vector3();
        const pmremGenerator = new THREE.PMREMGenerator(renderer);

        const phi = THREE.MathUtils.degToRad(60);
        const theta = THREE.MathUtils.degToRad(180);
        sun.setFromSphericalCoords(1, phi, theta);

        sky.material.uniforms['sunPosition'].value.copy(sun);
        water.material.uniforms['sunDirection'].value.copy(sun).normalize();

        scene.environment = pmremGenerator.fromScene(sky).texture;
        pmremGenerator.dispose();

        // Temporary boat (box for now)
        const boatGeometry = new THREE.BoxGeometry(20, 10, 40);
        const boatMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff88 });
        playerBoat = new THREE.Mesh(boatGeometry, boatMaterial);
        playerBoat.position.set(0, 5, 0);
        scene.add(playerBoat);

        // Create a simple straight endless track
        createSimpleEndlessTrack();

        // Update initial boat position
        playerBoat.position.set(0, 5, 0);

        // Controls
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enablePan = false;
        controls.maxPolarAngle = Math.PI * 0.495;
        controls.minDistance = 100;
        controls.maxDistance = 1000;
        controls.target.copy(playerBoat.position);
        controls.update();

        // Clock for frame-independent movement
        clock = new THREE.Clock();

        // Event listeners
        window.addEventListener('resize', onWindowResize);
        
        console.log('Scene initialized successfully');
    } catch (error) {
        console.error('Error initializing scene:', error);
    }
}

// Create a simple straight endless track
function createSimpleEndlessTrack() {
    try {
        console.log('Creating simple endless track...');
        
        // Clear any existing track elements
        if (trackBarriers.length > 0) {
            trackBarriers.forEach(barrier => scene.remove(barrier));
            trackBarriers = [];
        }
        
        if (checkpoints.length > 0) {
            checkpoints.forEach(checkpoint => scene.remove(checkpoint));
            checkpoints = [];
        }
        
        if (boostPads && boostPads.length > 0) {
            boostPads.forEach(pad => scene.remove(pad));
            boostPads = [];
        }
        
        if (waterJets && waterJets.length > 0) {
            waterJets.forEach(jet => scene.remove(jet));
            waterJets = [];
        }
        
        if (hazards && hazards.length > 0) {
            hazards.forEach(hazard => scene.remove(hazard));
            hazards = [];
        }
        
        // Define a simple straight track
        const trackLength = 10000; // Very long track
        const trackWidth = 300;
        const segmentLength = 500; // Length of each track segment
        
        // Create track segments
        for (let z = -trackLength/2; z < trackLength/2; z += segmentLength) {
            // Create track segment (road) - make it more visible with brighter color
            const roadGeometry = new THREE.PlaneGeometry(trackWidth, segmentLength);
            const roadMaterial = new THREE.MeshStandardMaterial({
                color: 0x444444, // Lighter gray for better visibility
                roughness: 0.8,
                metalness: 0.2,
                emissive: 0x222222, // Add some emissive for better visibility
                emissiveIntensity: 0.2
            });
            const road = new THREE.Mesh(roadGeometry, roadMaterial);
            road.rotation.x = -Math.PI / 2;
            road.position.set(0, WATER_LEVEL + 0.5, z); // Raise it slightly above water
            scene.add(road);
            trackBarriers.push(road); // Store for cleanup
            
            // Add lane markings - make them brighter and more visible
            const laneMarkingGeometry = new THREE.PlaneGeometry(10, segmentLength * 0.8); // Wider markings
            const laneMarkingMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                emissive: 0xffffff,
                emissiveIntensity: 1.0
            });
            const laneMarking = new THREE.Mesh(laneMarkingGeometry, laneMarkingMaterial);
            laneMarking.rotation.x = -Math.PI / 2;
            laneMarking.position.set(0, WATER_LEVEL + 0.6, z); // Slightly above road
            scene.add(laneMarking);
            trackBarriers.push(laneMarking); // Store for cleanup
            
            // Create left barrier - make it taller and more visible
            const leftBarrierGeometry = new THREE.BoxGeometry(10, 30, segmentLength);
            const leftBarrierMaterial = new THREE.MeshStandardMaterial({
                color: 0x00ff88,
                emissive: 0x00ff88,
                emissiveIntensity: 0.8, // Increased intensity
                roughness: 0.3,
                metalness: 0.7
            });
            const leftBarrier = new THREE.Mesh(leftBarrierGeometry, leftBarrierMaterial);
            leftBarrier.position.set(-trackWidth/2 - 5, 15, z); // Taller and wider
            scene.add(leftBarrier);
            trackBarriers.push(leftBarrier);
            
            // Create right barrier - make it taller and more visible
            const rightBarrierGeometry = new THREE.BoxGeometry(10, 30, segmentLength);
            const rightBarrierMaterial = new THREE.MeshStandardMaterial({
                color: 0x00ff88,
                emissive: 0x00ff88,
                emissiveIntensity: 0.8, // Increased intensity
                roughness: 0.3,
                metalness: 0.7
            });
            const rightBarrier = new THREE.Mesh(rightBarrierGeometry, rightBarrierMaterial);
            rightBarrier.position.set(trackWidth/2 + 5, 15, z); // Taller and wider
            scene.add(rightBarrier);
            trackBarriers.push(rightBarrier);
            
            // Add additional lighting for the track segment
            const trackLight = new THREE.PointLight(0xffffff, 1, 500);
            trackLight.position.set(0, 50, z);
            scene.add(trackLight);
            trackLights.push(trackLight);
            
            // Add billboards on alternating sides
            if (z % (segmentLength * 2) === 0) {
                // Left side billboard
                createBillboard(-trackWidth/2 - 80, z, 0); // Further from track
            } else {
                // Right side billboard
                createBillboard(trackWidth/2 + 80, z, 1); // Further from track
            }
            
            // Add checkpoint with more visibility
            const checkpointGeometry = new THREE.BoxGeometry(trackWidth, 40, 5); // Taller
            const checkpointMaterial = new THREE.MeshStandardMaterial({
                color: 0xffff00,
                emissive: 0xffff00,
                emissiveIntensity: 0.8, // Increased intensity
                transparent: true,
                opacity: 0.5, // More visible
                roughness: 0.7,
                metalness: 0.3
            });
            const checkpoint = new THREE.Mesh(checkpointGeometry, checkpointMaterial);
            checkpoint.position.set(0, 20, z + segmentLength/2); // Higher
            scene.add(checkpoint);
            checkpoints.push(checkpoint);
        }
        
        // Reset player position to start of track
        playerBoat.position.set(0, 5, -trackLength/2 + 50);
        playerBoat.rotation.y = 0; // Face forward
        
        // Update camera
        camera.position.set(0, 100, playerBoat.position.z - 200);
        controls.target.copy(playerBoat.position);
        controls.update();
        
        // Add global lighting to make track more visible
        const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
        scene.add(hemisphereLight);
        
        // Add directional light to cast shadows and improve visibility
        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(0, 200, 100);
        dirLight.castShadow = true;
        scene.add(dirLight);
        
        console.log('Simple endless track created successfully');
    } catch (error) {
        console.error('Error creating simple endless track:', error);
    }
}

// Create a billboard with sponsor logo
function createBillboard(x, z, type) {
    // Billboard stand
    const standGeometry = new THREE.BoxGeometry(15, 80, 15); // Taller and wider
    const standMaterial = new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.7,
        metalness: 0.3
    });
    const stand = new THREE.Mesh(standGeometry, standMaterial);
    stand.position.set(x, 40, z); // Higher
    scene.add(stand);
    trackBarriers.push(stand);
    
    // Billboard panel
    const panelGeometry = new THREE.PlaneGeometry(120, 60); // Larger panel
    
    // Different billboard designs
    let panelMaterial;
    if (type === 0) {
        // Neon sponsor logo - brighter
        panelMaterial = new THREE.MeshStandardMaterial({
            color: 0xff3366,
            emissive: 0xff3366,
            emissiveIntensity: 1.0, // Increased intensity
            roughness: 0.3,
            metalness: 0.7
        });
    } else {
        // Aqua Blitz logo - brighter
        panelMaterial = new THREE.MeshStandardMaterial({
            color: 0x00aaff,
            emissive: 0x00aaff,
            emissiveIntensity: 1.0, // Increased intensity
            roughness: 0.3,
            metalness: 0.7
        });
    }
    
    const panel = new THREE.Mesh(panelGeometry, panelMaterial);
    panel.position.set(x, 80, z); // Higher
    
    // Rotate to face the track
    if (x < 0) {
        panel.rotation.y = Math.PI / 2;
    } else {
        panel.rotation.y = -Math.PI / 2;
    }
    
    scene.add(panel);
    trackBarriers.push(panel);
    
    // Add spotlight to illuminate billboard - brighter
    const spotLight = new THREE.SpotLight(type === 0 ? 0xff3366 : 0x00aaff, 2); // Increased intensity
    spotLight.position.set(x, 120, z); // Higher
    spotLight.target = panel;
    spotLight.angle = 0.6; // Wider angle
    spotLight.penumbra = 0.5;
    spotLight.distance = 200; // Increased range
    spotLight.intensity = 2; // Brighter
    scene.add(spotLight);
    trackLights.push(spotLight);
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