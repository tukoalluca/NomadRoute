import * as turf from '@turf/turf';

/**
 * Calculate the bounding box for a set of points
 * @param {Array<[number, number]>} coords 
 * @returns {mapboxgl.LngLatBounds}
 */
export function getBounds(coords) {
    if (!coords || coords.length === 0) return null;

    // Simple min/max implementation
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;

    coords.forEach(([lng, lat]) => {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
    });

    // Provide some padding handled by mapbox fitBounds usually, but returning basic bounds here
    // Creating a minimal compatible object for mapbox-gl fitBounds
    return [[minLng, minLat], [maxLng, maxLat]];
}

/**
 * Generate a curved path (Great Circle) between two points for planes
 * @param {[number, number]} start 
 * @param {[number, number]} end 
 * @param {number} numPoints 
 * @returns {Array<[number, number]>}
 */
export function getGreatCircleArc(start, end, numPoints = 100) {
    const startPt = turf.point(start);
    const endPt = turf.point(end);

    // Calculate distance to determine number of points if needed due to resolution, but fixed is fine
    const line = turf.greatCircle(startPt, endPt, { npoints: numPoints });
    return line.geometry.coordinates;
}

/**
 * Get distance between two points in km
 * @param {[number, number]} c1 
 * @param {[number, number]} c2 
 */
export function getDistance(c1, c2) {
    return turf.distance(turf.point(c1), turf.point(c2));
}

/**
 * Linearly interpolate between two points
 * @param {[number, number]} p1 
 * @param {[number, number]} p2 
 * @param {number} t (0 to 1)
 */
export function lerp(p1, p2, t) {
    return [
        p1[0] + (p2[0] - p1[0]) * t,
        p1[1] + (p2[1] - p1[1]) * t
    ];
}
