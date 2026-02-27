/* eslint-disable no-console */

const GeouttagDrawHandler = function GeouttagDrawHandler(options = {}) {
  const {
    stylewindow,
    pointerMoveHandler,
    Origo,
    warningLimit,
    errorLimit,
    updateExportButtonState,
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
      // Re-evaluate style based on updated geometry
      try {
        if (typeof feature.changed === 'function') feature.changed();
      } catch (err) {
        console.warn('Could not refresh feature style after modify:', err);
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

    if (stylewindow && stylewindow.getStyleObject) {
      const styleObject = stylewindow.getStyleObject(feature);
      feature.set('origostyle', styleObject);
    }

      if (!select) {
      console.log('creating a new select')
      select = new Select({
        layers: [geouttagLayer],
        style: styleFunction,
        hitTolerance: 5
      });
      map.addInteraction(select);

      select.getFeatures().on('add', onSelectAdd);
    }

    const translateInteraction = new Translate({
      layers: [geouttagLayer]
    });
    map.addInteraction(translateInteraction);

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
