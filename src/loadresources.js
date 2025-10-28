const svgPath = 'plugins/geouttag/';
const svgSprites = ['material-icons.svg'];

async function loadSvgSprites() {
  const svgResponse = await fetch(svgPath + svgSprites[0]);
  if (svgResponse.ok) {
    const svgText = await svgResponse.text();
    const div = document.createElement('div');
    div.id = 'geouttag-materials';
    div.style = 'display: none';
    div.innerHTML = svgText;
    document.body.prepend(div);
  } else {
    console.error('Error loading Geouttag plugin svg sprites:', svgResponse.status);
  }
}

export default loadSvgSprites;
