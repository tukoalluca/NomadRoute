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

// Target Camera Config - Even more zoomed out
const MODE_ZOOMS = {
    walk: 13,    // Was 14.5
    bike: 12,    // Was 13.5
    car: 10,     // Was 11 - nice regional view
    bus: 10,     // Same as car
    train: 9,    // Was 10
    plane: 3,    // Globe view
    teleport: 9
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

        // Initial Camera Set
        map.flyTo({
            center: currentCoords,
            zoom: MODE_ZOOMS[currentMode] || 10,
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
                        console.warn("Skipping empty leg", legIndex);
                        legIndex++;
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

                    // On leg switch, we DO want to gently encourage the new zoom level
                    // because the transport mode changed (e.g. Car -> Plane).
                    // We can do a one-off flyTo here to bridge the modes.
                    map.flyTo({
                        center: p2 || currentLegPath[0],
                        zoom: MODE_ZOOMS[currentMode] || 10,
                        pitch: MODE_PITCH[currentMode] || 40,
                        speed: 0.8, // Gentle transition
                        curve: 1
                    });

                    break;
                }

                const dist = getDistance(p1, p2);

                if (dist <= 0.0005) {
                    pointIndex++;
                    progress = 0;
                    movesProcessed++;
                    continue;
                }

                const speed = MODE_SPEEDS[currentMode] || 1;
                const DEMO_SPEED_MULTIPLIER = 0.5;
                const fractionStep = (speed * DEMO_SPEED_MULTIPLIER) / dist;

                progress += fractionStep;

                if (progress >= 1) {
                    pointIndex++;
                    progress = 0;
                    activeTrailCoords.push(p2);
                    updateActiveTrail(map, activeTrailCoords);
                    break;
                } else {
                    const currentPos = lerp(p1, p2, progress);
                    updateActiveTrail(map, [...activeTrailCoords, currentPos]);

                    marker.setLngLat(currentPos);

                    // Update Camera: strictly tracking center, NO zoom drift
                    updateCamera(map, currentPos, currentMode);

                    break;
                }
            }

            if (pointIndex < currentLegPath.length && progress === 0) {
                const finalP = currentLegPath[pointIndex];
                marker.setLngLat(finalP);
                updateCamera(map, finalP, currentMode);
            }

        } catch (err) {
            console.error("Animation Loop Error", err);
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

    // REMOVED: Automatic zoom drift logic.
    // We now respect the user's manual zoom. 
    // The zoom is only set initially at the start of a leg.

    // We still maintain pitch drift because pitch is less "personal" and helps scene framing
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
