import * as THREE from 'three';

// Basic scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x001133);

// Camera
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 20000);
camera.position.set(0, 100, -200);
camera.lookAt(0, 0, 0);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Basic lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight.position.set(100, 100, 100);
scene.add(directionalLight);

// Add a simple boat
const boatGeometry = new THREE.BoxGeometry(20, 10, 40);
const boatMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
const boat = new THREE.Mesh(boatGeometry, boatMaterial);
boat.position.y = 5;
scene.add(boat);

// Add a simple water plane
const waterGeometry = new THREE.PlaneGeometry(2000, 2000);
const waterMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x0044ff,
    transparent: true,
    opacity: 0.6
});
const water = new THREE.Mesh(waterGeometry, waterMaterial);
water.rotation.x = -Math.PI / 2;
water.position.y = 0;
scene.add(water);

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Rotate boat
    boat.rotation.y += 0.01;
    
    renderer.render(scene, camera);
}

// Start animation
animate();

// Log success
console.log('Simple scene initialized successfully');

// Add window resize handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}); 