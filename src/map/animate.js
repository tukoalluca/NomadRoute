import { updateActiveTrail, updateCompletedTrail } from './map';
import { getDistance, lerp, getBearing } from '../utils/geo';

let animationFrameId = null;
let isPaused = false;
let stopRequested = false;

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
    bus: 45,
    train: 40,
    plane: 10,
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
    stopRequested = true;
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

// --- Cinematic Helpers ---

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/**
 * Animate Journey with "Cinematic Director" Logic
 */
export async function animateJourney(
    map,
    markerEl,
    marker,
    journey,
    onComplete,
    onLegStart,
    settings = {},
    showLabel,
    hideLabel
) {
    stopAnimation();
    stopRequested = false;

    const modeZooms = { ...DEFAULT_MODE_ZOOMS, ...settings.zooms };
    const modeSpeeds = { ...DEFAULT_MODE_SPEEDS, ...settings.speeds };

    let completedLegsCoords = [];

    // Validation
    if (!journey || journey.length === 0) {
        if (onComplete) onComplete();
        return;
    }

    try {
        // --- 1. Opening Sequence ---
        // Start at first point
        const firstPoint = journey[0].pathCoords[0];
        markerEl.innerText = MODE_ICONS[journey[0].mode] || '📍';
        marker.setLngLat(firstPoint);
        updateActiveTrail(map, []);
        updateCompletedTrail(map, []);

        // Initial Camera Position (Slightly further out for context)
        map.jumpTo({
            center: firstPoint,
            zoom: (modeZooms['car'] || 10) - 1,
            pitch: 0,
            bearing: 0
        });

        // Show Start Label
        if (showLabel && journey[0].fromName) {
            showLabel(journey[0].fromName);
            await wait(2500); // Read time
            if (showLabel) hideLabel();
            await wait(800); // Fade out time
        }

        if (stopRequested) return;

        // --- 2. Iterate Legs ---
        for (let i = 0; i < journey.length; i++) {
            const leg = journey[i];
            const path = leg.pathCoords;
            const mode = leg.mode;
            const speedBase = modeSpeeds[mode] || 1.0;
            const zoomTarget = modeZooms[mode] || 10;
            const pitchTarget = MODE_PITCH[mode] || 40;

            // Transition Camera for Start of Leg
            markerEl.innerText = MODE_ICONS[mode] || '📍';

            // "Director" Camera Move: Focus on the path
            // We ease into the leg.
            map.flyTo({
                center: path[0],
                zoom: zoomTarget,
                pitch: pitchTarget,
                bearing: 0,
                speed: 0.8,
                curve: 1.2
            });

            await wait(1000); // Pause for camera to settle and viewer to anticipate

            // --- 3. Execute Leg Animation ---
            // We use a custom Promise-based animation loop for this leg
            await animateLeg(
                map,
                marker,
                path,
                speedBase,
                zoomTarget,
                pitchTarget,
                completedLegsCoords
            );

            if (stopRequested) return;

            // --- 4. Leg Complete ---
            completedLegsCoords.push(path);
            updateActiveTrail(map, []); // Clear active
            updateCompletedTrail(map, completedLegsCoords); // Commit to gray

            // --- 5. Arrival Sequence ---
            // Decelerate is handled by ease-out in animateLeg roughly, but we pause here.

            // Show Destination Label
            // Check if this is the final destination or just a stop
            const isFinal = i === journey.length - 1;
            const labelText = leg.toName;

            if (showLabel) {
                showLabel(labelText);
                await wait(3000); // Read time
                if (showLabel) hideLabel();
                await wait(1000);
            }
        }

        // --- 6. Finale ---
        if (onComplete) onComplete();

    } catch (e) {
        console.error("Cinematic Error", e);
        stopAnimation();
    }
}

/**
 * Animates a single leg with ease-in/out and camera leading
 */
