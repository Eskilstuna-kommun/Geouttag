/* eslint-disable no-console */
import Origo from 'Origo';

const DoubleClickZoom = Origo.ol.interaction.DoubleClickZoom;
const { Style, Fill, Stroke, Text } = Origo.ol.style;
const { Select, Modify } = Origo.ol.interaction;

const GeouttagDrawHandler = function GeouttagDrawHandler(options = {}) {
  const {
    stylewindow,
    pointerMoveHandler
  } = options;

  let geouttagLayer;
  let geouttag;
  let map;
  let select;
  let modify;

  // default style for the rectangle
  function createStyle() {
    return new Style({
      fill: new Fill({
        color: 'rgba(255, 255, 255, 0.4)'
      }),
      stroke: new Stroke({
        color: 'rgba(0,153,255,1)',
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

  function setGeouttagInteraction(interaction) {
    geouttag = interaction;
  }

  function setGeouttagLayer(layer) {
    geouttagLayer = layer;
  }

  function initializeMap(mapInstance) {
    map = mapInstance;
  }

  function disableDoubleClickZoom(evt) {
    if (!map) {
      return;
    }

    const featureType = evt.feature.getGeometry().getType();
    const interactionsToBeRemoved = [];

    if (featureType === 'Point') {
      return;
    }

    map.getInteractions().forEach((interaction) => {
      if (interaction instanceof DoubleClickZoom) {
        interactionsToBeRemoved.push(interaction);
      }
    });

    if (interactionsToBeRemoved.length > 0) {
      map.removeInteraction(interactionsToBeRemoved[0]);
    }
  }

  function onDrawStart(evt) {
    const feature = evt.feature;
    feature.setStyle(createStyle());

    if (evt.feature.getGeometry().getType() !== 'Point') {
      disableDoubleClickZoom(evt);
    }
  }

  function addDoubleClickZoomInteraction() {
    const allDoubleClickZoomInteractions = [];
    map.getInteractions().forEach((interaction) => {
      if (interaction instanceof DoubleClickZoom) {
        allDoubleClickZoomInteractions.push(interaction);
      }
    });
    if (allDoubleClickZoomInteractions.length < 1) {
      map.addInteraction(new Origo.ol.interaction.DoubleClickZoom());
    }
  }

  function enableDoubleClickZoom() {
    setTimeout(() => {
      addDoubleClickZoomInteraction(map);
    }, 100);
  }

  function onSelectAdd(e) {
    if (e.target && e.target.getLength() > 0) {
      const feature = e.target.item(0);

      const selectedStyle = createStyle();
      feature.setStyle(selectedStyle);
    }
  }

  function onModifyEnd(evt) {
    if (evt.features && evt.features.getLength() > 0) {
      const feature = evt.features.item(0);

      // Update coordinates after modification
      if (pointerMoveHandler) {
        const fakeEvent = { feature };
        pointerMoveHandler(fakeEvent);
      } else {
        console.warn('pointerMoveHandler not available - coordinates not updated');
      }
      console.log('Feature modified, coordinates updated');
    }
  }

  function onDrawEnd(evt) {
    const feature = evt.feature;

    enableDoubleClickZoom();

    if (stylewindow && stylewindow.getStyleObject) {
      const styleObject = stylewindow.getStyleObject(feature);
      feature.set('origostyle', styleObject);
    }

    if (!select) {
      select = new Select({
        layers: [geouttagLayer],
        style: null,
        hitTolerance: 5
      });
      map.addInteraction(select);

      select.getFeatures().on('add', onSelectAdd);
    }

    if (!modify) {
      modify = new Modify({
        features: select.getFeatures()
      });
      map.addInteraction(modify);
      modify.on('modifyend', onModifyEnd);
    }

    if (select) {
      select.getFeatures().clear();
      select.getFeatures().push(feature);
    }

    // Deactivate drawing after completion
    if (geouttag) {
      if (map && typeof map.removeInteraction === 'function') {
        map.removeInteraction(geouttag);
      } else {
        console.warn('Map not provided; could not remove draw interaction');
      }
    }
    console.log('Draw completed for export area');
  }

  function onSelectRemove(e) {
    if (e.element) {
      console.log('Deselected feature:', e.element);
    }
  }

  return {
    name: 'GeouttagDrawHandler',
    setGeouttagInteraction,
    setGeouttagLayer,
    initializeMap,
    createStyle,
    disableDoubleClickZoom,
    onDrawStart,
    addDoubleClickZoomInteraction,
    enableDoubleClickZoom,
    onSelectAdd,
    onSelectRemove,
    onModifyEnd,
    onDrawEnd
  };
};

export default GeouttagDrawHandler;
