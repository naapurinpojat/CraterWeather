import { isWindInDir } from "./helpers.js";

const LS = {
  panelOpen: "surfseeker_panel_open", // "1" | "0"
  dirMode: "surfseeker_dir_mode", // "to" | "from"
  sport: "surfseeker_sport", // "windsurf" | "kitesurf" | "kitefoil" | "wingfoil"
};

const SPORT_THRESHOLDS = {
  windsurf: {
    good: [5, 6.9],
    very: 7,
    label: "Windsurf: hyvä 5-6,9; erittäin hyvä ≥7,0 m/s",
  },
  kitesurf: {
    good: [6, 8.9],
    very: 9,
    label: "Kitesurf: hyvä 6-8,9; erittäin hyvä ≥9,0 m/s",
  },
  kitefoil: {
    good: [3, 5.9],
    very: 6,
    label: "Kitefoil: hyvä 3-5,9; erittäin hyvä ≥6,0 m/s",
  },
  wingfoil: {
    good: [4, 6.9],
    very: 7,
    label: "Wingfoil: hyvä 4-6,9; erittäin hyvä ≥7,0 m/s",
  },
  ice: {
    good: [2, 4.9],
    very: 5,
    label: "Ice: hyvä 2-4,9; erittäin hyvä ≥5,0 m/s",
  }
};

const QUICK_VIEWS = [
  { name: "Lappajärvi", c: [63.147649, 23.732634], z: 8 },
  { name: "Kyrkösjärvi", c: [62.740582, 22.802155], z: 8 },
  { name: "Vaasa", c: [63.1, 21.6], z: 11 },
  { name: "Kalajoki", c: [64.243349, 23.814994], z: 8 },
];

function cleanupLS() {
  try {
    const sport = localStorage.getItem(LS.sport);
    if (sport && !Object.keys(SPORT_THRESHOLDS).includes(sport)) {
      console.warn("Removing invalid surfseeker_sport:", sport);
      localStorage.removeItem(LS.sport);
    }
    const dir = localStorage.getItem(LS.dirMode);
    if (dir && !["to", "from"].includes(dir)) {
      console.warn("Removing invalid surfseeker_dir_mode:", dir);
      localStorage.removeItem(LS.dirMode);
    }
    const panel = localStorage.getItem(LS.panelOpen);
    if (panel && !["0", "1"].includes(panel)) {
      console.warn("Removing invalid surfseeker_panel_open:", panel);
      localStorage.removeItem(LS.panelOpen);
    }
  } catch (e) {
    console.error("LocalStorage cleanup error", e);
  }
}

// Helpers
function lsGet(k, fb) {
  try {
    const v = localStorage.getItem(k);
    return v === null ? fb : v;
  } catch {
    return fb;
  }
}

function lsSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch { }
}

const toTO = (deg) => (deg + 180) % 360;

/**
 * Initializes Surfseeker UI and logic
 * @param {L.Map} map Leaflet map instance
 * @param {Function} refreshSpotsFn Callback to refresh spots/markers
 * @returns {Object} Object containing controls and state access
 */