function animateLeg(map, marker, path, speedBase, targetZoom, targetPitch, previousTrails) {
    return new Promise((resolve) => {
        let startTime = null;
        // Calculate total distance to estimate duration
        let totalDist = 0;
        for (let i = 0; i < path.length - 1; i++) totalDist += getDistance(path[i], path[i + 1]);

        // Heuristic duration: dist / speed
        // Speed multiplier needs calibration. 
        // 1.0 speed ~= 1000km / 5s? 
        // Let's say speed 1 = 200km/s (very fast for car)
        // Adjust:
        const REAL_SPEED = speedBase * 0.2; // km per frame roughly
        // We can't strictly predict duration frame by frame, so we use distance progress.

        let distanceCovered = 0;
        let currentPathIdx = 0;
        let p1 = path[0];
        let p2 = path[1];
        let segmentProgress = 0;

        let activeTrail = [path[0]];
        updateActiveTrail(map, activeTrail);

        function frame(timestamp) {
            if (stopRequested) {
                resolve();
                return;
            }
            if (!startTime) startTime = timestamp;

            // Calculate Easing Factor based on total progress
            const progressRatio = totalDist > 0 ? distanceCovered / totalDist : 1;

            // Ease In at 0-10%, Ease Out at 90-100%
            let easeFactor = 1;
            if (progressRatio < 0.1) easeFactor = lerp(0.1, 1, progressRatio * 10);
            if (progressRatio > 0.9) easeFactor = lerp(1, 0.1, (progressRatio - 0.9) * 10);

            // Move
            const moveDist = (REAL_SPEED * easeFactor);

            // Advance
            if (getDistance(p1, p2) <= 0.0001) {
                // Skip tiny segment
                currentPathIdx++;
            } else {
                const segDist = getDistance(p1, p2);
                const segStep = moveDist / segDist;

                segmentProgress += segStep;
            }

            while (segmentProgress >= 1) {
                segmentProgress -= 1;
                currentPathIdx++;
                activeTrail.push(p2);
                if (currentPathIdx >= path.length - 1) {
                    // Leg Done
                    marker.setLngLat(path[path.length - 1]);
                    updateActiveTrail(map, path);
                    resolve();
                    return;
                }
                p1 = path[currentPathIdx];
                p2 = path[currentPathIdx + 1];

                // Recalculate segment distance for next loop to be accurate?
                // For simplicity, we assume next frame catches it.
                // But we must update distanceCovered
                distanceCovered += getDistance(path[currentPathIdx - 1], p1);
            }

            // Interpolate
            // Safe check
            if (currentPathIdx >= path.length - 1) {
                resolve();
                return;
            }

            p1 = path[currentPathIdx];
            p2 = path[currentPathIdx + 1];

            const currentPos = lerp(p1, p2, segmentProgress);
            marker.setLngLat(currentPos);

            // Update Active Trail (visually grow it)
            // Perf: don't update every single frame if too heavy? Mapbox handles it well usually.
            // To smooth it:
            updateActiveTrail(map, [...activeTrail, currentPos]);

            // --- Camera Leading ---
            // Look ahead: find a point roughly "Zoom / 2" distance ahead?
            // Or just P2?
            // Let's lead by a small fixed ratio of the screen.
            // Using logic: Center = Lerp(Current, Target, 0.X)
            // A simple lead is to center the camera on a point slightly ahead of the marker.

            // Let's try to project ahead.
            // bearing from p1 to p2
            // We just center on currentPos for now but use JumpTo to avoid lag
            // User requested: "Not perfectly centered" -> "Keep it slightly behind center"
            // Actually, "Keep [marker] slightly behind center to create forward motion" means Camera Center is AHEAD of Marker.

            // Simple approach: Camera Center = lerp(currentPos, p2, 0.3)
            // This pulls the camera towards the destination of the segment. 
            // If segment is long, it looks far ahead.

            const leadPos = lerp(currentPos, p2, 0.3);

            map.jumpTo({
                center: leadPos,
                zoom: targetZoom,
                pitch: targetPitch,
                bearing: 0 // Keep north up for stability, or rotate? User said "Calm", so 0 is best.
            });

            animationFrameId = requestAnimationFrame(frame);
        }

        animationFrameId = requestAnimationFrame(frame);
    });
}
