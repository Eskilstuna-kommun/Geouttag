/* eslint-disable no-console */
import 'Origo';
import loadSVGs from './loadresources';

const Draw = Origo.ol.interaction.Draw;
const createBox = Origo.ol.interaction.Draw.createBox;
const VectorSource = Origo.ol.source.Vector;
const { Style, Fill, Stroke, Text } = Origo.ol.style;

/* Geouttag is a tool to request FME server to
     export data from a marked area in map */
const Geouttag = function Geouttag(options = {}) {
  const {
    url = '',
    contactMail = '',
    filePath = '',
    infoLink = '',
    logo = '',
    warningLimit,
    warningTooltip = 'varning',
    warningText = 'varning',
    errorLimit,
    errorTooltip = 'error',
    errorText = 'error',
    infoText = '',
    predefinedExports = [],
    maplayerExport = {}

  } = options;

  let viewer;
  let measureStyleOptions;
  let map;
  let projectionCode;
  let geouttag;
  let x1; let y1; let x2; let y2;
  let exportBtn;
  let layerTypeSelect;
  let mapLayerSelect;
  let productSelect;
  let fileTypeSelect;
  let mapExports;
  let allExports;
  let isActive = false;
  let geouttagButton;
  let controlContainer;
  let drawToolbarComp;
  let polygonSelectionButton;
  let rectangleSelectionButton;
  let squareSelectionButton;
  let headerComp;
  let productSelectorTextComp;
  let formatSelectorTextComp;
  let drawToolSelectorTextComp;
  let customSelect;
  let customSelectOptionsDropdown;
  let customSelectSelectedOptions;
  let customSelectInput;
  let selectedValues = [];
  const restrictedLayers = [];

  loadSVGs();

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

  function getMaplayerOptions({ mapLayers, predefined }) {
    const theLayers = mapLayers?.length > 0 ? mapLayers : predefined;
    return theLayers.map((layer) => {
      const layerOptionElement = Origo.ui.Element({
        tagName: 'div',
        cls: 'option',
        innerHTML: layer.get('title'),
        attributes: {
          data: {
            title: layer.get('title'),
            name: layer.get('name')
          }
        }
      });
      return layerOptionElement;
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

  function validateData(n) {
    return !(n.length < 1);
  }

  function validateEmail(email) {
    const re = /^(([^<>()\]\\.,;:\s@"]+(\.[^<>()\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
  }

  function setCookie(cname, cvalue, exdays) {
    const d = new Date();
    d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
    const expires = `expires=${d.toUTCString()}`;
    document.cookie = `${cname}=${cvalue};${expires};path=/`;
  }

  /* Collect data from elements and send request to server */
  function sendData() {
    const x1Elem = document.getElementById('X1');
    const x2Elem = document.getElementById('X2');
    const y1Elem = document.getElementById('Y1');
    const y2Elem = document.getElementById('Y2');
    const emailElem = document.getElementById('email');
    let incorrectInput = false;

    /* check if every text field is filled out correctly */
    [x1Elem, x2Elem, y1Elem, y2Elem].forEach((elem) => {
      const element = elem;
      if (!validateData(elem.value)) {
        element.style.backgroundColor = 'yellow';
        incorrectInput = true;
        return;
      }
      element.style.backgroundColor = 'white';
    });

    if (!validateEmail(emailElem.value)) {
      emailElem.style.backgroundColor = 'yellow';
      incorrectInput = true;
    } else {
      emailElem.style.backgroundColor = 'white';
    }

    /* If any field were filled out incorrect then dont continue */
    if (incorrectInput) return;

    setCookie('email', emailElem.value, 365);

    /* Get the FME workspace name, title of the export option and title of filetype
      from the layers array via the selected options */
    const selectedExportName = document.getElementById(layerTypeSelect.getId()).value;
    const selectedExport = allExports.find((layer) => layer.name === selectedExportName);

    const fileTypeName = document.getElementById(fileTypeSelect.getId()).value;
    const fileTypeObj = selectedExport.filetypes.find((filetype) => fileTypeName === filetype.title);

    const FMEscript = fileTypeObj.workspace || maplayerExport.workspace;
    const fileType = fileTypeObj.outputFormat;
    const layerType = selectedExport.name;

    const d = new Date();
    let requestUrl = `${url}/${FMEscript}?geom=POLYGON `;
    requestUrl += `((${x1Elem.value} ${y1Elem.value},${x1Elem.value} ${y2Elem.value},${x2Elem.value} ${y2Elem.value},${x2Elem.value} ${y1Elem.value}))`;
    requestUrl
      += `&srs=EPSG:3010&productName=${layerType}`
      + `&email=${emailElem.value}`
      + `&id=${d.getTime()}`
      + `${fileType ? `&outputFormat=${fileType}` : ''}` // if there's an outputFormat prop of the fileType then relay it to FME Flow
      + '&opt_servicemode=async';

    document.getElementById('ModalForm').style.display = 'none';
    document.getElementById('ModalStatus').style.display = 'block';

    fetch(requestUrl).catch((e) => console.log(e));

    console.log('REQ: ', requestUrl);
  }

  function getCookie(cname) {
    const name = `${cname}=`;
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i += 1) {
      let c = ca[i];
      while (c.charAt(0) === ' ') {
        c = c.substring(1);
      }
      if (c.indexOf(name) === 0) {
        return c.substring(name.length, c.length);
      }
    }
    return '';
  }

  /* Updates extent coordinates of rectangle */
  function pointerMoveHandler(e) {
    const feature = e.feature;
    const coords = feature.getGeometry().getCoordinates()[0];
    // Extract all x and y values
    const xValues = coords.map(c => c[0]);
    const yValues = coords.map(c => c[1]);
    // Calculate min and max
    x1 = Math.round(Math.min(...xValues));
    x2 = Math.round(Math.max(...xValues));
    y1 = Math.round(Math.min(...yValues));
    y2 = Math.round(Math.max(...yValues));
  }

  /* Creates the draw interaction for the map */
  function makeDrawInteraction() {
    /* type Circle with a createBox() function defines a rectangle */
    const geometryFunction = createBox();
    const selectbox = new Draw({
      source: new VectorSource(),
      type: 'Circle',
      geometryFunction
    });
    return selectbox;
  }

  // default style for the rectangle
  function createStyle() {
    return new Style({
      fill: new Fill({
        color: 'rgba(255, 255, 255, 0.4)'
      }),
      stroke: new Stroke({
        color: '#ffcc33',
        width: 2
      }),
      text: new Text({
        text: 'Area att exportera',
        font: '14px Calibri,sans-serif',
        fill: new Fill({ color: '#000' }),
        stroke: new Stroke({ color: '#fff', width: 3 }),
        offsetY: -10
      })
    });
  }

  function toggleGeouttag() {
    const controlContainerElement = document.getElementById(controlContainer.getId());
    if (controlContainerElement.classList.contains('o-hidden')) {
      controlContainerElement.classList.remove('o-hidden');
    } else {
      document.getElementById(controlContainer.getId()).classList.add('o-hidden');
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
      projectionCode = map.getView().getProjection();
      const mapLayers = Object.keys(maplayerExport).length ? viewer.getLayers().filter((layer) => layer.get('geouttag')) : [];

      try {
        const customSelectLayerOptions = getMaplayerOptions({
          mapLayers
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
      viewer.on('toggleClickInteraction', (e) => {
        if ((e.name !== 'geouttag') && (e.active)) {
          if (isActive) {
            document.getElementById(controlContainer.getId()).classList.add('o-hidden');
          }
        }
      });

      geouttag = makeDrawInteraction();

      geouttag.on('drawstart', (e) => {
        const feature = e.feature;
        feature.setStyle(createStyle());
      });

      // drawend is the only relevant event for the rectangle coordinates for the modal
      geouttag.on('drawend', (e) => {
        pointerMoveHandler(e);

        document.getElementById('email').value = (getCookie('email'));
        const layerTypeSelectElement = document.getElementById(layerTypeSelect.getId());
        layerTypeSelectElement.addEventListener('change', () => {
          const selectedLayer = allExports.find((layer) => layer.name === layerTypeSelectElement.value);
          setFiletypes(selectedLayer);
        });
        if (allExports.length) {
          // setFiletypes(allExports[0]);
        } else console.warn('No exports defined, check your configuration.');
        const exportBtnElement = document.getElementById(exportBtn.getId());
        exportBtnElement.addEventListener('click', () => {
          sendData();
        });
      });

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

      const productSelectElement = document.getElementById(productSelect.getId());
      productSelectElement.addEventListener('change', (productSelectEvent) => {
        const selectedValue = productSelectEvent.target.value;
        const customSelectEl = document.getElementById(customSelectInput.getId());
        if (selectedValue !== 'defaultSelectionValue') {
          setFiletypes({ selValue: selectedValue });
          customSelectEl.disabled = true;
          customSelectEl.classList.add('disabled');
        } else {
          customSelectEl.disabled = false;
          customSelectEl.classList.remove('disabled');
          setFiletypes({ mapLayerOutputFormats: [] });
        }
      });

      document.getElementById(customSelectInput.getId()).addEventListener('click', () => {
        const optionsDropdownEl = document.getElementById(customSelectOptionsDropdown.getId());
        const inputEl = document.getElementById(customSelectInput.getId());
        if (!optionsDropdownEl || !inputEl) return;
        const rect = inputEl.getBoundingClientRect();
        // Toggle visibility and float the dropdown above the control container by moving it to body
        if (optionsDropdownEl.style.display === 'block') {
          optionsDropdownEl.style.display = 'none';
          // move it back under the custom select component to keep DOM tidy
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

      const mapLayerOptions = customSelectOptionsDropdown.getComponents().map((component) => document.getElementById(component.getId()));

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
            selectedOptions.appendChild(tag);
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
        });
      });

      // eventlistener behövs för att ta bort rullgardin vid klick utanför i custom select
      document.addEventListener('click', (forDropdownEvent) => {
        const optionsEl = document.getElementById(customSelectOptionsDropdown.getId());
        if (forDropdownEvent.target.closest('.custom-select') || (optionsEl?.contains(forDropdownEvent.target))) return;
        if (optionsEl) optionsEl.style.display = 'none';
      });
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
          placeholder: 'Välj kartlager..',
          readonly: true
        },
        cls: 'select-input'
      });

      customSelectOptionsDropdown = Origo.ui.Element({
        tagName: 'div',
        cls: 'options-dropdown',
        style: 'display:none'
      });

      customSelect = Origo.ui.Element({
        tagName: 'div',
        cls: 'custom-select',
        components: [customSelectOptionsDropdown, customSelectInput, customSelectSelectedOptions]
      });

      geouttagButton = Origo.ui.Button({
        cls: 'padding-small margin-bottom-smaller icon-smaller round light box-shadow tooltip',
        click() {
          toggleGeouttag();
        },
        icon: '#geouttag_ic_download_24px',
        tooltipText: 'Geouttag',
        tooltipPlacement: 'east'//,
        //state: 'disabled' - funkar
      });

      exportBtn = Origo.ui.Element({
        tagName: 'button',
        cls: 'export-btn light box-shadow',
        style: 'margin-top: 1.3rem; width: 30%',
        innerHTML: 'Starta export'
      });

      layerTypeSelect = Origo.ui.Element({
        tagName: 'select'
      });

      productSelect = Origo.ui.Element({
        tagName: 'select',
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
        innerHTML: 'Geouttag',
        style: 'text-align: center;'
      });

      productSelectorTextComp = Origo.ui.Element({
        tagName: 'p',
        innerHTML: 'Välj en produkt eller ett till flera lager i kartan',
        cls: 'text-smaller'
      });

      formatSelectorTextComp = Origo.ui.Element({
        tagName: 'p',
        innerHTML: 'Välj ett exportformat',
        cls: 'text-smaller'
      });

      drawToolSelectorTextComp = Origo.ui.Element({
        tagName: 'p',
        innerHTML: 'Välj ett verktyg för att rita önskat område att exportera',
        cls: 'text-smaller',
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
        components: [headerComp, productSelectorTextComp, productSelect, customSelect, formatSelectorTextComp, fileTypeSelect, drawToolSelectorTextComp, drawToolbarComp, exportBtn]
      });

      // Ensure controlContainer is registered as a child component so its
      // `onRender` handlers are called when this component dispatches 'render'.
      this.addComponent(controlContainer);
    },
    render() {
      document.getElementById(viewer.getMain().getMapTools().getId()).append(Origo.ui.dom.html(geouttagButton.render())); // den enda komponenten som ska synas från start
      document.getElementById(viewer.getMain().getId()).append(Origo.ui.dom.html(controlContainer.render()));
      this.dispatch('render');
    }
  });
};

export default Geouttag;
