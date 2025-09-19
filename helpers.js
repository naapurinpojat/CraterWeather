import { config } from "./config.js";

/**
 * Convert degrees to radians, normalizing the angle to the range [0, 360).
 *
 * @param {number} deg - The angle in degrees. Can be any integer or float,
 *                       positive or negative.
 * @returns {number} The equivalent angle in radians, wrapped to the
 *                   interval [0, 2π).
 */
export function normalizeDegrees(deg) {
  // First bring the degree value into the canonical range [0, 360)
  const normalizedDeg = ((deg % 360) + 360) % 360;

  return normalizedDeg;
}

/* Example usage */
console.log(normalizeDegrees(0));      // 0
console.log(normalizeDegrees(90));     // 1.5707963267948966  (π/2)
console.log(normalizeDegrees(-30));    // 5.235987755982989   (≈ 330° → 11π/6)
console.log(normalizeDegrees(720));    // 0                    (two full turns)
console.log(normalizeDegrees(-450));   // 2.356194490192345   (≈ 270° → 3π/2)

export function createWindIcon(direction, speed, bestDirs) {
        let color = "darkgray";
        color = windsurfColor(speed);
        const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="30" fill="none" height="30"
             viewBox="0 0 24 24" style="transform: rotate(${
               direction + 180
             }deg)">
          <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="${color}" stroke-width="2"/>
          <path d="M12 8L12 16" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M15 11L12.087 8.08704C12.039 8.03897 11.961 8.03897 11.913 8.08704L9 11" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
        return L.divIcon({
          className: "wind-marker",
          html: svg,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
      }

export function windsurfColor(speed) {
  // -----------------------------------------------------------------
  // 1️⃣ Clamp the input to the supported range (0‑15)
  // -----------------------------------------------------------------
  speed = Math.max(0, Math.min(15, Math.round(speed)));

  // -----------------------------------------------------------------
  // 2️⃣ Define the two anchor colours
  // -----------------------------------------------------------------
  // Light‑blue (the colour for speeds ≤ 5)
  const LIGHT_BLUE = { r: 173, g: 216, b: 230 }; // #ADD8E6
  const NONE = { r: 10, g: 20, b: 40 }; // #ADD8E6
  // Pure green (the colour we end up at speed 15)
  const GREEN = { r: 0, g: 255, b: 0 }; // #00FF00

  // -----------------------------------------------------------------
  // 3️⃣ Decide which colour to return
  // -----------------------------------------------------------------
  let r, g, b;

  if (speed <= 5 && speed > 1) {
    // All speeds 0‑5 stay light‑blue
    ({ r, g, b } = LIGHT_BLUE);
  } else if (speed > 5) {
    // Speeds 6‑15: split the interval into 10 equal steps.
    // Each step corresponds to one integer wind‑speed value.
    // We calculate a *step index* (0‑9) and then linearly interpolate
    // between LIGHT_BLUE and GREEN for that step.
    const stepIndex = speed; // 0 for speed 6, …, 9 for speed 15
    const t = stepIndex / 9; // Normalised 0‑1 across the 10 steps

    // Linear interpolation for each channel
    r = Math.round(LIGHT_BLUE.r + t * (GREEN.r - LIGHT_BLUE.r));
    g = Math.round(LIGHT_BLUE.g + t * (GREEN.g - LIGHT_BLUE.g));
    b = Math.round(LIGHT_BLUE.b + t * (GREEN.b - LIGHT_BLUE.b));
  } else {
    ({ r, g, b } = NONE);
  }

  // -----------------------------------------------------------------
  // 4️⃣ Convert the RGB values back to a hex string
  // -----------------------------------------------------------------
  return (
    "#" +
    r.toString(16).padStart(2, "0") +
    g.toString(16).padStart(2, "0") +
    b.toString(16).padStart(2, "0")
  );
}

export function getSunriseSunset(lat, lon, date = new Date()) {
  const times = SunCalc.getTimes(date, lat, lon);
  // times.sunrise, times.sunset are JavaScript Date objects in UTC (unless local date)?
  // The returned Date is in local time of the environment when you format it
  return {
    sunrise: times.sunrise,
    sunset: times.sunset,
  };
}

export function isAppleDevice() {
  // Grab the user‑agent string and convert it to lower case for easy matching
  const ua = navigator.userAgent.toLowerCase();

  // Look for identifiers that appear only on Apple platforms
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isMacOS = /macintosh|mac os x/.test(ua);

  // Return true if either iOS or macOS is detected
  return isIOS || isMacOS;
}

export function getBestWind(timeseries, bestDirs, sunrise, sunset) {
  let maxWind = -Infinity;
  let maxGust = -Infinity;

  timeseries.slice(0, config.forecast_how_many_hours).map((entry) => {
    const hour = new Date(entry.time).getHours();

    // only check between daylight hours
    if (hour >= sunrise.getHours() && hour <= sunset.getHours()) {
      const wind = entry.data.instant.details.wind_speed;
      const gust = entry.data.instant.details.wind_speed_of_gust;
      const dir = entry.data.instant.details.wind_from_direction;

      // optional: check if wind direction is within bestDirs
      const bestwinddirs =
        (dir >= bestDirs[0] && dir <= bestDirs[1]) ||
        (dir >= bestDirs[2] && dir <= bestDirs[3]);

      if (bestwinddirs) {
        if (wind > maxWind) maxWind = wind;
        if (gust > maxGust) maxGust = gust;
      }
    }
  });

  return {
    wind: maxWind === -Infinity ? 0.0 : maxWind,
    gust: maxGust === -Infinity ? 0.0 : maxGust,
  };
}
