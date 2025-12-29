import { updateActiveTrail, updateCompletedTrail } from './map';
import { getDistance, lerp } from '../utils/geo';

let animationFrameId = null;
let isPaused = false;

// Icons mapping
const MODE_ICONS = {
    walk: '🚶',
    bike: '🚲',
    car: '🚗',
    train: '🚆',
    plane: '✈️'
};

/**
 * Stop any running animation
 */
export function stopAnimation() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

/**
 * Main animation function
 * @param {mapboxgl.Map} map 
 * @param {HTMLElement} markerEl 
 * @param {mapboxgl.Marker} marker 
 * @param {Array} journey structure: [{ pathCoords: [[lng,lat],...], mode: 'car', ... }]
 * @param {Function} onComplete 
 * @param {Function} onLegStart (legIndex) => void
 */
export function animateJourney(map, markerEl, marker, journey, onComplete, onLegStart) {
    stopAnimation();

    let legIndex = 0;
    let pointIndex = 0;
    let progress = 0; // 0 to 1 between current point and next point
    let completedLegsCoords = []; // Array of arrays

    // Speed factor: meters per frame roughly
    // We want a constant visual speed.
    // Real distance varies. We can just use a fixed step size in coordinate space or km.
    // Let's use a fixed speed in km/frame.
    const SPEED_KM_PER_FRAME = 0.05; // Adjustable, maybe scale by zoom level? 
    // Actually, "constant speed feel" usually implies constant screen pixels, but 
    // constant geographic speed is easier. Let's try constant geographic.
    // Issue: Plane leg might be 1000km, Walk 1km. If constant speed, Walk is instant or Plane takes forever.
    // Solution: Adaptive speed based on leg total distance? 
    // Or just fixed "duration" per leg? No, user said "constant speed feel".
    // A simplified approach: move X% of the leg per frame? No, that's variable speed.
    // Let's stick to moving a fixed distance per frame, but clamp it reasonable.
    // For MVP: simply iterate through points. If points are dense (Directions API), one point per frame is slow.
    // Directions API returns dense points. 
    // We will traverse the path array.

    // Better approach for smooth animation:
    // Track current position along the path. 
    // Target speed: e.g. 500km/h for plane, 100km/h car... 
    // Or just make everything fast enough to not be boring.
    // Let's use a "Base Speed" and vary slightly by mode?
    // User said "constant speed feel (approx)".

    const MODE_SPEEDS = {
        walk: 0.1,
        bike: 0.2,
        car: 0.8,
        train: 0.8,
        plane: 5.0
    };

    let currentLegPath = journey[0].pathCoords;
    let currentMode = journey[0].mode;
    let currentCoords = currentLegPath[0];

    markerEl.innerText = MODE_ICONS[currentMode] || '📍';
    marker.setLngLat(currentCoords);
    onLegStart(0);

    // Prepare active trail
    let activeTrailCoords = [currentCoords];

    function frame() {
        if (isPaused) {
            animationFrameId = requestAnimationFrame(frame);
            return;
        }

        // 1. Determine next target point
        const p1 = currentLegPath[pointIndex];
        const p2 = currentLegPath[pointIndex + 1];

        if (!p2) {
            // End of leg
            completedLegsCoords.push(currentLegPath);
            updateCompletedTrail(map, completedLegsCoords);

            legIndex++;
            if (legIndex >= journey.length) {
                // Done
                stopAnimation();
                if (onComplete) onComplete();
                return;
            }

            // Next leg setup
            currentLegPath = journey[legIndex].pathCoords;
            currentMode = journey[legIndex].mode;
            markerEl.innerText = MODE_ICONS[currentMode] || '📍';
            onLegStart(legIndex);

            pointIndex = 0;
            progress = 0;
            activeTrailCoords = [currentLegPath[0]]; // Reset active trail
            updateActiveTrail(map, activeTrailCoords);

            animationFrameId = requestAnimationFrame(frame);
            return;
        }

        const dist = getDistance(p1, p2); // km
        const speed = MODE_SPEEDS[currentMode] || 1;

        // If dist is 0 (duplicate points), skip
        if (dist <= 0.0001) {
            pointIndex++;
            progress = 0;
            animationFrameId = requestAnimationFrame(frame);
            return;
        }

        // Calculate step size (ratio of segment)
        const step = speed / (dist * 100); // Scaling factor to make it look good
        // *100 is just a magic number to tune the global speed. 1 km is long.
        // Let's try simpler logic: Move fixed distance.

        progress += (speed * 0.02); // Just advance progress manually?
        // No, need checks.

        // Let's just traverse points if they are dense enough?
        // Mapbox directions are usually dense. Plane arc we generate is controllable.
        // Let's assume points are approx equidistant or we don't care about perfect constant speed.
        // We will interpolate between p1 and p2.

        // Calculate dynamic step based on distance to keep SPEED constant-ish
        // We want to cover 'speed' km per frame.
        // Segment length is 'dist' km.
        // Step fraction should be (speed / dist).

        // Adjust speed multiplier for "demo" feel (not real-time obviously)
        const DEMO_SPEED_MULTIPLIER = 0.5;
        const fractionStep = (speed * DEMO_SPEED_MULTIPLIER) / dist;

        progress += fractionStep;

        if (progress >= 1) {
            // Reached p2
            pointIndex++;
            progress = 0;
            activeTrailCoords.push(p2);
            marker.setLngLat(p2);
            updateActiveTrail(map, activeTrailCoords);
        } else {
            // Interpolate
            const nextPos = lerp(p1, p2, progress);
            marker.setLngLat(nextPos);
            // Optional: add intermediate points to trail for smoothness? 
            // GeoJSON line string handles two points fine.
            // But we want the trail to grow smoothly. 
            // So we update the LAST point of activeTrailCoords to be `nextPos`
            // But we shouldn't mute the array that holds verified points.
            updateActiveTrail(map, [...activeTrailCoords, nextPos]);
        }

        animationFrameId = requestAnimationFrame(frame);
    }

    animationFrameId = requestAnimationFrame(frame);
}
