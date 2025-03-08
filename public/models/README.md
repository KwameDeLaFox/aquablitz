# Track Models

This directory contains 3D models for the game tracks.

## track.glb

This is the main track model for the game. It should be a GLTF/GLB file with the following properties:

- The track should be a long, straight path with barriers on both sides
- The track should have a start and end point
- The track should have checkpoints along the way
- The track should have billboards and other decorative elements

## Creating a Track Model

You can create a track model using any 3D modeling software that can export to GLTF/GLB format, such as:

- Blender
- Maya
- 3DS Max
- SketchUp

Once you have created your model, export it as a GLB file and place it in this directory.

## Using the Track Model

The game will automatically load the track model when the game starts. If the model fails to load, a basic track will be created as a fallback. 