export function initSurfSeeker(map, refreshSpotsFn) {
  cleanupLS();

  // 1) Create Panel
  const panel = document.createElement("div");
  panel.id = "surfseeker-panel";
  panel.innerHTML = `
    <div class="ss-header" id="ssHeader">
      <div class="ss-brand">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 12h10a3 3 0 1 0-3-3" fill="none" stroke="#222" stroke-width="2" stroke-linecap="round"/>
          <path d="M3 17h12a3 3 0 1 1-3 3" fill="none" stroke="#222" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <span class="ss-title">Surfseeker</span>
      </div>
      <button class="ss-toggle nav-btn" id="ssToggle" title="Hide/Show" aria-expanded="true">-</button>
    </div>

    <div class="ss-body" id="ssBody">
      <div class="ss-section">
        <div><b>Wind Direction Arrow</b></div>
        <label><input type="radio" name="ssDirMode" value="to"> To (Where blowing)</label>
        <label style="margin-left:8px;"><input type="radio" name="ssDirMode" value="from"> From (Source)</label>
      </div>

      <div class="ss-section">
        <div><b>Sport</b></div>
        <div id="ssSportGroup">
          ${Object.keys(SPORT_THRESHOLDS).map(k =>
    `<span class="chip" data-sport="${k}">${k.charAt(0).toUpperCase() + k.slice(1)}</span>`
  ).join('')}
        </div>
        <div id="ssLegend" style="font-size:11px;margin-top:4px;"></div>
      </div>

      <div class="ss-section">
        <div><b>Quick Views</b></div>
        <div id="ssQuickRow" class="ss-row"></div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  // 2) State from LS
  const state = {
    dirMode: lsGet(LS.dirMode, "to"),
    sport: lsGet(LS.sport, "windsurf"),
    open: lsGet(LS.panelOpen, "1") === "1",
  };

  if (!SPORT_THRESHOLDS[state.sport]) {
    state.sport = "windsurf";
    lsSet(LS.sport, state.sport);
  }

  // 3) Minimization
  const ssToggle = panel.querySelector("#ssToggle");
  const ssHeader = panel.querySelector("#ssHeader");
  function setCollapsed(collapsed) {
    panel.classList.toggle("collapsed", collapsed);
    if (ssToggle) ssToggle.setAttribute("aria-expanded", (!collapsed).toString());
    lsSet(LS.panelOpen, collapsed ? "0" : "1");
  }
  setCollapsed(!state.open);

  ssToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    setCollapsed(!panel.classList.contains("collapsed"));
  });
  ssHeader.addEventListener("click", () => {
    if (panel.classList.contains("collapsed")) setCollapsed(false);
  });

  // 4) DirMode
  panel.querySelectorAll("input[name=ssDirMode]").forEach((r) => {
    r.checked = r.value === state.dirMode;
    r.addEventListener("change", (e) => {
      state.dirMode = e.target.value;
      lsSet(LS.dirMode, state.dirMode);
      refreshSpotsFn();
    });
  });

  // 5) Sport
  const ssLegend = panel.querySelector("#ssLegend");
  function applySportUI() {
    panel.querySelectorAll("#ssSportGroup .chip").forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.sport === state.sport);
    });
    const thr = SPORT_THRESHOLDS[state.sport];
    ssLegend.textContent = thr ? thr.label : "";
  }
  applySportUI();

  panel.querySelector("#ssSportGroup").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    state.sport = chip.dataset.sport;
    lsSet(LS.sport, state.sport);
    applySportUI();
    refreshSpotsFn();
  });

  // 6) Quick Views
  const quickRow = panel.querySelector("#ssQuickRow");
  QUICK_VIEWS.forEach((q) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = q.name;
    b.onclick = () => map.setView(q.c, q.z);
    quickRow.appendChild(b);
  });

  // 7) Icon Generator Logic
  function createSurfSeekerIcon(directionFrom, speed, best_dir) {
    const thr = SPORT_THRESHOLDS[state.sport];
    // use imported helper
    // best_dir is [min, max, min2, max2...]
    let inBest = false;
    if (best_dir && best_dir.length >= 2) {
      inBest = isWindInDir(directionFrom, best_dir[0], best_dir[1]);
      if (!inBest && best_dir.length >= 4) {
        inBest = isWindInDir(directionFrom, best_dir[2], best_dir[3]);
      }
    }

    let color = "darkgrey";
    if (speed >= thr.very && inBest) {
      color = "#28ff45"; // very good
    } else if (speed >= thr.good[0] && speed <= thr.good[1] && inBest) {
      color = "#b2f2bb"; // good
    }

    const drawAngle = state.dirMode === "to" ? toTO(directionFrom) : directionFrom;

    return L.divIcon({
      className: "wind-marker",
      html: `
      <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"
           viewBox="0 0 24 24" style="transform: rotate(${drawAngle}deg)">
        <path d="M21 12c0 4.9706-4.0294 9-9 9s-9-4.0294-9-9 4.0294-9 9-9 9 4.0294 9 9Z"
              fill="none" stroke="${color}" stroke-width="2"/>
        <path d="M12 8L12 16" stroke="${color}" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M15 11L12.087 8.087c-.048-.048-.126-.048-.174 0L9 11"
              stroke="${color}" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }

  // Return API
  return {
    createIcon: createSurfSeekerIcon
  };
}
