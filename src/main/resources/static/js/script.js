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

var routingControl = null;
var userLocation = null;
var userLocationMarker = null; 
var isRoutingEnabled = false; 

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

function createMarker(lat, lon, name, type) {
    const icon = getIconForType(type);
    L.marker([lat, lon], { title: name, icon: icon }).addTo(allPoints)
     .bindPopup(`<b>${name}</b><br>Tip: ${type || 'Standard'}`);
}

function createRoad(coordinates, name) {
    var polyline = L.polyline(coordinates, {color: 'red', weight: 4}).addTo(allRoads);
    polyline.bindPopup("Drum: " + name);
}

function loadSavedLocations() {
    fetch('/locations')
        .then(response => response.json())
        .then(locations => {
            locations.forEach(loc => createMarker(loc.lat, loc.lng, loc.name, loc.type));
        })
        .catch(err => console.error("Eroare incarcare locatii:", err));
}

function loadSavedRoads() {
    fetch('/roads')
        .then(response => response.json())
        .then(roads => {
            roads.forEach(road => {
                try {
                    var coords = JSON.parse(road.coordinatesJson);
                    createRoad(coords, road.name);
                } catch (e) {
                    console.error("Eroare parsare drum:", e);
                }
            });
        })
        .catch(err => console.error("Eroare incarcare drumuri:", err));
}

function loadPoints(query) {
    return new Promise((resolve, reject) => {
        fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            body: `[out:json][timeout:10]; area["name"="Romania"]->.ro; ${query} out center;`
        })
        .then(r => {
            if (!r.ok) throw new Error("Overpass API Error: " + r.status);
            return r.json();
        })
        .then(data => {
            if (data.elements) {
                data.elements.forEach(el => {
                    if(el.lat && el.lon && el.tags && el.tags.name){
                        createMarker(el.lat, el.lon, el.tags.name, 'default');
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

const stopsContainer = document.getElementById('stopsContainer');
const addStopBtn = document.getElementById('addStopBtn');
const saveBuiltRoadBtn = document.getElementById('saveBuiltRoadBtn');
const roadNameInput = document.getElementById('roadNameInput');

addLocationBtn.addEventListener('click', () => {
    if (isRoutingEnabled) document.getElementById('toggleRoutingBtn').click();

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
    }
});

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const targetId = 'tab-' + tab.dataset.tab;
        document.getElementById(targetId).classList.add('active');
    });
});


// --- 1. LOGICA ADAUGARE LOCATIE ---
pickOnMapBtn.addEventListener('click', () => {
    const name = newLocName.value;
    if (!name) { alert("Te rog scrie un nume pentru locatie!"); return; }
    
    pickingLocationMode = true;
    map.getContainer().style.cursor = 'crosshair';
    locStatus.style.display = 'block';
    locStatus.innerText = "Click pe harta pentru a salva '" + name + "'...";
});

map.on('click', function(e) {
    if (creatorMode && pickingLocationMode) {
        const name = newLocName.value;
        const type = locTypeSelect.value;
        const location = { name: name, type: type, lat: e.latlng.lat, lng: e.latlng.lng };
        
        fetch('/locations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(location)
        })
        .then(r => r.json())
        .then(saved => {
            createMarker(saved.lat, saved.lng, saved.name, saved.type);
            // Alerta eliminata
            
            pickingLocationMode = false;
            map.getContainer().style.cursor = '';
            newLocName.value = "";
            locStatus.style.display = 'none';
        });
    }
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

addStopBtn.addEventListener('click', () => {
    createStopInput();
});

function geocodeText(text) {
    return new Promise((resolve, reject) => {
        if (!text || text.trim() === "") { reject("Camp gol"); return; }
        console.log("Geocoding:", text);
        
        const timeout = setTimeout(() => {
            reject("Timeout la cautarea adresei: " + text);
        }, 15000);

        const searchText = text.toLowerCase().includes("romania") ? text : text + ", Romania";

        L.Control.Geocoder.nominatim().geocode(searchText, function(results) {
            clearTimeout(timeout);
            if (results && results.length > 0) { 
                console.log("Gasit:", text, results[0].center);
                resolve(results[0].center); 
            }
            else { 
                L.Control.Geocoder.nominatim().geocode(text, function(retryResults) {
                    if (retryResults && retryResults.length > 0) {
                        console.log("Gasit (retry):", text, retryResults[0].center);
                        resolve(retryResults[0].center);
                    } else {
                        reject("Nu am gasit adresa: " + text);
                    }
                });
            }
        });
    });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

saveBuiltRoadBtn.addEventListener('click', async () => {
    const inputs = Array.from(document.querySelectorAll('#stopsContainer .builder-input'));
    const roadName = roadNameInput.value;
    
    if (!roadName) { alert("Te rog introdu un nume pentru drum!"); return; }
    
    const validInputs = inputs.filter(inp => inp.value && inp.value.trim() !== "");
    
    if (validInputs.length < 2) { 
        alert("Ai nevoie de cel putin 2 puncte completate!"); 
        return; 
    }

    saveBuiltRoadBtn.innerText = "Se proceseaza...";
    saveBuiltRoadBtn.disabled = true;

    try {
        const coords = [];
        
        for (const inp of validInputs) {
            const coord = await geocodeText(inp.value);
            coords.push(coord);
            await delay(1000); 
        }

        console.log("Toate coordonatele gasite:", coords);
        
        const coordString = coords.map(c => c.lng + "," + c.lat).join(";");
        const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`;

        console.log("Cerere OSRM:", url);

        const osrmResponse = await fetch(url);
        if (!osrmResponse.ok) throw new Error("Eroare OSRM: " + osrmResponse.status);
        
        const data = await osrmResponse.json();

        if (data.routes && data.routes.length > 0) {
            const routeCoords = data.routes[0].geometry.coordinates;
            const leafletCoords = routeCoords.map(c => [c[1], c[0]]);
            
            const roadData = {
                name: roadName,
                coordinatesJson: JSON.stringify(leafletCoords)
            };

            const saveResponse = await fetch('/roads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(roadData)
            });
            
            const saved = await saveResponse.json();
            
            createRoad(leafletCoords, saved.name);
            // Alerta eliminata
            
            saveBuiltRoadBtn.innerText = "Calculeaza si Salveaza";
            saveBuiltRoadBtn.disabled = false;
            stopsContainer.innerHTML = ""; 
            createStopInput("Start"); createStopInput("End");
            roadNameInput.value = "";
        } else {
            throw new Error("Nu s-a putut calcula ruta intre puncte (OSM nu a gasit drum).");
        }

    } catch (err) {
        console.error("Eroare proces:", err);
        alert("Eroare: " + err);
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
