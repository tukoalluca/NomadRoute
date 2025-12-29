import { updateActiveTrail, updateCompletedTrail } from './map';
import { getDistance, lerp, getBearing } from '../utils/geo';

let animationFrameId = null;
let currentRunId = 0; // Unique ID for the active playback session

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
    // Increment run ID so any pending async tasks (waits/loops) from previous runs will fail their checks
    currentRunId++;
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
    const myRunId = currentRunId; // Capture the ID for this specific run

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
            await wait(2500);
            if (currentRunId !== myRunId) return; // Zombie Check

            if (showLabel) hideLabel();
            await wait(800);
            if (currentRunId !== myRunId) return; // Zombie Check
        }

        // --- 2. Iterate Legs ---
        for (let i = 0; i < journey.length; i++) {
            if (currentRunId !== myRunId) return;

            const leg = journey[i];
            const path = leg.pathCoords;
            const mode = leg.mode;
            const speedBase = modeSpeeds[mode] || 1.0;
            const zoomTarget = modeZooms[mode] || 10;
            const pitchTarget = MODE_PITCH[mode] || 40;

            markerEl.innerText = MODE_ICONS[mode] || '📍';

            // "Director" Camera Move
            map.flyTo({
                center: path[0],
                zoom: zoomTarget,
                pitch: pitchTarget,
                bearing: 0,
                speed: 0.8,
                curve: 1.2
            });

            await wait(1000);
            if (currentRunId !== myRunId) return; // Zombie Check after wait

            // --- 3. Execute Leg Animation ---
            await animateLeg(
                map,
                marker,
                path,
                speedBase,
                zoomTarget,
                pitchTarget,
                myRunId // Pass ID to leg for frame-level checks
            );

            if (currentRunId !== myRunId) return;

            // --- 4. Leg Complete ---
            completedLegsCoords.push(path);
            updateActiveTrail(map, []);
            updateCompletedTrail(map, completedLegsCoords);

            // --- 5. Arrival Sequence ---
            const labelText = leg.toName;

            if (showLabel) {
                showLabel(labelText);
                await wait(3000);
                if (currentRunId !== myRunId) return;

                if (showLabel) hideLabel();
                await wait(1000);
                if (currentRunId !== myRunId) return;
            }
        }

        // --- 6. Finale ---
        if (onComplete && currentRunId === myRunId) onComplete();

    } catch (e) {
        console.error("Cinematic Error", e);
        // Only stop if we are still the active run (to avoid messing up a newer run)
        if (currentRunId === myRunId) stopAnimation();
    }
}

/**
 * Animates a single leg with ease-in/out and camera leading
 */
function animateLeg(map, marker, path, speedBase, targetZoom, targetPitch, runId) {
    return new Promise((resolve) => {
        let startTime = null;
        let totalDist = 0;
        for (let i = 0; i < path.length - 1; i++) totalDist += getDistance(path[i], path[i + 1]);

        const REAL_SPEED = speedBase * 0.2;

        let distanceCovered = 0;
        let currentPathIdx = 0;
        let p1 = path[0];
        let p2 = path[1];
        let segmentProgress = 0;

        let activeTrail = [path[0]];
        updateActiveTrail(map, activeTrail);

        function frame(timestamp) {
            // Check Run ID directly
            if (currentRunId !== runId) {
                resolve(); // Kill this promise
                return;
            }

            if (!startTime) startTime = timestamp;

            const progressRatio = totalDist > 0 ? distanceCovered / totalDist : 1;

            let easeFactor = 1;
            if (progressRatio < 0.1) easeFactor = lerp(0.1, 1, progressRatio * 10);
            if (progressRatio > 0.9) easeFactor = lerp(1, 0.1, (progressRatio - 0.9) * 10);

            const moveDist = (REAL_SPEED * easeFactor);

            if (getDistance(p1, p2) <= 0.0001) {
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
                    marker.setLngLat(path[path.length - 1]);
                    updateActiveTrail(map, path);
                    resolve();
                    return;
                }
                p1 = path[currentPathIdx];
                p2 = path[currentPathIdx + 1];
                distanceCovered += getDistance(path[currentPathIdx - 1], p1);
            }

            if (currentPathIdx >= path.length - 1) {
                resolve();
                return;
            }

            p1 = path[currentPathIdx];
            p2 = path[currentPathIdx + 1];

            const currentPos = lerp(p1, p2, segmentProgress);
            marker.setLngLat(currentPos);
            updateActiveTrail(map, [...activeTrail, currentPos]);

            const leadPos = lerp(currentPos, p2, 0.3);

            map.jumpTo({
                center: leadPos,
                zoom: targetZoom,
                pitch: targetPitch,
                bearing: 0
            });

            animationFrameId = requestAnimationFrame(frame);
        }

        animationFrameId = requestAnimationFrame(frame);
    });
}
