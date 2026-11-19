async function loadSvgSprites({ svgResourcePath }) {
  const resourcePath = typeof svgResourcePath === 'string' ? svgResourcePath.trim() : '';

  if (!resourcePath) {
    console.warn('Geouttag plugin svg sprite path is missing or empty.');
    return;
  }

  let resourceUrl;
  try {
    resourceUrl = new URL(resourcePath, window.location.href);
  } catch (error) {
    console.warn('Geouttag plugin svg sprite path is not a valid URL:', resourcePath, error);
    return;
  }

  const allowedProtocols = ['http:', 'https:', 'file:', 'blob:'];
  if (!allowedProtocols.includes(resourceUrl.protocol)) {
    console.warn('Geouttag plugin svg sprite path uses an unsupported protocol:', resourceUrl.href);
    return;
  }

  if (!/\.svg(?:$|[?#])/i.test(resourceUrl.pathname)) {
    console.warn('Geouttag plugin svg sprite path does not point to an SVG file:', resourceUrl.href);
    return;
  }

  try {
    const svgResponse = await fetch(resourceUrl.href);
    if (svgResponse.ok) {
      const svgText = await svgResponse.text();
      const div = document.createElement('div');
      div.id = 'geouttag-materials';
      div.style = 'display: none';
      div.innerHTML = svgText;
      document.body.prepend(div);
      return;
    }

    console.error('Error loading Geouttag plugin svg sprites:', resourceUrl.href, svgResponse.status);
  } catch (error) {
    console.error('Error loading Geouttag plugin svg sprites:', resourceUrl.href, error);
  }
}

export default loadSvgSprites;
