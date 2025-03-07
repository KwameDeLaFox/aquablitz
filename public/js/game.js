// Log that the game.js file is loaded
console.log('Aqua Blitz game.js loaded at', new Date().toISOString());

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
    
    // Add a direct keyboard test that directly updates speed
    window.addEventListener('keydown', function(e) {
        console.log('Direct keydown test:', e.key);
        
        // Directly update speed and HUD
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
            // Force speed to increase
            speed = 500;
            speedMeter.textContent = `DIRECT: ${Math.round(speed)} KPH`;
            speedMeter.style.color = 'red';
            console.log('Directly set speed to:', speed);
            
            // Force boat to move forward
            if (playerBoat) {
                const forwardVector = new THREE.Vector3(0, 0, 1);
                forwardVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerBoat.rotation.y);
                forwardVector.multiplyScalar(10); // Move 10 units
                playerBoat.position.add(forwardVector);
                console.log('Directly moved boat to:', playerBoat.position);
            }
        }
        
        // Directly update turning
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
            if (playerBoat) {
                playerBoat.rotation.y += 0.1;
                speedMeter.textContent = `TURNING LEFT: ${Math.round(playerBoat.rotation.y * 57.3)} degrees`;
                speedMeter.style.color = 'blue';
            }
        }
        
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
            if (playerBoat) {
                playerBoat.rotation.y -= 0.1;
                speedMeter.textContent = `TURNING RIGHT: ${Math.round(playerBoat.rotation.y * 57.3)} degrees`;
                speedMeter.style.color = 'green';
            }
        }
    });
    
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

        // Create the Neon Lagoon track
        createNeonLagoonTrack();

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

        // More responsive boat physics
        if (keys.forward) {
            speed += ACCELERATION * delta;
            console.log('Accelerating, new speed:', Math.round(speed));
            // Direct update of HUD for testing
            speedMeter.textContent = `FORWARD: ${Math.abs(Math.round(speed))} KPH`;
            speedMeter.style.color = 'lime';
        } else if (keys.backward) {
            speed -= ACCELERATION * delta * 0.7; // Slower reverse speed
            console.log('Braking, new speed:', Math.round(speed));
            // Direct update of HUD for testing
            speedMeter.textContent = `BACKWARD: ${Math.abs(Math.round(speed))} KPH`;
            speedMeter.style.color = 'orange';
        } else {
            // Natural deceleration when no input
            speed *= 0.95;
            // Direct update of HUD for testing
            speedMeter.textContent = `COASTING: ${Math.abs(Math.round(speed))} KPH`;
        }

        // Apply drag and speed limits
        speed *= DRAG_COEFFICIENT;
        speed = THREE.MathUtils.clamp(speed, -MAX_SPEED * 0.4, MAX_SPEED);

        // Sharper turning when moving
        const turnMultiplier = Math.abs(speed) / MAX_SPEED; // Turn better at higher speeds
        if (keys.left) {
            playerBoat.rotation.y += TURN_SPEED * (isDrifting ? DRIFT_FACTOR : 1) * delta * (turnMultiplier + 0.5);
            console.log('Turning left, rotation:', playerBoat.rotation.y);
            // Update HUD for turning
            speedMeter.textContent += ' TURNING LEFT';
        }
        if (keys.right) {
            playerBoat.rotation.y -= TURN_SPEED * (isDrifting ? DRIFT_FACTOR : 1) * delta * (turnMultiplier + 0.5);
            console.log('Turning right, rotation:', playerBoat.rotation.y);
            // Update HUD for turning
            speedMeter.textContent += ' TURNING RIGHT';
        }

        // Update velocity and position with better physics
        velocity.set(0, 0, speed * delta);
        velocity.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerBoat.rotation.y);
        
        // Add slight banking when turning
        const bankAmount = (keys.left ? 1 : (keys.right ? -1 : 0)) * Math.abs(speed) / MAX_SPEED * 0.3;
        playerBoat.rotation.z = bankAmount;
        
        // Store previous position for logging
        const prevPosition = playerBoat.position.clone();
        
        // Update position
        playerBoat.position.add(velocity);
        
        console.log('Boat moved from', 
            prevPosition.x.toFixed(2), 
            prevPosition.y.toFixed(2), 
            prevPosition.z.toFixed(2), 
            'to', 
            playerBoat.position.x.toFixed(2), 
            playerBoat.position.y.toFixed(2), 
            playerBoat.position.z.toFixed(2)
        );

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
            speed = 500;
            const forwardVector = new THREE.Vector3(0, 0, 1);
            forwardVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerBoat.rotation.y);
            forwardVector.multiplyScalar(10); // Move 10 units
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