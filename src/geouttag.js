/* eslint-disable no-console */
import 'Origo';
import loadSVGs from './loadresources';
import GeouttagDrawHandler from './drawhandler';
import styles from './styles';
import ImageServer, { handleOAuthCallback } from './utils/imageserver';

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
    url = '',
    warningLimit,
    errorLimit,
    predefinedExports = [],
    maplayerExport = {},
    drawlayerTitle = '',
    arcgisClientId = import.meta.env.VITE_ARC_GIS_CLIENT_ID || '',
    arcgisTokenEndpoint = 'https://geo.eskilstuna.se/portal/sharing/rest/oauth2/token'

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

  function createImageServer() {
    return ImageServer({
      predefinedExports,
      productSelect,
      fileTypeSelect,
      arcgisSession,
      arcgisClientId,
      arcgisTokenEndpoint,
      userInfoComp,
      signOutBtn,
      coords,
      x1,
      y1,
      x2,
      y2
    });
  }

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

      const exportBtnElement = document.getElementById(exportBtn.getId());
      if (exportBtnElement && !exportBtnElement.dataset.listenerAttached) {
        exportBtnElement.addEventListener('click', async () => {
          const selectedProduct = predefinedExports.find((p) => p.name === productSelectElement?.value);
          const isRaster = selectedProduct && selectedProduct.imageServer;

          if (isRaster) {
            // Raster product: authenticate if needed, then download via ArcGIS ImageServer
            if (arcgisSession && arcgisSession.access_token) {
              // Already logged in — download directly
              createImageServer().sendArcGISRequest();
            } else {
              // Not logged in — open OAuth popup; handleOAuthCallback will exchange the code for tokens
              await createImageServer().openArcGISAuth();
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
        arcgisSession = sessionInfo || null;
      }

      // Only wire up ArcGIS auth if client ID was provided
      if (arcgisClientId) {
        createImageServer().setupArcGISAuth({
          onAuthChange: updateAuthUI
        });
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
