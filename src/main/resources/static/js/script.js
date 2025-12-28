// --- Initializare Harta ---
var map = L.map('map').setView([45.9432, 24.9668], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

var allPoints = L.layerGroup().addTo(map);
var allRoads = L.layerGroup().addTo(map);

// --- Variabile Globale ---
var creatorMode = false; 
var pickingLocationMode = false; 
var tempLocationMarker = null;

var routingControl = null;
var userLocation = null;
var userLocationMarker = null; 
var isRoutingEnabled = false; 

var problematicRoads = []; 
var isIllegalSpeed = false; // Modul de viteza GLOBAL

// --- MOTIVE RAPORTARE ---
const REPORT_REASONS = {
    'road': ["Alerta Falsa", "Drum Deschis", "Informatie Gresita", "Duplicat", "Nu mai este valabil", "Traseu Gresit", "Nume Ofensator", "Altul"],
    'cafe': ["Inchis Permanent", "Nu exista", "Nume Gresit", "Locatie Gresita", "Altul"],
    'shop': ["Inchis Permanent", "Nu exista", "Nume Gresit", "Locatie Gresita", "Altul"],
    'police': ["Nu mai sunt acolo", "Alerta Falsa", "Locatie Gresita", "Altul"],
    'blocked': ["Drumul s-a deblocat", "Alerta Falsa", "Locatie Gresita", "Altul"],
    'gas': ["Inchis Permanent", "Nu exista", "Preturi Gresite", "Altul"],
    'default': ["Nu exista", "Informatie Gresita", "Duplicat", "Altul"]
};

// --- Functii Utilitare ---

function getIconForType(type) {
    let emoji = "📍";
    let color = "#3388ff";

    switch(type) {
        case 'cafe': emoji = "☕"; color = "#6f4e37"; break;
        case 'shop': emoji = "🛒"; color = "#28a745"; break;
        case 'police': emoji = "🚓"; color = "#007bff"; break;
        case 'blocked': emoji = "⛔"; color = "#dc3545"; break;
        case 'gas': emoji = "⛽"; color = "#fd7e14"; break;
    }

    return L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color:white; border:2px solid ${color}; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; font-size:16px; box-shadow:0 2px 5px rgba(0,0,0,0.3);">${emoji}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
}

function createMarker(lat, lon, name, type, id) {
    const icon = getIconForType(type);
    const marker = L.marker([lat, lon], { title: name, icon: icon }).addTo(allPoints);
    
    const popupContent = document.createElement('div');
    popupContent.innerHTML = `<b>${name}</b><br>Tip: ${type || 'Standard'}<br>`;
    
    const reportBtn = document.createElement('button');
    reportBtn.innerText = "⚠️ Raporteaza";
    reportBtn.style.cssText = "margin-top:5px; background-color:#dc3545; color:white; border:none; border-radius:3px; cursor:pointer;";
    
    reportBtn.onclick = function() {
        showReportModal(id, name, 'location', type || 'default', marker);
        map.closePopup();
    };
    
    popupContent.appendChild(reportBtn);
    marker.bindPopup(popupContent);
}

function createRoad(coordinates, name, id, type) {
    let color = 'red';
    let weight = 4;
    let dashArray = null;

    if (type === 'blocked') { color = 'black'; weight = 5; }
    else if (type === 'work') { color = 'orange'; weight = 5; dashArray = '10, 10'; }
    else if (type === 'accident') { color = 'purple'; weight = 5; }

    var polyline = L.polyline(coordinates, {color: color, weight: weight, dashArray: dashArray}).addTo(allRoads);
    
    if (['blocked', 'work', 'accident'].includes(type)) {
        problematicRoads.push({ id: id, type: type, name: name, polyline: polyline, coordinates: coordinates });
    }

    polyline.on('click', function(e) {
        L.DomEvent.stopPropagation(e);
        showDetailsPanel(id, name, coordinates, polyline, type);
    });
}

function loadSavedLocations() {
    fetch('/locations').then(r => r.json()).then(data => {
        data.forEach(loc => createMarker(loc.lat, loc.lng, loc.name, loc.type, loc.id));
    }).catch(err => console.error("Eroare incarcare locatii:", err));
}

function loadSavedRoads() {
    fetch('/roads').then(r => r.json()).then(data => {
        data.forEach(road => {
            try {
                createRoad(JSON.parse(road.coordinatesJson), road.name, road.id, road.type);
            } catch (e) { console.error("Eroare parsare drum:", e); }
        });
    }).catch(err => console.error("Eroare incarcare drumuri:", err));
}

function loadPoints(query) {
    return new Promise((resolve) => {
        fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            body: `[out:json][timeout:10]; area["name"="Romania"]->.ro; ${query} out center;`
        })
        .then(r => r.ok ? r.json() : Promise.reject("Overpass API Error: " + r.status))
        .then(data => {
            if (data.elements) {
                data.elements.forEach(el => {
                    if(el.lat && el.lon && el.tags && el.tags.name){
                        const icon = getIconForType('default');
                        L.marker([el.lat, el.lon], { title: el.tags.name, icon: icon }).addTo(allPoints)
                         .bindPopup(`<b>${el.tags.name}</b><br>Sursa: OpenStreetMap`);
                    }
                });
            }
            resolve();
        })
        .catch(err => {
            console.warn("Nu s-au putut incarca punctele OSM:", err);
            resolve(); 
        });
    });
}

