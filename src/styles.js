const { Style, Fill, Stroke, Text, Circle } = Origo.ol.style;

const styleComponents = {
  standardInteractionText: 'Area att exportera',
  warningInteractionText: 'Area för stor',
  standardInteractionFill: 'rgba(0,153,255, 0.2)',
  deselectedBlueFill: 'rgba(0,153,255,0.2)',
  warningInteractionFill: 'rgba(255,192,203,0.45)',
  standardInteractionStroke: 'rgba(0,153,255,1)',
  warningInteractionStroke: 'rgba(255,0,0,0.9)'
};

const styles = {
  drawCursorStyle: new Style({
    image: new Circle({
      radius: 5,
      fill: new Fill({ color: 'rgba(0, 153, 255, 0.7)' }),
      stroke: new Stroke({ color: 'rgba(0, 153, 255, 1)', width: 2 })
    })
  }),
  standardInteractionStyle: new Style({
    fill: new Fill({
      color: styleComponents.standardInteractionFill
    }),
    stroke: new Stroke({
      color: styleComponents.standardInteractionStroke,
      width: 3
    }),
    image: new Circle({
      radius: 7,
      fill: new Fill({ color: '#3399CC' }),
      stroke: new Stroke({ color: 'white', width: 2 })
    })
  }),
  standardCompletedStyle: new Style({
    fill: new Fill({
      color: styleComponents.standardInteractionFill
    }),
    stroke: new Stroke({
      color: styleComponents.standardInteractionStroke,
      width: 3
    })
  }),
  warningStyle: new Style({
    fill: new Fill({
      color: styleComponents.warningInteractionFill
    }),
    stroke: new Stroke({
      color: styleComponents.warningInteractionStroke,
      width: 3
    }),
    text: new Text({
      text: styleComponents.warningInteractionText,
      font: '14px Calibri,sans-serif',
      fill: new Fill({ color: '#000' }),
      stroke: new Stroke({ color: '#fff', width: 3 }),
      offsetY: -10
    })
  }),
  extraStrokeStyle: new Style({
    stroke: new Stroke({ color: [250, 250, 250, 0.4], width: 5 })
  }),
  deselectedBlueFill: new Style({
    fill: new Fill({
      color: styleComponents.deselectedBlueFill
    })
  })
};

export default styles;
