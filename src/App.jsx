import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Search, MapPin, Map as MapIcon, List, Building, Users, Download,
  Phone, Globe, Mail, ChevronRight, Navigation, ArrowUpDown,
  ArrowLeft, Route, Filter, Crosshair, Loader2, Info, RefreshCw, Compass, Trash2, AlertCircle, Menu, X, Star, Flame, PieChart, BarChart2, Scale, CheckSquare, Square
} from 'lucide-react';

// --- UTILS: HAVERSINE FORMULA FOR RADIUS CALCULATION ---
const getDistanceInKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// --- UTILS: REGION EXTRACTOR FOR ANALYTICS ---
const getRegionFromAddress = (alamat) => {
  if (!alamat || alamat.includes("Belum dilengkapi")) return "Lainnya";
  let region = "Lainnya";
  const match = alamat.match(/(Kecamatan|Kec\.|Kota|Kabupaten|Kab\.)\s+([a-zA-Z\s]+)/i);
  if (match) {
    region = `${match[1]} ${match[2]}`.trim();
  } else if (alamat.includes(',')) {
    const parts = alamat.split(',');
    region = parts[parts.length - 1].trim();
    if (/^\d+$/.test(region) && parts.length > 1) {
      region = parts[parts.length - 2].trim();
    }
  } else {
    region = alamat.trim();
  }
  return region.charAt(0).toUpperCase() + region.slice(1).toLowerCase();
};

// --- DATA: TOP CITIES FOR SEO DIRECTORY ---
const TOP_CITIES = [
  { id: 'jakarta', name: 'DKI Jakarta', lat: -6.2088, lng: 106.8456, zoom: 11 },
  { id: 'surabaya', name: 'Surabaya', lat: -7.2504, lng: 112.7688, zoom: 12 },
  { id: 'bandung', name: 'Bandung', lat: -6.9175, lng: 107.6191, zoom: 12 },
  { id: 'medan', name: 'Medan', lat: 3.5952, lng: 98.6722, zoom: 12 },
  { id: 'semarang', name: 'Semarang', lat: -6.9666, lng: 110.4167, zoom: 12 },
  { id: 'makassar', name: 'Makassar', lat: -5.1476, lng: 119.4327, zoom: 12 },
  { id: 'palembang', name: 'Palembang', lat: -2.9909, lng: 104.7566, zoom: 12 },
  { id: 'yogyakarta', name: 'Yogyakarta', lat: -7.7956, lng: 110.3695, zoom: 13 },
  { id: 'malang', name: 'Malang', lat: -7.9839, lng: 112.6214, zoom: 13 },
  { id: 'denpasar', name: 'Denpasar', lat: -8.6705, lng: 115.2126, zoom: 13 },
];

