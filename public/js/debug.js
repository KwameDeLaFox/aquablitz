// Debug version of game.js
console.log('Debug script starting...');

try {
    // Import Three.js
    console.log('Importing Three.js...');
    import('three').then(THREE => {
        console.log('Three.js imported successfully');
        
        // Basic scene setup
        console.log('Setting up scene...');
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x001133);
        
        // Camera
        console.log('Setting up camera...');
        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 20000);
        camera.position.set(0, 100, -200);
        camera.lookAt(0, 0, 0);
        
        // Renderer
        console.log('Setting up renderer...');
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);
        
        // Basic lighting
        console.log('Adding lights...');
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(100, 100, 100);
        scene.add(directionalLight);
        
        // Add a simple boat
        console.log('Adding boat...');
        const boatGeometry = new THREE.BoxGeometry(20, 10, 40);
        const boatMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
        const boat = new THREE.Mesh(boatGeometry, boatMaterial);
        boat.position.y = 5;
        scene.add(boat);
        
        // Add a simple water plane
        console.log('Adding water plane...');
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
        console.log('Starting animation loop...');
        function animate() {
            requestAnimationFrame(animate);
            
            // Rotate boat
            boat.rotation.y += 0.01;
            
            renderer.render(scene, camera);
        }
        
        // Start animation
        animate();
        
        console.log('Debug scene initialized successfully');
    }).catch(error => {
        console.error('Error importing Three.js:', error);
    });
} catch (error) {
    console.error('Critical error in debug script:', error);
} 