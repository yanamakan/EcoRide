// Approximate real-world coordinates for each hub, based on the landmark
// named in LOCATION.ADDRESS (e.g. "Sandton City Mall, Johannesburg").
// These are manually sourced from known public landmark locations, not from
// a geocoding API (none was available in this environment) -- accurate
// enough for mapping purposes, but verify before relying on them for
// anything beyond visualisation.
module.exports = {
    'Sandton Hub':        { lat: -26.1076, lng: 28.0567 },
    'Rosebank Station':   { lat: -26.1467, lng: 28.0436 },
    'Soweto Depot':       { lat: -26.2485, lng: 27.8540 },
    'Pretoria Central':   { lat: -25.7449, lng: 28.1878 },
    'Fourways Hub':       { lat: -26.0175, lng: 28.0106 },
    'Midrand Hub':        { lat: -25.9992, lng: 28.1123 },
    'Centurion Point':    { lat: -25.8603, lng: 28.1894 },
    'Melville Station':   { lat: -26.1752, lng: 28.0016 },
    'Braamfontein Hub':   { lat: -26.1929, lng: 28.0402 },
    'Randburg Hub':       { lat: -26.0939, lng: 27.9998 },
    'Kempton Park':       { lat: -26.1020, lng: 28.2293 },
    'Benoni Depot':       { lat: -26.1885, lng: 28.3208 },
    'Boksburg Hub':       { lat: -26.2041, lng: 28.2593 },
    'Hatfield Station':   { lat: -25.7487, lng: 28.2377 },
    'Bedfordview Hub':    { lat: -26.1809, lng: 28.1156 },
    'Krugersdorp Depot':  { lat: -26.0987, lng: 27.7736 },
    'Roodepoort Hub':     { lat: -26.1122, lng: 27.8763 },
    'Bryanston Point':    { lat: -26.0576, lng: 28.0304 },
    'Alberton Hub':       { lat: -26.2679, lng: 28.1224 },
    'Germiston Station':  { lat: -26.2197, lng: 28.1671 },
    'Rivonia Hub':        { lat: -26.0538, lng: 28.0616 },
    'Maboneng Point':     { lat: -26.2023, lng: 28.0567 },
    'Eastgate Station':   { lat: -26.1783, lng: 28.1088 },
    'Hyde Park Hub':      { lat: -26.1315, lng: 28.0388 },
    'Parkhurst Depot':    { lat: -26.1436, lng: 28.0198 },
    'Lanseria Point':     { lat: -25.9384, lng: 27.9261 },
    'OR Tambo Hub':       { lat: -26.1392, lng: 28.2460 },
    'Waterfall City':     { lat: -25.9926, lng: 28.0894 },
    'Greenstone Hub':     { lat: -26.1543, lng: 28.1381 },
    'Northgate Station':  { lat: -26.0508, lng: 27.9601 }
};
