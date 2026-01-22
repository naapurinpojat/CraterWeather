# Crater Weather

![CraterWeather Interface](craterweather.jpg)

[Live Demo](https://naapurinpojat.github.io/CraterWeather)

## Design Prerequisites

- Windsurfers needed a clear way to check the weather for Finland's surf spots.
- Knowledge of surf spot locations.
- No-go zones indication for safety.
- Simple, responsive user interface.
- Zero backend dependency.

## Project Structure

- **Frontend:** HTML, JavaScript, CSS with TypeScript.
- **Runtime:** Bundler and runtime (Bun).
- **Assets:** SVG-based map pins, JSON (Geojson) for location data.

## Features

![CraterWeather Screenshot](screenshot.png)
Displays:
- Real-time wind and weather data for Finnish coastal surf spots.
- Surf location visualization on maps.
- Clear warning for no-go zones.
- Responsive design for easy navigation on mobile and desktop.

## Add New Surf Spots
Add location entries in `.md` files inside the **places/** directory. Update `spots.geojson` with new geographic details.

## Tech Stack

- Frontend Library: Vanilla JS/TS and HTML/CSS.
- Build Tool: Uses Bun for dependency management and bundling.
- Frontend Framework: No framework, pure JS for interactive features.

## Run the Application

#### Install Dependencies
```bash
bun install
```

#### Start the Server
```bash
bun run dev
```
Development server runs using Bun.

#### Development Notes

- **Bun** is used for fast transpilation.
- Type safety enforced with **TypeScript**.
- Pure frontend-based solution without reliance on a server.

## License & Attribution

Project follows [MIT License](LICENSE) by default.

Created using **Bun** v1.2.21+