Promise.all([
    loadPoints(`node["place"="city"](area.ro); node["place"="town"](area.ro);`),
]).then(() => console.log("Initializare date finalizata."));

loadSavedLocations();
loadSavedRoads();


// --- LOGICA VERIFICARE RUTA SI TIMP ---

function isPointNearSegment(p, a, b, tolerance) {
    const L2 = (b.lat - a.lat)**2 + (b.lng - a.lng)**2;
    if (L2 === 0) return ((p.lat - a.lat)**2 + (p.lng - a.lng)**2) < tolerance**2;
    let t = ((p.lat - a.lat) * (b.lat - a.lat) + (p.lng - a.lng) * (b.lng - a.lng)) / L2;
    t = Math.max(0, Math.min(1, t));
    const projLat = a.lat + t * (b.lat - a.lat);
    const projLng = a.lng + t * (b.lng - a.lng);
    return ((p.lat - projLat)**2 + (p.lng - projLng)**2) < tolerance**2;
}

function getRouteProblems(routeCoordinates) {
    let problems = [];
    for (const road of problematicRoads) {
        const roadBounds = road.polyline.getBounds();
        const routeBounds = L.latLngBounds(routeCoordinates);
        
        if (!roadBounds.intersects(routeBounds)) continue;

        for (let i = 0; i < routeCoordinates.length; i += 5) {
            const p = routeCoordinates[i];
            for (let j = 0; j < road.coordinates.length - 1; j++) {
                const a = {lat: road.coordinates[j][0], lng: road.coordinates[j][1]};
                const b = {lat: road.coordinates[j+1][0], lng: road.coordinates[j+1][1]};
                if (isPointNearSegment(p, a, b, 0.0003)) {
                    problems.push(road);
                    break; 
                }
            }
            if (problems.includes(road)) break;
        }
    }
    return problems;
}

function calculateAdjustedTime(osrmTimeSeconds, distanceMeters, problems) {
    let time = osrmTimeSeconds;

    if (isIllegalSpeed) {
        let avgSpeed = distanceMeters / osrmTimeSeconds;
        let newSpeed = avgSpeed + 8.33; // +30 km/h
        time = distanceMeters / newSpeed;
    }

    let penaltySeconds = 0;
    let isBlocked = false;

    problems.forEach(p => {
        if (p.type === 'blocked') isBlocked = true;
        if (p.type === 'work') penaltySeconds += 1800; 
        if (p.type === 'accident') penaltySeconds += 3600; 
    });

    if (isBlocked) return Infinity;
    return time + penaltySeconds;
}

