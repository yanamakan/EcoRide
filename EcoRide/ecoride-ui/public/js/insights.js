(function () {
    var dataEl = document.getElementById('dashboard-data');
    if (!dataEl) return;
    var DATA = JSON.parse(dataEl.textContent);
    var locations = DATA.locationStats || [];
    var totalRevenue = DATA.totalRevenue || 0;

    function formatR(n) {
        var sign = n < 0 ? '-' : '';
        return sign + 'R' + Math.round(Math.abs(n)).toLocaleString();
    }

    /* ---------------------------- FLEET MAP ---------------------------- */
    var mapEl = document.getElementById('hub-map');
    if (mapEl && window.L && locations.length > 0) {
        var map = L.map('hub-map', { scrollWheelZoom: false }).setView([-26.1, 28.05], 10);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(map);

        var maxRevenue = Math.max.apply(null, locations.map(function (l) { return l.revenue || 0; }));

        locations.forEach(function (loc) {
            var isActive = (loc.revenue || 0) > 0;
            var minR = 5, maxR = 28;
            var radius = isActive && maxRevenue > 0
                ? minR + (maxR - minR) * Math.sqrt(loc.revenue / maxRevenue)
                : minR;

            var marker = L.circleMarker([loc.lat, loc.lng], {
                radius: radius,
                fillColor: isActive ? '#00e5a0' : '#6b7796',
                color: '#0d0f14',
                weight: 2,
                fillOpacity: isActive ? 0.65 : 0.35
            }).addTo(map);

            var popupHtml =
                '<strong>' + loc.name + '</strong><br>' +
                (isActive
                    ? 'Revenue: ' + formatR(loc.revenue) + '<br>' +
                      'Rides: ' + loc.rides + '<br>' +
                      'Vehicles used: ' + loc.vehicles + '<br>' +
                      'Revenue/vehicle: ' + formatR(loc.revenuePerVehicle) + '<br>'
                    : '<em>No rides under the current filters</em><br>') +
                '<a href="/insights?location=' + encodeURIComponent(loc.name) + '">Filter dashboard to this hub &rarr;</a>';

            marker.bindPopup(popupHtml);
        });
    } else if (mapEl) {
        mapEl.innerHTML = '<p class="empty-msg">No location data available for the map.</p>';
    }

    /* ------------------------- WHAT-IF: FARE ---------------------------- */
    var fareSlider = document.getElementById('fareSlider');
    var fareSliderVal = document.getElementById('fareSliderVal');
    var fareBase = document.getElementById('fareBase');
    var fareProjected = document.getElementById('fareProjected');
    var fareDelta = document.getElementById('fareDelta');

    function updateFare() {
        var pct = parseInt(fareSlider.value, 10);
        fareSliderVal.textContent = pct;
        var projected = totalRevenue * (1 + pct / 100);
        fareBase.textContent = formatR(totalRevenue);
        fareProjected.textContent = formatR(projected);
        var delta = projected - totalRevenue;
        fareDelta.textContent = (delta >= 0 ? '+' : '') + formatR(delta);
        fareDelta.style.color = delta >= 0 ? 'var(--green)' : 'var(--red)';
    }
    if (fareSlider) {
        fareSlider.addEventListener('input', updateFare);
        updateFare();
    }

    /* --------------------- WHAT-IF: FLEET REALLOCATION -------------------- */
    var fromSel = document.getElementById('fromLocation');
    var toSel = document.getElementById('toLocation');
    var fleetSlider = document.getElementById('fleetSlider');
    var fleetSliderVal = document.getElementById('fleetSliderVal');
    var fromRPV = document.getElementById('fromRPV');
    var toRPV = document.getElementById('toRPV');
    var fleetDelta = document.getElementById('fleetDelta');

    // Only hubs that actually have vehicles deployed make sense as
    // reallocation options (the map itself still shows every hub, active or not).
    var activeLocations = locations.filter(function (l) { return l.vehicles > 0; });

    if (fromSel && toSel && activeLocations.length > 1) {
        var sorted = activeLocations.slice().sort(function (a, b) { return b.revenue - a.revenue; });
        sorted.forEach(function (loc, i) {
            var opt1 = document.createElement('option');
            opt1.value = loc.name; opt1.textContent = loc.name;
            fromSel.appendChild(opt1);
            var opt2 = document.createElement('option');
            opt2.value = loc.name; opt2.textContent = loc.name;
            toSel.appendChild(opt2);
        });
        // sensible default: move vehicles from the busiest hub to the quietest
        fromSel.value = sorted[0].name;
        toSel.value = sorted[sorted.length - 1].name;

        function findLoc(name) {
            return locations.find(function (l) { return l.name === name; });
        }

        function updateFleet() {
            var from = findLoc(fromSel.value);
            var to = findLoc(toSel.value);
            var n = parseInt(fleetSlider.value, 10);
            fleetSliderVal.textContent = n;
            if (!from || !to) return;

            // Cap the slider at how many vehicles the source hub actually has (leave at least 1 behind)
            var maxMovable = Math.max(1, Math.min(10, from.vehicles > 1 ? from.vehicles - 1 : 1));
            fleetSlider.max = maxMovable;
            if (n > maxMovable) { n = maxMovable; fleetSlider.value = n; fleetSliderVal.textContent = n; }

            fromRPV.textContent = formatR(from.revenuePerVehicle);
            toRPV.textContent = formatR(to.revenuePerVehicle);
            var delta = n * (to.revenuePerVehicle - from.revenuePerVehicle);
            fleetDelta.textContent = (delta >= 0 ? '+' : '') + formatR(delta);
            fleetDelta.style.color = delta >= 0 ? 'var(--green)' : 'var(--red)';
        }

        fromSel.addEventListener('change', updateFleet);
        toSel.addEventListener('change', updateFleet);
        fleetSlider.addEventListener('input', updateFleet);
        updateFleet();
    }
})();
