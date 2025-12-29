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

// Target Camera Config
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

    // Validation
    if (!journey || journey.length === 0 || !journey[0].pathCoords || journey[0].pathCoords.length === 0) {
        console.error("Invalid journey data");
        if (onComplete) onComplete();
        return;
    }

    // Setup initial state
    let currentLegPath = journey[0].pathCoords;
    let currentMode = journey[0].mode;
    let currentCoords = currentLegPath[0];

    try {
        markerEl.innerText = MODE_ICONS[currentMode] || '📍';
        marker.setLngLat(currentCoords);
        onLegStart(0);

        map.flyTo({
            center: currentCoords,
            zoom: MODE_ZOOMS[currentMode] || 11,
            pitch: MODE_PITCH[currentMode] || 40,
            bearing: 0,
            speed: 1.5
        });
    } catch (e) {
        console.error("Error setting up animation start", e);
    }

    let activeTrailCoords = [currentCoords];

    function frame() {
        if (isPaused) {
            animationFrameId = requestAnimationFrame(frame);
            return;
        }

        try {
            // Processing loop: we might skip multiple tiny points in one frame to prevent "stuck" visual
            // But we limit it to avoid freezing the main thread (e.g. max 10 skips)
            let movesProcessed = 0;
            const MAX_SKIPS = 20;

            while (movesProcessed < MAX_SKIPS) {
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
                        return; // EXIT FRAME
                    }

                    // Next Leg
                    if (!journey[legIndex].pathCoords || journey[legIndex].pathCoords.length === 0) {
                        // Skip empty leg?
                        console.warn("Skipping empty leg", legIndex);
                        legIndex++;
                        // Loop continues to check next leg
                        continue;
                    }

                    currentLegPath = journey[legIndex].pathCoords;
                    currentMode = journey[legIndex].mode;
                    markerEl.innerText = MODE_ICONS[currentMode] || '📍';
                    onLegStart(legIndex);

                    pointIndex = 0;
                    progress = 0;
                    activeTrailCoords = [currentLegPath[0]];
                    updateActiveTrail(map, activeTrailCoords);

                    // Break loop to render this state
                    break;
                }

                // Distance Check
                const dist = getDistance(p1, p2); // km

                // If point is duplicate or extremely close, skip instantly
                if (dist <= 0.0005) { // Increased threshold slightly
                    pointIndex++;
                    progress = 0;
                    movesProcessed++;
                    continue; // Retry logic with next point immediately
                }

                const speed = MODE_SPEEDS[currentMode] || 1;
                const DEMO_SPEED_MULTIPLIER = 0.5;
                const fractionStep = (speed * DEMO_SPEED_MULTIPLIER) / dist;

                progress += fractionStep;

                if (progress >= 1) {
                    // Reached p2, move to next point
                    pointIndex++;
                    progress = 0; // Reset progress for next segment
                    activeTrailCoords.push(p2);
                    updateActiveTrail(map, activeTrailCoords);

                    // Since we completed a segment, we 'moved'. 
                    // We *could* continue processing if we covered it instantly, but for animation smoothness
                    // it's usually better to render at p2.
                    // However, if fractionStep was massive (e.g. > 2.0), we skipped a lot.
                    // For now, let's break to render p2.
                    break;
                } else {
                    // Interpolating
                    const currentPos = lerp(p1, p2, progress);
                    // Update active trail optimization: 
                    // To avoid creating massive arrays every frame, we could just optimize the setData call
                    // But here we just append the interpolated point
                    updateActiveTrail(map, [...activeTrailCoords, currentPos]);

                    marker.setLngLat(currentPos);
                    updateCamera(map, currentPos, currentMode);

                    // Done for this frame
                    break;
                }
            }

            // If we broke out of loop because we reached destination, update marker/camera one last time in this frame check
            if (pointIndex < currentLegPath.length) {
                const finalP = currentLegPath[pointIndex];
                // Should we force set marker? Only if we are sitting at a point (progress 0)
                if (progress === 0) {
                    marker.setLngLat(finalP);
                    updateCamera(map, finalP, currentMode);
                }
            }

        } catch (err) {
            console.error("Animation Loop Error", err);
            // Emergency stop to avoid infinite error loop
            stopAnimation();
        }

        animationFrameId = requestAnimationFrame(frame);
    }

    animationFrameId = requestAnimationFrame(frame);
}

function updateCamera(map, center, mode) {
    const cameraOptions = {
        center: center
    };

    // "Drift to Target" logic
    if (!map.isZooming()) {
        const currentZoom = map.getZoom();
        const targetZoom = MODE_ZOOMS[mode] || 11;
        const newZoom = currentZoom + (targetZoom - currentZoom) * 0.01;
        if (Math.abs(newZoom - currentZoom) > 0.001) {
            cameraOptions.zoom = newZoom;
        }
    }

    if (!map.isRotating()) {
        const currentPitch = map.getPitch();
        const targetPitch = MODE_PITCH[mode] || 40;
        const newPitch = currentPitch + (targetPitch - currentPitch) * 0.01;

        if (Math.abs(newPitch - currentPitch) > 0.1) {
            cameraOptions.pitch = newPitch;
        }
    }

    map.jumpTo(cameraOptions);
}