function formatTime(seconds) {
    if (seconds === Infinity) return "BLOCAT";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}min`;
    return `${m}min`;
}


// --- SELECTOR VITEZA GLOBAL ---
const globalSpeedLegal = document.getElementById('globalSpeedLegal');
const globalSpeedIllegal = document.getElementById('globalSpeedIllegal');

function updateSpeedMode(illegal) {
    isIllegalSpeed = illegal;
    if (isIllegalSpeed) {
        globalSpeedIllegal.classList.add('active-illegal');
        globalSpeedLegal.classList.remove('active-legal');
    } else {
        globalSpeedLegal.classList.add('active-legal');
        globalSpeedIllegal.classList.remove('active-illegal');
    }
    
    // Daca avem o ruta activa, o recalculam (trigger search)
    // Pentru simplitate, daca avem text in searchBox, simulam Enter
    if (routingControl && searchBox.value) {
        // searchBox.dispatchEvent(new KeyboardEvent('keypress', {'key': 'Enter'}));
        // Sau mai bine, doar actualizam notificarea daca e cazul, dar OSRM nu se schimba
        // Trebuie sa re-evaluam rutele gasite deja.
        // Deoarece nu pastram rutele vechi in memorie usor, cel mai simplu e sa re-declansam cautarea
        // Dar asta face trafic de retea.
        // Lasam utilizatorul sa dea Enter din nou daca vrea update.
    }
}

globalSpeedLegal.addEventListener('click', () => updateSpeedMode(false));
globalSpeedIllegal.addEventListener('click', () => updateSpeedMode(true));


// --- PANOU DETALII ---
const detailsPanel = document.getElementById('detailsPanel');
const detailTitle = document.getElementById('detailTitle');
const detailType = document.getElementById('detailType');
const detailDistance = document.getElementById('detailDistance');
const detailDuration = document.getElementById('detailDuration');
const detailStart = document.getElementById('detailStart');
const detailEnd = document.getElementById('detailEnd');
const closeDetailsBtn = document.getElementById('closeDetailsBtn');
const navigateBtn = document.getElementById('navigateBtn');
const reportBtn = document.getElementById('reportBtn');

let currentSelectedRoadId = null;
let currentSelectedPolyline = null;

function showDetailsPanel(id, name, coordinates, polyline, type) {
    if (creatorMode) document.getElementById('addLocationBtn').click();
    
    currentSelectedRoadId = id;
    currentSelectedPolyline = polyline;
    
    detailTitle.innerText = name;
    
    let typeText = "Standard";
    if (type === 'blocked') typeText = "⛔ Blocat";
    if (type === 'work') typeText = "🚧 In Lucru";
    if (type === 'accident') typeText = "💥 Accident";
    detailType.innerText = "Tip: " + typeText;

    detailsPanel.style.display = 'flex';
    
    let totalDistance = 0;
    for(let i = 0; i < coordinates.length - 1; i++) {
        totalDistance += map.distance(coordinates[i], coordinates[i+1]);
    }
    detailDistance.innerText = (totalDistance / 1000).toFixed(1) + " km";
    
    // Calculam durata estimata (fara OSRM, doar baza)
    let baseTime = totalDistance / 13.8; 
    let problems = [];
    if (type === 'blocked' || type === 'work' || type === 'accident') {
        problems.push({type: type});
    }
    let adjustedTime = calculateAdjustedTime(baseTime, totalDistance, problems);
    
    detailDuration.innerText = formatTime(adjustedTime);
    if (adjustedTime === Infinity) detailDuration.style.color = "red";
    else if (problems.length > 0) detailDuration.style.color = "orange";
    else detailDuration.style.color = "#28a745";
    
    detailStart.innerText = "Start: Se incarca...";
    detailEnd.innerText = "Sfarsit: Se incarca...";
    
    const startPoint = coordinates[0];
    const endPoint = coordinates[coordinates.length - 1];
    
    reverseGeocode(startPoint).then(addr => detailStart.innerText = "Start: " + addr);
    reverseGeocode(endPoint).then(addr => detailEnd.innerText = "Sfarsit: " + addr);
    
    polyline.setStyle({weight: 8, opacity: 0.8});
}

function closeDetailsPanel() {
    detailsPanel.style.display = 'none';
    if (currentSelectedPolyline) {
        currentSelectedPolyline.setStyle({weight: 4, opacity: 1}); 
    }
    currentSelectedRoadId = null;
    currentSelectedPolyline = null;
}

closeDetailsBtn.addEventListener('click', closeDetailsPanel);

navigateBtn.addEventListener('click', () => {
    if (currentSelectedPolyline) {
        const coords = currentSelectedPolyline.getLatLngs();
        const start = coords[0];
        if (!isRoutingEnabled) document.getElementById('toggleRoutingBtn').click();
        setTimeout(() => {
            if (userLocation && routingControl) {
                routingControl.setWaypoints([userLocation, start]);
            } else {
                alert("Te rugam sa astepti localizarea GPS...");
            }
        }, 500);
        closeDetailsPanel();
    }
});

reportBtn.addEventListener('click', () => {
    if (currentSelectedRoadId) {
        showReportModal(currentSelectedRoadId, detailTitle.innerText, 'road', 'road', currentSelectedPolyline);
    }
});

function reverseGeocode(latlng) {
    const lat = latlng.lat || latlng[0];
    const lng = latlng.lng || latlng[1];
    return fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
        .then(r => r.json())
        .then(data => {
            return data.address.city || data.address.town || data.address.village || data.address.road || "Locatie necunoscuta";
        })
        .catch(() => "Eroare adresa");
}


// --- GESTIONARE RAPORTARE ---
const reportModal = document.getElementById('reportModal');
const reportTitle = document.getElementById('reportTitle');
const reportItemName = document.getElementById('reportItemName');
const reportReasonSelect = document.getElementById('reportReason');
const confirmReportBtn = document.getElementById('confirmReportBtn');
const cancelReportBtn = document.getElementById('cancelReportBtn');
let currentReportId = null, currentReportCategory = null, currentReportLayer = null;

function showReportModal(id, name, category, type, layer) {
    currentReportId = id;
    currentReportCategory = category;
    currentReportLayer = layer;
    reportTitle.innerText = category === 'road' ? "⚠️ Raporteaza Drum" : "⚠️ Raporteaza Locatie";
    reportItemName.innerText = (category === 'road' ? "Drum: " : "Locatie: ") + name;
    
    reportReasonSelect.innerHTML = "";
    const reasons = REPORT_REASONS[type] || REPORT_REASONS['default'];
    reasons.forEach(reason => {
        const option = document.createElement('option');
        option.value = reason;
        option.innerText = reason;
        reportReasonSelect.appendChild(option);
    });
    reportModal.style.display = "block";
}
function hideReportModal() { reportModal.style.display = "none"; }
cancelReportBtn.addEventListener('click', hideReportModal);
confirmReportBtn.addEventListener('click', () => {
    if (currentReportId) {
        const endpoint = currentReportCategory === 'road' ? '/roads/' : '/locations/';
        fetch(endpoint + currentReportId, { method: 'DELETE' })
        .then(response => {
            if (response.ok) {
                if (currentReportLayer) {
                    if (currentReportCategory === 'road') {
                        allRoads.removeLayer(currentReportLayer);
                        problematicRoads = problematicRoads.filter(r => r.id !== currentReportId);
                    }
                    else allPoints.removeLayer(currentReportLayer);
                }
                hideReportModal();
                closeDetailsPanel();
            } else { alert("Eroare la stergere."); }
        }).catch(err => { console.error("Eroare stergere:", err); alert("Eroare de retea."); });
    }
});


// --- GESTIONARE LOCATIE SI RUTARE ---
map.on('locationfound', function(e) {
    userLocation = e.latlng;
    if (!userLocationMarker) {
        userLocationMarker = L.circleMarker(e.latlng, { radius: 10, fillColor: "#3388ff", color: "#fff", weight: 3, opacity: 1, fillOpacity: 0.8 }).bindPopup("Esti aici!");
    } else { userLocationMarker.setLatLng(e.latlng); }
    if (isRoutingEnabled && !map.hasLayer(userLocationMarker)) userLocationMarker.addTo(map);
});
map.on('locationerror', function(e) { if (isRoutingEnabled) { alert("Nu am putut gasi locatia ta."); document.getElementById('toggleRoutingBtn').click(); } });

const toggleRoutingBtn = document.getElementById('toggleRoutingBtn');
toggleRoutingBtn.addEventListener('click', () => {
    if (creatorMode) document.getElementById('addLocationBtn').click();
    isRoutingEnabled = !isRoutingEnabled;
    if (isRoutingEnabled) {
        toggleRoutingBtn.classList.add('active');
        map.locate({setView: true, maxZoom: 14, watch: true}); 
    } else {
        toggleRoutingBtn.classList.remove('active');
        map.stopLocate();
        if (userLocationMarker && map.hasLayer(userLocationMarker)) map.removeLayer(userLocationMarker);
        if (routingControl) { map.removeControl(routingControl); routingControl = null; }
    }
});

const searchBox = document.getElementById('searchBox');
const rerouteNotification = document.getElementById('rerouteNotification');

searchBox.addEventListener('keypress', function(e) {
    if(e.key === 'Enter') {
        const query = searchBox.value;
        if(!query) return;
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Romania')}`)
            .then(response => response.json())
            .then(data => {
                if(data && data.length > 0) {
                    const destLatLng = L.latLng(parseFloat(data[0].lat), parseFloat(data[0].lon));
                    if (routingControl) { map.removeControl(routingControl); routingControl = null; }
                    if (isRoutingEnabled) {
                        if (!userLocation) { alert("Asteapta putin, inca te localizam..."); return; }
                        
                        routingControl = L.Routing.control({
                            waypoints: [userLocation, destLatLng],
                            router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
                            routeWhileDragging: false, addWaypoints: false, fitSelectedRoutes: true, showAlternatives: true,
                            lineOptions: { styles: [{color: 'blue', opacity: 0.6, weight: 6}] }
                        }).addTo(map);

                        // --- LOGICA REROUTING AVANSATA (TIMP + VITEZA) ---
                        routingControl.on('routesfound', function(e) {
                            const routes = e.routes;
                            
                            let bestRoute = null;
                            let minTime = Infinity;
                            let bestRouteIndex = -1;

                            routes.forEach((route, index) => {
                                const problems = getRouteProblems(route.coordinates);
                                const adjustedTime = calculateAdjustedTime(route.summary.totalTime, route.summary.totalDistance, problems);
                                
                                console.log(`Ruta ${index}: Timp OSRM=${route.summary.totalTime}s, Probleme=${problems.length}, Timp Ajustat=${adjustedTime}s`);

                                if (adjustedTime < minTime) {
                                    minTime = adjustedTime;
                                    bestRoute = route;
                                    bestRouteIndex = index;
                                }
                            });

                            if (bestRouteIndex > 0) {
                                const problemsOnMain = getRouteProblems(routes[0].coordinates);
                                let reason = "trafic/blocaje";
                                if (problemsOnMain.length > 0) reason = problemsOnMain[0].name + " (" + problemsOnMain[0].type + ")";
                                
                                rerouteNotification.style.display = 'flex';
                                rerouteNotification.innerHTML = `<span>⚠️ Ruta principala afectata de ${reason}. Am ales o alternativa mai rapida (${formatTime(minTime)})!</span>`;
                                setTimeout(() => rerouteNotification.style.display = 'none', 5000);
                            } else if (minTime === Infinity) {
                                rerouteNotification.style.display = 'flex';
                                rerouteNotification.innerHTML = `<span>⛔ Toate rutele sunt blocate!</span>`;
                            } else {
                                rerouteNotification.style.display = 'none';
                            }
                        });

                    } else {
                        map.setView(destLatLng, 14);
                        L.marker(destLatLng).addTo(map).bindPopup(query).openPopup();
                    }
                } else { alert("Locatie negasita!"); }
            });
    }
});


