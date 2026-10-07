/**
 * GeoMeasure Studio - Frontend Logic
 * Interactive Geospatial Measurement & Validation Dashboard
 */

document.addEventListener('DOMContentLoaded', () => {
  // Global State
  let currentFileId = null;
  let currentSummary = null;
  let currentFeatures = [];
  let currentGeoJsonLayer = null;
  let featureMapLayers = new Map(); // index -> leaflet layer
  let activeFilterType = 'all';
  let searchQuery = '';
  let map = null;

  // DOM Elements
  const dropzone = document.getElementById('upload-dropzone');
  const fileInput = document.getElementById('file-input');
  const btnLoadSample = document.getElementById('btn-load-sample');
  const progressBox = document.getElementById('upload-progress-box');
  const progressFill = document.getElementById('upload-progress-fill');
  const progressStatusText = document.getElementById('progress-status-text');
  const progressStatusPct = document.getElementById('progress-status-pct');
  const alertBox = document.getElementById('alert-box');
  const alertMessage = document.getElementById('alert-message');
  const alertCard = document.getElementById('alert-card-content');
  const dashboardSection = document.getElementById('dashboard-results-section');
  const toastContainer = document.getElementById('toast-container');
  const apiStatusText = document.getElementById('api-status-text');
  const statusIndicator = document.getElementById('status-indicator');

  // Stats Card Elements
  const statFilename = document.getElementById('stat-filename');
  const statCrsBadge = document.getElementById('stat-crs-badge');
  const statFeatureCount = document.getElementById('stat-feature-count');
  const statLayersText = document.getElementById('stat-layers-text');
  const statTotalAreaHa = document.getElementById('stat-total-area-ha');
  const statTotalAreaSqm = document.getElementById('stat-total-area-sqm');
  const statTotalAreaSqkm = document.getElementById('stat-total-area-sqkm');
  const statTotalLengthM = document.getElementById('stat-total-length-m');
  const statTotalLengthKm = document.getElementById('stat-total-length-km');
  const statGeodesicLength = document.getElementById('stat-geodesic-length');
  const statAccuracyStatus = document.getElementById('stat-accuracy-status');
  const statMaxDeviation = document.getElementById('stat-max-deviation');
  const statGeometryHealth = document.getElementById('stat-geometry-health');
  const utmUsageText = document.getElementById('utm-usage-text');

  // Table & Filter Elements
  const tableBody = document.getElementById('features-table-body');
  const filterPills = document.querySelectorAll('.filter-pill');
  const searchInput = document.getElementById('feature-search-input');
  const tableShowingText = document.getElementById('table-showing-text');
  const countAll = document.getElementById('count-all');
  const countPolygon = document.getElementById('count-polygon');
  const countLineString = document.getElementById('count-linestring');
  const countPoint = document.getElementById('count-point');

  // Action Buttons
  const btnFitBounds = document.getElementById('btn-fit-bounds');
  const btnExportJson = document.getElementById('btn-export-json');
  const btnExportGeoJson = document.getElementById('btn-export-geojson');

  // Modal Elements
  const inspectorModal = document.getElementById('inspector-modal');
  const modalFeatureTitle = document.getElementById('modal-feature-title');
  const modalJsonContent = document.getElementById('modal-json-content');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCopyJson = document.getElementById('btn-copy-json');
  const btnModalZoom = document.getElementById('btn-modal-zoom');
  let selectedModalFeature = null;

  // --------------------------------------------------------------------------
  // 1. Initialize Map & API Health Check
  // --------------------------------------------------------------------------

  function initMap() {
    if (map) return;

    // Default center on world view
    map = L.map('leaflet-map', {
      zoomControl: true,
      attributionControl: true,
    }).setView([20, 0], 2);

    // DarkMatter Base Tile Layer (Default)
    const darkMatter = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 20,
    }).addTo(map);

    // OpenStreetMap Base Tile Layer
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    });

    // Satellite Imagery Layer
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; Esri, Maxar, Earthstar Geographics',
      maxZoom: 19,
    });

    const baseMaps = {
      '🌙 Dark Matter': darkMatter,
      '🗺️ Street Map': osm,
      '🛰️ Satellite': satellite,
    };

    L.control.layers(baseMaps, null, { position: 'bottomright' }).addTo(map);
  }

  async function checkHealth() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        apiStatusText.textContent = 'API Online';
        statusIndicator.style.background = '#10b981';
        statusIndicator.style.boxShadow = '0 0 8px #10b981';
      } else {
        throw new Error('API degraded');
      }
    } catch {
      apiStatusText.textContent = 'API Offline';
      statusIndicator.style.background = '#f43f5e';
      statusIndicator.style.boxShadow = '0 0 8px #f43f5e';
    }
  }

  // --------------------------------------------------------------------------
  // 2. File Upload & Processing
  // --------------------------------------------------------------------------

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  });

  btnLoadSample.addEventListener('click', async () => {
    try {
      showProgress(true, 'Fetching sample KML dataset...', 20);
      const res = await fetch('/api/sample');
      if (!res.ok) throw new Error('Could not fetch sample dataset');
      const blob = await res.blob();
      const sampleFile = new File([blob], 'sample_survey.kml', { type: 'application/vnd.google-earth.kml+xml' });
      await handleFileUpload(sampleFile);
    } catch (err) {
      showProgress(false);
      showAlert(`Failed to load sample dataset: ${err.message}`, 'error');
    }
  });

  function showProgress(visible, text = '', pct = 0) {
    if (visible) {
      progressBox.style.display = 'block';
      progressStatusText.textContent = text;
      progressStatusPct.textContent = `${pct}%`;
      progressFill.style.width = `${pct}%`;
    } else {
      progressBox.style.display = 'none';
      progressFill.style.width = '0%';
    }
  }

  function showAlert(message, type = 'error') {
    alertBox.style.display = 'block';
    alertMessage.textContent = message;
    alertCard.className = `alert-card alert-${type}`;
  }

  function hideAlert() {
    alertBox.style.display = 'none';
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${type === 'success' ? '#10b981' : '#06b6d4'}" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
      <span>${message}</span>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  async function handleFileUpload(file) {
    hideAlert();
    const name = file.name || 'dataset';
    const ext = name.split('.').pop().toLowerCase();
    if (!['zip', 'kml'].includes(ext)) {
      showAlert('Only .zip (Shapefile) and .kml files are supported.', 'error');
      return;
    }

    showProgress(true, `Uploading ${name}...`, 30);

    const formData = new FormData();
    formData.append('file', file);

    try {
      showProgress(true, 'Extracting layers & re-projecting to local metric UTM...', 60);
      const uploadRes = await fetch('/api/files/', {
        method: 'POST',
        body: formData,
      });

      const uploadData = await uploadRes.json();

      if (!uploadRes.ok) {
        const errorDetail = uploadData.detail || uploadData.error || 'Failed to process geospatial file.';
        throw new Error(errorDetail);
      }

      currentFileId = uploadData.id;
      showProgress(true, 'Fetching measurements & spatial summary...', 85);

      // Fetch summary and features in parallel
      const [summaryRes, measurementsRes] = await Promise.all([
        fetch(`/api/files/${currentFileId}/summary/`),
        fetch(`/api/files/${currentFileId}/measurements/?limit=1000&include_geometry=true`),
      ]);

      if (!summaryRes.ok || !measurementsRes.ok) {
        throw new Error('Failed to retrieve computed measurements from storage.');
      }

      currentSummary = await summaryRes.json();
      const measurementsData = await measurementsRes.json();
      currentFeatures = measurementsData.features || [];

      showProgress(true, 'Rendering spatial features...', 100);
      setTimeout(() => {
        showProgress(false);
        renderDashboard();
        showToast(`Successfully processed ${currentFeatures.length} features!`, 'success');
      }, 300);

    } catch (err) {
      showProgress(false);
      showAlert(`Error: ${err.message}`, 'error');
    }
  }

  // --------------------------------------------------------------------------
  // 3. Render Dashboard
  // --------------------------------------------------------------------------

  function renderDashboard() {
    dashboardSection.style.display = 'flex';
    initMap();

    // Scroll to dashboard
    dashboardSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Update Warnings if present
    if (currentSummary.warnings && currentSummary.warnings.length > 0) {
      showAlert(`Warnings: ${currentSummary.warnings.join(' • ')}`, 'warning');
    }

    // 1. Card: Dataset & CRS
    statFilename.textContent = currentSummary.filename;
    const crsCode = currentSummary.crs?.code || currentSummary.crs?.name || 'Unknown CRS';
    statCrsBadge.textContent = `CRS: ${crsCode}`;
    statFeatureCount.textContent = `${currentSummary.feature_count} features`;
    statLayersText.textContent = `Layers: ${currentSummary.layers?.join(', ') || 'Default'}`;

    // 2. Card: Total Area
    const totals = currentSummary.totals || {};
    statTotalAreaHa.textContent = `${(totals.area_hectares || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ha`;
    statTotalAreaSqm.textContent = `${(totals.area_sq_m || 0).toLocaleString()} sq m`;
    statTotalAreaSqkm.textContent = `${(totals.area_sq_km || 0).toFixed(6)} sq km`;

    // 3. Card: Total Length
    statTotalLengthM.textContent = `${(totals.length_m || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
    statTotalLengthKm.textContent = `${(totals.length_km || 0).toFixed(3)} km`;
    statGeodesicLength.textContent = `Geodesic: ${(totals.geodesic_length_m || 0).toLocaleString()} m`;

    // 4. Card: Geodesic Validation
    const val = currentSummary.validation || {};
    if (val.accuracy_ok) {
      statAccuracyStatus.innerHTML = '<span class="badge badge-emerald" style="font-size: 0.95rem; padding: 0.35rem 0.75rem;">✓ ACCURACY OK</span>';
    } else {
      statAccuracyStatus.innerHTML = '<span class="badge badge-rose" style="font-size: 0.95rem; padding: 0.35rem 0.75rem;">⚠ DEVIATION FLAG</span>';
    }
    const maxDev = val.max_deviation_pct !== null ? `${val.max_deviation_pct.toFixed(4)}%` : 'N/A';
    statMaxDeviation.textContent = `Max Geodesic Δ: ${maxDev} (tol: ${val.tolerance_pct || 1.0}%)`;
    statGeometryHealth.textContent = `Repaired: ${val.repaired_geometries || 0} | Invalid: ${val.invalid_geometries || 0}`;

    // UTM Usage text
    const utmUsage = Object.entries(currentSummary.measurement_crs_usage || {})
      .map(([crs, count]) => `${crs} (${count})`)
      .join(', ');
    utmUsageText.textContent = utmUsage ? `UTM: ${utmUsage}` : 'UTM: Local';

    // Counts for Filter Pills
    const dist = currentSummary.geometry_distribution || {};
    countAll.textContent = currentSummary.feature_count;
    countPolygon.textContent = (dist.Polygon || 0) + (dist.MultiPolygon || 0);
    countLineString.textContent = (dist.LineString || 0) + (dist.MultiLineString || 0);
    countPoint.textContent = (dist.Point || 0) + (dist.MultiPoint || 0);

    // Render Map Features
    renderMapFeatures();

    // Render Features Table
    renderTable();
  }

  // --------------------------------------------------------------------------
  // 4. Leaflet Map GeoJSON Rendering
  // --------------------------------------------------------------------------

  function renderMapFeatures() {
    if (!map) return;

    if (currentGeoJsonLayer) {
      map.removeLayer(currentGeoJsonLayer);
      currentGeoJsonLayer = null;
    }
    featureMapLayers.clear();

    const geoJsonFeatures = currentFeatures
      .filter(f => f.geometry !== null)
      .map(f => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          ...f.properties,
          __index: f.index,
          __layer: f.layer,
          __geomType: f.geometry_type,
          __measurement: f.measurement,
        }
      }));

    if (geoJsonFeatures.length === 0) return;

    const featureCollection = {
      type: 'FeatureCollection',
      features: geoJsonFeatures,
    };

    currentGeoJsonLayer = L.geoJSON(featureCollection, {
      style: (feature) => {
        const type = (feature.properties.__geomType || '').toLowerCase();
        if (type.includes('polygon')) {
          return {
            color: '#06b6d4',
            weight: 2,
            opacity: 0.9,
            fillColor: '#10b981',
            fillOpacity: 0.35,
          };
        } else if (type.includes('linestring') || type.includes('line')) {
          return {
            color: '#818cf8',
            weight: 3.5,
            opacity: 0.95,
          };
        }
        return { color: '#f59e0b', weight: 2 };
      },
      pointToLayer: (feature, latlng) => {
        return L.circleMarker(latlng, {
          radius: 7,
          fillColor: '#f59e0b',
          color: '#ffffff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.85,
        });
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties;
        const index = props.__index;
        featureMapLayers.set(index, layer);

        // Build rich popup content
        const m = props.__measurement || {};
        const areaStr = m.area_hectares !== null ? `${m.area_hectares} ha (${m.area_sq_m.toLocaleString()} m²)` : null;
        const lenStr = m.length_m !== null ? `${m.length_m.toLocaleString()} m` : null;
        const devStr = m.deviation_pct !== null ? `${m.deviation_pct.toFixed(4)}%` : null;

        const popupContent = `
          <div class="map-popup-card">
            <div class="map-popup-header">
              <span class="map-popup-title">Feature #${index}</span>
              <span class="badge badge-neutral">${props.__geomType}</span>
            </div>
            <div class="map-popup-row">
              <span class="map-popup-label">Layer:</span>
              <span class="map-popup-val">${props.__layer}</span>
            </div>
            ${areaStr ? `<div class="map-popup-row"><span class="map-popup-label">Area:</span><span class="map-popup-val">${areaStr}</span></div>` : ''}
            ${lenStr ? `<div class="map-popup-row"><span class="map-popup-label">Length:</span><span class="map-popup-val">${lenStr}</span></div>` : ''}
            ${devStr ? `<div class="map-popup-row"><span class="map-popup-label">Geodesic Δ:</span><span class="map-popup-val">${devStr}</span></div>` : ''}
            ${m.measurement_crs ? `<div class="map-popup-row"><span class="map-popup-label">CRS:</span><span class="map-popup-val">${m.measurement_crs}</span></div>` : ''}
          </div>
        `;

        layer.bindPopup(popupContent);

        layer.on('click', () => {
          highlightTableRow(index);
        });
      },
    }).addTo(map);

    // Fit map bounds
    try {
      const bounds = currentGeoJsonLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 });
      }
    } catch {
      // ignore
    }
  }

  btnFitBounds.addEventListener('click', () => {
    if (currentGeoJsonLayer && map) {
      const bounds = currentGeoJsonLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 });
      }
    }
  });

  // --------------------------------------------------------------------------
  // 5. Features Table & Filtering
  // --------------------------------------------------------------------------

  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeFilterType = pill.dataset.type;
      renderTable();
    });
  });

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderTable();
  });

  function renderTable() {
    tableBody.innerHTML = '';

    const filtered = currentFeatures.filter(feat => {
      // 1. Geometry Type Filter
      const gtype = (feat.geometry_type || '').toLowerCase();
      if (activeFilterType === 'polygon' && !gtype.includes('polygon')) return false;
      if (activeFilterType === 'linestring' && !(gtype.includes('linestring') || gtype.includes('line'))) return false;
      if (activeFilterType === 'point' && !gtype.includes('point')) return false;

      // 2. Search Query Filter
      if (searchQuery) {
        const idMatch = String(feat.index).includes(searchQuery);
        const layerMatch = (feat.layer || '').toLowerCase().includes(searchQuery);
        const typeMatch = gtype.includes(searchQuery);
        const propMatch = JSON.stringify(feat.properties || {}).toLowerCase().includes(searchQuery);
        if (!idMatch && !layerMatch && !typeMatch && !propMatch) return false;
      }

      return true;
    });

    tableShowingText.textContent = `Showing ${filtered.length} of ${currentFeatures.length} features`;

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            No features match the selected filter.
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach(feat => {
      const tr = document.createElement('tr');
      tr.id = `row-feat-${feat.index}`;

      const m = feat.measurement || {};
      const gtype = feat.geometry_type || 'Unknown';

      // Type Badge
      let badgeClass = 'badge-neutral';
      if (gtype.includes('Polygon')) badgeClass = 'badge-cyan';
      else if (gtype.includes('Line')) badgeClass = 'badge-indigo';
      else if (gtype.includes('Point')) badgeClass = 'badge-amber';

      // Measurement format
      let measurementHtml = '<span style="color: var(--text-muted);">-</span>';
      if (m.area_hectares !== null) {
        measurementHtml = `
          <div class="mono-metric" style="color: #38bdf8; font-weight: 500;">
            ${m.area_hectares} ha
          </div>
          <div style="font-size: 0.725rem; color: var(--text-muted);">
            ${m.area_sq_m.toLocaleString()} m²
          </div>
        `;
      } else if (m.length_m !== null) {
        measurementHtml = `
          <div class="mono-metric" style="color: #818cf8; font-weight: 500;">
            ${m.length_m.toLocaleString()} m
          </div>
        `;
      }

      // Geodesic Deviation format
      let devHtml = '<span style="color: var(--text-muted);">-</span>';
      if (m.deviation_pct !== null) {
        const isGood = m.deviation_pct <= (currentSummary?.validation?.tolerance_pct || 1.0);
        const devBadge = isGood ? 'badge-emerald' : 'badge-rose';
        devHtml = `
          <span class="badge ${devBadge} mono-metric">
            ${m.deviation_pct.toFixed(4)}%
          </span>
        `;
      }

      // Status format
      let statusHtml = '<span class="badge badge-emerald">Valid</span>';
      if (m.repaired) {
        statusHtml = '<span class="badge badge-amber" title="Repaired with make_valid">Repaired</span>';
      } else if (m.valid === false) {
        statusHtml = '<span class="badge badge-rose">Invalid</span>';
      } else if (!m.supported) {
        statusHtml = '<span class="badge badge-neutral">Unsupported</span>';
      }

      tr.innerHTML = `
        <td style="font-weight: 600; color: var(--text-secondary);">${feat.index}</td>
        <td>
          <span class="badge ${badgeClass}">${gtype}</span>
          <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;">${feat.layer || 'survey'}</div>
        </td>
        <td>${measurementHtml}</td>
        <td>${devHtml}</td>
        <td>${statusHtml}</td>
        <td style="text-align: right;">
          <div class="action-btn-group" style="justify-content: flex-end;">
            <button type="button" class="btn-table-action btn-zoom-feature" data-index="${feat.index}" title="Zoom on Map">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </button>
            <button type="button" class="btn-table-action btn-inspect-feature" data-index="${feat.index}" title="Inspect Feature JSON">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            </button>
          </div>
        </td>
      `;

      // Event listener for row click
      tr.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        zoomToFeature(feat.index);
      });

      tableBody.appendChild(tr);
    });

    // Attach button events
    document.querySelectorAll('.btn-zoom-feature').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index, 10);
        zoomToFeature(index);
      });
    });

    document.querySelectorAll('.btn-inspect-feature').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index, 10);
        openInspectorModal(index);
      });
    });
  }

  function highlightTableRow(index) {
    document.querySelectorAll('.features-table tbody tr').forEach(r => r.classList.remove('active-row'));
    const row = document.getElementById(`row-feat-${index}`);
    if (row) {
      row.classList.add('active-row');
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function zoomToFeature(index) {
    highlightTableRow(index);
    const layer = featureMapLayers.get(index);
    if (layer && map) {
      if (layer.getBounds) {
        map.fitBounds(layer.getBounds(), { padding: [50, 50], maxZoom: 18 });
      } else if (layer.getLatLng) {
        map.setView(layer.getLatLng(), 17);
      }
      layer.openPopup();
    }
  }

  // --------------------------------------------------------------------------
  // 6. Modal Inspector
  // --------------------------------------------------------------------------

  function openInspectorModal(index) {
    const feat = currentFeatures.find(f => f.index === index);
    if (!feat) return;
    selectedModalFeature = feat;

    modalFeatureTitle.textContent = `Feature #${feat.index} (${feat.geometry_type})`;
    modalJsonContent.textContent = JSON.stringify(feat, null, 2);
    inspectorModal.style.display = 'flex';
  }

  function closeModal() {
    inspectorModal.style.display = 'none';
    selectedModalFeature = null;
  }

  btnCloseModal.addEventListener('click', closeModal);
  inspectorModal.addEventListener('click', (e) => {
    if (e.target === inspectorModal) closeModal();
  });

  btnCopyJson.addEventListener('click', async () => {
    if (selectedModalFeature) {
      try {
        await navigator.clipboard.writeText(JSON.stringify(selectedModalFeature, null, 2));
        showToast('Feature JSON copied to clipboard!', 'success');
      } catch {
        showToast('Failed to copy to clipboard', 'error');
      }
    }
  });

  btnModalZoom.addEventListener('click', () => {
    if (selectedModalFeature) {
      const idx = selectedModalFeature.index;
      closeModal();
      zoomToFeature(idx);
    }
  });

  // --------------------------------------------------------------------------
  // 7. JSON / GeoJSON Exporting
  // --------------------------------------------------------------------------

  btnExportJson.addEventListener('click', () => {
    if (!currentFeatures || currentFeatures.length === 0) return;
    const exportData = {
      summary: currentSummary,
      features: currentFeatures,
    };
    downloadJson(exportData, `geomeasure_${currentFileId || 'results'}.json`);
    showToast('Measurements JSON exported!', 'success');
  });

  btnExportGeoJson.addEventListener('click', () => {
    if (!currentFeatures || currentFeatures.length === 0) return;
    const geoJson = {
      type: 'FeatureCollection',
      features: currentFeatures.filter(f => f.geometry !== null).map(f => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          index: f.index,
          layer: f.layer,
          geometry_type: f.geometry_type,
          crs: f.crs,
          ...f.properties,
          measurement: f.measurement,
        }
      }))
    };
    downloadJson(geoJson, `geomeasure_${currentFileId || 'features'}.geojson`);
    showToast('GeoJSON exported!', 'success');
  });

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --------------------------------------------------------------------------
  // 8. On Load
  // --------------------------------------------------------------------------
  checkHealth();
  setInterval(checkHealth, 30000);
});
