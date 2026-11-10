// --- CARTE LEAFLET SAINT-QUENTIN (INSSET) ---
const startCoords = [49.848, 3.287]; 
const map = L.map('map', { zoomControl: false }).setView(startCoords, 14);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '©️ OpenStreetMap'
}).addTo(map);

L.control.zoom({ position: 'topright' }).addTo(map);

const droneIcon = L.divIcon({
  className: 'custom-drone-icon',
  html: `<div style="background:#16a34a;width:20px;height:20px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 10px rgba(22,163,74,0.8);"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

const droneMarker = L.marker(startCoords, { icon: droneIcon }).addTo(map).bindPopup('<b>Drone #01</b>');
let destinationMarker = null;
let plannedLine = null;
let currentDestCoords = null;

let historyDataList = [];
let notificationsList = [
  { id: 1, text: "Système de télémétrie initialisé.", time: "11:30" },
  { id: 2, text: "Prêt pour la synchronisation des drones.", time: "11:31" }
];

document.addEventListener('DOMContentLoaded', () => {
  renderHistoryTable();
  fetchRealWeather();
  checkFlaskServerStatus();
  initNotifications();
  
  setInterval(checkFlaskServerStatus, 5000);
  setInterval(syncDroneWithPython, 1000);
});

// --- GESTION DES NOTIFICATIONS ---
function initNotifications() {
  const bellBtn = document.getElementById('bell-btn');
  const popover = document.getElementById('notif-popover');
  
  if (bellBtn && popover) {
    bellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      popover.style.display = popover.style.display === 'block' ? 'none' : 'block';
      renderNotifications();
    });

    document.addEventListener('click', (e) => {
      if (!popover.contains(e.target) && !bellBtn.contains(e.target)) {
        popover.style.display = 'none';
      }
    });
  }
}

function renderNotifications() {
  const listContainer = document.getElementById('notif-list');
  const badge = document.getElementById('notif-badge');
  if (!listContainer) return;

  if (notificationsList.length === 0) {
    listContainer.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--muted); font-size: 12px;">Aucune notification</div>`;
    if (badge) badge.style.display = 'none';
    return;
  }

  if (badge) badge.style.display = 'block';
  listContainer.innerHTML = notificationsList.map(n => `
    <div style="padding: 8px 10px; border-bottom: 1px solid var(--border); font-size: 12px;">
      <div>${n.text}</div>
      <div style="font-size: 10px; color: var(--muted); margin-top: 2px;">${n.time}</div>
    </div>
  `).join('');
}

function clearNotifications() {
  notificationsList = [];
  renderNotifications();
}

// --- AUTOCOMPLÉTION ADRESSES (02100) ---
const inputTo = document.getElementById('to');
const datalist = document.getElementById('address-suggestions');

if (inputTo) {
  inputTo.addEventListener('input', async (e) => {
    const query = e.target.value.trim();
    if (query.length < 3) return;

    try {
      const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&postcode=02100&limit=5`);
      const data = await response.json();

      if (datalist) {
        datalist.innerHTML = '';
        data.features.forEach(feature => {
          const option = document.createElement('option');
          option.value = feature.properties.label;
          option.dataset.lat = feature.geometry.coordinates[1];
          option.dataset.lng = feature.geometry.coordinates[0];
          datalist.appendChild(option);
        });
      }
    } catch (err) { console.error("Erreur API adresse :", err); }
  });

  inputTo.addEventListener('change', (e) => {
    if (!datalist) return;
    const selectedOption = Array.from(datalist.options).find(opt => opt.value === e.target.value);

    if (selectedOption) {
      const lat = parseFloat(selectedOption.dataset.lat);
      const lng = parseFloat(selectedOption.dataset.lng);
      currentDestCoords = [lat, lng];

      if (destinationMarker) {
        destinationMarker.setLatLng(currentDestCoords);
      } else {
        destinationMarker = L.marker(currentDestCoords, {
          icon: L.divIcon({
            className: 'custom-dest-icon',
            html: `<div style="background:#dc2626;width:22px;height:22px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 8px rgba(220,38,38,0.6);"></div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11]
          })
        }).addTo(map);
      }
      map.panTo(currentDestCoords);

      if (plannedLine) map.removeLayer(plannedLine);
      plannedLine = L.polyline([startCoords, currentDestCoords], {
        color: '#2563eb',
        weight: 3,
        dashArray: '6, 6',
        opacity: 0.8
      }).addTo(map);

      const distMeters = map.distance(startCoords, currentDestCoords);
      const durationSec = Math.round(distMeters / 12);
      const mins = Math.floor(durationSec / 60);
      const secs = durationSec % 60;
      
      const etaElem = document.getElementById('val-eta');
      if (etaElem) {
        etaElem.innerText = `${mins} min ${secs} s (${(distMeters / 1000).toFixed(2)} km)`;
      }
    }
  });
}