// --- CREATOR PANEL ---
const addLocationBtn = document.getElementById('addLocationBtn');
const creatorPanel = document.getElementById('creatorPanel');
const tabs = document.querySelectorAll('.creator-tab');
const tabContents = document.querySelectorAll('.tab-content');

const newLocName = document.getElementById('newLocName');
const locTypeSelect = document.getElementById('locTypeSelect');
const pickOnMapBtn = document.getElementById('pickOnMapBtn');
const locStatus = document.getElementById('locStatus');
const latInput = document.getElementById('latInput');
const lngInput = document.getElementById('lngInput');
const saveLocationBtn = document.getElementById('saveLocationBtn');
const locZoneInput = document.getElementById('locZoneInput');
const locGoToZoneBtn = document.getElementById('locGoToZoneBtn');

const stopsContainer = document.getElementById('stopsContainer');
const addStopBtn = document.getElementById('addStopBtn');
const saveBuiltRoadBtn = document.getElementById('saveBuiltRoadBtn');
const roadNameInput = document.getElementById('roadNameInput');
const roadZoneInput = document.getElementById('roadZoneInput');
const roadGoToZoneBtn = document.getElementById('roadGoToZoneBtn');
const roadTypeSelect = document.getElementById('roadTypeSelect');

addLocationBtn.addEventListener('click', () => {
    if (isRoutingEnabled) document.getElementById('toggleRoutingBtn').click();
    closeDetailsPanel();

    creatorMode = !creatorMode;
    
    if (creatorMode) {
        addLocationBtn.classList.add('active');
        creatorPanel.style.display = 'flex';
        
        if (stopsContainer.children.length === 0) {
            createStopInput("Punct de Plecare (Start)");
            createStopInput("Destinatie (Sosire)");
        }
    } else {
        addLocationBtn.classList.remove('active');
        creatorPanel.style.display = 'none';
        pickingLocationMode = false;
        map.getContainer().style.cursor = '';
        locStatus.style.display = 'none';
        if (tempLocationMarker) map.removeLayer(tempLocationMarker);
    }
});

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
});

