# Aqua Blitz 🚤

A fast-paced multiplayer boat racing game inspired by Hydro Thunder, built with Three.js and Socket.IO.

## Features

- Real-time multiplayer racing for up to 8 players
- Arcade-style physics with fast acceleration and big jumps
- Power-ups: Nitro boost (more coming soon!)
- Giant ramp for spectacular aerial moments
- Drift mechanics for skilled cornering
- Low-poly graphics for fast loading

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open `http://localhost:3000` in your browser

## Controls

- W/↑ - Accelerate
- S/↓ - Brake
- A/← D/→ - Turn
- SHIFT - Drift
- SPACE - Use Power-up

## Development

The game is built with:
- Three.js for 3D graphics
- Socket.IO for multiplayer
- Node.js/Express for the server

Key files:
- `server.js` - Multiplayer server logic
- `public/index.html` - Game UI and Three.js setup
- `public/js/game.js` - Core game logic and physics

## Coming Soon

- More tracks (Neon Lagoon, Pirate Cove)
- Additional power-ups (Splash Bomb, Shield)
- Boat customization
- Race countdown and lap system
- Leaderboards
- Sound effects and music

## Performance

The game is optimized for fast loading:
- Low-poly models
- Minimal textures
- Efficient networking with Socket.IO
- Target load time: <5 seconds

## Contributing

Feel free to contribute! Some areas that need work:
- Additional tracks
- Better boat models
- Power-up effects
- Sound system
- Physics tweaking

## License

MIT License - feel free to use this code for your own projects! 