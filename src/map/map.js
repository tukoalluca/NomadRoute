import mapboxgl from 'mapbox-gl';

export const COMPLETED_SOURCE = 'completed-trail-source';
export const COMPLETED_LAYER = 'completed-trail-layer';
export const ACTIVE_SOURCE = 'active-trail-source';
export const ACTIVE_LAYER = 'active-trail-layer';

export function initMap(containerId, token) {
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
        container: containerId,
        style: 'mapbox://styles/mapbox/outdoors-v12', // Outdoors style
        center: [100.5018, 13.7563], // Default Bangkok
        zoom: 4,
        projection: 'globe' // 3D globe effect
    });

    map.on('load', () => {
        // Source for completed legs
        map.addSource(COMPLETED_SOURCE, {
            type: 'geojson',
            data: {
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'MultiLineString',
                    coordinates: []
                }
            }
        });

        // Layer for completed legs (dimmer)
        map.addLayer({
            id: COMPLETED_LAYER,
            type: 'line',
            source: COMPLETED_SOURCE,
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#555555',
                'line-width': 4,
                'line-opacity': 0.8
            }
        });

        // Source for active animating leg
        map.addSource(ACTIVE_SOURCE, {
            type: 'geojson',
            data: {
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'LineString',
                    coordinates: []
                }
            }
        });

        // Layer for active leg (bright)
        map.addLayer({
            id: ACTIVE_LAYER,
            type: 'line',
            source: ACTIVE_SOURCE,
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#4caf50', // Green active trail
                'line-width': 5,
                'line-glow-width': 2
            }
        });

        // Add atmosphere for globe
        map.setFog({});
    });

    return map;
}

export function updateCompletedTrail(map, allCoords) {
    const source = map.getSource(COMPLETED_SOURCE);
    if (source) {
        source.setData({
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'MultiLineString',
                coordinates: allCoords // Array of arrays of coords
            }
        });
    }
}

export function updateActiveTrail(map, coords) {
    const source = map.getSource(ACTIVE_SOURCE);
    if (source) {
        source.setData({
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'LineString',
                coordinates: coords
            }
        });
    }
}

/**
 * Dynamically update layer colors
 * @param {mapboxgl.Map} map 
 * @param {string} activeColor 
 * @param {string} completedColor 
 */
export function setLayerColors(map, activeColor, completedColor) {
    if (!map) return;

    if (map.getLayer(ACTIVE_LAYER)) {
        map.setPaintProperty(ACTIVE_LAYER, 'line-color', activeColor);
    }

    if (map.getLayer(COMPLETED_LAYER)) {
        map.setPaintProperty(COMPLETED_LAYER, 'line-color', completedColor);
    }
}