// --- UTILS: OVERPASS API FETCHER WITH FALLBACK ---
const fetchOverpassData = async (query) => {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
    'https://overpass.osm.ch/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  let lastErrorText = "";
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`
      });

      const text = await res.text();
      try {
        const json = JSON.parse(text);
        if (json.remark && json.remark.toLowerCase().includes('runtime error')) throw new Error(json.remark);
        return json;
      } catch (e) {
        lastErrorText = text.substring(0, 150);
      }
    } catch (e) {
      console.warn(`[OSM Fallback] Server ${url} gagal diakses. Mencoba server lain...`);
    }
  }
  throw new Error("Semua server satelit OSM sedang sibuk (Rate Limit/Terlalu Banyak Permintaan). Silakan coba beberapa saat lagi.");
};

// --- HOOKS: LEAFLET & CLUSTERING INJECTOR ---
const useLeaflet = () => {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (window.L && window.L.markerClusterGroup) { setLoaded(true); return; }

    const loadScript = (src, id) => new Promise((resolve) => {
      if (document.getElementById(id)) return resolve();
      const script = document.createElement('script');
      script.id = id; script.src = src; script.onload = resolve;
      document.head.appendChild(script);
    });

    const loadCSS = (href, id) => {
      if (document.getElementById(id)) return;
      const link = document.createElement('link');
      link.id = id; link.rel = 'stylesheet'; link.href = href;
      document.head.appendChild(link);
    };

    const initLeaflet = async () => {
      loadCSS('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'leaflet-css');
      await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'leaflet-script');
      loadCSS('https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.css', 'cluster-css');
      loadCSS('https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.Default.css', 'cluster-default-css');
      await loadScript('https://unpkg.com/leaflet.markercluster@1.4.1/dist/leaflet.markercluster.js', 'cluster-script');
      await loadScript('https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js', 'heat-script');
      setLoaded(true);
    };

    initLeaflet();
  }, []);

  return loaded;
};

// --- HOOKS: CHART.JS INJECTOR ---
const useChartJs = () => {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (window.Chart && window.ChartDataLabels) { setLoaded(true); return; }

    const loadScript = (src, id) => new Promise((resolve) => {
      if (document.getElementById(id)) return resolve();
      const script = document.createElement('script');
      script.id = id; script.src = src; script.onload = resolve;
      document.head.appendChild(script);
    });

    const init = async () => {
      await loadScript('https://cdn.jsdelivr.net/npm/chart.js', 'chartjs-script');
      await loadScript('https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0', 'chartjs-datalabels-script');
      if (window.Chart) window.Chart.register(window.ChartDataLabels);
      setLoaded(true);
    };

    init();
  }, []);

  return loaded;
};

// --- HOOKS: HASH ROUTER ---
const useHashRouter = () => {
  const getPathAndParams = useCallback(() => {
    const hash = window.location.hash.replace(/^#/, '') || '/';
    const [path, queryString] = hash.split('?');
    const params = new URLSearchParams(queryString || '');
    const query = Object.fromEntries(params.entries());
    return { path, query };
  }, []);

  const [route, setRoute] = useState(getPathAndParams());

  useEffect(() => {
    const handleHashChange = () => setRoute(getPathAndParams());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [getPathAndParams]);

  const navigate = (path, query = {}) => {
    const searchParams = new URLSearchParams(query);
    const queryString = searchParams.toString();
    window.location.hash = queryString ? `${path}?${queryString}` : path;
    window.scrollTo(0, 0);
  };

  return { route, navigate };
};


// --- SHARED COMPONENTS ---

const BookmarkButton = ({ isFavorite, onClick, className = "px-3 py-1.5 text-xs" }) => (
  <button
    onClick={onClick}
    className={`flex items-center justify-center gap-2 rounded-xl font-bold transition shadow-sm border ${isFavorite ? 'bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'} ${className}`}
  >
    <Star size={16} className={isFavorite ? "fill-yellow-500 text-yellow-500" : "text-gray-400"} />
    {isFavorite ? 'Tersimpan' : 'Simpan'}
  </button>
);

const RadiusSearch = ({ userLoc, locateUser, isLocating, radius, setRadius, resultCount, clearUserLoc }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm mb-6">
    <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
      <Crosshair size={16} className="text-indigo-600" /> Pencarian Radius
    </label>
    <div className="flex flex-col gap-3">
      {!userLoc ? (
        <button onClick={locateUser} disabled={isLocating} className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-2.5 px-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition border border-indigo-100">
          {isLocating ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />} Gunakan Lokasi Saya
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-green-700 bg-green-50 px-2 py-1.5 rounded-lg border border-green-200 font-medium flex items-center gap-1"><MapPin size={12} /> Lokasi Aktif</div>
            <button onClick={() => { setRadius(""); clearUserLoc(); }} className="text-xs text-red-500 hover:text-red-700 font-bold transition">Hapus</button>
          </div>
          <select value={radius} onChange={(e) => setRadius(e.target.value)} className="w-full bg-white border border-gray-300 text-gray-900 text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold transition shadow-sm">
            <option value="">Pilih Radius Pencarian...</option>
            <option value="1">Radius 1 KM</option>
            <option value="3">Radius 3 KM</option>
            <option value="5">Radius 5 KM</option>
            <option value="10">Radius 10 KM</option>
          </select>
          {radius && <div className="text-xs font-bold text-indigo-700 bg-indigo-50 p-2.5 rounded-xl border border-indigo-100 text-center mt-1">Menampilkan {resultCount} sekolah dalam radius {radius} KM</div>}
        </div>
      )}
    </div>
  </div>
);

const MapView = ({ schools, center, zoom, className = "h-full w-full", onBoundsChange, onMapMove, userLoc, favorites = [], isHeatmapMode = false }) => {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const clusterGroup = useRef(null);
  const heatmapLayer = useRef(null);
  const userMarkerRef = useRef(null);
  const leafletLoaded = useLeaflet();

  const lat = center ? center[0] : 0;
  const lng = center ? center[1] : 0;

  useEffect(() => {
    if (!mapRef.current) return;
    const resizeObserver = new ResizeObserver(() => {
      if (mapInstance.current) mapInstance.current.invalidateSize();
    });
    resizeObserver.observe(mapRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!leafletLoaded || !mapRef.current) return;

    const map = window.L.map(mapRef.current).setView([lat, lng], zoom);
    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18, subdomains: 'abcd'
    }).addTo(map);

    const cluster = window.L.markerClusterGroup({ chunkedLoading: true, showCoverageOnHover: false });
    map.addLayer(cluster);

    clusterGroup.current = cluster;
    mapInstance.current = map;

    map.on('moveend', () => {
      const bounds = map.getBounds();
      const currentZoom = map.getZoom();
      if (onMapMove) onMapMove(currentZoom);
      if (onBoundsChange) onBoundsChange({
        south: bounds.getSouth(), west: bounds.getWest(),
        north: bounds.getNorth(), east: bounds.getEast()
      });
    });

    setTimeout(() => {
      if (mapInstance.current) {
        mapInstance.current.invalidateSize();
        const initialBounds = mapInstance.current.getBounds();
        if (onBoundsChange) onBoundsChange({
          south: initialBounds.getSouth(), west: initialBounds.getWest(),
          north: initialBounds.getNorth(), east: initialBounds.getEast()
        });
      }
    }, 200);

    return () => {
      if (mapInstance.current) {
        mapInstance.current.off();
        mapInstance.current.remove();
        mapInstance.current = null;
        clusterGroup.current = null;
        heatmapLayer.current = null;
        userMarkerRef.current = null;
      }
    };
  }, [leafletLoaded]);

  useEffect(() => {
    if (!mapInstance.current || !window.L || userLoc) return;
    const map = mapInstance.current;
    const currentCenter = map.getCenter();
    if (Math.abs(currentCenter.lat - lat) > 0.0001 || Math.abs(currentCenter.lng - lng) > 0.0001 || map.getZoom() !== zoom) {
      map.setView([lat, lng], zoom);
    }
  }, [lat, lng, zoom, userLoc]);

  useEffect(() => {
    if (!mapInstance.current || !window.L || !userLoc) return;
    if (!userMarkerRef.current) {
      const userIcon = window.L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34]
      });
      userMarkerRef.current = window.L.marker([userLoc.lat, userLoc.lng], { icon: userIcon, zIndexOffset: 1000 }).addTo(mapInstance.current).bindPopup('<b class="font-sans text-sm">Lokasi Anda</b>');
    } else {
      userMarkerRef.current.setLatLng([userLoc.lat, userLoc.lng]);
    }
    mapInstance.current.flyTo([userLoc.lat, userLoc.lng], 15, { duration: 1.5 });
  }, [userLoc]);

  useEffect(() => {
    if (!mapInstance.current || !window.L || !clusterGroup.current) return;

    const map = mapInstance.current;
    if (map.hasLayer(clusterGroup.current)) map.removeLayer(clusterGroup.current);
    if (heatmapLayer.current && map.hasLayer(heatmapLayer.current)) map.removeLayer(heatmapLayer.current);

    if (isHeatmapMode) {
      if (window.L.heatLayer) {
        const heatData = schools.map(s => [s.lat, s.lng, 1]);
        heatmapLayer.current = window.L.heatLayer(heatData, { radius: 25, blur: 15, maxZoom: 17, gradient: { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red' } });
        heatmapLayer.current.addTo(map);
      }
    } else {
      clusterGroup.current.clearLayers();
      const markers = schools.map(school => {
        const isFav = favorites.some(f => f.id === school.id);
        const starSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="${isFav ? '#eab308' : 'none'}" stroke="${isFav ? '#eab308' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
        const marker = window.L.marker([school.lat, school.lng]);
        const popupContent = `
          <div class="text-sm font-sans min-w-[200px]">
            <span class="inline-block px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] rounded mb-1 font-bold uppercase tracking-wider">${school.jenjang || 'Sekolah'}</span>
            <strong class="block text-base font-bold mb-1 leading-tight">${school.nama}</strong>
            <span class="text-gray-600 block mb-3 text-xs leading-relaxed"><i class="text-gray-400">OSM ID: ${school.id}</i><br/>${school.alamat}</span>
            <div class="flex gap-2">
              <a href="#/sekolah/${school.id}" class="flex-1 text-center bg-blue-600 !text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition no-underline font-bold text-xs" style="color: #ffffff !important;">Detail</a>
              <button onclick="window.dispatchEvent(new CustomEvent('toggle-fav-osm', {detail: '${school.id}'}))" class="flex-1 flex items-center justify-center gap-1.5 ${isFav ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' : 'bg-gray-50 text-gray-700 border border-gray-200'} px-3 py-2 rounded-lg transition font-bold text-xs cursor-pointer">${starSvg} ${isFav ? 'Tersimpan' : 'Simpan'}</button>
            </div>
          </div>
        `;
        marker.bindPopup(popupContent);
        return marker;
      });
      clusterGroup.current.addLayers(markers);
      map.addLayer(clusterGroup.current);
    }
  }, [schools, favorites, isHeatmapMode]);

  return <div ref={mapRef} className={`z-0 ${className} relative bg-gray-100`}></div>;
};

// --- PAGES ---

const HomePage = ({ navigate, isSearchingGeocode, setIsSearchingGeocode }) => {
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery) return;
    setIsSearchingGeocode(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}+Indonesia&limit=1`);
      const data = JSON.parse(await res.text());
      if (data && data.length > 0) navigate('/peta', { lat: data[0].lat, lng: data[0].lon, zoom: 13, triggerSearch: 'true' });
      else alert("Lokasi tidak ditemukan.");
    } catch (err) { alert("Terjadi kesalahan: " + err.message); } finally { setIsSearchingGeocode(false); }
  };

  const findNearest = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => navigate('/peta', { lat: pos.coords.latitude, lng: pos.coords.longitude, zoom: 15, triggerSearch: 'true', isUserLoc: 'true' }), () => alert("Gagal mendapatkan lokasi."));
    } else { alert("Geolocation tidak didukung di browser ini."); }
  };

  return (
    <div className="flex flex-col items-center">
      <section className="w-full bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 text-white py-24 px-4 text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold mb-6 tracking-tight drop-shadow-md">Cari Sekolah Secara Real-Time</h1>
        <p className="text-blue-100 text-lg md:text-xl mb-10 max-w-2xl mx-auto opacity-90 leading-relaxed">
          Aplikasi ini melakukan <b className="text-white">auto-scraping langsung dari database OpenStreetMap</b> untuk memberikan Anda data paling mutakhir.
        </p>
        <form onSubmit={handleSearch} className="max-w-3xl mx-auto relative flex items-center mb-6">
          <Search className="absolute left-4 text-gray-400" size={24} />
          <input type="text" placeholder="Cari Kota, Kabupaten, atau Kecamatan..." className="w-full pl-12 pr-32 py-4 rounded-full text-gray-800 text-lg shadow-2xl focus:outline-none focus:ring-4 focus:ring-blue-300 transition" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} disabled={isSearchingGeocode} />
          <button type="submit" disabled={isSearchingGeocode} className="absolute right-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-8 py-2.5 rounded-full font-bold transition shadow-md flex items-center gap-2">{isSearchingGeocode ? <Loader2 size={20} className="animate-spin" /> : "Cari Area"}</button>
        </form>
        <div className="mt-14 flex flex-col sm:flex-row justify-center gap-4">
          <button onClick={() => navigate('/peta', { lat: -2.5489, lng: 118.0149, zoom: 5 })} className="flex items-center justify-center gap-2 bg-white text-blue-800 px-8 py-3.5 rounded-full font-bold shadow-xl hover:scale-105 transition transform"><MapIcon size={20} /> Buka Peta Nasional</button>
          <button onClick={findNearest} className="flex items-center justify-center gap-2 bg-indigo-500 text-white px-8 py-3.5 rounded-full font-bold shadow-xl hover:bg-indigo-400 hover:scale-105 transition transform border border-indigo-400"><Crosshair size={20} /> Scrape di Sekitar Saya</button>
        </div>
      </section>
      <section className="w-full max-w-5xl mx-auto -mt-12 px-4 mb-20 relative z-10">
        <div className="bg-white rounded-2xl shadow-2xl p-8 grid grid-cols-1 md:grid-cols-3 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-gray-100">
          <div className="flex flex-col items-center"><div className="bg-blue-50 p-4 rounded-2xl text-blue-600 mb-4"><RefreshCw size={36} /></div><h3 className="text-xl font-black text-gray-800 mb-2">Live Scraping</h3><p className="text-gray-500 font-medium text-sm">Data ditarik langsung dari database satelit OpenStreetMap saat Anda menggeser peta.</p></div>
          <div className="flex flex-col items-center pt-8 md:pt-0"><div className="bg-green-50 p-4 rounded-2xl text-green-600 mb-4"><Compass size={36} /></div><h3 className="text-xl font-black text-gray-800 mb-2">Direktori Kota (SEO)</h3><p className="text-gray-500 font-medium text-sm">Jelajahi sekolah berdasarkan struktur hierarki kota-kota secara sistematis.</p></div>
          <div className="flex flex-col items-center pt-8 md:pt-0"><div className="bg-purple-50 p-4 rounded-2xl text-purple-600 mb-4"><Download size={36} /></div><h3 className="text-xl font-black text-gray-800 mb-2">Export Kapan Saja</h3><p className="text-gray-500 font-medium text-sm">Hasil scraping area manapun bisa langsung diunduh dalam format CSV Excel.</p></div>
        </div>
      </section>
    </div>
  );
};

