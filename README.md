# NomadRoute MVP

A detailed map animation tool for multi-stop journeys.

## Setup

1.  **Install dependencies**:
    ```bash
    npm install
    ```

2.  **Environment Variables**:
    Create a `.env` file in the root directory (copy `.env.example`):
    ```bash
    cp .env.example .env
    ```
    Edit `.env` and add your Mapbox Public Access Token:
    ```
    VITE_MAPBOX_TOKEN=pk.eyJ1I...
    ```

3.  **Run Development Server**:
    ```bash
    npm run dev
    ```

## Features

-   **Interactive Map**: Powered by Mapbox GL JS.
-   **Multi-mode Routing**: Supports Car, Bike, Walk, Train (Directions API) and Plane (Geodesic Arc).
-   **Animation**: Smooth marker animation along the route path.
-   **No Backend**: Completely client-side execution.