function goToZone(query) {
    if (!query) return;
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Romania')}&limit=1`)
        .then(r => r.json())
        .then(data => {
            if (data && data.length > 0) {
                map.setView([data[0].lat, data[0].lon], 13);
            } else {
                alert("Zona negasita!");
            }
        });
}
locGoToZoneBtn.addEventListener('click', () => goToZone(locZoneInput.value));
roadGoToZoneBtn.addEventListener('click', () => goToZone(roadZoneInput.value));


// --- 1. LOGICA ADAUGARE LOCATIE ---
pickOnMapBtn.addEventListener('click', () => {
    pickingLocationMode = !pickingLocationMode;
    if (pickingLocationMode) {
        pickOnMapBtn.classList.add('active');
        map.getContainer().style.cursor = 'crosshair';
        locStatus.style.display = 'block';
        locStatus.innerText = "Click pe harta pentru a prelua coordonatele...";
    } else {
        pickOnMapBtn.classList.remove('active');
        map.getContainer().style.cursor = '';
        locStatus.style.display = 'none';
        if (tempLocationMarker) map.removeLayer(tempLocationMarker);
    }
});

map.on('click', function(e) {
    if (creatorMode && pickingLocationMode) {
        latInput.value = e.latlng.lat.toFixed(6);
        lngInput.value = e.latlng.lng.toFixed(6);
        
        if (tempLocationMarker) {
            tempLocationMarker.setLatLng(e.latlng);
        } else {
            tempLocationMarker = L.marker(e.latlng, {draggable: true}).addTo(map);
            tempLocationMarker.on('dragend', function(ev) {
                latInput.value = ev.target.getLatLng().lat.toFixed(6);
                lngInput.value = ev.target.getLatLng().lng.toFixed(6);
            });
        }
        pickOnMapBtn.click();
    }
});