// --- ENVOI DE LA MISSION & REDIRECTION VERS LE TABLEAU DE BORD ---
async function sendMission() {
  const recipient = document.getElementById('recipient-name')?.value.trim() || 'Client';
  const destinationName = document.getElementById('to')?.value.trim() || '';
  const errorMsg = document.getElementById('form-error-msg');

  if (!destinationName || !currentDestCoords) {
    if(errorMsg) {
      errorMsg.style.display = 'block';
      errorMsg.innerText = "Veuillez sélectionner une adresse valide dans la liste suggérée.";
    }
    return;
  }
  if(errorMsg) errorMsg.style.display = 'none';

  try {
    const response = await fetch('http://127.0.0.1:5000/api/drone/mission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: currentDestCoords[0], lng: currentDestCoords[1], name: destinationName, recipient })
    });
    const result = await response.json();
    if (result.success) {
      showToast("Mission lancée ! Redirection vers le tableau de bord...", "success");
      resetTimeline();
      
      // REDIRECTION AUTOMATIQUE VERS L'ONGLET TABLEAU DE BORD
      switchTab('dashboard');
    }
  } catch (err) {
    showToast("Impossible de joindre le serveur Python Flask.", "error");
  }
}

// --- SYNCHRONISATION ---
async function syncDroneWithPython() {
  try {
    const response = await fetch('http://127.0.0.1:5000/api/drone');
    const data = await response.json();
    const drone = data.drone;

    document.getElementById('val-alt').innerText = Math.round(drone.altitude) + " m";
    document.getElementById('val-speed').innerText = Math.round(drone.speed) + " m/s";
    document.getElementById('val-bat').innerText = Math.round(drone.battery) + " %";
    
    const statusText = document.getElementById('drone-status-text');
    const pill = document.getElementById('drone-status-pill');
    const dot = document.getElementById('drone-dot');
    const isMoving = drone.status !== "Au sol" && drone.status !== "Disponible";

    if (statusText) statusText.innerText = isMoving ? "En mission" : "Disponible";
    if (pill && dot) {
      pill.style.background = isMoving ? "#dcfce7" : "#f3f4f6";
      pill.style.color = isMoving ? "#15803d" : "#4b5563";
      dot.style.background = isMoving ? "#16a34a" : "#9ca3af";
    }

    const missionLabel = document.getElementById('mission-label');
    const missionId = document.getElementById('mission-id');
    if (isMoving) {
      if (missionLabel) missionLabel.innerText = "Mission en cours";
      if (missionId) {
        missionId.innerText = drone.destination_name ? `Vers : ${drone.destination_name}` : "En vol";
        missionId.style.color = "#2563eb";
      }
    } else {
      if (missionLabel) missionLabel.innerText = "Statut du système";
      if (missionId) {
        missionId.innerText = "Aucune mission active";
        missionId.style.color = "#6b7280";
      }
    }

    if (drone.step >= 1) markStepComplete(1);
    if (drone.step >= 2) markStepComplete(2);
    if (drone.step >= 3) markStepComplete(3);
    if (drone.step >= 4) markStepComplete(4);
    if (drone.step >= 5) markStepComplete(5);

    if (drone.position && typeof drone.position.latitude === 'number') {
      droneMarker.setLatLng([drone.position.latitude, drone.position.longitude]);
    }

    if (data.history) {
      historyDataList = data.history;
      renderHistoryTable();
    }
  } catch (err) {}
}

