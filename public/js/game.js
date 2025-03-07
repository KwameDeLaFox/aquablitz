import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Constants for game physics
const ACCELERATION = 2000;
const MAX_SPEED = 1500;
const TURN_SPEED = 3.5;
const DRIFT_FACTOR = 2.0;
const DRAG_COEFFICIENT = 0.98;
const WATER_LEVEL = 0;

// Game state
let playerBoat;
let camera, scene, renderer;
let controls;
let clock;
let speed = 0;
let velocity = new THREE.Vector3();
let isDrifting = false;
let isGameStarted = false;

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
        console.log('Initializing scene...');
        
        // Create clock
        clock = new THREE.Clock();
        
        // Scene setup with error handling
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x001133);
        
        // Camera
        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 20000);
        camera.position.set(0, 100, -200);
        camera.lookAt(0, 0, 0);
        
        // Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);
        
        // Basic lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(100, 100, 100);
        scene.add(directionalLight);
        
        // Add simple water plane
        const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
        const waterMaterial = new THREE.MeshBasicMaterial({
            color: 0x0044ff,
            transparent: true,
            opacity: 0.6
        });
        const water = new THREE.Mesh(waterGeometry, waterMaterial);
        water.rotation.x = -Math.PI / 2;
        water.position.y = WATER_LEVEL;
        scene.add(water);
        
        // Add player boat
        const boatGeometry = new THREE.BoxGeometry(20, 10, 40);
        const boatMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
        playerBoat = new THREE.Mesh(boatGeometry, boatMaterial);
        playerBoat.position.y = 5;
        scene.add(playerBoat);
        
        // Add simple track
        createSimpleTrack();
        
        // Add OrbitControls
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        
        // Add keyboard event listeners
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        
        // Handle window resize
        window.addEventListener('resize', onWindowResize, false);
        
        console.log('Scene initialized successfully');
    } catch (error) {
        console.error('Error initializing scene:', error);
    }
}

function createSimpleTrack() {
    // Create a simple track with colored boxes
    const trackPoints = [
        { x: 0, z: 0 },
        { x: 200, z: 50 },
        { x: 400, z: 200 },
        { x: 500, z: 400 },
        { x: 300, z: 600 },
        { x: 100, z: 500 },
        { x: -100, z: 600 },
        { x: -300, z: 400 },
        { x: -200, z: 200 },
        { x: -100, z: 100 }
    ];
    
    // Create track segments
    for (let i = 0; i < trackPoints.length; i++) {
        const start = trackPoints[i];
        const end = trackPoints[(i + 1) % trackPoints.length];
        
        // Create a box for each track point
        const boxGeometry = new THREE.BoxGeometry(50, 10, 50);
        const boxMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff });
        const box = new THREE.Mesh(boxGeometry, boxMaterial);
        box.position.set(start.x, 5, start.z);
        scene.add(box);
    }
}

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

function onKeyDown(event) {
    switch (event.keyCode) {
        case 38: // up arrow
        case 87: // W
            keys.forward = true;
            break;
        case 40: // down arrow
        case 83: // S
            keys.backward = true;
            break;
        case 37: // left arrow
        case 65: // A
            keys.left = true;
            break;
        case 39: // right arrow
        case 68: // D
            keys.right = true;
            break;
        case 16: // shift
            keys.drift = true;
            isDrifting = true;
            break;
        case 32: // space
            keys.powerUp = true;
            break;
    }
}

function onKeyUp(event) {
    switch (event.keyCode) {
        case 38: // up arrow
        case 87: // W
            keys.forward = false;
            break;
        case 40: // down arrow
        case 83: // S
            keys.backward = false;
            break;
        case 37: // left arrow
        case 65: // A
            keys.left = false;
            break;
        case 39: // right arrow
        case 68: // D
            keys.right = false;
            break;
        case 16: // shift
            keys.drift = false;
            isDrifting = false;
            break;
        case 32: // space
            keys.powerUp = false;
            break;
    }
}

// Update game state
function update() {
    const delta = clock.getDelta();

    // Boat physics
    if (keys.forward) {
        speed += ACCELERATION * delta;
    } else if (keys.backward) {
        speed -= ACCELERATION * delta * 0.7;
    } else {
        speed *= 0.95;
    }

    // Apply drag and speed limits
    speed *= DRAG_COEFFICIENT;
    speed = THREE.MathUtils.clamp(speed, -MAX_SPEED * 0.4, MAX_SPEED);

    // Turning
    if (keys.left) {
        playerBoat.rotation.y += TURN_SPEED * delta;
    }
    if (keys.right) {
        playerBoat.rotation.y -= TURN_SPEED * delta;
    }

    // Update velocity and position
    velocity.set(0, 0, speed * delta);
    velocity.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerBoat.rotation.y);
    playerBoat.position.add(velocity);

    // Keep boat above water
    playerBoat.position.y = Math.max(5, playerBoat.position.y);

    // Camera follows boat
    controls.target.copy(playerBoat.position);
    camera.position.set(
        playerBoat.position.x - Math.sin(playerBoat.rotation.y) * 200,
        100,
        playerBoat.position.z - Math.cos(playerBoat.rotation.y) * 200
    );
    controls.update();

    // Update UI
    document.getElementById('speed-meter').textContent = `${Math.abs(Math.round(speed))} KPH`;
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    if (!isGameStarted) return;
    
    try {
        update();
        renderer.render(scene, camera);
    } catch (error) {
        console.error('Error in animation loop:', error);
    }
}

// Start the game
init();
animate(); 