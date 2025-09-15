// surfseeker.js

const LS = {
  panelOpen: 'surfseeker_panel_open', // "1" | "0"
  dirMode:   'surfseeker_dir_mode',   // "to" | "from"
  sport:     'surfseeker_sport',      // "surf" | "kitesurf" | "kitefoil" | "wingfoil"
};

const SPORT_THRESHOLDS = {
  surf:     { good:[5,6.9], very:7,   label:'Surf: hyvä 5–6,9; erittäin hyvä ≥7,0 m/s' },
  kitesurf: { good:[6,8.9], very:9,   label:'Kitesurf: hyvä 6–8,9; erittäin hyvä ≥9,0 m/s' },
  kitefoil: { good:[3,5.9], very:6,   label:'Kitefoil: hyvä 3–5,9; erittäin hyvä ≥6,0 m/s' },
  wingfoil: { good:[4,6.9], very:7,   label:'Wingfoil: hyvä 4–6,9; erittäin hyvä ≥7,0 m/s' },
};

const QUICK_VIEWS = [
  {name:'Lappajärvi',c:[63.164,23.615],z:9},
  {name:'Kyrkösjärvi',c:[62.740582,22.802155],z:10},
  {name:'Vaasa',c:[63.10,21.60],z:11},
  {name:'Tampere',c:[61.50,23.80],z:10},
  {name:'Koko alue',c:[62.939,23.184],z:9}
];

// apufunktiot
function lsGet(k, fb){ try{ const v=localStorage.getItem(k); return v===null?fb:v; }catch{ return fb; } }
function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch{} }
const toTO = deg => (deg + 180) % 360;
function angleInRange(a,s,e){a=(a+360)%360;s=(s+360)%360;e=(e+360)%360;return s<=e?(a>=s&&a<=e):(a>=s||a<=e);}

// odotetaan että kartta on valmis
function ready(fn){
  if (window.surfApp && window.surfApp.map && window.surfApp.refreshSpots) fn();
  else setTimeout(()=>ready(fn), 50);
}

ready(() => {
  const { map, refreshSpots } = window.surfApp;

  // 1) lisää paneeli
  const panel = document.createElement('div');
  panel.id = 'surfseeker-panel';
  panel.innerHTML = `
    <div class="ss-header" id="ssHeader">
      <div class="ss-brand">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 12h10a3 3 0 1 0-3-3" fill="none" stroke="#222" stroke-width="2" stroke-linecap="round"/>
          <path d="M3 17h12a3 3 0 1 1-3 3" fill="none" stroke="#222" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <span class="ss-title">Surfseeker</span>
      </div>
      <button class="ss-toggle nav-btn" id="ssToggle" title="Piilota / näytä" aria-expanded="true">–</button>
    </div>

    <div class="ss-body" id="ssBody">
      <div class="ss-section">
        <div><b>Nuolen tyyppi</b></div>
        <label><input type="radio" name="ssDirMode" value="to"> minne tuulee</label>
        <label style="margin-left:8px;"><input type="radio" name="ssDirMode" value="from"> mistä tuulee</label>
      </div>

      <div class="ss-section">
        <div><b>Laji</b></div>
        <div id="ssSportGroup">
          <span class="chip" data-sport="surf">Surf</span>
          <span class="chip" data-sport="kitesurf">Kitesurf</span>
          <span class="chip" data-sport="kitefoil">Kitefoil</span>
          <span class="chip" data-sport="wingfoil">Wingfoil</span>
        </div>
        <div id="ssLegend" style="font-size:11px;margin-top:4px;"></div>
      </div>

      <div class="ss-section">
        <div><b>Pikavalinnat</b></div>
        <div id="ssQuickRow" class="ss-row"></div>
      </div>

      <button id="ssRefresh" class="nav-btn" style="width:100%;">Päivitä nyt</button>
    </div>
  `;
  document.body.appendChild(panel);

  // 2) tila localStoragesta
  const state = {
    dirMode: lsGet(LS.dirMode, 'to'),
    sport:   lsGet(LS.sport, 'surf'),
    open:    lsGet(LS.panelOpen, '1') === '1'
  };

  // 3) minimointi
  const ssToggle = panel.querySelector('#ssToggle');
  const ssHeader = panel.querySelector('#ssHeader');
  function setCollapsed(collapsed){
    panel.classList.toggle('collapsed', collapsed);
    ssToggle?.setAttribute('aria-expanded', (!collapsed).toString());
    lsSet(LS.panelOpen, collapsed ? '0' : '1');
  }
  setCollapsed(!state.open);
  ssToggle.addEventListener('click', e=>{
    e.stopPropagation();
    setCollapsed(!panel.classList.contains('collapsed'));
  });
  ssHeader.addEventListener('click', ()=>{
    if(panel.classList.contains('collapsed')) setCollapsed(false);
  });

  // 4) dirMode
  panel.querySelectorAll('input[name=ssDirMode]').forEach(r=>{
    r.checked = (r.value === state.dirMode);
    r.addEventListener('change', e=>{
      state.dirMode = e.target.value;
      lsSet(LS.dirMode, state.dirMode);
      refreshSpots();
    });
  });

  // 5) sport
  const ssLegend = panel.querySelector('#ssLegend');
  function applySportUI(){
    panel.querySelectorAll('#ssSportGroup .chip').forEach(chip=>{
      chip.classList.toggle('active', chip.dataset.sport === state.sport);
    });
    ssLegend.textContent = SPORT_THRESHOLDS[state.sport].label;
  }
  applySportUI();
  panel.querySelector('#ssSportGroup').addEventListener('click', e=>{
    const chip = e.target.closest('.chip'); if(!chip) return;
    state.sport = chip.dataset.sport;
    lsSet(LS.sport, state.sport);
    applySportUI();
    refreshSpots();
  });

  // 6) pikavalinnat
  const quickRow = panel.querySelector('#ssQuickRow');
  QUICK_VIEWS.forEach(q=>{
    const b=document.createElement('button');
    b.className='nav-btn';
    b.textContent=q.name;
    b.onclick=()=>map.setView(q.c,q.z);
    quickRow.appendChild(b);
  });
  panel.querySelector('#ssRefresh').onclick=()=>refreshSpots();

  // 7) patchaa createWindIcon
  window.createWindIcon = function(directionFrom, speed, best_dir){
    const thr = SPORT_THRESHOLDS[state.sport];
    const inBest = angleInRange(directionFrom, best_dir[0], best_dir[1]);

    // väri aina FROM-suunnan mukaan
    let color = "#6e571a";
    if (speed >= thr.very && inBest) {
      color = "#28ff45";
    } else if (speed >= thr.good[0] && speed <= thr.good[1] && inBest) {
      color = "#b2f2bb";
    }

    // kulma käyttäjän valinnan mukaan
    const drawAngle = (state.dirMode === 'to') ? toTO(directionFrom) : directionFrom;

    return L.divIcon({
      className: 'wind-marker',
      html: `
        <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"
             viewBox="0 0 24 24" style="transform: rotate(${drawAngle}deg)">
          <polygon points="12,2 22,22 12,17 2,22" fill="${color}" />
          <circle cx="12" cy="12" r="1.5" fill="#222"/>
        </svg>`,
      iconSize:[24,24], iconAnchor:[12,12]
    });
  };

  // 8) eka päivitys
  refreshSpots();
});
