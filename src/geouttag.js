/* eslint-disable no-console */
import 'Origo';
import loadSVGs from './loadresources';
import GeouttagDrawHandler from './drawhandler';
import styles from './styles';

const Draw = Origo.ol.interaction.Draw;
// const createBox = Origo.ol.interaction.Draw.createBox;
const { createRegularPolygon, createBox } = Origo.ol.interaction.Draw;
const VectorSource = Origo.ol.source.Vector;
const VectorLayer = Origo.ol.layer.Vector;
const { Style } = Origo.ol.style;

function handleOAuthCallback() {
  // If user cancelled (error in query string), just close the popup silently
  if (window.location.search && window.location.search.match(/[?&]error=/)) {
    if (window.opener) {
      window.stop();
      window.close();
    }
    return;
  }

  // PKCE flow: authorization code in query string (?code=...)
  if (window.location.search) {
    const match = (window.location.search) ? window.location.search.match(/\?code=([^&]+)/) : false;
    if (match[1]) {
      window.opener.oauthCallback(match[1]);
    }
    window.close();
  }
}

handleOAuthCallback();

// ── PKCE helper functions for ArcGIS OAuth 2.0 Authorization Code with PKCE ──
function dec2hex(dec) {
  return (`0${dec.toString(16)}`).substr(-2);
}

function generateRandomString() {
  const array = new Uint32Array(56 / 2);
  window.crypto.getRandomValues(array);
  return Array.from(array, dec2hex).join('');
}