const DirectoryPage = ({ navigate }) => (
  <div className="max-w-7xl mx-auto px-4 py-12">
    <div className="text-center mb-12"><h1 className="text-4xl font-extrabold text-gray-900 mb-4">Direktori Pendidikan per Kota (SEO)</h1><p className="text-gray-600 max-w-2xl mx-auto text-lg">Jelajahi data sekolah dan perguruan tinggi berdasarkan kota besar di Indonesia.</p></div>
    <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2"><Building className="text-blue-600" /> Direktori Sekolah Dasar & Menengah</h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
      {TOP_CITIES.map(city => (
        <div key={`sekolah-${city.id}`} onClick={() => navigate('/peta', { lat: city.lat, lng: city.lng, zoom: city.zoom, triggerSearch: 'true' })} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 hover:shadow-xl hover:border-blue-500 transition cursor-pointer group flex items-center justify-between">
          <div><h3 className="text-xl font-bold text-gray-800 group-hover:text-blue-600 transition">Sekolah di {city.name}</h3><p className="text-gray-500 text-sm mt-1">SD, SMP, SMA, SMK</p></div><div className="bg-blue-50 text-blue-600 p-3 rounded-full group-hover:bg-blue-600 group-hover:text-white transition"><ChevronRight size={20} /></div>
        </div>
      ))}
    </div>
    <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2"><Users className="text-indigo-600" /> Direktori Perguruan Tinggi</h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {TOP_CITIES.map(city => (
        <div key={`kampus-${city.id}`} onClick={() => navigate('/peta', { lat: city.lat, lng: city.lng, zoom: city.zoom, triggerSearch: 'true', filter: 'Kampus' })} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 hover:shadow-xl hover:border-indigo-500 transition cursor-pointer group flex items-center justify-between">
          <div><h3 className="text-xl font-bold text-gray-800 group-hover:text-indigo-600 transition">Kampus di {city.name}</h3><p className="text-gray-500 text-sm mt-1">Universitas, Institut, Politeknik</p></div><div className="bg-indigo-50 text-indigo-600 p-3 rounded-full group-hover:bg-indigo-600 group-hover:text-white transition"><ChevronRight size={20} /></div>
        </div>
      ))}
    </div>
  </div>
);