async function checkFlaskServerStatus() {
  const dot = document.getElementById('server-dot');
  const text = document.getElementById('server-text');
  if (!dot || !text) return;

  try {
    const response = await fetch('http://127.0.0.1:5000/api/drone/status');
    if (response.ok) {
      dot.style.background = '#16a34a';
      text.style.color = '#15803d';
      text.innerText = 'Serveur : Connecté';
    } else { throw new Error(); }
  } catch (err) {
    dot.style.background = '#dc2626';
    text.style.color = '#b91c1c';
    text.innerText = 'Serveur : Déconnecté';
  }
}

function renderHistoryTable() {
  const tbody = document.getElementById("tbody");
  if (!tbody) return;

  if (historyDataList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--muted); padding:16px;">Aucune livraison enregistrée.</td></tr>`;
    return;
  }

  tbody.innerHTML = historyDataList.map(item => `
    <tr>
      <td><b>#${item.id}</b></td>
      <td>${item.time}</td>
      <td>${item.destination}</td>
      <td><span class="badge b-term">${item.status}</span></td>
      <td><span style="font-size:12px; color:var(--muted);">Détails</span></td>
    </tr>
  `).join('');
}

function markStepComplete(stepNum) {
  const stepEl = document.getElementById(`step-${stepNum}`);
  if (!stepEl) return;
  const now = new Date();
  const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  const dotEl = stepEl.querySelector('.tl-dot');
  const timeEl = document.getElementById(`time-step-${stepNum}`);

  if (dotEl) {
    dotEl.style.background = '#16a34a';
    dotEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" style="width:10px;height:10px;"><path d="M5 12l5 5 9-9"/></svg>';
  }
  if (timeEl && timeEl.innerText === '--:--') timeEl.innerText = timeStr;
}

function resetTimeline() {
  for (let i = 1; i <= 5; i++) {
    const stepEl = document.getElementById(`step-${i}`);
    if (stepEl) {
      stepEl.querySelector('.tl-dot').style.background = '#e5e7eb';
      stepEl.querySelector('.tl-dot').innerHTML = '';
      document.getElementById(`time-step-${i}`).innerText = '--:--';
    }
  }
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 50);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

async function fetchRealWeather() {
  try {
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=49.848&longitude=3.287&current_weather=true');
    const data = await res.json();
    document.getElementById('wTemp').innerText = `${Math.round(data.current_weather.temperature)}°C`;
    document.getElementById('wDesc').innerText = "Temps réel";
  } catch (err) {}
}

function switchTab(tabId, evt) {
  if (evt) evt.preventDefault();
  document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar .nav a').forEach(a => a.classList.remove('active'));
  
  const targetTab = document.getElementById(`tab-${tabId}`);
  if (targetTab) targetTab.classList.add('active');
  
  // Active l'élément cliqué dans la sidebar s'il y a un événement
  if (evt && evt.currentTarget) {
    evt.currentTarget.classList.add('active');
  } else {
    // Si la fonction est appelée par code (ex: switchTab('dashboard')), on retrouve le lien correspondant
    document.querySelectorAll('.sidebar .nav a').forEach(a => {
      if (a.getAttribute('onclick')?.includes(`'${tabId}'`)) {
        a.classList.add('active');
      }
    });
  }

  if (tabId === 'dashboard' && typeof map !== 'undefined') {
    setTimeout(() => map.invalidateSize(), 150);
  }
}