saveLocationBtn.addEventListener('click', () => {
    const name = newLocName.value;
    const type = locTypeSelect.value;
    const lat = parseFloat(latInput.value);
    const lng = parseFloat(lngInput.value);

    if (!name || !lat || !lng) {
        alert("Te rog completeaza toate campurile.");
        return;
    }

    const location = { name, type, lat, lng };
    
    fetch('/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(location)
    })
    .then(r => r.json())
    .then(saved => {
        createMarker(saved.lat, saved.lng, saved.name, saved.type, saved.id);
        newLocName.value = "";
        latInput.value = "";
        lngInput.value = "";
        if (tempLocationMarker) {
            map.removeLayer(tempLocationMarker);
            tempLocationMarker = null;
        }
    });
});


// --- 2. LOGICA CONSTRUIRE DRUM ---
function createStopInput(placeholder) {
    const div = document.createElement('div');
    div.className = 'builder-input-group';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'builder-input';
    input.placeholder = placeholder || "Punct intermediar...";
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-stop-btn';
    removeBtn.innerText = 'x';
    removeBtn.onclick = function() { stopsContainer.removeChild(div); };
    div.appendChild(input);
    div.appendChild(removeBtn);
    stopsContainer.appendChild(div);
}

addStopBtn.addEventListener('click', () => createStopInput());

