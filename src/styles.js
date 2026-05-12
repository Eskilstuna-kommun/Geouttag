const { Style, Fill, Stroke, Text } = Origo.ol.style;

const styleComponents = {
  standardInteractionText: 'Area att exportera',
  warningInteractionText: 'Area för stor',
  standardInteractionFill: 'rgba(255, 255, 255, 0.4)',
  warningInteractionFill: 'rgba(255,192,203,0.45)',
  standardInteractionStroke: 'rgba(0,153,255,1)',
  warningInteractionStroke: 'rgba(255,0,0,0.9)'
};

const styles = {
  standardInteractionStyle: new Style({
    fill: new Fill({
      color: styleComponents.standardInteractionFill
    }),
    stroke: new Stroke({
      color: styleComponents.standardInteractionStroke,
      width: 2
    })/* ,
    text: new Text({
      text: styleComponents.standardInteractionText,
      font: '14px Calibri,sans-serif',
      textAlign: 'center',
      textBaseline: 'middle',
      fill: new Fill({ color: '#000' }),
      stroke: new Stroke({ color: '#fff', width: 3 }),
      offsetY: -10
    }) */
  }),
  standardCompletedStyle: new Style({
    fill: new Fill({
      color: styleComponents.standardInteractionFill
    }),
    stroke: new Stroke({
      color: styleComponents.standardInteractionStroke,
      width: 2
    })
  }),
  warningStyle: new Style({
    fill: new Fill({
      color: styleComponents.warningInteractionFill
    }),
    stroke: new Stroke({
      color: styleComponents.warningInteractionStroke,
      width: 2
    }),
    text: new Text({
      text: styleComponents.warningInteractionText,
      font: '14px Calibri,sans-serif',
      fill: new Fill({ color: '#000' }),
      stroke: new Stroke({ color: '#fff', width: 3 }),
      offsetY: -10
    })
  }),
  unSelectedStyle: new Style({
    stroke: new Stroke({ color: [250, 250, 250, 0.4], width: 5 })
  })
};

export default styles;
