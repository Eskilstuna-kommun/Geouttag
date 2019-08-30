import Draw from 'ol/interaction/Draw';
import VectorSource from 'ol/source/Vector';
import Measure from './measure'
import { createBox } from 'ol/interaction/Draw';
import "Origo";


/*Geouttag is a tool to request FME server to
     export data from a marked area in map*/
const Geouttag = function Geouttag(options = {}) {
    let {
        target,
        url = "",
        contactmail = "",
        filepath = "",
        infolink = "",
        logo = "",
        warninglimit,
        warningtooltip = "varning",
        warningtext = "varning",
        errorlimit,
        errortooltip = "error",
        errortext = "error",
        infotext = "",
        layers = {}
    } = options;

    let viewer;
    let modal;
    let measureStyleOptions;
    let map;
    let projectionCode;
    let draw;
    let x1,y1,x2,y2;
    let closeBtn;
    let exportBtn;
    let layerTypeSelect;
    let fileTypeSelect;
    let initLayer;
    let restrictedLayers;

    /*returns html string of modal content*/
    function modalContent(x1, y1, x2, y2){
        let modalhtml = 
        `<form id="ModalForm" onsubmit="return false;">
            <div>
                <h4>Välj kartlager och filtyp:</h4>
                <br>
            </div>
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
                        <input type="text" id="X1" name="X1" value=${x1}>
                    </label>
                    <label for="Y1">
                        <span class="label">Y1: </span>
                        <input type="text" id="Y1" name="Y1" value=${y1}>
                    </label>
                </div>
                <br>
                <div class="flex">
                    <label for="X2">
                        <span class="label">X2: </span>
                        <input type="text" id="X2" name="X2" value=${x2}>
                    </label>
                    <label for="Y2">
                        <span class="label">Y2: </span>
                        <input type="text" id="Y2" name="Y2" value=${y2}>
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
                        ${infotext}
                        <br>
                        <br>
                        <a href="${infolink}" target="_blank">
                            <b>Klicka här för instruktion och mer information.</b>
                        </a>
                    </font>
                </p>
            </div>
            <div>
                ${exportBtn.render()}
                <span title="${errortooltip}" id="geouttag-red-warning" class="geouttag-red-warning">
                    ${errortext}
                </span>
                <span title="${warningtooltip}" id="geouttag-yellow-warning" class="geouttag-yellow-warning">
                    ${warningtext}
                    </span>
                <img src="${logo}" align="right" style="width:auto;">
            </div>
        </form>
        <div id="ModalStatus" style="display: none;max-width: 37em;">
            <h3>Vi har tagit emot din beställning</h3>
            <br>
            <br>
           Ditt geouttag kommer att levereras till din mail samt att du kan hämta den manuellt från ${filepath}
            <br>
            <br>
            <font size="2">
                <i>Tänk på att du bara får använda ditt geouttag inom ramen för ditt arbete. 
                    Du får inte sprida eller sälja informationen vidare, undantaget externa konsulter som utför arbete åt kommunen.
                    Har du frågor, kontakta <a href="mailto:${contactmail}?Subject=Geouttag" target="_top">${contactmail}</a>
                </i>
            </font>
            <br>
            <br>
            <br>
            ${closeBtn.render()}
        </div>`

        return modalhtml;
    }

    /*Apply some restrictions on layers*/
    function restrictExport(selValue){
        let area = (x2-x1) * (y2-y1);
        area = area < 0 ? -area : area;

        if(restrictedLayers.includes(selValue)){
            if(area > errorlimit){
                document.getElementById("geouttag-red-warning").style.display = "inline";
                document.getElementById(exportBtn.getId()).disabled = true;
            }
            else if(area > warninglimit){
                document.getElementById("geouttag-yellow-warning").style.display = "inline";
            }
        }
        else{
            document.getElementById(exportBtn.getId()).disabled = false;
            document.getElementById("geouttag-yellow-warning").style.display = "none";
            document.getElementById("geouttag-red-warning").style.display = "none";
        }
    }

    /*Shows available filetype in dropdown for selected layer*/
    function addFiletypes(selValue){  
        let currFiletypes = layers[selValue].filetypes;
        let optionsHtml = ""; 
        for(let filetype in currFiletypes){
            optionsHtml += `<option value="${filetype}">${filetype}</option>`; 
        }
        document.getElementById(fileTypeSelect.getId()).innerHTML = optionsHtml;
    }

    /*Get available layers to select in dropdown*/
    function getOptions(){
        let html = ``
        for (let layer in layers){
            html += `<option value="${layer}">${layers[layer].title}</option>`; 
        }
        return html;
    }

    function validateData(n){  
        return !(n.length<1);
    }

    function validateEmail(email){  
        let re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;  
        return re.test(email);
    }

    /*Collect data from elements and send request to server*/
    function sendData(e){
        let x1Elem = document.getElementById("X1");
        let x2Elem = document.getElementById("X2");
        let y1Elem = document.getElementById("Y1");
        let y2Elem = document.getElementById("Y2");
        let emailElem = document.getElementById("email");
        let incorrectInput = false;

        /*check if every text field is filled out correctly*/
        [x1Elem, x2Elem, y1Elem, y2Elem].forEach((elem) => {
            if(!validateData(elem.value)){
                elem.style.backgroundColor = "yellow";
                incorrectInput = true;
                return;
            }
            elem.style.backgroundColor="white";  
        })

        if (!validateEmail(emailElem.value)){    
            emailElem.style.backgroundColor="yellow";
            incorrectInput = true;
        }
        else{
            emailElem.style.backgroundColor="white";   
        }

        /*If any field were filled out incorrect then dont continue*/
        if(incorrectInput) return;

        setCookie("email",emailElem.value,365);  

        /*Get the approtiate FMEscript name based on selected layers and filetype*/
        let layerType = document.getElementById(layerTypeSelect.getId()).value;
        let fileType = document.getElementById(fileTypeSelect.getId()).value;
        let FMEscript = layers[layerType].filetypes[fileType];
  
        let d = new Date(); 
        let url = `${url}/${FMEscript}?geom=POLYGON `
        url += `((${x1Elem.value} ${y1Elem.value},${x1Elem.value} ${y2Elem.value},${x2Elem.value} ${y2Elem.value},${x2Elem.value} ${y1Elem.value}))`
        url += 
                `&srs=EPSG:3010&productName=${layerType}`+
                `&email=${emailElem.value}`+
                `&id=${d.getTime()}`+
                `&outputFormat=${fileType}`+
                `&opt_servicemode=async`

        document.getElementById("ModalForm").style.display='none';    
        document.getElementById("ModalStatus").style.display='block';

        fetch(url).catch((e) => console.log(e))

        console.log("REQ: ",url);
    }

    function getCookie(cname) {  
        let name = cname + "=";  
        let ca = document.cookie.split(';');  
        for(let i = 0; i < ca.length; i++) {    
            let c = ca[i];    
            while (c.charAt(0) == ' ') {      
                c = c.substring(1);    
            }    
            if (c.indexOf(name) == 0) {      
                return c.substring(name.length, c.length);    
            }  
        }  
        return "";
    }

    function setCookie(cname, cvalue, exdays){ 
        let d= new Date();  
        d.setTime(d.getTime() + (exdays*24*60*60*1000));  
        let expires = "expires="+ d.toUTCString();  
        document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/"
    }

    /*Updates coordinates when clicking in map*/
    function pointerMoveHandler(e) {
        let coord = e.coordinate;
        x2 = Math.round(coord[0]);
        y2 = Math.round(coord[1]);
    };

    /*Creates the draw interaction for the map*/
    function makeDrawInteraction() {
        /*type Circle with a createBox() function defines a rectangle*/
        let geometryFunction = createBox();
        let selectbox = new Draw({
            source: new VectorSource(),
            type: 'Circle',
            geometryFunction
        })
        return selectbox;
    };

    function createStyle(feature) {
        let featureType = feature.getGeometry().getType();
        let measureStyle = featureType == 'LineString' ? Origo.Style.createStyleRule(measureStyleOptions.linestring) : Origo.Style.createStyleRule(measureStyleOptions.polygon);
        return measureStyle;
    };

    return Origo.ui.Component({
        name: 'geouttag',
        onAdd(evt) {
            viewer = evt.target;
            map = viewer.getMap();
            projectionCode = map.getView().getProjection();

            draw = makeDrawInteraction();

            map.on("click", pointerMoveHandler);

            draw.on("drawstart", (e) => {
                let feature = e.feature;
                let coords = feature.getGeometry().getCoordinates()[0][0];
                /*update x1 y1 with coordinates from where you start drawing*/
                x1 = Math.round(coords[0]);
                y1 = Math.round(coords[1]);
                feature.setStyle(createStyle(feature));
                feature.getStyle()[0].getText().setText("Area att exportera");
            });

            /*wait for clickEvent function to update x2 y2 before rendering modal*/
            draw.on("drawend", async(e) => {
                await pointerMoveHandler
                this.render()
            });

            map.addInteraction(draw);

            closeBtn = Origo.ui.Button({
                click(){
                    modal.closeModal()
                },
                text: "Stäng Fönster",
                cls: 'geouttag-close'
            })
            
            exportBtn = Origo.ui.Button({
                click() {
                    sendData();
                },
                text: 'Starta Export',
                style: 'margin-top: 1.3rem',
                cls: 'export-btn'
            })

            layerTypeSelect = Origo.ui.Element({
                tagName: "select",
                innerHTML: `${getOptions()}`
            })

            fileTypeSelect = Origo.ui.Element({
                tagName: "select"
            })

            this.addComponents([closeBtn, exportBtn, layerTypeSelect, fileTypeSelect]);

        },
        onInit() {
            measureStyleOptions = Measure;
            //A way of getting first property in an object
            for (initLayer in layers) break;

            restrictedLayers = [];
            for (let layer in layers){
                if(layers[layer].restricted){
                    restrictedLayers.push(layer)
                }
            }
            
        },
        render() {
 
            modal = Origo.ui.Modal({
                title: `Välj det lager du vill exportera från vald area!`,
                content: `${modalContent(x1,y1,x2,y2)}`,
                target: viewer.getMain().getId(),
                cls: 'geouttag-modal'
            })

            document.getElementById("email").value=(getCookie("email"));
            document.getElementById(layerTypeSelect.getId()).addEventListener('change', (e) => { 
                addFiletypes(e.srcElement.value);
                restrictExport(e.srcElement.value); 
            })
            addFiletypes(initLayer);

            this.dispatch('render'); 

        }
    });
};

export default Geouttag;