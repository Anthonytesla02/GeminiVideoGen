# Lumina AI Video Generator - Application Guide

Lumina is a sophisticated client-side application that leverages Google's Gemini 2.5 models to generate "Kinetic" style videos completely within the browser. This guide details the architecture, asset generation pipeline, audio engineering, and rendering techniques used in the app.

## 1. Architecture Overview

The application is built using **React 19** and **TypeScript**. It operates without a dedicated backend server for video processing; all media assembly, effects, and audio mixing happen in the user's browser using the **Web Audio API** and **HTML5 Canvas**.

### Key Components
- **`services/geminiService.ts`**: Handles all interactions with the Gemini API (Scripting, Image Gen, TTS).
- **`components/Player.tsx`**: The core engine. It acts as both the preview player (using DOM/CSS) and the video renderer (using Canvas/MediaRecorder).
- **`utils/audioUtils.ts`**: A utility library for low-level audio graph manipulation (EQ, Effects, Decoding).
- **`App.tsx`**: The main controller managing application state (Idle, Scripting, Generating, Ready, Exporting).

---

## 2. The Generation Pipeline

The video creation process follows a strict linear pipeline optimized for the Gemini Free Tier rate limits.

### Step 1: Scripting (`gemini-2.5-flash`)
1.  The user inputs a topic.
2.  The app constructs a complex prompt enforcing:
    -   **JSON Structure**: Strictly typed output.
    -   **Pacing**: Sentence lengths tailored to Short or Long form.
    -   **Visual Cues**: Instructions to highlight specific keywords with asterisks (e.g., `*Video*`).
3.  Gemini returns a JSON array of "Scenes". Each scene contains the script text and a detailed image prompt.

### Step 2: Asset Generation (Serial Execution)
To avoid `429 Resource Exhausted` errors, assets are generated one by one with a delay:
1.  **Image**: Calls `gemini-2.5-flash-image`.
    -   Prompts are automatically enhanced with "cinematic lighting, 8k, minimalist" modifiers.
    -   Returns a Base64 encoded string.
2.  **Audio**: Calls `gemini-2.5-flash-preview-tts`.
    -   Text is stripped of visual markup (asterisks).
    -   Returns raw PCM audio data.
3.  **Delay**: The loop pauses for 1.5 seconds between requests to respect the rate limit bucket.

---

## 3. Audio Engineering Engine

Lumina doesn't just play audio files; it constructs a real-time audio graph for professional sound.

### The Graph
`Source -> Bass Boost EQ -> Auto-Ducker -> Destination`

1.  **Bass Boost**: A `BiquadFilterNode` (LowShelf) boosts frequencies below 200Hz by +4dB to give the AI voice a "radio broadcast" quality.
2.  **Auto-Ducking**:
    -   A background music loop (Lofi Drone) plays continuously.
    -   When the voice speaks, the music gain is automatically lowered to 2% volume.
    -   When the voice ends, the music swells back up.
3.  **Synthesized SFX**:
    -   **Whoosh**: A white noise buffer passed through a modulated LowPass filter creates a "swoosh" sound on scene changes.
    -   **Pop**: A sine wave oscillator with a rapid exponential frequency drop creates a subtle "blip" when text appears.
    -   These are generated mathematically on the fly—no external mp3 files required.

---

## 4. Visual Rendering & "Kinetic" Typography

The app uses two rendering modes: **DOM** (for Preview) and **Canvas** (for Export).

### Visual Logic
-   **Ken Burns Effect**: Every static image is assigned a random movement:
    -   `Zoom In`: Scale 1.0 → 1.15
    -   `Zoom Out`: Scale 1.15 → 1.0
    -   `Pan`: Scale 1.1, Translate X.
-   **Film Grain**: A CSS/Canvas noise overlay is applied to reduce the "clean digital" look.

### Kinetic Typography
-   **Parsing**: The text engine scans for `*word*` syntax.
-   **Highlighting**:
    -   Standard text: White (#FFFFFF) with Drop Shadow.
    -   Highlighted text: Gold (#FFD700) with a Glowing Shadow.
-   **Layout**: Text is wrapped and centered dynamically based on the aspect ratio (16:9 or 9:16).

---

## 5. Video Export (Download)

Downloading a video generated in the browser is complex because there is no video file until we create one.

### The "Record-While-Playing" Technique
When "Export Video" is clicked:
1.  The app enters **Export Mode**.
2.  It creates a hidden `<canvas>` element.
3.  It sets up a `MediaRecorder` to capture the stream from the canvas and a `MediaStreamDestination` from the audio context.
4.  **The Rendering Loop**:
    -   The app plays through the playlist scene-by-scene.
    -   Instead of CSS, it uses `requestAnimationFrame` to draw the images and text onto the canvas 30 times per second.
    -   The math for Zoom/Pan is recalculated for the Canvas 2D context.
5.  **Completion**:
    -   Once the last scene finishes, the recorder stops.
    -   The recorded chunks are combined into a `Blob` (MIME type `video/webm`).
    -   The browser triggers a download of the resulting file.

This ensures that exactly what you see (effects, text, timing) and hear (EQ, ducking, SFX) is captured in the final video.