async function challengeFromVerifier(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const sha256 = await window.crypto.subtle.digest('SHA-256', data);
  let str = '';
  const bytes = new Uint8Array(sha256);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/* Geouttag is a tool to request FME server to
     export data from a marked area in map */
const Geouttag = function Geouttag(options = {}) {
  const {
    url = '',
    warningLimit,
    errorLimit,
    predefinedExports = [],
    maplayerExport = {},
    drawlayerTitle = '',
    arcgisClientId = process.env.ARC_GIS_CLIENT_ID || '',
    arcgisTokenEndpoint = 'https://geo.eskilstuna.se/portal/sharing/rest/oauth2/token'

  } = options;

  let viewer;
  let map;
  let geouttag;
  let x1; let y1; let x2; let y2;
  let exportBtn;
  let productSelect;
  let fileTypeSelect;
  let isActive = false;
  let geouttagButton;
  let arcgisSession = null;
  let arcgisCodeVerifier = null;
  let arcgisCodeChallenge = null;
  let controlContainer;
  let drawToolbarComp;
  let polygonSelectionButton;
  let rectangleSelectionButton;
  let squareSelectionButton;
  let headerComp;
  let productSelectorTextComp;
  let additionalLayersTextComp;
  let formatSelectorTextComp;
  let drawToolSelectorTextComp;
  let customSelect;
  let customSelectOptionsDropdown;
  let customSelectSelectedOptions;
  let customSelectInput;
  let mapLayerOptionElements = [];
  let selectedValues = [];
  let geouttagLayer;
  let currentDrawType = 'Polygon';
  let coords;
  let drawHandler;
  let signOutBtn;
  let userInfoComp;
  const restrictedLayers = [];

  loadSVGs();

  function getMapLayersExist() {
    const mapLayersExist = maplayerExport && maplayerExport.layers && (maplayerExport.layers.length > 0);
    return mapLayersExist;
  }

  /* State for the export button, if it should be enabled or disabled */
  function updateExportButtonState() {
    const exportBtnElement = document.getElementById(exportBtn.getId());
    const productSelectElement = document.getElementById(productSelect.getId());
    const fileTypeSelectElement = document.getElementById(fileTypeSelect.getId());

    const hasProductSelection = productSelectElement.value;
    const hasMapLayerSelection = selectedValues.length > 0;
    const hasFileTypeSelection = !fileTypeSelectElement.disabled
      && fileTypeSelectElement.options.length > 0
      && !!fileTypeSelectElement.value;
    const hasOkArea = geouttagLayer.getSource().getFeatures()[0]?.getGeometry().getArea() < warningLimit;
    const exportReady = (hasProductSelection || hasMapLayerSelection) && hasFileTypeSelection && hasOkArea;
    exportBtnElement.disabled = !exportReady;
  }

  /* Shows available filetype in dropdown for selected layer/product
  suitable handler function for listeners on productSelect and maplayer(custom)Select */
  function setFiletypes({ selValue, mapLayerOutputFormats }) {
    let currFiletypes;
    if (selValue && (selValue !== 'defaultSelectionValue')) {
      currFiletypes = predefinedExports.find((product) => product.name === selValue).filetypes;
    } else if (mapLayerOutputFormats?.length > 0) currFiletypes = maplayerExport.filetypes;
    else currFiletypes = [];
    let optionsHtml = '';
    currFiletypes.forEach((filetype) => {
      optionsHtml += `<option value="${filetype.title}">${filetype.title}</option>`;
    });
    const filetypeSelectElement = document.getElementById(fileTypeSelect.getId());
    filetypeSelectElement.innerHTML = optionsHtml;
    if ((filetypeSelectElement.options.length > 0) && (filetypeSelectElement.disabled)) filetypeSelectElement.disabled = false;
    else if ((filetypeSelectElement.options.length === 0) && (filetypeSelectElement.disabled === false)) filetypeSelectElement.disabled = true;
  }

  function getMaplayerOptions({ layers }) {
    return layers.map((layer) => {
      const layerOptionElement = Origo.ui.Element({
        tagName: 'div',
        cls: 'option',
        innerHTML: layer.title,
        attributes: {
          data: {
            title: layer.title,
            name: layer.name,
            workspace: layer.workspace
          }
        }
      });
      return layerOptionElement;
    });
  }

  function filterCustomOptions(filterText) {
    const text = (filterText || '').trim().toLowerCase();
    const customSelectOptions = customSelectOptionsDropdown.getComponents().map(c => document.getElementById(c.getId()));
    customSelectOptions.forEach((optEl) => {
      if (!optEl) return;
      const title = (optEl.getAttribute('data-title') || optEl.textContent || '').toLowerCase();
      const optionsElement = optEl;
      if (!text || title.indexOf(text) !== -1) {
        optionsElement.style.display = 'block';
      } else {
        optionsElement.style.display = 'none';
      }
    });
  }

  function getSelectOptionsHtml({ selectOptions, defaultNothing }) {
    if (defaultNothing) selectOptions.unshift(defaultNothing);
    let html = '';
    selectOptions.forEach((sOption) => {
      html += `<option value="${sOption.name}">${sOption.title}</option>`;
    });
    return html;
  }

  /* Collect data from elements and send request to server */
  function sendData() {
    const productSelectElement = document.getElementById(productSelect.getId());
    const fileTypeSelectElement = document.getElementById(fileTypeSelect.getId());

    const selectedExportName = productSelectElement.value;
    const isMapLayerExport = selectedExportName && selectedValues.length > 0;
    const selectedExport = isMapLayerExport
      ? maplayerExport
      : predefinedExports.find((layer) => layer.name === selectedExportName);

    const fileTypeName = fileTypeSelectElement.value;
    const availableFiletypes = selectedExport.filetypes || [];
    const fileTypeObj = availableFiletypes.find((filetype) => fileTypeName === filetype.title);

    const FMEscript = fileTypeObj.workspace || maplayerExport.FMEWorkspace;
    const fileType = fileTypeObj.outputFormat;
    const layerType = selectedExport.name || selectedExportName;

    const selectedLayerNames = isMapLayerExport ? selectedValues : [layerType];
    const productNameParams = selectedLayerNames
      .map((name) => `&productName=${encodeURIComponent(name)}`)
      .join('');

    const displayProductNames = selectedLayerNames.join(', ');

    const d = new Date();
    let requestUrl = `${url}/${FMEscript}?geom=POLYGON `;

    // Check if polygon coordinates
    if (coords && currentDrawType === 'Polygon') {
      // Use actual polygon coordinates
      const coordinateString = coords
        .map(coord => `${coord[0]} ${coord[1]}`)
        .join(',');
      requestUrl += `((${coordinateString}))`;
    } else if (x1 !== undefined && y1 !== undefined && x2 !== undefined && y2 !== undefined) {
      // Use bounding box for other tools
      requestUrl += `((${x1} ${y1},${x1} ${y2},${x2} ${y2},${x2} ${y1},${x1} ${y1}))`;
    } else {
      console.error('No coordinates available for export');
      return;
    }

    requestUrl
      += `&srs=EPSG:3010${productNameParams}`
        + '&outputFilename='
        + `&outputFormat=${fileType}`
        + '&token=7732ad7a4a12634f5784a8188e633f0c79a95170'
        + `&id=${d.getTime()}`;

    // Open a new window with spinner, then load the export
    const exportWindow = window.open('', '_blank');

    if (!exportWindow) {
      console.error('Popup blocked! Please allow popups for this site.');
      alert('Kunde inte öppna exportfönstret. Kontrollera att popup-blockerare är avstängd för denna sida.');
      return;
    }

    // Create HTML content with spinner
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="sv">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Exporterar data...</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }

            body {
              width: 100vw;
              height: 100vh;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              background-color: rgba(255, 255, 255, 0.95);
              font-family: Arial, sans-serif;
              overflow: hidden;
            }

            .spinner {
              border: 4px solid #f3f3f3;
              border-top: 4px solid #3498db;
              border-radius: 50%;
              width: 60px;
              height: 60px;
              animation: spin 1s linear infinite;
              margin-bottom: 20px;
            }

            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }

            .message {
              font-size: 18px;
              color: #333;
              text-align: center;
              padding: 0 20px;
            }

            .iframe-container {
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              display: none;
            }

            .iframe-container iframe {
              width: 100%;
              height: 100%;
              border: none;
            }
          </style>
        </head>
        <body>
          <div class="spinner"></div>
          <p class="message">Väntar på export av <strong>${displayProductNames}</strong> från FME Flow...<br><br>Låt fönstret vara öppet och vänta tills exporten är klar.<br><br>Om du stänger fönstret innan exporten är klar måste du starta om exporten.</p>

          <div class="iframe-container" id="iframe-container">
            <iframe id="export-iframe" src="${requestUrl}" title="Export"></iframe>
          </div>

          <script>
            // Hide spinner and show iframe when it loads
            const iframe = document.getElementById('export-iframe');
            const container = document.getElementById('iframe-container');
            const spinner = document.querySelector('.spinner');
            const message = document.querySelector('.message');

            iframe.addEventListener('load', function() {
              spinner.style.display = 'none';
              message.style.display = 'none';
              container.style.display = 'block';
            });

            // Fallback: if iframe doesn't load within 30 seconds, show error
            setTimeout(function() {
              if (container.style.display !== 'block') {
                message.innerHTML = 'Exporten av <strong>${displayProductNames}</strong> tar lite tid...<br><br>Låt fönstret vara öppet och vänta tills exporten är klar.<br><br>Om du stänger fönstret innan exporten är klar måste du starta om exporten.';
                message.style.color = 'none';
              }
            }, 30000);
          </script>
        </body>
      </html>
    `;

    // Write HTML to the new window using modern approach with Blob
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    exportWindow.location.href = blobUrl;
  }

  /* Helper: extract a plain URL from the id field (handles possible markdown link syntax) */
  function extractUrlFromId(idValue) {
    if (!idValue) return '';
    const markdownMatch = idValue.match(/^\[([^\]]*)\]\(([^)]*)\)$/);
    if (markdownMatch) {
      return markdownMatch[2] || markdownMatch[1];
    }
    return idValue;
  }

  /* Helper: load JSZip from CDN dynamically */
  function loadJSZip() {
    return new Promise((resolve, reject) => {
      if (window.JSZip) {
        resolve(window.JSZip);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = () => resolve(window.JSZip);
      script.onerror = () => reject(new Error('Failed to load JSZip from CDN'));
      document.head.appendChild(script);
    });
  }

  /* Construct and open ArcGIS ImageServer download URL for imageServer export */
  function sendArcGISRequest() {
    // Only proceed if the selected product has imageServer: true
    const productSelectElement = document.getElementById(productSelect.getId());
    const selectedProduct = predefinedExports.find((p) => p.name === productSelectElement?.value);
    if (!selectedProduct || !selectedProduct.imageServer) {
      return;
    }

    const fileTypeSelectElement = document.getElementById(fileTypeSelect.getId());
    const selectedFormat = fileTypeSelectElement.value;

    if (!selectedFormat) {
      console.error('No format selected for ArcGIS imageServer download');
      return;
    }

    if (!arcgisSession || !arcgisSession.access_token) {
      console.error('No ArcGIS session available. Please sign in first.');
      return;
    }

    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
      console.error('No extent available. Please draw an area first.');
      return;
    }

    const geometry = `${x1},${y1},${x2},${y2}`;
    const token = arcgisSession.access_token;

    // Build the base ImageServer download URL (use f=json to get individual file URLs)
    const jsonUrl = `https://geo.eskilstuna.se/imageserver/rest/services/${selectedProduct.name}/ImageServer/download?rasterIds=1&geometry=${geometry}&geometryType=esriGeometryEnvelope&format=${selectedFormat}&f=json&token=${token}`;

    console.log('Fetching ArcGIS imageServer download URLs');

    fetch(jsonUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`ArcGIS download request failed: ${response.status}`);
        }
        return response.json();
      })
      .then(async (data) => {
        if (data.error) {
          throw new Error(data.error.message || 'ArcGIS returned an error');
        }

        // Extract download URLs and file info from rasterFiles
        const files = [];
        if (data.rasterFiles && Array.isArray(data.rasterFiles)) {
          data.rasterFiles.forEach((item) => {
            const downloadUrl = extractUrlFromId(item.id);
            if (downloadUrl) {
              const urlPath = downloadUrl.split('?')[0];
              const fileName = urlPath.split('/').pop() || `fil_${files.length}`;
              files.push({ url: downloadUrl, name: fileName, size: item.size });
            }
          });
        } else if (data.href) {
          const hrefUrl = extractUrlFromId(data.href);
          if (hrefUrl) {
            const urlPath = hrefUrl.split('?')[0];
            files.push({ url: hrefUrl, name: urlPath.split('/').pop() || 'raster_output' });
          }
        }

        if (files.length === 0) {
          throw new Error('No download URLs found in the response');
        }

        // Open a progress window
        const downloadWindow = window.open('', '_blank');
        if (!downloadWindow) {
          alert('Kunde inte öppna nedladdningsfönstret. Kontrollera att popup-blockerare är avstängd för denna sida.');
          return;
        }

        // Show a spinner page while we work
        downloadWindow.document.write(`
          <!DOCTYPE html>
          <html lang="sv">
            <head>
              <meta charset="UTF-8">
              <title>Laddar ner raster...</title>
              <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                  width: 100vw; height: 100vh;
                  display: flex; flex-direction: column;
                  justify-content: center; align-items: center;
                  background: #f0f4f8;
                  font-family: 'Segoe UI', Arial, sans-serif;
                }
                .spinner {
                  border: 4px solid #e0e0e0;
                  border-top: 4px solid #3498db;
                  border-radius: 50%;
                  width: 50px; height: 50px;
                  animation: spin 1s linear infinite;
                  margin-bottom: 1.5rem;
                }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                p { color: #555; font-size: 1.1rem; text-align: center; padding: 0 2rem; }
                .progress-text { color: #888; font-size: 0.9rem; margin-top: 0.5rem; }
              </style>
            </head>
            <body>
              <div class="spinner"></div>
              <p>Laddar ner raster från imageserver...</p>
              <p class="progress-text">Skapar ZIP-fil när nedladdningen är klar</p>
            </body>
          </html>
        `);
        downloadWindow.document.close();

        // Load JSZip from CDN
        await loadJSZip();

        // Download each file and add to ZIP
        const zip = new JSZip();
        // 'JSZip' is not defined — this is expected since JSZip is loaded dynamically from CDN at runtime (via loadJSZip()),
        // not as a module import. It will work correctly in the browser.
        let downloadedCount = 0;

        // Download all files in parallel, one at a time via reduce chain to avoid lint issues
        await files.reduce(async (previousPromise, file) => {
          await previousPromise;
          try {
            const fileResponse = await fetch(file.url);
            if (!fileResponse.ok) {
              console.warn(`Failed to download ${file.name}: ${fileResponse.status}`);
              return;
            }
            const blob = await fileResponse.blob();
            zip.file(file.name, blob);
            downloadedCount += 1;
          } catch (err) {
            console.warn(`Failed to download ${file.name}:`, err);
          }
        }, Promise.resolve());

        if (downloadedCount === 0) {
          throw new Error('Could not download any files');
        }

        // Generate the ZIP blob
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipBlobUrl = URL.createObjectURL(zipBlob);
        const zipFileName = `${selectedProduct.name}_${new Date().getTime()}.zip`;

        // Build file list HTML for the success page
        const fileListHtml = files
          .map(
            (f) => `<li>${f.name} ${f.size ? `(${(f.size / 1024).toFixed(0)} KB)` : ''}</li>`
          )
          .join('');

        // Show success page with download button in the new window
        downloadWindow.location.href = URL.createObjectURL(
          new Blob(
            [
              `
          <!DOCTYPE html>
          <html lang="sv">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Raster nedladdning</title>
              <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                  width: 100vw; min-height: 100vh;
                  display: flex; flex-direction: column;
                  align-items: center;
                  background-color: #f0f4f8;
                  font-family: 'Segoe UI', Arial, sans-serif;
                  padding: 2rem;
                }
                .container {
                  max-width: 800px; width: 100%;
                  background: #ffffff;
                  border-radius: 12px;
                  box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                  padding: 2.5rem;
                  margin-top: 2rem;
                  text-align: center;
                }
                .success-icon { font-size: 64px; margin-bottom: 1rem; }
                h1 { color: #000000; font-size: 1.8rem; margin-bottom: 1rem; }
                .message { color: #555; font-size: 1.1rem; margin-bottom: 0.5rem; line-height: 1.6; }
                .sub-message { color: #888; font-size: 0.95rem; margin-bottom: 2rem; }
                .download-button {
                  display: inline-block;
                  font-size: 1.3rem; font-weight: 700;
                  color: #ffffff; background: #007ac2;
                  padding: 1rem 2.5rem;
                  border-radius: 10px;
                  text-decoration: none;
                  transition: background 0.2s, transform 0.1s;
                  margin-bottom: 1.5rem;
                  border: none; cursor: pointer;
                }
                .download-button:hover { background: #007ac2; transform: scale(1.02); }
                .download-button:active { transform: scale(0.98); }
                .file-list {
                  text-align: left; margin: 0 auto; max-width: 500px;
                  background: #f8fafc; border: 1px solid #e2e8f0;
                  border-radius: 8px; padding: 1rem 1.5rem;
                  list-style: none;
                }
                .file-list li { padding: 0.3rem 0; font-size: 0.9rem; color: #555; word-break: break-all; }
                .note { margin-top: 1rem; font-size: 0.85rem; color: #aaa; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>Nedladdning av raster lyckades</h1>

                <a href="${zipBlobUrl}" download="${zipFileName}" class="download-button" id="download-zip-btn">
                  Ladda ner ZIP
                </a>

                <ul class="file-list">
                  ${fileListHtml}
                </ul>

                <p class="note">Export från GeoUttag — ArcGIS ImageServer</p>
              </div>
            </body>
          </html>`
            ],
            { type: 'text/html;charset=utf-8' }
          )
        );
      })
      .catch((error) => {
        console.error('ArcGIS download failed:', error);
        // Fallback: open the HTML page directly
        const fallbackUrl = jsonUrl.replace('f=json', 'f=html');
        const fallbackWindow = window.open(fallbackUrl, '_blank');
        if (!fallbackWindow) {
          alert('Kunde inte öppna nedladdningsfönstret. Kontrollera att popup-blockerare är avstängd för denna sida.');
        }
      });
  }

  /* Updates extent coordinates of rectangle */
  function pointerMoveHandler(e) {
    const feature = e.feature;
    const geometry = feature.getGeometry();
    const geometryType = geometry.getType();

    if (geometryType === 'Polygon' && (currentDrawType === 'Polygon')) {
      coords = geometry.getCoordinates()[0];

      // Get bounding box from any geometry type
      const extent = geometry.getExtent();
      x1 = Math.round(extent[0]); // minX
      y1 = Math.round(extent[1]); // minY
      x2 = Math.round(extent[2]); // maxX
      y2 = Math.round(extent[3]); // maxY

      console.log(`Bounding box from ${geometry.getType()}: ${x1}, ${y1}, ${x2}, ${y2}`);
    } else {
      const extent = geometry.getExtent();
      x1 = Math.round(extent[0]); // minX
      y1 = Math.round(extent[1]); // minY
      x2 = Math.round(extent[2]); // maxX
      y2 = Math.round(extent[3]); // maxY

      console.log(`Bounding box from ${geometry.getType()}: ${x1}, ${y1}, ${x2}, ${y2}`);

      // Clear polygon coordinates since we're not using freehand
      coords = null;
    }
  }

  function calculateStyle(feature, isSelected) {
    const geometry = feature.getGeometry();

    // 1. Handle the Point (the moving cursor/vertex during drawing)
    if (geometry && geometry.getType() === 'Point') {
      return [styles.standardInteractionStyle];
    }

    // 2. Handle the Polygon (the shape being drawn)
    if (!geometry || geometry.getType() !== 'Polygon') {
      return new Style({});
    }

    const area = Math.abs(geometry.getArea());

    // Choose the base styling based on your business logic
    const areaStyle = area > warningLimit ? styles.warningStyle : styles.standardInteractionStyle;

    // 3. Combine styles:
    // [defaultEditingStyle] provides the sketch-line feel
    // [areaStyle] provides your specific logic
    // [styles.unSelectedStyle] applies if not selected

    if (isSelected) {
      if (areaStyle === styles.standardInteractionStyle) {
        return [styles.standardInteractionStyle];
      }
      return [areaStyle];
    } else if (areaStyle === styles.standardInteractionStyle) {
      return [styles.standardInteractionStyle, styles.extraStrokeStyle];
    }
    return [areaStyle, styles.extraStrokeStyle];
  }

  function selectedStyleFunction(feature) { // the decision on what style bits to employ looks different for the finished feature (select can also influense, why else have a select)
    return calculateStyle(feature, true);
  }
  function styleFunction(feature) {
    return calculateStyle(feature, false);
  }

  /* Creates different draw interactions based on tool type */
  function makeDrawInteraction(toolType = 'Polygon') {
    let layer;

    if (!geouttagLayer) {
      layer = new VectorLayer({
        source: new VectorSource(),
        title: drawlayerTitle || 'Urvalsyta!',
        type: 'GEOJSON',
        drawlayer: true,
        zIndex: 7,
        group: 'root',
        style: styleFunction
      });
      map.addLayer(layer);

      geouttagLayer = layer;
      drawHandler.setGeouttagLayer(geouttagLayer);
    } else {
      layer = geouttagLayer;
      layer.getSource().clear();
    }

    let drawInteraction;

    switch (toolType) {
      case 'box':
        drawInteraction = new Draw({
          source: layer.getSource(),
          type: 'Circle',
          style: selectedStyleFunction,
          geometryFunction: createBox()
        });
        break;

      case 'squareButton':
        drawInteraction = new Draw({
          source: layer.getSource(),
          type: 'Circle',
          geometryFunction: createRegularPolygon(4),
          style: selectedStyleFunction
        });
        break;

      case 'Polygon':
      default:
        drawInteraction = new Draw({
          source: layer.getSource(),
          type: 'Polygon',
          style: selectedStyleFunction
        });
        break;
    }

    drawHandler.setGeouttagInteraction(drawInteraction);
    drawInteraction.on('drawstart', drawHandler.onDrawStart);

    drawInteraction.on('drawend', (evt) => {
      drawHandler.onDrawEnd(evt);
      updateExportButtonState();
      setTimeout(updateExportButtonState, 0); // "on next tick" för att featuren finns inte i sourcen annars
      pointerMoveHandler(evt);
    });

    return drawInteraction;
  }

  // Function to change draw tool
  function changeDrawTool(toolType) {
    currentDrawType = toolType;

    // Only change the interaction if geouttag is currently active
    if (isActive && geouttag) {
      // Remove current interaction
      map.removeInteraction(geouttag);
      // Clear any existing features so export state sees no selection
      try {
        if (geouttagLayer && geouttagLayer.getSource) {
          const src = geouttagLayer.getSource();
          if (src && typeof src.clear === 'function') src.clear();
        }
      } catch (err) {
        console.warn('Could not clear geouttagLayer source:', err);
      }

      updateExportButtonState();

      // Create new interaction with selected tool (event handlers attached automatically)
      geouttag = makeDrawInteraction(toolType);

      // Add interaction to map
      map.addInteraction(geouttag);
    } else {
      console.log('Tool selected but interaction not active. Will be used when activated.');
    }
  }

  function removeGeouttag() {
    document.getElementById(controlContainer.getId()).classList.add('o-hidden');
    geouttagLayer.getSource().clear();
  }

  function toggleGeouttag() {
    const controlContainerElement = document.getElementById(controlContainer.getId());
    if (controlContainerElement.classList.contains('o-hidden')) {
      controlContainerElement.classList.remove('o-hidden');
    } else {
      removeGeouttag();
    }

    const detail = {
      name: 'geouttag',
      active: !isActive
    };
    viewer.dispatch('toggleClickInteraction', detail);
  }

  function setActive(state) {
    isActive = state;
  }

  function drawToolButtonEvents() {
    const polygonBtnElement = document.getElementById(polygonSelectionButton.getId());
    const squareBtnElement = document.getElementById(squareSelectionButton.getId());
    const rectangleBtnElement = document.getElementById(rectangleSelectionButton.getId());

    if (polygonBtnElement && !polygonBtnElement.dataset.listenerAttached) {
      polygonBtnElement.addEventListener('click', () => {
        changeDrawTool('Polygon');
      });
    }

    if (squareBtnElement && !squareBtnElement.dataset.listenerAttached) {
      squareBtnElement.addEventListener('click', () => {
        changeDrawTool('squareButton');
      });
    }

    if (rectangleBtnElement && !rectangleBtnElement.dataset.listenerAttached) {
      rectangleBtnElement.addEventListener('click', () => {
        changeDrawTool('box');
      });
    }
  }

  function enableInteraction() {
    map.addInteraction(geouttag);
    document.getElementById(geouttagButton.getId()).classList.add('active');
    document.getElementById(geouttagButton.getId()).classList.remove('tooltip');
    setActive(true);
  }

  function disableInteraction() {
    map.removeInteraction(geouttag);
    document.getElementById(geouttagButton.getId()).classList.remove('active');
    document.getElementById(geouttagButton.getId()).classList.add('tooltip');
    setActive(false);
  }

  return Origo.ui.Component({
    name: 'geouttag',
    onAdd(evt) {
      viewer = evt.target;
      map = viewer.getMap();

      drawHandler = GeouttagDrawHandler({
        stylewindow: null,
        pointerMoveHandler,
        Origo,
        warningLimit,
        errorLimit,
        updateExportButtonState,
        selectedStyleFunction,
        styleFunction
      });

      drawHandler.initializeMap(map);

      // projectionCode = map.getView().getProjection();

      const mapLayers = maplayerExport?.layers || [];

      try {
        const customSelectLayerOptions = getMaplayerOptions({
          layers: mapLayers
        });
        customSelectOptionsDropdown.addComponents(customSelectLayerOptions);
      } catch (e) {
        console.warn('Could not create/attach mapLayerSelect now:', e);
      }

      if (predefinedExports) {
        predefinedExports.forEach((layer) => {
          if (layer.restricted) {
            restrictedLayers.push(layer);
          }
        });
      }
      // if another click interaction like draw is activated, the geouttag tool button should become inactive and its control panel should vanish
      // so should its painted feature
      viewer.on('toggleClickInteraction', (e) => {
        if ((e.name !== 'geouttag') && (e.active)) {
          if (isActive) {
            removeGeouttag();
          }
        }
      });

      geouttag = makeDrawInteraction();

      drawToolButtonEvents();

      viewer.on('toggleClickInteraction', (detail) => {
        if (detail.name === 'geouttag' && detail.active) {
          enableInteraction();
        } else {
          disableInteraction();
        }
      });

      this.addComponents([geouttagButton]);
      this.render();

      document.getElementById(fileTypeSelect.getId()).disabled = true;

      // These three handlers work together to ensure users can only export when they've
      // made valid selections, and to enforce the rule that users must choose either a predefined product OR map layers, but not both.

      const productSelectElement = document.getElementById(productSelect.getId());
      productSelectElement.addEventListener('change', (productSelectEvent) => {
        const selectedValue = productSelectEvent.target.value;
        const customSelectEl = document.getElementById(customSelectInput.getId());
        if (selectedValue !== 'defaultSelectionValue') {
          setFiletypes({ selValue: selectedValue });
          customSelectEl.disabled = true;
          customSelectEl.classList.add('disabled');
        } else {
          if (getMapLayersExist()) {
            customSelectEl.disabled = false;
            customSelectEl.classList.remove('disabled');
          }
          setFiletypes({ mapLayerOutputFormats: [] });
        }
        updateExportButtonState();
      });

      const fileTypeSelectElement = document.getElementById(fileTypeSelect.getId());
      fileTypeSelectElement.addEventListener('change', () => {
        updateExportButtonState();
      });

      // Helper to open ArcGIS OAuth popup (Authorization Code with PKCE)
      async function openArcGISAuth() {
        arcgisCodeVerifier = generateRandomString();
        arcgisCodeChallenge = await challengeFromVerifier(arcgisCodeVerifier);
        const redirectUri = window.location.href;
        const authorizationEndpoint = `https://geo.eskilstuna.se/portal/sharing/rest/oauth2/authorize?client_id=${arcgisClientId}&code_challenge=${arcgisCodeChallenge}&code_challenge_method=S256&redirect_uri=${window.encodeURIComponent(redirectUri)}&response_type=code&expiration=20160`;
        const popupWidth = 600;
        const popupHeight = 400;
        const left = Math.max(0, Math.round((window.screen.availWidth - popupWidth) / 2));
        const top = Math.max(0, Math.round((window.screen.availHeight - popupHeight) / 2));
        window.open(authorizationEndpoint, 'oauth-window', `height=${popupHeight},width=${popupWidth},left=${left},top=${top},menubar=no,location=yes,resizable=yes,scrollbars=yes,status=yes`);
      }

      const exportBtnElement = document.getElementById(exportBtn.getId());
      if (exportBtnElement && !exportBtnElement.dataset.listenerAttached) {
        exportBtnElement.addEventListener('click', async () => {
          const selectedProduct = predefinedExports.find((p) => p.name === productSelectElement?.value);
          const isRaster = selectedProduct && selectedProduct.imageServer;

          if (isRaster) {
            // Raster product: authenticate if needed, then download via ArcGIS ImageServer
            if (arcgisSession && arcgisSession.access_token) {
              // Already logged in — download directly
              sendArcGISRequest();
            } else {
              // Not logged in — open OAuth popup; handleOAuthCallback will exchange the code for tokens
              await openArcGISAuth();
            }
          } else {
            // Other products: use FME export
            sendData();
          }
        });
        exportBtnElement.dataset.listenerAttached = 'true';
      }

      document.getElementById(customSelectInput.getId()).addEventListener('click', () => {
        const optionsDropdownEl = document.getElementById(customSelectOptionsDropdown.getId());
        const inputEl = document.getElementById(customSelectInput.getId());
        if (!optionsDropdownEl || !inputEl) return;
        const rect = inputEl.getBoundingClientRect();
        if (optionsDropdownEl.style.display === 'block') {
          optionsDropdownEl.style.display = 'none';
          const customSelectEl = document.getElementById(customSelect.getId());
          if (customSelectEl && customSelectEl.contains(optionsDropdownEl) === false) {
            customSelectEl.appendChild(optionsDropdownEl);
          }
        } else {
          optionsDropdownEl.style.position = 'absolute';
          optionsDropdownEl.style.left = `${rect.left + window.scrollX}px`;
          optionsDropdownEl.style.top = `${rect.bottom + window.scrollY}px`;
          optionsDropdownEl.style.maxWidth = `${rect.width}px`;
          optionsDropdownEl.style.zIndex = '10000';
          optionsDropdownEl.style.display = 'block';
          document.body.appendChild(optionsDropdownEl);
        }
      });

      document.getElementById(customSelectInput.getId()).addEventListener('input', (e) => {
        const optionsDropdownEl = document.getElementById(customSelectOptionsDropdown.getId());
        const inputEl = document.getElementById(customSelectInput.getId());
        if (!optionsDropdownEl || !inputEl) return;
        const rect = inputEl.getBoundingClientRect();
        if (optionsDropdownEl.style.display !== 'block') {
          optionsDropdownEl.style.position = 'absolute';
          optionsDropdownEl.style.left = `${rect.left + window.scrollX}px`;
          optionsDropdownEl.style.top = `${rect.bottom + window.scrollY}px`;
          optionsDropdownEl.style.maxWidth = `${rect.width}px`;
          optionsDropdownEl.style.zIndex = '10000';
          optionsDropdownEl.style.display = 'block';
          document.body.appendChild(optionsDropdownEl);
        }
        filterCustomOptions(e.target.value);
      });

      mapLayerOptionElements = customSelectOptionsDropdown.getComponents().map((component) => document.getElementById(component.getId()));
      const mapLayerOptions = mapLayerOptionElements;

      // eventlisteners behövs för varje option samt dess tagg
      mapLayerOptions.forEach(mapLayerOption => {
        mapLayerOption.addEventListener('click', () => {
          const layerName = mapLayerOption.getAttribute('data-name');
          const layerTitle = mapLayerOption.getAttribute('data-title');

          const isSelected = mapLayerOption.classList.toggle('selected');
          const selectedOptions = document.getElementById(customSelectSelectedOptions.getId());
          const productSelectElem = document.getElementById(productSelect.getId());

          if (isSelected) {
            productSelectElem.disabled = true;
            selectedValues.push(layerName);
            const tag = document.createElement('div');
            tag.className = 'selected-tag';
            tag.textContent = layerTitle;
            // vald-lager-brickorna behöver eventlisterners för ta bort och ta bort resp lagers markering
            tag.addEventListener('click', (closeTagClickEvent) => {
              closeTagClickEvent.stopPropagation();
              mapLayerOption.classList.remove('selected');
              selectedValues = selectedValues.filter(v => v !== layerName);
              if (selectedValues.length === 0) {
                productSelectElem.disabled = false;
                setFiletypes({ mapLayerOutputFormats: [] });
              }
              tag.remove();
            });
            selectedOptions.append(tag);
          } else {
            selectedValues = selectedValues.filter(v => v !== layerName);
            if (selectedValues.length === 0) {
              productSelectElem.disabled = false;
              setFiletypes({ mapLayerOutputFormats: [] });
            }
            const tags = selectedOptions.querySelectorAll('.selected-tag');
            tags.forEach(tag => {
              if (tag.textContent.includes(layerTitle)) {
                tag.remove();
              }
            });
          }
          if (selectedValues.length > 0) setFiletypes({ mapLayerOutputFormats: maplayerExport.filetypes });
          updateExportButtonState();
        });
      });

      // eventlistener behövs för att ta bort rullgardin vid klick utanför i custom select
      document.addEventListener('click', (forDropdownEvent) => {
        const optionsEl = document.getElementById(customSelectOptionsDropdown.getId());
        if (forDropdownEvent.target.closest('.custom-select') || (optionsEl?.contains(forDropdownEvent.target))) return;
        if (optionsEl) optionsEl.style.display = 'none';
      });

      // Helper to toggle auth UI state
      function updateAuthUI(sessionInfo) {
        const userInfoEl = document.getElementById(userInfoComp.getId());

        if (!sessionInfo) {
          localStorage.removeItem('__ARCGIS_USER_SESSION__');
          arcgisSession = null;
          userInfoEl.style.display = 'none';
          userInfoEl.innerHTML = '';
        } else {
          arcgisSession = sessionInfo;
          localStorage.setItem('__ARCGIS_USER_SESSION__', JSON.stringify(sessionInfo));
          userInfoEl.style.display = '';
        }
      }

      // Only wire up ArcGIS auth if client ID was provided
      if (arcgisClientId) {
        // Expose oauthCallback on window so the OAuth popup can reach it

        // Access the response from the endpoint. If the request was valid,
        // the response will contain an access_token, refresh_token, username, and other session information
        window.oauthCallback = async (authResponse) => {
          try {
            // PKCE flow — authResponse is an authorization code string
            if (typeof authResponse === 'string' && authResponse.length > 0) {
              const redirectUri = window.location.href;
              const response = await fetch(arcgisTokenEndpoint, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                }, // ArcGIS Portalens token-endpoint stödjer inte application/json
                body: new URLSearchParams({
                  client_id: arcgisClientId,
                  grant_type: 'authorization_code',
                  code: authResponse,
                  redirect_uri: redirectUri,
                  code_verifier: arcgisCodeVerifier
                })
              });
              if (!response.ok) {
                console.error('ArcGIS token exchange failed:', response.status, await response.text());
                return;
              }
              const sessionInfo = await response.json();
              console.log('ArcGIS OAuth session info:', sessionInfo);
              if (sessionInfo.access_token) {
                updateAuthUI(sessionInfo);
                sendArcGISRequest();
              } else {
                console.error('ArcGIS OAuth failed: no access_token in response', sessionInfo);
              }
              return;
            }
            // Implicit grant fallback — authResponse is an object with access_token
            if (authResponse && authResponse.access_token) {
              updateAuthUI(authResponse);
              sendArcGISRequest();
              return;
            }
            console.error('ArcGIS OAuth failed: unrecognized response', authResponse);
          } catch (e) {
            console.error('ArcGIS OAuth callback error', e);
          }
        };

        // Sign-in button: open ArcGIS authorization popup
        // document.getElementById(signInBtn.getId()).addEventListener('click', openArcGISAuth);

        // Sign-out button: clear session
        document.getElementById(signOutBtn.getId()).addEventListener('click', () => {
          updateAuthUI(null);
        });

        // Restore existing session from localStorage on page load
        try {
          const savedSession = localStorage.getItem('__ARCGIS_USER_SESSION__');
          if (savedSession) {
            const parsed = JSON.parse(savedSession);
            if (parsed && parsed.access_token) {
              updateAuthUI(parsed);
            }
          }
        } catch (e) {
          console.warn('Could not restore ArcGIS session:', e);
          localStorage.removeItem('__ARCGIS_USER_SESSION__');
        }
      }
    },

    onInit() {
      customSelectSelectedOptions = Origo.ui.Element({
        tagName: 'div',
        cls: 'selected-options'
      });

      customSelectInput = Origo.ui.Element({
        tagName: 'input',
        attributes: {
          type: 'text',
          placeholder: getMapLayersExist() ? 'Välj kartlager..' : 'Inga tillgängliga kartlager',
          disabled: !(getMapLayersExist())
        },
        cls: `select-input custom-select-input text-small ${(getMapLayersExist()) ? '' : 'disabled'}`
      });

      customSelectOptionsDropdown = Origo.ui.Element({
        tagName: 'div',
        cls: 'options-dropdown',
        style: 'display:none'
      });

      customSelect = Origo.ui.Element({
        tagName: 'div',
        cls: 'custom-select',
        components: [customSelectOptionsDropdown, customSelectInput]
      });

      geouttagButton = Origo.ui.Button({
        cls: 'padding-small margin-bottom-smaller icon-smaller round light box-shadow tooltip',
        click() {
          toggleGeouttag();
        },
        icon: '#geouttag_ic_download_24px',
        tooltipText: 'Geouttag',
        tooltipPlacement: 'east'// ,
        // state: 'disabled' - funkar
      });

      exportBtn = Origo.ui.Element({
        tagName: 'button',
        cls: 'export-btn light box-shadow',
        style: 'margin-top: 1.3rem; width: 30%',
        attributes: {
          disabled: true
        },
        innerHTML: 'Starta export'
      });

      productSelect = Origo.ui.Element({
        tagName: 'select',
        cls: 'text-small',
        innerHTML: getSelectOptionsHtml({
          selectOptions: predefinedExports,
          defaultNothing: {
            title: 'Välj en produkt..',
            name: 'defaultSelectionValue'
          }
        })
      });

      fileTypeSelect = Origo.ui.Element({
        tagName: 'select'
      });

      headerComp = Origo.ui.Element({
        tagName: 'h3',
        innerHTML: 'GeoUttag',
        style: 'text-align: center;'
      });

      productSelectorTextComp = Origo.ui.Element({
        tagName: 'p',
        innerHTML: 'Välj en produkt eller ett till flera lager i kartan',
        cls: 'text-small padding-bottom-small padding-left-small'
      });

      additionalLayersTextComp = Origo.ui.Element({
        tagName: 'p',
        innerHTML: "Syns inte lagret du önskar, saknar du något?<br>Mejla <a href='mailto:gissupport@eskilstuna.se'>gissupport@eskilstuna.se",
        cls: 'text-smaller padding-bottom-small padding-left-small'
      });

      formatSelectorTextComp = Origo.ui.Element({
        tagName: 'p',
        innerHTML: 'Välj ett exportformat',
        cls: 'text-small padding-top-large padding-bottom-small padding-left-small'
      });

      drawToolSelectorTextComp = Origo.ui.Element({
        tagName: 'p',
        innerHTML: 'Välj ett verktyg för att rita önskat område att exportera',
        cls: 'text-small padding-left-small',
        style: 'padding-bottom: 0.4rem;'
      });

      polygonSelectionButton = Origo.ui.Button({
        cls: 'light text-smaller padding-left-large',
        style: 'flex: 1 1 auto;',
        text: 'polygon',
        state: 'active'
      });

      squareSelectionButton = Origo.ui.Button({
        cls: 'light text-smaller',
        style: 'flex: 1 1 auto;',
        text: 'kvadrat',
        state: 'initial'
      });

      rectangleSelectionButton = Origo.ui.Button({
        cls: 'light text-smaller padding-right-large',
        style: 'flex: 1 1 auto;',
        text: 'rektangel'
      });

      drawToolbarComp = Origo.ui.ToggleGroup({
        cls: 'flex button-group divider-horizontal rounded-large bg-inverted box-shadow',
        style: { height: 'fit-content', display: 'flex', width: '75%' }, // width: 75%;
        components: [polygonSelectionButton, squareSelectionButton, rectangleSelectionButton]
      });

      // ArcGIS OAuth UI components
      const authSeparator = Origo.ui.Element({
        tagName: 'hr',
        cls: 'separator',
        style: 'margin: 0.8rem 0; border: none; border-top: 1px solid #ccc;'
      });

      signOutBtn = Origo.ui.Button({
        cls: 'light text-smaller padding-left-large padding-right-large',
        style: 'width: 100%; display: none;',
        text: 'Logga ut från ArcGIS Portal'
      });

      userInfoComp = Origo.ui.Element({
        tagName: 'div',
        cls: 'text-smaller padding-left-small padding-bottom-small',
        style: 'display: none; font-style: italic;'
      });

      controlContainer = Origo.ui.Element({
        tagName: 'div',
        cls: 'flex column control box bg-white overflow-hidden o-hidden',
        style: {
          left: '4rem',
          top: '1rem',
          padding: '0.5rem',
          width: '25rem',
          'z-index': '-1'
        },
        components: [headerComp, productSelectorTextComp, productSelect, customSelect, additionalLayersTextComp, customSelectSelectedOptions, formatSelectorTextComp, fileTypeSelect, drawToolSelectorTextComp, drawToolbarComp, exportBtn, authSeparator, userInfoComp, signOutBtn]
      });

      // Ensure controlContainer is registered as a child component so its
      // `onRender` handlers are called when this component dispatches 'render'.
      this.addComponent(controlContainer);
    },
    render() {
      document.getElementById(viewer.getMain().getMapTools().getId()).append(Origo.ui.dom.html(geouttagButton.render())); // den enda komponenten som ska synas från start
      document.getElementById(viewer.getMain().getId()).append(Origo.ui.dom.html(controlContainer.render()));
      drawToolButtonEvents();
      this.dispatch('render');
    }
  });
};

export default Geouttag;
