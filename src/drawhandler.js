/* eslint-disable no-console */
import 'Origo';
const { Style, Fill, Stroke, Text } = Origo.ol.style;
import styles from './styles';


const GeouttagDrawHandler = function GeouttagDrawHandler(options = {}) {
  const {
    stylewindow,
    pointerMoveHandler,
    Origo,
    warningLimit,
    errorLimit,
    updateExportButtonState,
    selectedStyleFunction,
    styleFunction
  } = options;

  const DoubleClickZoom = Origo.ol.interaction.DoubleClickZoom;

  const { Select, Modify, Translate } = Origo.ol.interaction;

  let geouttagLayer;
  let geouttag;
  let map;
  let select;
  let modify;
  let translate;

  // default style for the rectangle

  function setGeouttagInteraction(interaction) {
    geouttag = interaction;
  }

  function setGeouttagLayer(layer) { // method for the drawhandler to become aware of the current vector layer
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
    //const feature = evt.feature;
    //feature.setStyle(styleFunction);

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

      // Selected features use the layer/select styleFunction; trigger a redraw
      try {
        if (typeof feature.changed === 'function') feature.changed();
      } catch (err) {
        console.warn('Could not refresh selected feature style:', err);
      }
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

      try {
        if (typeof updateExportButtonState === 'function') updateExportButtonState();
      } catch (err) {
        console.warn('Could not call updateExportButtonState after modify:', err);
      }
      console.log('Feature modified, coordinates updated');
    }
  }

  function onDrawEnd(evt) {
    const feature = evt.feature;



    //enableDoubleClickZoom();

    /*if (stylewindow && stylewindow.getStyleObject) {
      const styleObject = stylewindow.getStyleObject(feature);
      feature.set('origostyle', styleObject);
    } */

    if (!select) {
      select = new Select({
        layers: [geouttagLayer],
        style: selectedStyleFunction,
        hitTolerance: 5
      });
      map.addInteraction(select);
      // Select hanterar selekterad - inte selekterad själv genom att applicera sin stil när selekterad
      // så ha "aktiv" stil för selekterad och låt lagret starta på "inaktiv"
      // select.getFeatures().on('remove', onSelectRemove);

     // select.getFeatures().on('add', onSelectAdd);
    }

    const translateInteraction = new Translate({
      layers: [geouttagLayer]
    });
    map.addInteraction(translateInteraction);

    if (modify) {
      console.log('modify was already defined so removing this interaction')
      map.removeInteraction(modify)
    }
    console.log('creating a new modify')
    modify = new Modify({
      features: select.getFeatures()
    });
    map.addInteraction(modify);
    modify.on('modifyend', onModifyEnd);

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

  function onSelectRemove() {
    console.log('selection removed, setting style to the original styleFunction')
    geouttagLayer.setStyle(selectedStyleFunction)
  }

  return {
    name: 'GeouttagDrawHandler',
    setGeouttagInteraction,
    setGeouttagLayer,
    initializeMap,
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
