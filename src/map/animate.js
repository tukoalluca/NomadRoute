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

// Target Camera Config Defaults
const DEFAULT_MODE_ZOOMS = {
    walk: 13,
    bike: 12,
    car: 10,
    bus: 10,
    train: 9,
    plane: 3,
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

const DEFAULT_MODE_SPEEDS = {
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

/**
 * Animate Journey with configurable settings
 * @param {mapboxgl.Map} map 
 * @param {HTMLElement} markerEl 
 * @param {mapboxgl.Marker} marker 
 * @param {Array} journey 
 * @param {Function} onComplete 
 * @param {Function} onLegStart 
 * @param {Object} settings { zooms: {}, speeds: {} }
 */
export function animateJourney(map, markerEl, marker, journey, onComplete, onLegStart, settings = {}) {
    stopAnimation();

    const modeZooms = { ...DEFAULT_MODE_ZOOMS, ...settings.zooms };
    const modeSpeeds = { ...DEFAULT_MODE_SPEEDS, ...settings.speeds };

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
            zoom: modeZooms[currentMode] || 10,
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

                    // On leg switch, bridge zoom
                    map.flyTo({
                        center: p2 || currentLegPath[0],
                        zoom: modeZooms[currentMode] || 10,
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

                const speed = modeSpeeds[currentMode] || 1;
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