function geocodeText(text) {
    return new Promise((resolve, reject) => {
        if (!text || text.trim() === "") { reject("Camp gol"); return; }
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&countrycodes=ro&limit=1`;
        fetch(url)
            .then(r => r.ok ? r.json() : Promise.reject("Eroare retea"))
            .then(data => {
                if (data && data.length > 0) {
                    resolve(L.latLng(parseFloat(data[0].lat), parseFloat(data[0].lon)));
                } else {
                    reject("Nu am gasit adresa: " + text);
                }
            })
            .catch(err => reject("Eroare geocodare: " + err));
    });
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

saveBuiltRoadBtn.addEventListener('click', async () => {
    const inputs = Array.from(stopsContainer.querySelectorAll('.builder-input'));
    const roadName = roadNameInput.value;
    const roadType = roadTypeSelect.value;

    if (!roadName) { alert("Te rog introdu un nume pentru drum!"); return; }
    const validInputs = inputs.filter(inp => inp.value && inp.value.trim() !== "");
    if (validInputs.length < 2) { alert("Ai nevoie de cel putin 2 puncte completate!"); return; }

    saveBuiltRoadBtn.innerText = "Se proceseaza...";
    saveBuiltRoadBtn.disabled = true;

    try {
        const coords = [];
        for (const inp of validInputs) {
            coords.push(await geocodeText(inp.value));
            await delay(1000); 
        }
        
        const coordString = coords.map(c => c.lng + "," + c.lat).join(";");
        const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`;
        const osrmResponse = await fetch(url);
        if (!osrmResponse.ok) throw new Error("Eroare OSRM: " + osrmResponse.status);
        const data = await osrmResponse.json();

        if (data.routes && data.routes.length > 0) {
            const leafletCoords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
            
            const roadData = { 
                name: roadName, 
                type: roadType,
                coordinatesJson: JSON.stringify(leafletCoords) 
            };

            const saveResponse = await fetch('/roads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(roadData)
            });
            const saved = await saveResponse.json();
            createRoad(leafletCoords, saved.name, saved.id, saved.type);
            
            stopsContainer.innerHTML = ""; 
            createStopInput("Start"); createStopInput("End");
            roadNameInput.value = "";
        } else {
            throw new Error("Nu s-a putut calcula ruta.");
        }
    } catch (err) {
        alert("Eroare: " + err);
    } finally {
        saveBuiltRoadBtn.innerText = "Calculeaza si Salveaza";
        saveBuiltRoadBtn.disabled = false;
    }
});


// --- Login ---
const loginBtn = document.getElementById('loginBtn');
const loginModal = document.getElementById('loginModal');
const loginAction = document.getElementById('loginAction');
const signupAction = document.getElementById('signupAction');

loginBtn.addEventListener('click', () => loginModal.style.display = 'block');
window.onclick = (e) => { if (e.target === loginModal) loginModal.style.display = 'none'; };

function sendData(endpoint) {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ username: u, password: p })
    }).then(r => {
        if (r.ok) { alert('Success!'); loginModal.style.display = 'none'; }
        else alert('Error!');
    });
}
loginAction.addEventListener('click', () => sendData('/login'));
signupAction.addEventListener('click', () => sendData('/signup'));
