export interface MapMember {
  uid: string;
  label: string;
  lat: number;
  lon: number;
}

export function mapPageHTML(members: MapMember[]): string {
  const markersJs = members
    .map((m) => {
      const name = m.label.replace(/'/g, "\\'");
      return `L.marker([${m.lat}, ${m.lon}]).addTo(map).bindPopup('${name}').openPopup();`;
    })
    .join("\n    ");

  const lats = members.map((m) => m.lat);
  const lons = members.map((m) => m.lon);
  const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
  const centerLon = lons.reduce((a, b) => a + b, 0) / lons.length;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Group locations</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: sans-serif; }
    #map { width: 100vw; height: 100vh; }
    #title {
      position: absolute;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      background: white;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
  </style>
</head>
<body>
  <div id="title">📍 ${members.length} member${members.length !== 1 ? "s" : ""}</div>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map').setView([${centerLat}, ${centerLon}], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    ${markersJs}

    // Fit map to show all markers
    const group = L.featureGroup([
      ${members.map((m) => `L.marker([${m.lat}, ${m.lon}])`).join(",\n      ")}
    ]);
    map.fitBounds(group.getBounds().pad(0.2));
  </script>
</body>
</html>`;
}