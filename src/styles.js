const { Style, Fill, Stroke, Text } = Origo.ol.style;

const styleFunctions = {
  defaultStyle: function defaultStyle() {
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
        textAlign: 'center',
        textBaseline: 'middle',
        fill: new Fill({ color: '#000' }),
        stroke: new Stroke({ color: '#fff', width: 3 }),
        offsetY: -10
      })
    });
  },
  warningStyle: function warningStyle() {
    return new Style({
      fill: new Fill({
        color: 'rgba(255,192,203,0.45)'
      }),
      stroke: new Stroke({
        color: 'rgba(255,0,0,0.9)',
        width: 2
      }),
      text: new Text({
        text: 'För stort område',
        font: '14px Calibri,sans-serif',
        fill: new Fill({ color: '#000' }),
        stroke: new Stroke({ color: '#fff', width: 3 }),
        offsetY: -10
      })
    });
  }
};

export default styleFunctions;
