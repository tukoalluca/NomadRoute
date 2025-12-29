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

// Camera config per mode - Zooming out significantly for smoother feel
const MODE_ZOOMS = {
    walk: 14.5,
    bike: 13.5,
    car: 11,
    bus: 11,
    train: 10,
    plane: 3,     // Very zoomed out
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

    // Setup initial state
    let currentLegPath = journey[0].pathCoords;
    let currentMode = journey[0].mode;
    let currentCoords = currentLegPath[0];

    markerEl.innerText = MODE_ICONS[currentMode] || '📍';
    marker.setLngLat(currentCoords);
    onLegStart(0);

    // Initial Camera Move
    map.flyTo({
        center: currentCoords,
        zoom: MODE_ZOOMS[currentMode] || 11,
        pitch: MODE_PITCH[currentMode] || 40,
        bearing: 0,
        speed: 1.5,
        curve: 1
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
                // Final view
                map.flyTo({ zoom: 4, pitch: 0, bearing: 0 }); // Reset to globe view
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

        // --- Camera Tracking ---
        // jumpTo is smoothest for rigid tracking.
        // Reduced zoom will help masking jitter.
        map.jumpTo({
            center: currentPos,
            zoom: MODE_ZOOMS[currentMode] || 11,
            pitch: MODE_PITCH[currentMode] || 35,
            bearing: 0
        });

        animationFrameId = requestAnimationFrame(frame);
    }

    animationFrameId = requestAnimationFrame(frame);
}