const MapPage = ({ query, globalSchools, fetchSchoolsFromOSM, isFetchingOSM, navigate, favorites }) => {
  const [filterJenjang, setFilterJenjang] = useState(query.filter || "");
  const [currentBounds, setCurrentBounds] = useState(null);
  const [showSearchHereBtn, setShowSearchHereBtn] = useState(true);

  const [userLoc, setUserLoc] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isHeatmapMode, setIsHeatmapMode] = useState(false);
  const [searchRadius, setSearchRadius] = useState("");
  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);

  const mapCenter = useMemo(() => query.lat && query.lng ? [parseFloat(query.lat), parseFloat(query.lng)] : [-2.5489, 118.0149], [query.lat, query.lng]);
  const mapZoom = query.zoom ? parseInt(query.zoom) : 5;

  useEffect(() => { if (query.isUserLoc === 'true' && query.lat && query.lng) setUserLoc({ lat: parseFloat(query.lat), lng: parseFloat(query.lng) }); }, [query.isUserLoc, query.lat, query.lng]);
  useEffect(() => { if (query.triggerSearch === 'true' && currentBounds && !isFetchingOSM) handleSearchArea(); }, [query.triggerSearch, currentBounds]);

  const handleBoundsChange = useCallback((bounds) => setCurrentBounds(bounds), []);

  const handleMapMove = useCallback((z) => {
    if (z === undefined || z > 8) setShowSearchHereBtn(true);
    else setShowSearchHereBtn(false);
  }, []);

  const handleSearchArea = () => {
    if (currentBounds) {
      fetchSchoolsFromOSM(currentBounds);
      setShowSearchHereBtn(false);
    } else {
      alert("Area belum terdeteksi. Mohon geser peta sedikit ke arah yang ingin Anda cari.");
    }
  };

  const handleMapSearch = async (e) => {
    e.preventDefault();
    if (!mapSearchQuery) return;
    setIsSearchingLocation(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(mapSearchQuery)}+Indonesia&limit=1`);
      const data = JSON.parse(await res.text());
      if (data && data.length > 0) navigate('/peta', { lat: data[0].lat, lng: data[0].lon, zoom: 13, triggerSearch: 'true' });
      else alert("Lokasi tidak ditemukan.");
    } catch (err) { alert("Terjadi kesalahan: " + err.message); } finally { setIsSearchingLocation(false); }
  };

  const locateUser = () => {
    if (navigator.geolocation) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => { setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setIsLocating(false); },
        () => { alert("Gagal mendeteksi lokasi."); setIsLocating(false); },
        { enableHighAccuracy: true }
      );
    } else alert("Geolocation tidak didukung.");
  };

  const filteredSchools = globalSchools.filter(s => {
    if (filterJenjang) {
      const f = filterJenjang.toLowerCase();
      if (!(s.jenjang && s.jenjang.toLowerCase().includes(f)) && !(s.nama && s.nama.toLowerCase().includes(f))) return false;
    }
    if (searchRadius && userLoc) {
      if (getDistanceInKm(userLoc.lat, userLoc.lng, s.lat, s.lng) > parseFloat(searchRadius)) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-64px)] bg-gray-50 relative">
      {showSearchHereBtn && !isFetchingOSM && (
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-[1000] ml-0 md:ml-40">
          <button onClick={handleSearchArea} className="bg-white text-blue-600 px-6 py-2.5 rounded-full font-bold shadow-2xl border hover:bg-blue-50 transition flex items-center gap-2"><RefreshCw size={18} /> Scrape Area Ini</button>
        </div>
      )}
      <div className="w-full md:w-80 bg-white shadow-xl flex flex-col z-[500] border-r">
        <div className="p-5 border-b bg-gray-50 flex items-center justify-between"><div className="flex items-center gap-2"><Filter className="text-blue-600" size={20} /><h2 className="text-lg font-extrabold text-gray-800">Panel Data</h2></div>{isFetchingOSM && <Loader2 className="animate-spin text-blue-600" size={20} />}</div>
        <div className="p-5 flex-1 overflow-y-auto space-y-6">
          <form onSubmit={handleMapSearch} className="relative">
            <Search className="absolute left-3 top-3 text-gray-400" size={18} />
            <input type="text" placeholder="Cari Kota/Kecamatan..." className="w-full pl-10 pr-4 py-2.5 bg-white border rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500" value={mapSearchQuery} onChange={(e) => setMapSearchQuery(e.target.value)} disabled={isSearchingLocation} />
            {isSearchingLocation && <div className="absolute right-3 top-3"><Loader2 size={18} className="animate-spin text-blue-600" /></div>}
            <button type="submit" className="hidden">Cari</button>
          </form>
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-center relative overflow-hidden">
            {isFetchingOSM && <div className="absolute inset-0 bg-blue-100/50 backdrop-blur-sm flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>}
            <p className="text-sm text-blue-600 font-bold mb-1">Berhasil Di-Scrape</p><h3 className="text-4xl font-black text-blue-800">{filteredSchools.length}</h3><p className="text-xs text-blue-600 mt-1">Sekolah di memori</p>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <Info className="text-yellow-600 shrink-0 mt-0.5" size={16} />
              <p className="text-xs text-yellow-800 font-medium leading-relaxed">Geser peta lalu klik tombol di bawah untuk mengambil data satelit OSM terbaru.</p>
            </div>
            <button
              onClick={handleSearchArea}
              disabled={isFetchingOSM}
              className="w-full bg-yellow-400 hover:bg-yellow-500 text-yellow-900 py-2.5 rounded-xl text-sm font-extrabold transition shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw size={18} className={isFetchingOSM ? "animate-spin" : ""} />
              {isFetchingOSM ? "Menarik Data..." : "Scrape Area Terlihat"}
            </button>
          </div>

          <hr className="border-gray-100" />
          <RadiusSearch userLoc={userLoc} locateUser={locateUser} isLocating={isLocating} radius={searchRadius} setRadius={setSearchRadius} resultCount={filteredSchools.length} clearUserLoc={() => setUserLoc(null)} />
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Filter Tampilan (Lokal)</label>
            <div className="grid grid-cols-3 gap-2">
              {["SD", "SMP", "SMA", "SMK", "Kampus"].map(j => (
                <button key={j} onClick={() => setFilterJenjang(filterJenjang === j ? "" : j)} className={`py-2 rounded-lg text-xs font-bold transition border ${filterJenjang === j ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{j}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 relative">
        <MapView schools={filteredSchools} center={mapCenter} zoom={mapZoom} onBoundsChange={handleBoundsChange} onMapMove={handleMapMove} userLoc={userLoc} favorites={favorites} isHeatmapMode={isHeatmapMode} />
        <div className="absolute top-6 right-6 z-[1000]">
          <div className="bg-white rounded-xl shadow-lg border p-1.5 flex items-center">
            <button onClick={() => setIsHeatmapMode(false)} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 ${!isHeatmapMode ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}><MapPin size={16} /> Marker</button>
            <button onClick={() => setIsHeatmapMode(true)} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 ${isHeatmapMode ? 'bg-orange-100 text-orange-700' : 'text-gray-500 hover:bg-gray-50'}`}><Flame size={16} /> Heatmap</button>
          </div>
        </div>
        <button onClick={locateUser} className="absolute bottom-8 right-8 z-[1000] bg-white p-3.5 rounded-full shadow-2xl border hover:bg-blue-50 flex items-center justify-center hover:scale-105 active:scale-95 text-gray-700">{isLocating ? <Loader2 size={24} className="animate-spin text-blue-600" /> : <Crosshair size={24} className={userLoc ? "text-blue-600" : ""} />}</button>
      </div>
    </div>
  );
};

const ListPage = ({ globalSchools, setGlobalSchools, favorites, toggleFavorite, compareList, toggleCompare }) => {
  const [search, setSearch] = useState("");
  const [filterJenjang, setFilterJenjang] = useState("");
  const [filterLokasi, setFilterLokasi] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: 'nama', direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [userLoc, setUserLoc] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const itemsPerPage = 10;

  const sortByNearest = () => {
    if (userLoc) { setSortConfig({ key: 'jarak', direction: 'asc' }); setCurrentPage(1); return; }
    if (navigator.geolocation) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => { setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setSortConfig({ key: 'jarak', direction: 'asc' }); setIsLocating(false); setCurrentPage(1); },
        () => { alert("Gagal mendeteksi lokasi."); setIsLocating(false); }
      );
    } else alert("Browser tidak mendukung Geolocation.");
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const processedData = useMemo(() => {
    let data = [...globalSchools];
    if (userLoc) data = data.map(s => ({ ...s, jarakKm: getDistanceInKm(userLoc.lat, userLoc.lng, s.lat, s.lng) }));
    if (filterJenjang) data = data.filter(s => s.jenjang && s.jenjang.toLowerCase().includes(filterJenjang.toLowerCase()));
    if (filterLokasi) data = data.filter(s => s.alamat && s.alamat.toLowerCase().includes(filterLokasi.toLowerCase()));
    if (search) data = data.filter(s => s.nama && s.nama.toLowerCase().includes(search.toLowerCase()));

    data.sort((a, b) => {
      let valA = sortConfig.key === 'jarak' ? (a.jarakKm || Infinity) : (a[sortConfig.key] || "");
      let valB = sortConfig.key === 'jarak' ? (b.jarakKm || Infinity) : (b[sortConfig.key] || "");
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  }, [search, filterJenjang, filterLokasi, sortConfig, globalSchools, userLoc]);

  const totalPages = Math.max(1, Math.ceil(processedData.length / itemsPerPage));
  const paginatedData = processedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const exportCSV = () => {
    if (globalSchools.length === 0) return alert("Belum ada data.");
    const headers = "OSM_ID,Nama Sekolah,Tipe,Alamat,Website,Telepon,Latitude,Longitude\n";
    const csv = globalSchools.map(s => `"${s.id}","${(s.nama || "").replace(/"/g, '""')}","${s.jenjang}","${(s.alamat || "").replace(/"/g, '""')}","${s.web}","${s.telp}",${s.lat},${s.lng}`).join("\n");
    const blob = new Blob([headers + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.setAttribute("download", `Data_Sekolah_OSM.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div><h1 className="text-2xl font-extrabold text-blue-900 flex items-center gap-2"><List size={24} /> Daftar Database Lokal</h1><p className="text-blue-700 mt-1 text-sm font-medium">Data tersimpan di memori browser (LocalStorage).</p></div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button onClick={() => { if (window.confirm("Hapus semua data scrape?")) setGlobalSchools([]); }} className="flex items-center gap-2 bg-red-100 hover:bg-red-200 text-red-700 px-5 py-2.5 rounded-xl font-bold"><Trash2 size={18} /> Hapus</button>
          <button onClick={sortByNearest} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold">{isLocating ? <Loader2 size={18} className="animate-spin" /> : <Crosshair size={18} />} Terdekat</button>
          <button onClick={exportCSV} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl font-bold"><Download size={18} /> Export</button>
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gray-50 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative w-full max-w-md"><Search className="absolute left-4 top-3 text-gray-400" size={20} /><input type="text" placeholder="Cari nama sekolah..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} className="w-full pl-12 pr-4 py-2.5 border rounded-xl font-medium focus:ring-4 focus:ring-blue-100 focus:border-blue-500" /></div>
            <div className="text-sm font-bold text-gray-500 hidden sm:block">Total: {processedData.length} Baris</div>
          </div>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide"><span className="text-xs font-bold text-gray-500 uppercase">Filter:</span>{["SD", "SMP", "SMA", "SMK", "Kampus"].map(j => (<button key={j} onClick={() => { setFilterJenjang(filterJenjang === j ? "" : j); setCurrentPage(1); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${filterJenjang === j ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{j}</button>))}</div>
            <div className="relative flex-1 w-full"><MapPin className="absolute left-3 top-2.5 text-gray-400" size={16} /><input type="text" placeholder="Filter Kota/Kecamatan..." value={filterLokasi} onChange={(e) => { setFilterLokasi(e.target.value); setCurrentPage(1); }} className="w-full pl-9 pr-4 py-2 border rounded-xl font-medium focus:ring-4 focus:ring-blue-100 focus:border-blue-500" /></div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white text-gray-500 text-xs uppercase font-bold border-b">
                <th className="p-5 cursor-pointer hover:text-blue-600" onClick={() => handleSort('nama')}>Nama Sekolah <ArrowUpDown size={14} className="inline" /></th>
                <th className="p-5">Alamat (OSM)</th>
                {sortConfig.key === 'jarak' && <th className="p-5 text-indigo-600">Jarak</th>}
                <th className="p-5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="4" className="p-10 text-center font-bold text-gray-500">Belum ada data.</td>
                </tr>
              ) : (
                paginatedData.map(school => (
                  <tr key={school.id} className="hover:bg-blue-50/50">
                    <td className="p-5">
                      <strong className="text-gray-900 block">{school.nama}</strong>
                      <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-bold uppercase mt-1 inline-block">{school.jenjang}</span>
                    </td>
                    <td className="p-5 text-sm text-gray-600 max-w-xs truncate">{school.alamat}</td>
                    {sortConfig.key === 'jarak' && <td className="p-5 font-bold text-indigo-700">{school.jarakKm < 1 ? `${Math.round(school.jarakKm * 1000)} M` : `${school.jarakKm.toFixed(2)} KM`}</td>}
                    <td className="p-5 text-right">
                      <div className="flex justify-end gap-2 items-center">
                        <button
                          onClick={() => toggleCompare(school)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-bold transition border ${compareList.some(c => c.id === school.id) ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                        >
                          {compareList.some(c => c.id === school.id) ? <CheckSquare size={14} /> : <Square size={14} />} Bandingkan
                        </button>
                        <a href={`#/sekolah/${school.id}`} className="inline-flex items-center text-blue-600 font-bold text-sm bg-blue-50 px-3 py-1.5 rounded-lg">Detail <ChevronRight size={16} /></a>
                        <BookmarkButton isFavorite={favorites.some(f => f.id === school.id)} onClick={() => toggleFavorite(school)} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 bg-gray-50 border-t flex justify-between items-center"><span className="text-sm font-medium text-gray-600">Hal {currentPage} dari {totalPages}</span><div className="flex gap-2"><button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 bg-white border rounded shadow-sm disabled:opacity-50 font-medium">Prev</button><button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 bg-white border rounded shadow-sm disabled:opacity-50 font-medium">Next</button></div></div>
      </div>
    </div>
  );
};

const DetailPage = ({ id, globalSchools, setGlobalSchools, isFetchingOSM, setIsFetchingOSM, favorites, toggleFavorite }) => {
  const [school, setSchool] = useState(globalSchools.find(s => s.id === id));
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!school && !isFetchingOSM && !error) {
      const fetchSingleNode = async () => {
        setIsFetchingOSM(true);
        try {
          const query = `[out:json][timeout:10];(node(${id});way(${id});relation(${id}););out center;`;
          const data = await fetchOverpassData(query);
          if (data && data.elements && data.elements.length > 0) {
            const el = data.elements[0];
            const tags = el.tags || {};
            const fetchedSchool = {
              id: el.id.toString(), nama: tags.name || "Tidak Diketahui", jenjang: tags['is_in:school_type'] || tags.amenity || "Sekolah",
              alamat: tags['addr:full'] || tags['addr:street'] || "Belum dilengkapi oleh relawan OSM",
              lat: el.lat || el.center?.lat, lng: el.lon || el.center?.lon,
              telp: tags['phone'] || tags['contact:phone'] || "Belum ada data", email: tags['email'] || tags['contact:email'] || "Belum ada data", web: tags['website'] || tags['contact:website'] || "Belum ada data"
            };
            setSchool(fetchedSchool); setGlobalSchools(prev => [...prev, fetchedSchool]);
          } else setError(true);
        } catch (e) { setError(true); } finally { setIsFetchingOSM(false); }
      };
      fetchSingleNode();
    }
  }, [id, school, isFetchingOSM, error]);

  if (isFetchingOSM && !school) return <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-blue-600 mb-4" size={40} />Mencari data OSM...</div>;
  if (error || !school) return <div className="py-32 text-center"><h2 className="text-3xl font-extrabold mb-4 text-gray-800">404 - Sekolah Tidak Ditemukan</h2><a href="#/list" className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold">Kembali</a></div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <a href="#/list" className="inline-flex items-center gap-2 text-gray-500 hover:text-blue-600 mb-6 font-bold bg-white px-4 py-2 rounded-lg shadow-sm border"><ArrowLeft size={18} /> Kembali</a>
      <div className="bg-white rounded-3xl shadow-xl border overflow-hidden mb-8 relative">
        <div className="h-48 bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-700 absolute w-full top-0"></div>
        <div className="px-8 pb-10 pt-32 relative z-10 flex flex-col md:flex-row items-end gap-6">
          <div className="bg-white p-2 rounded-2xl shadow-xl shrink-0"><div className="w-32 h-32 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100"><Building size={56} className="text-blue-500" /></div></div>
          <div className="flex-1 w-full mt-4 md:mt-0">
            <div className="flex gap-2 mb-3"><span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-black uppercase">{school.jenjang}</span><span className="px-3 py-1 bg-green-100 text-green-800 text-xs rounded-full font-black flex items-center gap-1"><MapPin size={12} /> OSM Data</span></div>
            <h1 className="text-4xl md:text-5xl font-black text-gray-900 mb-2">{school.nama}</h1><p className="text-sm text-gray-500 font-mono">OSM ID: {school.id}</p>
          </div>
          <div className="w-full md:w-auto mt-4 md:mt-0 flex gap-2">
            <BookmarkButton isFavorite={favorites.some(f => f.id === school.id)} onClick={() => toggleFavorite(school)} className="px-6 py-3.5 text-sm" />
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${school.lat},${school.lng}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3.5 rounded-xl font-bold shadow-lg hover:bg-blue-700"><Route size={20} /> Rute</a>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-3xl shadow-lg border p-8">
            <h3 className="text-xl font-extrabold text-gray-900 mb-6 flex items-center gap-2"><Phone className="text-blue-500" /> Atribut OSM</h3>
            <ul className="space-y-5">
              <li><p className="text-xs text-gray-400 font-bold uppercase mb-1">Alamat</p><p className="font-bold text-gray-800 text-sm">{school.alamat}</p></li>
              <li><p className="text-xs text-gray-400 font-bold uppercase mb-1">Telepon</p><p className="font-bold text-gray-800">{school.telp}</p></li>
              <li><p className="text-xs text-gray-400 font-bold uppercase mb-1">Website</p>{school.web !== 'Belum ada data' ? <a href={school.web.startsWith('http') ? school.web : `http://${school.web}`} target="_blank" rel="noreferrer" className="font-bold text-blue-600 hover:underline break-all">{school.web}</a> : <span className="font-bold text-gray-800">Belum ada data</span>}</li>
              <li><p className="text-xs text-gray-400 font-bold uppercase mb-1">Email</p><p className="font-bold text-gray-800 break-all">{school.email}</p></li>
            </ul>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 flex gap-3 text-blue-800"><AlertCircle className="shrink-0 mt-0.5" size={20} /><p className="text-xs font-medium"><b>Catatan:</b> OSM adalah platform crowdsource. Kelengkapan atribut bergantung pada relawan lokal.</p></div>
        </div>
        <div className="lg:col-span-2 bg-white rounded-3xl shadow-lg border overflow-hidden flex flex-col">
          <div className="p-6 border-b flex justify-between items-center bg-gray-50"><h3 className="text-xl font-extrabold text-gray-900">Peta Detail</h3><div className="text-xs font-mono text-gray-500 bg-white px-3 py-1.5 rounded-lg border">{school.lat.toFixed(6)}, {school.lng.toFixed(6)}</div></div>
          <div className="h-[450px] w-full relative z-0"><MapView schools={[school]} center={[school.lat, school.lng]} zoom={17} className="h-full w-full" /></div>
        </div>
      </div>
    </div>
  );
};

