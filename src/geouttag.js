/* eslint-disable no-console */
import 'Origo';

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
    layers = {}
  } = options;

  let viewer;
  let modal;
  let measureStyleOptions;
  let map;
  let projectionCode;
  let draw;
  let x1; let y1; let x2; let y2;
  let closeBtn;
  let exportBtn;
  let layerTypeSelect;
  let fileTypeSelect;
  let initLayer;
  let restrictedLayers;

  /* returns html string of modal content */
  function modalContent(xMin, yMin, xMax, yMax) {
    const modalhtml = `<form id="ModalForm" onsubmit="return false;">
            <div>
                <label for="layer">
                    <span class="label">Välj lager: </span>
                    ${layerTypeSelect.render()}
                </label>
            </div>
            <div>
                <label for="layer">
                    <span class="label">Välj filtyp: </span>
                    ${fileTypeSelect.render()}
                    </select>
                </label>
            </div>
            <div class="geouttag-positionblock">
                <div class="flex">
                    <label for="X1">
                        <span class="label">X1: </span>
                        <input type="text" id="X1" name="X1" value=${xMin}>
                    </label>
                    <label for="Y1">
                        <span class="label">Y1: </span>
                        <input type="text" id="Y1" name="Y1" value=${yMin}>
                    </label>
                </div>
                <br>
                <div class="flex">
                    <label for="X2">
                        <span class="label">X2: </span>
                        <input type="text" id="X2" name="X2" value=${xMax}>
                    </label>
                    <label for="Y2">
                        <span class="label">Y2: </span>
                        <input type="text" id="Y2" name="Y2" value=${yMax}>
                    </label>
                </div>
            </div>
            <div>
                <label for="email">
                    <span class="label">Epost: </span>
                    <input type="email" id="email" name="email" style="width: 300px; margin: 1rem; padding: 0.2rem; background-color: white;" placeholder="Skriv epostaddress här">
                </label>
            </div>
            <div>
                <p style="font-family: Arial;max-width: 37em;">
                    <font size="2">
                        ${infoText}
                        <br>
                        <br>
                        <a href="${infoLink}" target="_blank">
                            <b>Klicka här för instruktion och mer information.</b>
                        </a>
                    </font>
                </p>
            </div>
            <div>
                ${exportBtn.render()}
                <span title="${errorTooltip}" id="geouttag-red-warning" class="geouttag-red-warning">
                    ${errorText}
                </span>
                <span title="${warningTooltip}" id="geouttag-yellow-warning" class="geouttag-yellow-warning">
                    ${warningText}
                    </span>
                <img src="${logo}" align="right" style="width:auto;">
            </div>
        </form>
        <div id="ModalStatus" style="display: none;max-width: 37em;">
            <h3>Vi har tagit emot din beställning</h3>
            <br>
            <br>
           Ditt geouttag kommer att levereras till din mail samt att du kan hämta den manuellt från ${filePath}
            <br>
            <br>
            <font size="2">
                <i>Tänk på att du bara får använda ditt geouttag inom ramen för ditt arbete. 
                    Du får inte sprida eller sälja informationen vidare, undantaget externa konsulter som utför arbete åt kommunen.
                    Har du frågor, kontakta <a href="mailto:${contactMail}?Subject=Geouttag" target="_top">${contactMail}</a>
                </i>
            </font>
            <br>
            <br>
            <br>
            ${closeBtn.render()}
        </div>`;

    return modalhtml;
  }

  /* Apply some restrictions on layers */
  function restrictExport(selValue) {
    let area = (x2 - x1) * (y2 - y1);
    area = area < 0 ? -area : area;

    if (restrictedLayers.includes(selValue)) {
      if (area > errorLimit) {
        document.getElementById('geouttag-red-warning').style.display = 'inline';
        document.getElementById(exportBtn.getId()).disabled = true;
      } else if (area > warningLimit) {
        document.getElementById('geouttag-yellow-warning').style.display = 'inline';
      }
    } else {
      document.getElementById(exportBtn.getId()).disabled = false;
      document.getElementById('geouttag-yellow-warning').style.display = 'none';
      document.getElementById('geouttag-red-warning').style.display = 'none';
    }
  }

  /* Shows available filetype in dropdown for selected layer */
  function addFiletypes(selValue) {
    const currFiletypes = layers[selValue].filetypes;
    let optionsHtml = '';
    Object.keys(currFiletypes).forEach((filetype) => {
      optionsHtml += `<option value="${filetype}">${filetype}</option>`;
    });

    document.getElementById(fileTypeSelect.getId()).innerHTML = optionsHtml;
  }

  /* Get available layers to select in dropdown */
  function getOptions() {
    let html = '';
    Object.keys(layers).forEach((layer) => {
      html += `<option value="${layer}">${layers[layer].title}</option>`;
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

    /* Get the approtiate FMEscript name based on selected layers and filetype */
    const layerType = document.getElementById(layerTypeSelect.getId()).value;
    const fileType = document.getElementById(fileTypeSelect.getId()).value;
    const FMEscript = layers[layerType].filetypes[fileType];

    const d = new Date();
    let requestUrl = `${url}/${FMEscript}?geom=POLYGON `;
    requestUrl += `((${x1Elem.value} ${y1Elem.value},${x1Elem.value} ${y2Elem.value},${x2Elem.value} ${y2Elem.value},${x2Elem.value} ${y1Elem.value}))`;
    requestUrl
                += `&srs=EPSG:3010&productName=${layerType}`
                + `&email=${emailElem.value}`
                + `&id=${d.getTime()}`
                + `&outputFormat=${fileType}`
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

  return Origo.ui.Component({
    name: 'geouttag',
    onAdd(evt) {
      viewer = evt.target;
      map = viewer.getMap();
      projectionCode = map.getView().getProjection();

      draw = makeDrawInteraction();

      draw.on('drawstart', (e) => {
        const feature = e.feature;
        feature.setStyle(createStyle());
      });

      // drawend is the only relevant event for the rectangle coordinates for the modal
      draw.on('drawend', (e) => {
        pointerMoveHandler(e);
        this.render();
      });

      map.addInteraction(draw);

      closeBtn = Origo.ui.Button({
        click() {
          modal.closeModal();
        },
        text: 'Stäng Fönster',
        cls: 'geouttag-close'
      });

      exportBtn = Origo.ui.Button({
        click() {
          sendData();
        },
        text: 'Starta Export',
        style: 'margin-top: 1.3rem',
        cls: 'export-btn'
      });

      layerTypeSelect = Origo.ui.Element({
        tagName: 'select',
        innerHTML: `${getOptions()}`
      });

      fileTypeSelect = Origo.ui.Element({
        tagName: 'select'
      });

      this.addComponents([closeBtn, exportBtn, layerTypeSelect, fileTypeSelect]);
    },
    onInit() {
      // A way of getting first property in an object
      initLayer = Object.keys(layers)[0];

      restrictedLayers = [];
      Object.keys(layers).forEach((layer) => {
        if (layers[layer].restricted) {
          restrictedLayers.push(layer);
        }
      });
    },
    render() {
      modal = Origo.ui.Modal({
        title: 'Välj det lager du vill exportera från vald area',
        content: `${modalContent(x1, y1, x2, y2)}`,
        target: viewer.getMain().getId(),
        cls: 'geouttag-modal'
      });

      document.getElementById('email').value = (getCookie('email'));
      document.getElementById(layerTypeSelect.getId()).addEventListener('change', (e) => {
        addFiletypes(e.target.value);
        restrictExport(e.target.value);
      });
      addFiletypes(initLayer);

      this.dispatch('render');
    }
  });
};

export default Geouttag;
