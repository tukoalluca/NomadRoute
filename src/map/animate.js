import { updateActiveTrail, updateCompletedTrail } from './map';
import { getDistance, lerp } from '../utils/geo';

let animationFrameId = null;
let isPaused = false;

// Icons mapping
const MODE_ICONS = {
    walk: '🚶',
    bike: '🚲',
    car: '🚗',
    bus: '🚌',
    train: '🚆',
    plane: '✈️',
    teleport: '🌀'
};

// Target Camera Config (ideal state, but overridable by user interaction)
const MODE_ZOOMS = {
    walk: 15,
    bike: 14,
    car: 12,
    bus: 12,
    train: 11,
    plane: 3,
    teleport: 10
};

const MODE_PITCH = {
    walk: 50,
    bike: 45,
    car: 40,
    bus: 40,
    train: 35,
    plane: 0,
    teleport: 40
};

const MODE_SPEEDS = {
    walk: 0.1,
    bike: 0.3,
    car: 0.8,
    bus: 0.6,
    train: 1.0,
    plane: 8.0,
    teleport: 100.0
};

export function stopAnimation() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

export function animateJourney(map, markerEl, marker, journey, onComplete, onLegStart) {
    stopAnimation();

    let legIndex = 0;
    let pointIndex = 0;
    let progress = 0;
    let completedLegsCoords = [];

    // Setup initial state
    let currentLegPath = journey[0].pathCoords;
    let currentMode = journey[0].mode;
    let currentCoords = currentLegPath[0];

    markerEl.innerText = MODE_ICONS[currentMode] || '📍';
    marker.setLngLat(currentCoords);
    onLegStart(0);

    // Initial Camera Move (Start of journey - force set)
    map.flyTo({
        center: currentCoords,
        zoom: MODE_ZOOMS[currentMode] || 11,
        pitch: MODE_PITCH[currentMode] || 40,
        bearing: 0,
        speed: 1.5
    });

    let activeTrailCoords = [currentCoords];

    function frame() {
        if (isPaused) {
            animationFrameId = requestAnimationFrame(frame);
            return;
        }

        const p1 = currentLegPath[pointIndex];
        const p2 = currentLegPath[pointIndex + 1];

        // End of Leg Check
        if (!p2) {
            completedLegsCoords.push(currentLegPath);
            updateCompletedTrail(map, completedLegsCoords);

            legIndex++;
            if (legIndex >= journey.length) {
                stopAnimation();
                map.flyTo({ zoom: 3, pitch: 0, bearing: 0 });
                if (onComplete) onComplete();
                return;
            }

            // Next Leg
            currentLegPath = journey[legIndex].pathCoords;
            currentMode = journey[legIndex].mode;
            markerEl.innerText = MODE_ICONS[currentMode] || '📍';
            onLegStart(legIndex);

            pointIndex = 0;
            progress = 0;
            activeTrailCoords = [currentLegPath[0]];
            updateActiveTrail(map, activeTrailCoords);

            animationFrameId = requestAnimationFrame(frame);
            return;
        }

        // Movement Logic
        const dist = getDistance(p1, p2); // km
        const speed = MODE_SPEEDS[currentMode] || 1;

        if (dist <= 0.0001) {
            // instant skip duplicate points
            pointIndex++;
            progress = 0;
            animationFrameId = requestAnimationFrame(frame);
            return;
        }

        const DEMO_SPEED_MULTIPLIER = 0.5;
        const fractionStep = (speed * DEMO_SPEED_MULTIPLIER) / dist;

        progress += fractionStep;

        let currentPos;
        if (progress >= 1) {
            pointIndex++;
            progress = 0;
            currentPos = p2;
            activeTrailCoords.push(p2);
            updateActiveTrail(map, activeTrailCoords);
        } else {
            currentPos = lerp(p1, p2, progress);
            updateActiveTrail(map, [...activeTrailCoords, currentPos]);
        }

        marker.setLngLat(currentPos);

        // --- Camera Tracking Logic ---
        // Requirement: Always follow icon (center).
        // Requirement: Allow user to scroll/zoom (don't force zoom if interacting).
        // Requirement: Smooth transition between modes.

        const cameraOptions = {
            center: currentPos
        };

        // Check if user is interacting with map controls
        const isUserInteracting = map.isZooming() || map.isRotating() || map.isMoving() || map.isDragPan();
        // Note: isMoving() returns true if we are calling jumpTo/flyTo. 
        // We need 'isUserInteracting' specifically, but Mapbox GL JS doesn't have a single flag.
        // However, we can check if we are *currently* strictly following our own logic? 
        // Actually, simpler approach:
        // We always set CENTER.
        // We only set ZOOM and PITCH if we think we should drift to it.

        // Let's implement a "Drift to Target" logic.
        // If the current zoom is significantly different from target, we gently nudge it.
        // UNLESS the user is actively zooming.

        if (!map.isZooming()) {
            const currentZoom = map.getZoom();
            const targetZoom = MODE_ZOOMS[currentMode] || 11;

            // Simple ease towards target (lerp)
            // 0.02 factor makes it slow and smooth, creating a "drift" effect
            const newZoom = currentZoom + (targetZoom - currentZoom) * 0.01;

            // Only apply if difference is noteworthy to avoid micro-jitters
            if (Math.abs(newZoom - currentZoom) > 0.001) {
                cameraOptions.zoom = newZoom;
            }
        }

        if (!map.isRotating()) {
            const currentPitch = map.getPitch();
            const targetPitch = MODE_PITCH[currentMode] || 40;
            const newPitch = currentPitch + (targetPitch - currentPitch) * 0.01;

            if (Math.abs(newPitch - currentPitch) > 0.1) {
                cameraOptions.pitch = newPitch;
            }
        }

        map.jumpTo(cameraOptions);

        animationFrameId = requestAnimationFrame(frame);
    }

    animationFrameId = requestAnimationFrame(frame);
}
