/* eslint-disable no-console */
import 'Origo';
import loadSVGs from './loadresources';
import GeouttagDrawHandler from './drawhandler';
import styles from './styles';
import ImageServer, { handleOAuthCallback, isArcGISSessionValid } from './utils/imageserver';
import svLocale from './loc/sv_SE.json';
import enLocale from './loc/en_US.json';

const Draw = Origo.ol.interaction.Draw;
// const createBox = Origo.ol.interaction.Draw.createBox;
const { createRegularPolygon, createBox } = Origo.ol.interaction.Draw;
const VectorSource = Origo.ol.source.Vector;
const VectorLayer = Origo.ol.layer.Vector;
const { Style } = Origo.ol.style;

handleOAuthCallback();

/* Geouttag is a tool to request FME server to
     export data from a marked area in map */
const Geouttag = function Geouttag(options = {}) {
  const {
    fmeFlowDataDownloadUrl = '',
    products = [],
    layersConf = {},
    coordSyses = [],
    drawlayerTitle = '',
    arcgisClientId = import.meta.env.VITE_ARC_GIS_CLIENT_ID || '',
    arcgisTokenEndpoint = import.meta.env.VITE_ARC_GIS_TOKEN_ENDPOINT || ''

  } = options;

  let viewer;
  let map;
  let geouttag;
  let x1;
  let y1;
  let x2;
  let y2;
  let exportBtn;
  let productSelect;
  let fileTypeSelect;
  let coordSysSelect;
  let isActive = false;
  let geouttagButton;
  let arcgisSession = null;
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
  let layersSelect;
  let layersSelectOptionsDropdown;
  let layersSelectSelectedOptions;
  let layersSelectInput;
  let mapLayerOptionElements = [];
  let selectedLayers = [];
  let geouttagLayer;
  let currentDrawType = 'Polygon';
  let coords;
  let drawHandler;
  let signOutBtn;
  let userInfoComp;
  const filetypesById = {};
  let pendingRasterExport = false;
  let localizationControl = null;

  loadSVGs();

  // Registers the plugin's strings with Origo's localization control so they can be
  // translated or overridden per map and user (see https://origo-map.github.io/origo-documentation/latest/#add-locales).
  // If the map has no localization control, getString() falls back to the bundled sv_SE.json.
  function initLocalization(targetViewer) {
    if (localizationControl) return;
    try {
      localizationControl = targetViewer.getControlByName('localization');
      if (localizationControl && typeof localizationControl.addPluginToLocale === 'function') {
        localizationControl.addPluginToLocale('sv-SE', svLocale);
        localizationControl.addPluginToLocale('en-US', enLocale);
      } else {
        localizationControl = null;
      }
    } catch (e) {
      localizationControl = null;
      console.warn('Could not register Geouttag locale with the localization control:', e);
    }
  }

  function getString(key) {
    if (localizationControl && typeof localizationControl.getStringByKeys === 'function') {
      return localizationControl.getStringByKeys({ targetParentKey: 'geouttag', targetKey: key });
    }
    return svLocale.geouttag[key] || key;
  }

  // Called when an ArcGIS request comes back with a session restored from localStorage that has since expired. Clears the stale session,
  // and re-opens the sign-in popup so the user just has to log in again
  // pendingRasterExport ensures the export resumes automatically once that succeeds, so 'Starta export' not needs to be pressed on again efter the authentication.
  function handleInvalidArcgisSession() {
    arcgisSession = null;
    if (userInfoComp) {
      const userInfoEl = document.getElementById(userInfoComp.getId());
      if (userInfoEl) {
        userInfoEl.style.display = 'none';
        userInfoEl.innerHTML = '';
      }
    }
    pendingRasterExport = true;
    // Re-opens the sign-in popup. A bare ImageServer is enough for that — openArcGISAuth only
    // uses arcgisClientId — which keeps this function from referencing createImageServer below
    // (the two would otherwise be mutually recursive, which no-use-before-define disallows).
    ImageServer({ arcgisClientId }).openArcGISAuth();
  }

  function createImageServer() {
    return ImageServer({
      products,
      productSelect,
      fileTypeSelect,
      arcgisSession,
      arcgisClientId,
      arcgisTokenEndpoint,
      userInfoComp,
      signOutBtn,
      getString,
      coords,
      x1,
      y1,
      x2,
      y2,
      onInvalidSession: handleInvalidArcgisSession
    });
  }
  // helper function to create ids for the filetype objects
  function generateFiletypeId({ productNameorLayer, filetypeTitle }) {
    const normalizedTitle = filetypeTitle.toLowerCase().split(' ').join('_');
    return `${productNameorLayer}_${normalizedTitle}`;
  }

  // Products have their own workspace per product, layers share the one
  // workspace declared on layersConf. Normalize both to the same filetype
  // shape ({ id, title, outputFormat, FMEWorkspace }) and register them for
  // lookup by id when the export is posted.
  const productFiletypesByName = {};

  function normalizeFiletypes({ ownerName, filetypes, FMEWorkspace }) {
    return (filetypes || []).map((filetype) => {
      const normalized = {
        ...filetype,
        id: generateFiletypeId({ productNameorLayer: ownerName, filetypeTitle: filetype.title }),
        FMEWorkspace
      };
      filetypesById[normalized.id] = normalized;
      return normalized;
    });
  }

  products.forEach((product) => {
    productFiletypesByName[product.name] = normalizeFiletypes({
      ownerName: product.name,
      filetypes: product.filetypes,
      FMEWorkspace: product.FMEWorkspace || product.FMEworkspace
    });
  });

  const layerFiletypes = normalizeFiletypes({
    ownerName: 'layer',
    filetypes: layersConf.filetypes,
    FMEWorkspace: layersConf.FMEWorkspace
  });

  function getConfiguredLayersExist() {
    const mapLayersExist = layersConf && layersConf.layers && (layersConf.layers.length > 0);
    return mapLayersExist;
  }

  /* Returns the maximum exportable area in km2 for the current selection.
     A selected product contributes its own maxArea. With one or more layers
     selected, the smallest maxArea among them applies. While nothing is
     selected, no limit is enforced — the limit is a property of what is
     exported, which is not known yet. */
  function parseMaxAreaKm2(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  function getCurrentMaxAreaKm2() {
    const productSelectElement = document.getElementById(productSelect.getId());
    const selectedProduct = productSelectElement
      ? products.find((product) => product.name === productSelectElement.value)
      : undefined;
    if (selectedLayers.length > 0) {
      const layerMaxAreas = selectedLayers
        .map((name) => parseMaxAreaKm2(layersConf.layers?.find((layer) => layer.name === name)?.maxArea))
        .filter((maxArea) => maxArea !== undefined);
      if (layerMaxAreas.length > 0) return Math.min(...layerMaxAreas);
    } else {
      const productMaxArea = parseMaxAreaKm2(selectedProduct?.maxArea);
      if (productMaxArea !== undefined) return productMaxArea;
    }
    return Infinity;
  }

  /* Forces drawn feature(s) to be re-styled. Needed when the applicable maxArea
     becomes known only after the feature was drawn, e.g. selecting a product
     after finishing the sketch: OpenLayers re-evaluates a styleFunction only on
     feature/render changes, not when a select dropdown changes. */
  function refreshGeouttagFeatureStyles() {
    if (!geouttagLayer || typeof geouttagLayer.getSource !== 'function') return;
    geouttagLayer.getSource().getFeatures().forEach((feature) => {
      if (typeof feature.changed === 'function') feature.changed();
    });
  }

  /* True when every exported item is a whole-exportable product/layer, i.e.
     one that can be exported in its entirety without a drawn geometry. */
  function isWholeExportableSelection() {
    const productSelectElement = document.getElementById(productSelect.getId());
    if (selectedLayers.length > 0) {
      return selectedLayers.every((name) => {
        const layer = layersConf.layers?.find((l) => l.name === name);
        return !!layer && layer.wholeExportable === true;
      });
    }
    if (productSelectElement.value && productSelectElement.value !== 'defaultSelectionValue') {
      const product = products.find((p) => p.name === productSelectElement.value);
      // imageServer products cannot be exported in their entirety with this
      // app, so the wholeExportable prop is disregarded for them
      return !!product && product.wholeExportable === true && !product.imageServer;
    }
    return false;
  }

  /* State for the export button, if it should be enabled or disabled */
  function updateExportButtonState() {
    const exportBtnElement = document.getElementById(exportBtn.getId());
    const productSelectElement = document.getElementById(productSelect.getId());
    const fileTypeSelectElement = document.getElementById(fileTypeSelect.getId());

    const hasProductSelection = !!productSelectElement.value
      && productSelectElement.value !== 'defaultSelectionValue';
    const hasMapLayerSelection = selectedLayers.length > 0;
    const hasFileTypeSelection = !fileTypeSelectElement.disabled
      && fileTypeSelectElement.options.length > 0
      && !!fileTypeSelectElement.value;
    const wholeExportableSelection = isWholeExportableSelection();
    // The draw layer (and thus any feature) may not exist yet before the
    // first interaction has been created / the tool first activated.
    const drawnFeatures = geouttagLayer && typeof geouttagLayer.getSource === 'function'
      ? geouttagLayer.getSource().getFeatures()
      : [];
    const drawnFeature = drawnFeatures[0];
    const hasOkArea = !!drawnFeature
      && Math.abs(drawnFeature.getGeometry().getArea()) / 1000000 < getCurrentMaxAreaKm2();
    const geometryOk = wholeExportableSelection || !!drawnFeature;
    // When a geometry is drawn it must be within the applicable maxArea,
    // also for a whole-exportable selection — such items then get cut by
    // the drawn geometry just like everything else.
    const exportReady = (hasProductSelection || hasMapLayerSelection)
      && hasFileTypeSelection
      && geometryOk
      && (!drawnFeature || hasOkArea);
    exportBtnElement.disabled = !exportReady;
  }

  // Set the filetype selector to the filetypes available for the chosen
  // product or layers. Called without filetypes to clear the selection when
  // neither a product nor any layer is chosen.
  function setFiletypes({ filetypes } = {}) {
    const filetypeSelectElement = document.getElementById(fileTypeSelect.getId());
    filetypeSelectElement.innerHTML = (filetypes || [])
      .map((filetype) => `<option value="${filetype.id}">${filetype.title}</option>`)
      .join('');
    filetypeSelectElement.disabled = filetypeSelectElement.options.length === 0;
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
    const layersSelectOptions = layersSelectOptionsDropdown.getComponents().map(c => document.getElementById(c.getId()));
    layersSelectOptions.forEach((optEl) => {
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
    let html = '';
    if (defaultNothing) html += `<option value="${defaultNothing.name}">${defaultNothing.title}</option>`;
    selectOptions.forEach((sOption) => {
      html += `<option value="${sOption.name}">${sOption.title}</option>`;
    });
    return html;
  }

  /* Collect data from the panel elements and post the form to FME Flow.
     Either one product or one or many layers is exported, never both. */
  function sendData() {
    const productSelectElement = document.getElementById(productSelect.getId());
    const fileTypeSelectElement = document.getElementById(fileTypeSelect.getId());

    const filetype = filetypesById[fileTypeSelectElement.value];
    if (!filetype) {
      console.error('No filetype selected for export');
      return;
    }

    const isLayerExport = selectedLayers.length > 0;
    const selectedProduct = products.find((product) => product.name === productSelectElement.value);
    // One exportName param per exported item (product name or layer name)
    const exportNames = isLayerExport ? selectedLayers : [productSelectElement.value];
    // Titles, used for the message shown while the export is running
    const displayNames = isLayerExport
      ? selectedLayers
        .map((name) => layersConf.layers?.find((layer) => layer.name === name)?.title || name)
        .join(', ')
      : selectedProduct?.title || productSelectElement.value;

    let coordinatesString = '';
    // Check if polygon coordinates
    if (coords && currentDrawType === 'Polygon') {
      // Use actual polygon coordinates
      const coordinateString = coords
        .map(coord => `${coord[0]} ${coord[1]}`)
        .join(',');
      coordinatesString = `((${coordinateString}))`;
    } else if (x1 !== undefined && y1 !== undefined && x2 !== undefined && y2 !== undefined) {
      // Use bounding box for other tools
      coordinatesString = `((${x1} ${y1},${x1} ${y2},${x2} ${y2},${x2} ${y1},${x1} ${y1}))`;
    } else if (!isWholeExportableSelection()) {
      console.error('No coordinates available for export');
      return;
    }
    // A whole-exportable selection may be exported without a geometry; in
    // that case no geom parameter is sent and the whole dataset is exported.

    const requestUrl = new URL(`${fmeFlowDataDownloadUrl}/${filetype.FMEWorkspace}`);
    const coordSysSelectElement = document.getElementById(coordSysSelect.getId());
    const crs = coordSysSelectElement && coordSysSelectElement.value
      ? `EPSG:${coordSysSelectElement.value}`
      : '';
    const urlEncodedData = new URLSearchParams({
      outputFormat: filetype.outputFormat,
      token: import.meta.env.VITE_FME_FLOW_TOKEN
    });
    if (coordinatesString) urlEncodedData.append('geom', `POLYGON ${coordinatesString}`);
    if (crs) urlEncodedData.append('crs', crs);
    exportNames.forEach((name) => urlEncodedData.append('exportName', name));

    const inputsString = Array.from(urlEncodedData.entries())
      .map(([name, value]) => `<input type="hidden" name="${name}" value="${value}">`);

    // Open a new window with spinner, then load the export
    const exportWindow = window.open('', '_blank');

    if (!exportWindow) {
      console.error('Popup blocked! Please allow popups for this site.');
      alert(getString('popupBlockedExportAlertText'));
      return;
    }

    // Create HTML content with spinner and form for POST request
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="sv">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${getString('exportWindowTitle')}</title>
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

            form {
              display: none;
            }
          </style>
        </head>
        <body>
          <div class="spinner"></div>
          <p class="message">${getString('waitingForExportText').replace('{0}', displayNames)}</p>

          <div class="iframe-container" id="iframe-container">
            <iframe id="export-iframe" title="Export"></iframe>
          </div>

          <form id="export-form" action="${requestUrl}" method="POST">
          ${inputsString.join('')}
          </form>

          <script>
            // Submit the form to trigger the POST request
            const form = document.getElementById('export-form');
            form.submit();

            // Handle the response
            const iframe = document.getElementById('export-iframe');
            const container = document.getElementById('iframe-container');
            const spinner = document.querySelector('.spinner');
            const message = document.querySelector('.message');

            // Listen for messages from the iframe
            window.addEventListener('message', function(event) {
              if (event.origin !== window.location.origin) return;

              if (event.data === 'export-complete') {
                spinner.style.display = 'none';
                message.style.display = 'none';
                container.style.display = 'block';
              } else if (event.data === 'export-error') {
                message.innerHTML = '${getString('exportErrorText')}';
                message.style.color = 'red';
              }
            });

            // Fallback: if no response within 30 seconds, show error
            setTimeout(function() {
              if (container.style.display !== 'block') {
                message.innerHTML = '${getString('exportStillRunningText').replace('{0}', displayNames)}';
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

  /* Updates extent coordinates of rectangle */
  function pointerMoveHandler(e) {
    const feature = e.feature;
    const geometry = feature.getGeometry();
    const geometryType = geometry.getType();

    if (geometryType === 'Polygon' && (currentDrawType === 'Polygon')) {
      coords = geometry.getCoordinates()[0]; // any shape
    } else { // rectangle shape assumed
      const extent = geometry.getExtent();
      x1 = Math.round(extent[0]); // minX
      y1 = Math.round(extent[1]); // minY
      x2 = Math.round(extent[2]); // maxX
      y2 = Math.round(extent[3]); // maxY

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

    const areaKm2 = Math.abs(geometry.getArea()) / 1000000;

    // The maximum allowed area depends on what is currently selected for export
    const maxAreaKm2 = getCurrentMaxAreaKm2();
    const maxAreaLog = maxAreaKm2 === Infinity ? 'none (no product/layers selected)' : `${maxAreaKm2} km²`;
    console.log(`Calculate style, feature geometry area: ${areaKm2} km² (max allowed: ${maxAreaLog})`);

    // Choose the base styling based on your business logic
    const areaStyle = areaKm2 > maxAreaKm2 ? styles.warningStyle : styles.standardInteractionStyle;

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
        title: drawlayerTitle || getString('drawLayerTitle'),
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
    if (isActive) {
      // Remove current interaction, if one has been created
      if (geouttag) {
        map.removeInteraction(geouttag);
      }
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
    if (geouttagLayer && typeof geouttagLayer.getSource === 'function') {
      geouttagLayer.getSource().clear();
    }
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
    // A draw interaction exists only after one of the draw tool radios has
    // been selected (nothing is added to the map on plugin load)
    if (geouttag) {
      map.addInteraction(geouttag);
    }
    document.getElementById(geouttagButton.getId()).classList.add('active');
    document.getElementById(geouttagButton.getId()).classList.remove('tooltip');
    setActive(true);
  }

  function disableInteraction() {
    if (geouttag) map.removeInteraction(geouttag);
    document.getElementById(geouttagButton.getId()).classList.remove('active');
    document.getElementById(geouttagButton.getId()).classList.add('tooltip');
    setActive(false);
  }

  return Origo.ui.Component({
    name: 'geouttag',
    onAdd(evt) {
      viewer = evt.target;
      map = viewer.getMap();

      initLocalization(viewer);

      layersSelectSelectedOptions = Origo.ui.Element({
        tagName: 'div',
        cls: 'selected-options'
      });

      layersSelectInput = Origo.ui.Element({
        tagName: 'input',
        attributes: {
          type: 'text',
          placeholder: getConfiguredLayersExist() ? getString('selectMapLayerPlaceholder') : getString('noMapLayersText'),
          disabled: !(getConfiguredLayersExist())
        },
        cls: `select-input custom-select-input text-small ${(getConfiguredLayersExist()) ? '' : 'disabled'}`
      });

      layersSelectOptionsDropdown = Origo.ui.Element({
        tagName: 'div',
        cls: 'options-dropdown',
        style: 'display:none'
      });

      layersSelect = Origo.ui.Element({
        tagName: 'div',
        cls: 'custom-select',
        components: [layersSelectOptionsDropdown, layersSelectInput]
      });

      geouttagButton = Origo.ui.Button({
        cls: 'padding-small margin-bottom-smaller icon-smaller round light box-shadow tooltip',
        click() {
          toggleGeouttag();
        },
        icon: '#geouttag_ic_download_24px',
        tooltipText: getString('mainButtonTooltipText'),
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
        innerHTML: getString('startExportText')
      });

      productSelect = Origo.ui.Element({
        tagName: 'select',
        cls: 'text-small',
        innerHTML: getSelectOptionsHtml({
          selectOptions: products,
          defaultNothing: {
            title: getString('selectProductText'),
            name: 'defaultSelectionValue'
          }
        })
      });

      fileTypeSelect = Origo.ui.Element({
        tagName: 'select'
      });

      coordSysSelect = Origo.ui.Element({
        tagName: 'select',
        cls: 'text-small',
        innerHTML: coordSyses.map((epsgCode) => `<option value="${epsgCode.ref}">${epsgCode.title}</option>`).join('')
      });

      headerComp = Origo.ui.Element({
        tagName: 'h3',
        innerHTML: getString('title'),
        style: 'text-align: center;'
      });

      productSelectorTextComp = Origo.ui.Element({
        tagName: 'p',
        innerHTML: getString('productSelectorText'),
        cls: 'text-small padding-bottom-small padding-left-small'
      });

      additionalLayersTextComp = Origo.ui.Element({
        tagName: 'p',
        innerHTML: getString('additionalLayersText'),
        cls: 'text-smaller padding-bottom-small padding-left-small'
      });

      formatSelectorTextComp = Origo.ui.Element({
        tagName: 'p',
        innerHTML: getString('formatSelectorText'),
        cls: 'text-small padding-top-large padding-bottom-small padding-left-small'
      });

      drawToolSelectorTextComp = Origo.ui.Element({
        tagName: 'p',
        innerHTML: getString('drawToolSelectorText'),
        cls: 'text-small padding-left-small',
        style: 'padding-bottom: 0.4rem;'
      });

      polygonSelectionButton = Origo.ui.Button({
        cls: 'light text-smaller padding-left-large',
        style: 'flex: 1 1 auto;',
        text: getString('polygonText')
      });

      squareSelectionButton = Origo.ui.Button({
        cls: 'light text-smaller',
        style: 'flex: 1 1 auto;',
        text: getString('squareText')
      });

      rectangleSelectionButton = Origo.ui.Button({
        cls: 'light text-smaller padding-right-large',
        style: 'flex: 1 1 auto;',
        text: getString('rectangleText')
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
        text: getString('signOutText')
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
        components: [headerComp, productSelectorTextComp, productSelect, layersSelect, additionalLayersTextComp, layersSelectSelectedOptions, formatSelectorTextComp, fileTypeSelect, coordSysSelect, drawToolSelectorTextComp, drawToolbarComp, exportBtn, authSeparator, userInfoComp, signOutBtn]
      });

      // Ensure controlContainer is registered as a child component so its
      // `onRender` handlers are called when this component dispatches 'render'.
      this.addComponent(controlContainer);

      drawHandler = GeouttagDrawHandler({
        stylewindow: null,
        pointerMoveHandler,
        Origo,
        updateExportButtonState,
        selectedStyleFunction,
        styleFunction
      });

      drawHandler.initializeMap(map);

      // projectionCode = map.getView().getProjection();

      const mapLayers = layersConf?.layers || [];

      try {
        const layersSelectLayerOptions = getMaplayerOptions({
          layers: mapLayers
        });
        layersSelectOptionsDropdown.addComponents(layersSelectLayerOptions);
      } catch (e) {
        console.warn('Could not create/attach mapLayerSelect now:', e);
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

      geouttag = null;

      drawToolButtonEvents();

      viewer.on('toggleClickInteraction', (detail) => {
        if (detail.name === 'geouttag' && detail.active) {
          // The tool is enabled without a draw interaction; the user picks
          // one of the draw tool radios (changeDrawTool) to start drawing
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

      // Selecting a product and selecting layers are mutually exclusive:
      // choosing one clears the other's selection.
      function clearSelectedLayers() {
        selectedLayers = [];
        mapLayerOptionElements.forEach((optionElement) => optionElement.classList.remove('selected'));
        const selectedOptions = document.getElementById(layersSelectSelectedOptions.getId());
        if (selectedOptions) selectedOptions.innerHTML = '';
        refreshGeouttagFeatureStyles();
      }

      const productSelectElement = document.getElementById(productSelect.getId());
      productSelectElement.addEventListener('change', (productSelectEvent) => {
        const selectedValue = productSelectEvent.target.value;
        const layersSelectEl = document.getElementById(layersSelectInput.getId());
        if (selectedValue !== 'defaultSelectionValue') {
          clearSelectedLayers();
          setFiletypes({ filetypes: productFiletypesByName[selectedValue] });
          layersSelectEl.disabled = true;
          layersSelectEl.classList.add('disabled');
        } else {
          if (getConfiguredLayersExist()) {
            layersSelectEl.disabled = false;
            layersSelectEl.classList.remove('disabled');
          }
          setFiletypes();
        }
        refreshGeouttagFeatureStyles();
        updateExportButtonState();
      });

      const fileTypeSelectElement = document.getElementById(fileTypeSelect.getId());
      fileTypeSelectElement.addEventListener('change', () => {
        updateExportButtonState();
      });

      const exportBtnElement = document.getElementById(exportBtn.getId());
      if (exportBtnElement && !exportBtnElement.dataset.listenerAttached) {
        exportBtnElement.addEventListener('click', async () => {
          const selectedProduct = products.find((p) => p.name === productSelectElement?.value);
          const isRaster = selectedProduct && selectedProduct.imageServer;

          if (isRaster) {
            // Raster product: authenticate if needed, then download via ArcGIS ImageServer
            if (arcgisSession && isArcGISSessionValid(arcgisSession)) {
              // Already logged in — download directly
              createImageServer().sendArcGISRequest();
            } else {
              // Not logged in (or the stored session has expired) — open OAuth popup;
              // handleOAuthCallback will exchange the code for tokens.
              // Mark the export as pending so updateAuthUI() can kick off the download itself once the
              // session is ready (with a *fresh* ImageServer reflecting the currently drawn extent).
              pendingRasterExport = true;
              await createImageServer().openArcGISAuth();
            }
          } else {
            // Other products: use FME export
            sendData();
          }
        });
        exportBtnElement.dataset.listenerAttached = 'true';
      }

      document.getElementById(layersSelectInput.getId()).addEventListener('click', () => {
        const optionsDropdownEl = document.getElementById(layersSelectOptionsDropdown.getId());
        const inputEl = document.getElementById(layersSelectInput.getId());
        if (!optionsDropdownEl || !inputEl) return;
        const rect = inputEl.getBoundingClientRect();
        if (optionsDropdownEl.style.display === 'block') {
          optionsDropdownEl.style.display = 'none';
          const layersSelectEl = document.getElementById(layersSelect.getId());
          if (layersSelectEl && layersSelectEl.contains(optionsDropdownEl) === false) {
            layersSelectEl.appendChild(optionsDropdownEl);
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

      document.getElementById(layersSelectInput.getId()).addEventListener('input', (e) => {
        const optionsDropdownEl = document.getElementById(layersSelectOptionsDropdown.getId());
        const inputEl = document.getElementById(layersSelectInput.getId());
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

      mapLayerOptionElements = layersSelectOptionsDropdown.getComponents().map((component) => document.getElementById(component.getId()));
      const mapLayerOptions = mapLayerOptionElements;

      // eventlisteners behövs för varje option samt dess tagg
      mapLayerOptions.forEach(mapLayerOption => {
        mapLayerOption.addEventListener('click', () => {
          const layerName = mapLayerOption.getAttribute('data-name');
          const layerTitle = mapLayerOption.getAttribute('data-title');

          const isSelected = mapLayerOption.classList.toggle('selected');
          const selectedOptions = document.getElementById(layersSelectSelectedOptions.getId());
          const productSelectElem = document.getElementById(productSelect.getId());

          if (isSelected) {
            productSelectElem.disabled = true;
            selectedLayers.push(layerName);
            const tag = document.createElement('div');
            tag.className = 'selected-tag';
            tag.textContent = layerTitle;
            // vald-lager-brickorna behöver eventlisterners för ta bort och ta bort resp lagers markering
            tag.addEventListener('click', (closeTagClickEvent) => {
              closeTagClickEvent.stopPropagation();
              mapLayerOption.classList.remove('selected');
              selectedLayers = selectedLayers.filter(v => v !== layerName);
              if (selectedLayers.length === 0) {
                productSelectElem.disabled = false;
                setFiletypes();
              }
              refreshGeouttagFeatureStyles();
              updateExportButtonState();
              tag.remove();
            });
            selectedOptions.append(tag);
          } else {
            selectedLayers = selectedLayers.filter(v => v !== layerName);
            if (selectedLayers.length === 0) {
              productSelectElem.disabled = false;
              setFiletypes();
            }
            const tags = selectedOptions.querySelectorAll('.selected-tag');
            tags.forEach(tag => {
              if (tag.textContent.includes(layerTitle)) {
                tag.remove();
              }
            });
          }
          if (selectedLayers.length > 0) setFiletypes({ filetypes: layerFiletypes });
          refreshGeouttagFeatureStyles();
          updateExportButtonState();
        });
      });

      // eventlistener behövs för att ta bort rullgardin vid klick utanför i custom select
      document.addEventListener('click', (forDropdownEvent) => {
        const optionsEl = document.getElementById(layersSelectOptionsDropdown.getId());
        if (forDropdownEvent.target.closest('.custom-select') || (optionsEl?.contains(forDropdownEvent.target))) return;
        if (optionsEl) optionsEl.style.display = 'none';
      });

      // Helper to toggle auth UI state
      function updateAuthUI(sessionInfo) {
        arcgisSession = sessionInfo || null;

        // If sign-in was triggered by an export click, resume the download now that we have a
        // session — build a *fresh* ImageServer so it picks up the currently drawn extent instead
        // of whatever (possibly undefined) extent existed when setupArcGISAuth() first ran.
        if (pendingRasterExport && arcgisSession && arcgisSession.access_token) {
          pendingRasterExport = false;
          createImageServer().sendArcGISRequest();
        }
      }

      // Only wire up ArcGIS auth if client ID was provided
      if (arcgisClientId) {
        createImageServer().setupArcGISAuth({
          onAuthChange: updateAuthUI
        });
      }
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
