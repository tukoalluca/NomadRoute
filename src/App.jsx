import React, { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { initMap, updateActiveTrail, updateCompletedTrail } from './map/map';
import { searchPlaces, getDirections } from './api/mapbox';
import { getGreatCircleArc, getBounds } from './utils/geo';
import { animateJourney, stopAnimation } from './map/animate';
import './styles.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// Sub-component for Autocomplete Input
function LocationInput({ label, value, onSelect, placeholder }) {
    const [query, setQuery] = useState(value ? value.name : '');
    const [suggestions, setSuggestions] = useState([]);
    const [isOpen, setIsOpen] = useState(false);

    // Update local state if parent updates value
    useEffect(() => {
        if (value) setQuery(value.name);
    }, [value]);

    const handleChange = async (e) => {
        const val = e.target.value;
        setQuery(val);

        if (val.length > 2) {
            const results = await searchPlaces(val, MAPBOX_TOKEN);
            setSuggestions(results);
            setIsOpen(true);
        } else {
            setSuggestions([]);
            setIsOpen(false);
        }
    };

    const handleSelect = (place) => {
        setQuery(place.name);
        setIsOpen(false);
        onSelect(place);
    };

    return (
        <div className="input-group">
            <label>{label}</label>
            <input
                type="text"
                value={query}
                onChange={handleChange}
                placeholder={placeholder}
                onBlur={() => setTimeout(() => setIsOpen(false), 200)}
                onFocus={() => query.length > 2 && setIsOpen(true)}
            />
            {isOpen && suggestions.length > 0 && (
                <ul className="suggestions-list">
                    {suggestions.map(s => (
                        <li key={s.id} className="suggestion-item" onClick={() => handleSelect(s)}>
                            {s.name}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

const MODES = [
    { value: 'car', label: 'Car 🚗' },
    { value: 'bike', label: 'Bike 🚲' },
    { value: 'walk', label: 'Walk 🚶' },
    { value: 'train', label: 'Train 🚆' },
    { value: 'plane', label: 'Plane ✈️' },
    { value: 'teleport', label: 'Teleport 🌀' }
];

const MODE_ICONS = {
    car: '🚗',
    bike: '🚲',
    walk: '🚶',
    train: '🚆',
    plane: '✈️',
    teleport: '🌀'
};

export default function App() {
    // Map State
    const mapContainer = useRef(null);
    const mapInstance = useRef(null);
    const markerRef = useRef(null); // The moving animation marker
    const markerElRef = useRef(null);
    const staticMarkersRef = useRef([]); // Markers for start and stops

    // Data State
    const [startPlace, setStartPlace] = useState(null);
    const [stops, setStops] = useState([{ id: Date.now(), place: null, mode: 'car' }]);
    const [isAnimating, setIsAnimating] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');

    useEffect(() => {
        if (!process.env.VITE_MAPBOX_TOKEN && !MAPBOX_TOKEN) {
            alert('Missing VITE_MAPBOX_TOKEN in .env');
            return;
        }

        const map = initMap(mapContainer.current, MAPBOX_TOKEN);
        mapInstance.current = map;

        // Create customizable marker for animation
        const el = document.createElement('div');
        el.className = 'marker-icon';
        el.innerText = '📍';
        markerElRef.current = el;

        const marker = new mapboxgl.Marker(el)
            .setLngLat([100.5, 13.7]) // Init somewhere
            .addTo(map);

        // Hide moving marker initially
        el.style.display = 'none';
        markerRef.current = marker;

        return () => {
            map.remove();
            mapInstance.current = null;
        };
    }, []);

    // Effect: Update Static Markers when locations change
    useEffect(() => {
        if (!mapInstance.current) return;

        // Clear existing static markers
        staticMarkersRef.current.forEach(m => m.remove());
        staticMarkersRef.current = [];

        const boundsPoints = [];

        // Add Start Marker (Green)
        if (startPlace && startPlace.center) {
            const el = document.createElement('div');
            el.className = 'marker-static start';
            // Use basic style if no css class
            el.innerHTML = '<div style="background-color: #4caf50; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center;">⛳</div>';
            
            const m = new mapboxgl.Marker({ element: el, anchor: 'center' })
                .setLngLat(startPlace.center)
                .setPopup(new mapboxgl.Popup({ offset: 25 }).setText('Start: ' + startPlace.name))
                .addTo(mapInstance.current);
            
            staticMarkersRef.current.push(m);
            boundsPoints.push(startPlace.center);
        }

        // Add Stop Markers (Red)
        stops.forEach((stop, idx) => {
            if (stop.place && stop.place.center) {
                const el = document.createElement('div');
                el.className = 'marker-static stop';
                el.innerHTML = '<div style="background-color: #ff5252; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center;">📍</div>';

                const m = new mapboxgl.Marker({ element: el, anchor: 'center' })
                    .setLngLat(stop.place.center)
                    .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(`Stop ${idx + 1}: ${stop.place.name}`))
                    .addTo(mapInstance.current);

                staticMarkersRef.current.push(m);
                boundsPoints.push(stop.place.center);
            }
        });

        // Optional: Auto-fit bounds (with debouncing or check if user interacted? 
        // For now, let's fit if not animating to give feedback)
        if (!isAnimating && boundsPoints.length > 0) {
            try {
                // If only 1 point, flyTo
                if (boundsPoints.length === 1) {
                    mapInstance.current.flyTo({ center: boundsPoints[0], zoom: 10, speed: 1.5 });
                } else {
                    const bounds = getBounds(boundsPoints);
                    if (bounds) {
                        mapInstance.current.fitBounds(bounds, { padding: 100, maxZoom: 12, duration: 1500 });
                    }
                }
            } catch (err) {
                console.warn("FitBounds error", err);
            }
        }

    }, [startPlace, stops, isAnimating]);

    const addStop = () => {
        if (stops.length >= 10) return;
        setStops([...stops, { id: Date.now(), place: null, mode: 'car' }]);
    };

    const removeStop = (id) => {
        setStops(stops.filter(s => s.id !== id));
    };

    const updateStop = (id, field, value) => {
        setStops(stops.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

    const handleClear = () => {
        stopAnimation();
        setIsAnimating(false);
        setStartPlace(null);
        setStops([{ id: Date.now(), place: null, mode: 'car' }]);
        setStatusMessage('');

        // Clear map layers
        if (mapInstance.current) {
            updateActiveTrail(mapInstance.current, []);
            updateCompletedTrail(mapInstance.current, []);
            if (markerElRef.current) markerElRef.current.style.display = 'none';
        }
    };

    const handlePlay = async () => {
        if (isAnimating) return; // Prevention
        // Validation
        if (!startPlace) {
            alert('Please select a Start location.');
            return;
        }
        const validStops = stops.filter(s => s.place !== null);
        if (validStops.length === 0) {
            alert('Please add at least one destination.');
            return;
        }

        setIsAnimating(true);
        setStatusMessage('Calculating route...');
        stopAnimation();

        // Clear Map Layers
        updateActiveTrail(mapInstance.current, []);
        updateCompletedTrail(mapInstance.current, []);

        try {
            const journey = [];
            let prevCoords = startPlace.center;

            // Build Journey Segments
            for (let i = 0; i < validStops.length; i++) {
                const stop = validStops[i];
                const mode = stop.mode;
                const targetCoords = stop.place.center;

                let points = [];

                if (mode === 'plane') {
                    points = getGreatCircleArc(prevCoords, targetCoords, 100);
                } else if (mode === 'teleport') {
                    points = [prevCoords, targetCoords];
                } else {
                    // API Call
                    const profileMap = {
                        car: 'driving',
                        train: 'driving', 
                        bike: 'cycling',
                        walk: 'walking'
                    };
                    points = await getDirections(profileMap[mode] || 'driving', prevCoords, targetCoords, MAPBOX_TOKEN);
                }

                journey.push({
                    mode: mode,
                    from: prevCoords,
                    to: targetCoords,
                    pathCoords: points
                });

                prevCoords = targetCoords;
            }

            // Fit Bounds
            const allPoints = journey.flatMap(leg => leg.pathCoords);
            const bounds = getBounds(allPoints);
            if (bounds) {
                mapInstance.current.fitBounds(bounds, { padding: 50 });
            }

            // Start Animation
            setStatusMessage('Animating...');
            if (markerElRef.current) markerElRef.current.style.display = 'block';

            animateJourney(
                mapInstance.current,
                markerElRef.current,
                markerRef.current,
                journey,
                () => {
                    setIsAnimating(false);
                    setStatusMessage('Journey Complete!');
                },
                (legIndex) => {
                    // Optional: update UI active leg indicator
                }
            );

        } catch (error) {
            console.error(error);
            alert('Error calculating route: ' + error.message);
            setIsAnimating(false);
            setStatusMessage('Error');
        }
    };

    return (
        <div className="app-container">
            {/* Left Panel */}
            <div className="sidebar">
                <h1>NomadRoute 🌍</h1>

                {/* Start Input */}
                <LocationInput
                    label="Start Location"
                    placeholder="Where to start?"
                    value={startPlace}
                    onSelect={setStartPlace}
                />

                <h2>Itinerary</h2>

                <div className="stops-list">
                    {stops.map((stop, index) => (
                        <div key={stop.id} className="stop-row">
                            <div className="stop-header">
                                <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Stop {index + 1}</span>
                                {stops.length > 1 && (
                                    <button className="remove-btn" onClick={() => removeStop(stop.id)}>✕</button>
                                )}
                            </div>

                            <LocationInput
                                label="To Destination"
                                placeholder="Search destination..."
                                value={stop.place}
                                onSelect={(p) => updateStop(stop.id, 'place', p)}
                            />

                            <div className="input-group">
                                <label>Travel Mode</label>
                                <select
                                    value={stop.mode}
                                    onChange={(e) => updateStop(stop.id, 'mode', e.target.value)}
                                >
                                    {MODES.map(m => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="controls">
                    <button onClick={addStop} disabled={stops.length >= 10}>
                        + Add Stop
                    </button>
                    
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        <button
                            className="btn-primary"
                            style={{ flex: 1 }}
                            onClick={handlePlay}
                            disabled={isAnimating}
                        >
                            {isAnimating ? 'Playing...' : '▶ Play Journey'}
                        </button>
                        <button onClick={handleClear} disabled={isAnimating}>
                            Clear
                        </button>
                    </div>
                </div>

                {statusMessage && (
                    <div style={{ marginTop: '1rem', color: isAnimating ? '#4caf50' : '#888' }}>
                        {statusMessage}
                    </div>
                )}

                {/* Summary Text */}
                {startPlace && stops[0].place && (
                    <div className="journey-summary">
                        <div className="leg-item">🏁 Start: {startPlace.name}</div>
                        {stops.map((stop, i) => stop.place && (
                            <div key={stop.id} className="leg-item">
                                ⬇ {MODE_ICONS[stop.mode] || '🚗'} to {stop.place.name}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Right Map */}
            <div id="map-container" ref={mapContainer} className="map-container"></div>
        </div>
    );
}