const FavoritesPage = ({ favorites, toggleFavorite }) => {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-yellow-900 flex items-center gap-2">
            <Star size={24} className="fill-yellow-500 text-yellow-500" /> Daftar Sekolah Favorit
          </h1>
          <p className="text-yellow-700 mt-1 text-sm font-medium">Data ini tersimpan secara lokal di perangkat Anda.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        {favorites.length === 0 ? (
          <div className="p-16 text-center text-gray-500 flex flex-col items-center">
            <Star size={48} className="text-gray-200 mb-4" />
            <p className="font-bold text-lg">Belum ada sekolah favorit yang disimpan.</p>
            <p className="text-sm mt-1 mb-4">Silakan simpan sekolah melalui halaman List atau Live Map.</p>
            <a href="#/peta" className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition">Buka Live Map</a>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white text-gray-500 text-xs uppercase tracking-wider font-bold border-b border-gray-200">
                  <th className="p-5">Nama Sekolah</th>
                  <th className="p-5">Alamat (OSM)</th>
                  <th className="p-5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {favorites.map(school => (
                  <tr key={school.id} className="hover:bg-yellow-50/50 transition">
                    <td className="p-5">
                      <strong className="text-gray-900 block">{school.nama}</strong>
                      <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase font-bold mt-1 inline-block">{school.jenjang}</span>
                    </td>
                    <td className="p-5 text-sm text-gray-600 max-w-xs truncate">{school.alamat}</td>
                    <td className="p-5 text-right">
                      <div className="flex justify-end gap-2 items-center">
                        <a href={`#/sekolah/${school.id}`} className="inline-flex items-center text-blue-600 hover:text-blue-800 font-bold text-sm bg-blue-50 px-3 py-1.5 rounded-lg transition">
                          Detail
                        </a>
                        <BookmarkButton isFavorite={true} onClick={() => toggleFavorite(school)} className="px-3 py-1.5 text-xs" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const ComparePage = ({ compareList, toggleCompare, navigate }) => {
  if (compareList.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <Scale size={80} className="mx-auto text-gray-300 mb-6" />
        <h1 className="text-3xl font-black text-gray-800 mb-4">Belum Ada Sekolah yang Dibandingkan</h1>
        <p className="text-gray-500 mb-8">Silakan pilih maksimal 3 sekolah dari halaman Database Lokal dengan mencentang "Bandingkan".</p>
        <button onClick={() => navigate('/list')} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg">Buka Database Lokal</button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 flex items-center gap-3"><Scale className="text-teal-600" size={32} /> Perbandingan Sekolah</h1>
          <p className="text-gray-500 mt-2">Membandingkan {compareList.length} dari maksimal 3 sekolah.</p>
        </div>
        <button onClick={() => navigate('/list')} className="text-blue-600 bg-blue-50 px-5 py-2.5 rounded-xl font-bold hover:bg-blue-100 transition border border-blue-200">Tambah / Ubah Sekolah</button>
      </div>

      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="p-6 w-1/4 text-gray-500 font-bold uppercase tracking-wider text-sm">Atribut</th>
              {compareList.map(s => (
                <th key={s.id} className="p-6 w-1/4 border-l border-gray-100 align-top">
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-black text-lg text-gray-900 leading-tight">{s.nama}</span>
                    <button onClick={() => toggleCompare(s)} className="text-red-400 hover:text-red-600 p-1.5 bg-red-50 hover:bg-red-100 transition rounded-lg" title="Hapus dari perbandingan"><Trash2 size={16} /></button>
                  </div>
                </th>
              ))}
              {Array.from({ length: 3 - compareList.length }).map((_, i) => (
                <th key={`empty-${i}`} className="p-6 w-1/4 border-l border-gray-100 bg-gray-50/50">
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center text-gray-400 text-sm font-bold flex flex-col items-center justify-center h-full">
                    <Scale size={24} className="mb-2 opacity-50" />
                    Slot Kosong
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm">
            <tr className="hover:bg-gray-50/50">
              <td className="p-6 font-bold text-gray-600 bg-gray-50/30">Jenjang</td>
              {compareList.map(s => <td key={s.id} className="p-6 border-l border-gray-100"><span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg font-bold uppercase">{s.jenjang}</span></td>)}
              {Array.from({ length: 3 - compareList.length }).map((_, i) => <td key={`e1-${i}`} className="p-6 border-l border-gray-100 bg-gray-50/50"></td>)}
            </tr>
            <tr className="hover:bg-gray-50/50">
              <td className="p-6 font-bold text-gray-600 bg-gray-50/30">Alamat</td>
              {compareList.map(s => <td key={s.id} className="p-6 border-l border-gray-100 text-gray-700 leading-relaxed">{s.alamat}</td>)}
              {Array.from({ length: 3 - compareList.length }).map((_, i) => <td key={`e2-${i}`} className="p-6 border-l border-gray-100 bg-gray-50/50"></td>)}
            </tr>
            <tr className="hover:bg-gray-50/50">
              <td className="p-6 font-bold text-gray-600 bg-gray-50/30">Telepon</td>
              {compareList.map(s => <td key={s.id} className="p-6 border-l border-gray-100 text-gray-700 font-medium">{s.telp || '-'}</td>)}
              {Array.from({ length: 3 - compareList.length }).map((_, i) => <td key={`e3-${i}`} className="p-6 border-l border-gray-100 bg-gray-50/50"></td>)}
            </tr>
            <tr className="hover:bg-gray-50/50">
              <td className="p-6 font-bold text-gray-600 bg-gray-50/30">Website</td>
              {compareList.map(s => <td key={s.id} className="p-6 border-l border-gray-100">
                {s.web && s.web !== 'Belum ada data' ? <a href={s.web.startsWith('http') ? s.web : `http://${s.web}`} target="_blank" rel="noreferrer" className="text-blue-600 font-bold hover:underline break-all">{s.web}</a> : <span className="text-gray-400 italic">Belum ada data</span>}
              </td>)}
              {Array.from({ length: 3 - compareList.length }).map((_, i) => <td key={`e4-${i}`} className="p-6 border-l border-gray-100 bg-gray-50/50"></td>)}
            </tr>
            <tr className="hover:bg-gray-50/50">
              <td className="p-6 font-bold text-gray-600 bg-gray-50/30">Aksi</td>
              {compareList.map(s => <td key={s.id} className="p-6 border-l border-gray-100"><button onClick={() => navigate('/sekolah/' + s.id)} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-bold transition shadow-sm">Lihat Detail</button></td>)}
              {Array.from({ length: 3 - compareList.length }).map((_, i) => <td key={`e5-${i}`} className="p-6 border-l border-gray-100 bg-gray-50/50"></td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

const AnalyticsPage = ({ globalSchools }) => {
  const chartJsLoaded = useChartJs();
  const barRef = useRef(null);
  const pieRef = useRef(null);

  const [activeJenjang, setActiveJenjang] = useState('TOTAL');
  const [activeRegion, setActiveRegion] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const stats = useMemo(() => {
    const c = { SD: 0, SMP: 0, SMA: 0, SMK: 0, Kampus: 0, Lainnya: 0 };
    globalSchools.forEach(s => {
      let j = s.jenjang?.toUpperCase() || 'LAINNYA';
      if (j.includes('KAMPUS')) j = 'Kampus';
      if (c[j] !== undefined) c[j]++; else c.Lainnya++;
    });
    return c;
  }, [globalSchools]);

  const filteredByJenjang = useMemo(() => {
    if (activeJenjang === 'TOTAL') return globalSchools;
    return globalSchools.filter(s => {
      let j = s.jenjang?.toUpperCase() || 'LAINNYA';
      if (j.includes('KAMPUS')) j = 'Kampus';

      if (activeJenjang === 'Lainnya') {
        return !['SD', 'SMP', 'SMA', 'SMK', 'Kampus'].includes(j);
      }

      return j === activeJenjang;
    });
  }, [globalSchools, activeJenjang]);

  const topRegions = useMemo(() => {
    const rc = {};
    filteredByJenjang.forEach(s => {
      const r = getRegionFromAddress(s.alamat);
      if (r.length > 3) rc[r] = (rc[r] || 0) + 1;
    });
    return Object.entries(rc).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [filteredByJenjang]);

  const tableData = useMemo(() => {
    if (!activeRegion) return filteredByJenjang;
    return filteredByJenjang.filter(s => getRegionFromAddress(s.alamat) === activeRegion);
  }, [filteredByJenjang, activeRegion]);

  useEffect(() => {
    if (!chartJsLoaded || !barRef.current || !pieRef.current) return;
    const labels = ['SD', 'SMP', 'SMA', 'SMK', 'Kampus', 'Lainnya'];
    const data = labels.map(l => stats[l]);

    const chartIdBar = window.Chart.getChart(barRef.current);
    if (chartIdBar) chartIdBar.destroy();
    const chartIdPie = window.Chart.getChart(pieRef.current);
    if (chartIdPie) chartIdPie.destroy();

    const bgColors = ['rgba(239, 68, 68, 0.8)', 'rgba(59, 130, 246, 0.8)', 'rgba(168, 85, 247, 0.8)', 'rgba(249, 115, 22, 0.8)', 'rgba(99, 102, 241, 0.8)', 'rgba(156, 163, 175, 0.8)'];

    new window.Chart(barRef.current, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: bgColors, borderRadius: 8 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, datalabels: { align: 'top', anchor: 'end', font: { weight: 'bold', size: 12 }, color: '#4b5563', formatter: (val) => val > 0 ? val : '' } },
        scales: { y: { beginAtZero: true, grace: '10%', grid: { borderDash: [4, 4] } }, x: { grid: { display: false } } }
      }
    });

    new window.Chart(pieRef.current, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: bgColors, borderWidth: 2, hoverOffset: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: {
          legend: { position: 'right' },
          datalabels: { color: '#ffffff', font: { weight: 'bold', size: 12 }, formatter: (val, ctx) => { if (val === 0) return ''; const total = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0); const p = Math.round((val / total) * 100); return p > 3 ? p + '%' : ''; } }
        }
      }
    });
  }, [chartJsLoaded, stats]);

  const handleJenjangClick = (j) => { setActiveJenjang(j); setActiveRegion(null); setCurrentPage(1); };
  const handleRegionClick = (r) => { setActiveRegion(prev => prev === r ? null : r); setCurrentPage(1); setTimeout(() => document.getElementById('analytics-detail-table')?.scrollIntoView({ behavior: 'smooth' }), 100); };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8"><h1 className="text-3xl font-extrabold text-gray-900 flex items-center gap-3"><PieChart className="text-blue-600" size={32} /> Dashboard Analitik</h1><p className="text-gray-500 mt-2 text-lg">Ringkasan statistik data institusi pendidikan yang berhasil Anda scrape. <b>Klik kartu di bawah ini untuk melihat detail data.</b></p></div>
      <div className="flex flex-wrap gap-4 mb-8">
        <div onClick={() => handleJenjangClick('TOTAL')} className={`flex-1 min-w-[200px] bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 text-white shadow-lg cursor-pointer transform hover:-translate-y-1 transition ${activeJenjang === 'TOTAL' ? 'ring-4 ring-indigo-300' : ''}`}><p className="text-blue-100 font-bold text-sm mb-1 uppercase tracking-wider">Total Scraped</p><h2 className="text-4xl font-black">{globalSchools.length}</h2></div>
        {['SD', 'SMP', 'SMA', 'SMK', 'Kampus', 'Lainnya'].map(j => (
          <div key={j} onClick={() => handleJenjangClick(j)} className={`flex-1 min-w-[120px] bg-white rounded-2xl p-5 shadow-sm flex flex-col justify-center cursor-pointer transform hover:-translate-y-1 transition border-2 ${activeJenjang === j ? 'border-blue-500 bg-blue-50 ring-4 ring-blue-100' : 'border-gray-100 hover:border-blue-300'}`}><p className="text-gray-500 font-bold text-xs mb-1 uppercase tracking-wider">Total {j}</p><h2 className="text-3xl font-black text-gray-800">{stats[j]}</h2></div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-white rounded-3xl p-6 shadow-lg border border-gray-100 h-[400px]"><h3 className="text-lg font-extrabold text-gray-800 mb-6 flex items-center gap-2"><BarChart2 className="text-indigo-500" size={20} /> Jumlah Institusi per Jenjang</h3><div className="h-[280px] w-full relative">{!chartJsLoaded && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>}<canvas ref={barRef}></canvas></div></div>
        <div className="bg-white rounded-3xl p-6 shadow-lg border border-gray-100 h-[400px]"><h3 className="text-lg font-extrabold text-gray-800 mb-6 flex items-center gap-2"><PieChart className="text-purple-500" size={20} /> Distribusi Tipe Sekolah</h3><div className="h-[280px] w-full relative">{!chartJsLoaded && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>}<canvas ref={pieRef}></canvas></div></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 bg-white p-6 rounded-3xl shadow-lg border border-gray-100">
          <h3 className="text-lg font-extrabold text-gray-800 mb-2 flex items-center gap-2"><MapPin className="text-red-500" size={20} /> Top 10 Area (Wilayah)</h3><p className="text-xs text-gray-500 mb-6">Mendeteksi otomatis area dari atribut satelit OSM. <b>Pilih area untuk melihat detail.</b></p>
          <div className="space-y-3">
            {topRegions.length === 0 ? (<p className="text-sm text-gray-400 italic text-center py-6">Data wilayah tidak tersedia.</p>) : (
              topRegions.map(([r, c], index) => {
                const isSelected = activeRegion === r;
                return (
                  <div key={r} onClick={() => handleRegionClick(r)} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${isSelected ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-100' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'}`}>
                    <div className="flex items-center gap-3 overflow-hidden"><span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${index < 3 ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'} ${isSelected ? 'bg-blue-600 text-white' : ''}`}>{index + 1}</span><span className={`text-sm font-bold truncate ${isSelected ? 'text-blue-800' : 'text-gray-700'}`} title={r}>{r}</span></div><span className={`text-xs font-black px-2 py-1 rounded-lg border shadow-sm shrink-0 ${isSelected ? 'bg-blue-600 text-white border-blue-700' : 'bg-white border-gray-200 text-blue-700'}`}>{c} Data</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="lg:col-span-2 bg-white rounded-3xl shadow-lg flex flex-col overflow-hidden border border-gray-100">
          <div id="analytics-detail-table" className="p-6 bg-gray-50 border-b flex flex-col justify-center">
            <h3 className="text-lg font-extrabold text-gray-800 flex items-center gap-2"><List className="text-blue-500" size={20} /> Detail Data: Kategori {activeJenjang === 'TOTAL' ? 'Semua Institusi' : activeJenjang} {activeRegion ? `di Wilayah ${activeRegion}` : ''}</h3>
            <p className="text-sm text-gray-500 mt-1">Menampilkan total {tableData.length} baris data.</p>

            {activeJenjang === 'Lainnya' && (
              <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex gap-3 text-yellow-800">
                <Info className="shrink-0 mt-0.5" size={18} />
                <p className="text-xs font-medium leading-relaxed">
                  <b>Catatan Kategori "Lainnya":</b> Berisi data institusi pendidikan dari OpenStreetMap yang tidak memiliki tag spesifik SD, SMP, SMA, SMK, atau Kampus. Biasanya ini mencakup: <b>TK / PAUD, Madrasah (MI/MTs/MA), Lembaga Kursus/Pelatihan, SLB,</b> atau sekolah yang oleh relawan hanya diberi label umum tanpa jenjang.
                </p>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-x-auto min-h-[400px]">
            {tableData.length === 0 ? (
              <div className="p-16 text-center text-gray-400 flex flex-col items-center justify-center h-full"><Search size={48} className="mb-4 opacity-50" /><p className="font-medium text-lg">Tidak ada data untuk ditampilkan</p></div>
            ) : (
              <table className="w-full text-left border-collapse text-sm">
                <thead><tr className="bg-white border-b border-gray-100 text-gray-500 uppercase text-xs font-bold tracking-wider"><th className="p-5">Nama Institusi</th><th className="p-5">Alamat / Wilayah</th><th className="p-5 text-right">Aksi</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {tableData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(s => (
                    <tr key={s.id} className="hover:bg-blue-50/50 transition"><td className="p-5"><strong className="text-gray-900 block text-base">{s.nama}</strong><span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase font-black mt-1 inline-block">{s.jenjang}</span></td><td className="p-5 text-gray-600 text-sm truncate max-w-[250px]" title={s.alamat}>{s.alamat}</td><td className="p-5 text-right"><a href={`#/sekolah/${s.id}`} className="inline-flex items-center text-blue-600 hover:text-blue-800 font-bold text-sm bg-blue-50 px-4 py-2 rounded-lg transition whitespace-nowrap">Lihat Detail</a></td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {tableData.length > 0 && (<div className="p-5 border-t border-gray-100 flex justify-between items-center bg-white"><span className="text-sm font-bold text-gray-500 uppercase">Halaman {currentPage} dari {Math.max(1, Math.ceil(tableData.length / itemsPerPage))}</span><div className="flex gap-2"><button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-5 py-2 bg-white border border-gray-300 rounded-xl shadow-sm disabled:opacity-50 text-sm font-bold hover:bg-gray-50 transition text-gray-700">Prev</button><button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= Math.ceil(tableData.length / itemsPerPage)} className="px-5 py-2 bg-white border border-gray-300 rounded-xl shadow-sm disabled:opacity-50 text-sm font-bold hover:bg-gray-50 transition text-gray-700">Next</button></div></div>)}
        </div>
      </div>
    </div>
  );
};

// --- MAIN APP COMPONENT ---
export default function App() {
  const { route, navigate } = useHashRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [favorites, setFavorites] = useState(() => {
    try { const saved = localStorage.getItem('favorite_schools'); if (saved) return JSON.parse(saved); } catch (e) { console.error("Gagal", e); }
    return [];
  });

  const [globalSchools, setGlobalSchools] = useState(() => {
    try { const saved = localStorage.getItem('osm_scraped_schools'); if (saved) return JSON.parse(saved); } catch (e) { console.error("Gagal", e); }
    return [];
  });

  const [compareList, setCompareList] = useState([]);

  const [isFetchingOSM, setIsFetchingOSM] = useState(false);
  const [isSearchingGeocode, setIsSearchingGeocode] = useState(false);

  useEffect(() => { try { localStorage.setItem('osm_scraped_schools', JSON.stringify(globalSchools)); } catch (e) { if (e.name === 'QuotaExceededError') alert("Storage penuh!"); } }, [globalSchools]);
  useEffect(() => { try { localStorage.setItem('favorite_schools', JSON.stringify(favorites)); } catch (e) { console.error("Gagal", e); } }, [favorites]);

  const handleToggleFavorite = useCallback((school) => {
    setFavorites(prev => {
      const isFav = prev.some(f => f.id === school.id);
      if (isFav) return prev.filter(f => f.id !== school.id);
      return [...prev, { id: school.id, nama: school.nama, jenjang: school.jenjang, lat: school.lat, lng: school.lng, alamat: school.alamat }];
    });
  }, []);

  const handleToggleCompare = useCallback((school) => {
    setCompareList(prev => {
      if (prev.some(s => s.id === school.id)) {
        return prev.filter(s => s.id !== school.id);
      }
      if (prev.length >= 3) {
        alert("Anda hanya dapat membandingkan maksimal 3 sekolah.");
        return prev;
      }
      return [...prev, school];
    });
  }, []);

  useEffect(() => {
    if (route.path === '/') document.title = "Live Scrape Sekolah | Direktori OSM";
    else if (route.path === '/peta') document.title = "Peta OSM | Direktori Sekolah";
    else if (route.path === '/list') document.title = "Database Lokal | Direktori Sekolah";
    else if (route.path === '/direktori') document.title = "Direktori per Kota | Direktori Sekolah";
    else if (route.path === '/favorit') document.title = "Sekolah Favorit | Direktori Sekolah";
    else if (route.path === '/analitik') document.title = "Analitik Data | Direktori Sekolah";
    else if (route.path === '/compare') document.title = "Bandingkan Sekolah | Direktori Sekolah";
    setIsMobileMenuOpen(false);
  }, [route.path]);

  const fetchSchoolsFromOSM = async (bounds) => {
    setIsFetchingOSM(true);
    const { south, west, north, east } = bounds;
    const areaSq = Math.abs(north - south) * Math.abs(east - west);
    if (areaSq > 1.0) { alert("Area peta terlalu luas."); setIsFetchingOSM(false); return; }

    const query = `[out:json][timeout:25];(node["amenity"="school"](${south},${west},${north},${east});way["amenity"="school"](${south},${west},${north},${east});node["amenity"="kindergarten"](${south},${west},${north},${east});node["amenity"="university"](${south},${west},${north},${east});way["amenity"="university"](${south},${west},${north},${east});node["amenity"="college"](${south},${west},${north},${east});way["amenity"="college"](${south},${west},${north},${east}););out center;`;

    try {
      const data = await fetchOverpassData(query);
      const newSchools = [];
      if (data && data.elements) {
        data.elements.forEach(el => {
          const tags = el.tags || {};
          if (tags.name) {
            let calcJenjang = tags['is_in:school_type'];
            if (!calcJenjang) {
              const n = tags.name.toLowerCase();
              if (tags.amenity === 'kindergarten' || /\b(tk|paud|ra)\b/.test(n)) calcJenjang = 'TK';
              else if (tags.amenity === 'university' || tags.amenity === 'college' || /\b(universitas|institut|politeknik|akademi|sekolah tinggi|kampus|univ)\b/.test(n)) calcJenjang = 'Kampus';
              else if (/\b(sd|sdn|sdi|mis|min)\b/.test(n)) calcJenjang = 'SD';
              else if (/\b(smp|smpn|smpi|mts|mtsn)\b/.test(n)) calcJenjang = 'SMP';
              else if (/\b(sma|sman|smai|man|mas)\b/.test(n)) calcJenjang = 'SMA';
              else if (/\b(smk|smkn|smki)\b/.test(n)) calcJenjang = 'SMK';
              else calcJenjang = 'Sekolah';
            } else {
              if (calcJenjang.toLowerCase().includes('university') || calcJenjang.toLowerCase().includes('college')) calcJenjang = 'Kampus';
            }

            newSchools.push({
              id: el.id.toString(), nama: tags.name, jenjang: calcJenjang,
              alamat: tags['addr:full'] || tags['addr:street'] || tags['address'] || "Belum dilengkapi oleh relawan OSM",
              lat: el.lat || el.center?.lat, lng: el.lon || el.center?.lon,
              telp: tags['phone'] || tags['contact:phone'] || "Belum ada data", email: tags['email'] || tags['contact:email'] || "Belum ada data", web: tags['website'] || tags['contact:website'] || "Belum ada data"
            });
          }
        });
      }
      setGlobalSchools(prev => { const merged = [...prev, ...newSchools]; return Array.from(new Map(merged.map(item => [item.id, item])).values()); });
    } catch (err) { alert(err.message); } finally { setIsFetchingOSM(false); }
  };

  const renderRoute = () => {
    if (route.path === '/peta') return <MapPage query={route.query} globalSchools={globalSchools} fetchSchoolsFromOSM={fetchSchoolsFromOSM} isFetchingOSM={isFetchingOSM} navigate={navigate} favorites={favorites} />;
    if (route.path === '/list') return <ListPage globalSchools={globalSchools} setGlobalSchools={setGlobalSchools} favorites={favorites} toggleFavorite={handleToggleFavorite} compareList={compareList} toggleCompare={handleToggleCompare} />;
    if (route.path === '/direktori') return <DirectoryPage navigate={navigate} />;
    if (route.path === '/favorit') return <FavoritesPage favorites={favorites} toggleFavorite={handleToggleFavorite} />;
    if (route.path === '/analitik') return <AnalyticsPage globalSchools={globalSchools} />;
    if (route.path === '/compare') return <ComparePage compareList={compareList} toggleCompare={handleToggleCompare} navigate={navigate} />;
    if (route.path.startsWith('/sekolah/')) return <DetailPage id={route.path.split('/')[2]} globalSchools={globalSchools} setGlobalSchools={setGlobalSchools} isFetchingOSM={isFetchingOSM} setIsFetchingOSM={setIsFetchingOSM} favorites={favorites} toggleFavorite={handleToggleFavorite} />;
    return <HomePage navigate={navigate} isSearchingGeocode={isSearchingGeocode} setIsSearchingGeocode={setIsSearchingGeocode} />;
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col text-gray-800">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-[2000] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-18 py-3">
            <a href="#/" className="flex items-center gap-3 group">
              <div className="bg-blue-600 text-white p-2.5 rounded-xl shadow-md group-hover:scale-110 transition flex items-center justify-center"><RefreshCw size={24} className="group-hover:animate-spin" /></div>
              <span className="font-black text-2xl tracking-tight text-gray-900">OSM<span className="text-blue-600">Scraper</span></span>
            </a>

            <div className="hidden md:flex items-center space-x-2">
              <a href="#/" className={`px-4 py-2 rounded-lg text-sm font-bold transition ${route.path === '/' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-blue-600'}`}>Beranda</a>
              <a href="#/direktori" className={`px-4 py-2 rounded-lg text-sm font-bold transition ${route.path === '/direktori' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-blue-600'}`}>SEO Direktori</a>
              <a href="#/list" className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${route.path === '/list' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-blue-600'}`}>Database Lokal <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full text-xs">{globalSchools.length}</span></a>
              <a href="#/analitik" className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${route.path === '/analitik' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50 hover:text-purple-600'}`}><PieChart size={16} /> Analitik</a>
              <a href="#/favorit" className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${route.path === '/favorit' ? 'bg-yellow-50 text-yellow-700' : 'text-gray-600 hover:bg-gray-50 hover:text-yellow-600'}`}>Favorit <Star size={14} className={favorites.length > 0 ? "fill-yellow-500 text-yellow-500" : ""} /></a>
              <a href="#/peta" className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${route.path === '/peta' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-900 text-white hover:bg-gray-800'}`}><MapIcon size={16} /> Live Map</a>
              {compareList.length > 0 && (
                <button onClick={() => navigate('/compare')} className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 shadow-md animate-pulse ml-2">
                  <Scale size={16} /> Bandingkan Sekarang ({compareList.length})
                </button>
              )}
            </div>

            <div className="md:hidden flex items-center">
              <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-gray-600 hover:text-blue-600 focus:outline-none p-2 rounded-lg bg-gray-50 border border-gray-200">{isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}</button>
            </div>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 w-full bg-white border-b border-gray-200 shadow-2xl flex flex-col px-4 py-4 space-y-2 z-[2000]">
            <a href="#/" className={`px-4 py-3 rounded-xl text-base font-bold transition ${route.path === '/' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}>Beranda</a>
            <a href="#/direktori" className={`px-4 py-3 rounded-xl text-base font-bold transition ${route.path === '/direktori' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}>SEO Direktori</a>
            <a href="#/list" className={`px-4 py-3 rounded-xl text-base font-bold transition flex items-center justify-between ${route.path === '/list' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}><span>Database Lokal</span><span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs">{globalSchools.length} Data</span></a>
            <a href="#/analitik" className={`px-4 py-3 rounded-xl text-base font-bold transition flex items-center gap-2 ${route.path === '/analitik' ? 'bg-purple-50 text-purple-700' : 'text-gray-700 hover:bg-purple-50'}`}><PieChart size={18} /> Analitik Data</a>
            <a href="#/favorit" className={`px-4 py-3 rounded-xl text-base font-bold transition flex items-center justify-between ${route.path === '/favorit' ? 'bg-yellow-50 text-yellow-700' : 'text-gray-700 hover:bg-yellow-50'}`}><span className="flex items-center gap-2"><Star size={18} className={favorites.length > 0 ? "fill-yellow-500 text-yellow-500" : ""} /> Favorit</span><span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs">{favorites.length} Sekolah</span></a>
            {compareList.length > 0 && (
              <a href="#/compare" className={`px-4 py-3 rounded-xl text-base font-bold transition flex items-center justify-between ${route.path === '/compare' ? 'bg-teal-50 text-teal-700' : 'text-gray-700 hover:bg-teal-50'}`}>
                <span className="flex items-center gap-2"><Scale size={18} className="text-teal-600" /> Bandingkan Sekarang</span>
                <span className="bg-teal-100 text-teal-800 px-3 py-1 rounded-full text-xs animate-pulse">{compareList.length} Dipilih</span>
              </a>
            )}
            <div className="pt-2"><a href="#/peta" className={`w-full px-4 py-3.5 rounded-xl text-base font-bold transition flex items-center justify-center gap-2 ${route.path === '/peta' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-900 text-white hover:bg-gray-800'}`}><MapIcon size={18} /> Buka Live Map</a></div>
          </div>
        )}
      </nav>

      <main className="flex-1 w-full">{renderRoute()}</main>
    </div>
  );
}