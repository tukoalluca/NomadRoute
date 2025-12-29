const BASE_URL = 'https://api.mapbox.com';

/**
 * Search for places using Mapbox Geocoding API
 * @param {string} query 
 * @param {string} token 
 * @returns {Promise<Array>} List of features
 */
export async function searchPlaces(query, token) {
    if (!query || query.length < 3) return [];

    const url = `${BASE_URL}/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&autocomplete=true&limit=5`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Geocoding failed');
        const data = await res.json();
        return data.features.map(f => ({
            id: f.id,
            name: f.place_name,
            center: f.center // [lng, lat]
        }));
    } catch (e) {
        console.error(e);
        return [];
    }
}

/**
 * Get route between two points
 * @param {string} profile 'driving', 'cycling', 'walking'
 * @param {[number, number]} start 
 * @param {[number, number]} end 
 * @param {string} token 
 * @returns {Promise<Array<[number, number]>>} Array of coordinates
 */
export async function getDirections(profile, start, end, token) {
    const coords = `${start[0]},${start[1]};${end[0]},${end[1]}`;
    const mapboxProfile = `mapbox/${profile}`; // driving, walking, cycling

    const url = `${BASE_URL}/directions/v5/${mapboxProfile}/${coords}?geometries=geojson&access_token=${token}`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Directions failed');
        const data = await res.json();

        if (!data.routes || data.routes.length === 0) {
            throw new Error('No route found');
        }

        return data.routes[0].geometry.coordinates;
    } catch (e) {
        console.error(e);
        throw e;
    }
}
