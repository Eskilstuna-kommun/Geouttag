import 'Origo';
/* global JSZip */

// Module-scope so the PKCE code verifier survives between the openArcGISAuth() call
// (which opens the popup) and the later oauthCallback token exchange, even though a
// fresh ImageServer() instance is created for each of those calls.
let storedCodeVerifier = null;

/* Self-callback detection: when the ArcGIS OAuth popup redirects back to this same page
   with ?code=... (or an error), this closes the popup and hands the code back to the
   opener window via window.opener.oauthCallback(). Must be called once, at module load
   time in geouttag.js, before the rest of the app initializes. */
export function handleOAuthCallback() {
  // If user cancelled (error in query string), just close the popup silently
  if (window.location.search && window.location.search.match(/[?&]error=/)) {
    if (window.opener) {
      window.stop();
      window.close();
    }
    return;
  }

  // PKCE flow: authorization code in query string (?code=...)
  if (window.location.search) {
    const match = (window.location.search) ? window.location.search.match(/\?code=([^&]+)/) : false;
    if (match[1]) {
      window.opener.oauthCallback(match[1]);
    }
    window.close();
  }
}

// ── PKCE helper functions for ArcGIS OAuth 2.0 Authorization Code with PKCE ──
function dec2hex(dec) {
  return (`0${dec.toString(16)}`).substr(-2);
}

function generateRandomString() {
  const array = new Uint32Array(56 / 2);
  window.crypto.getRandomValues(array);
  return Array.from(array, dec2hex).join('');
}

async function challengeFromVerifier(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const sha256 = await window.crypto.subtle.digest('SHA-256', data);
  let str = '';
  const bytes = new Uint8Array(sha256);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i += 1) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const ImageServer = function ImageServer(options = {}) {
  const {
    predefinedExports = [],
    productSelect,
    fileTypeSelect,
    arcgisSession = null,
    arcgisClientId,
    arcgisTokenEndpoint,
    userInfoComp,
    coords,
    x1,
    y1,
    x2,
    y2
  } = options;

  // Helper to open ArcGIS OAuth popup (Authorization Code with PKCE)
  async function openArcGISAuth() {
    const codeVerifier = generateRandomString();
    const codeChallenge = await challengeFromVerifier(codeVerifier);
    storedCodeVerifier = codeVerifier;
    const redirectUri = window.location.href;
    const authorizationEndpoint = `https://geo.eskilstuna.se/portal/sharing/rest/oauth2/authorize?client_id=${arcgisClientId}&code_challenge=${codeChallenge}&code_challenge_method=S256&redirect_uri=${window.encodeURIComponent(redirectUri)}&response_type=code&expiration=20160`;
    const popupWidth = 600;
    const popupHeight = 400;
    const left = Math.max(0, Math.round((window.screen.availWidth - popupWidth) / 2));
    const top = Math.max(0, Math.round((window.screen.availHeight - popupHeight) / 2));
    window.open(authorizationEndpoint, 'oauth-window', `height=${popupHeight},width=${popupWidth},left=${left},top=${top},menubar=no,location=yes,resizable=yes,scrollbars=yes,status=yes`);
  }

  function getCodeVerifier() {
    return storedCodeVerifier;
  }

  /* Helper: extract a plain URL from the id field (handles possible markdown link syntax) */
  function extractUrlFromId(idValue) {
    if (!idValue) return '';
    const markdownMatch = idValue.match(/^\[([^\]]*)\]\(([^)]*)\)$/);
    if (markdownMatch) {
      return markdownMatch[2] || markdownMatch[1];
    }
    return idValue;
  }

  /* Helper: load JSZip from CDN dynamically */
  function loadJSZip() {
    return new Promise((resolve, reject) => {
      if (window.JSZip) {
        resolve(window.JSZip);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = () => resolve(window.JSZip);
      script.onerror = () => reject(new Error('Failed to load JSZip from CDN'));
      document.head.appendChild(script);
    });
  }

  /* Construct and open ArcGIS ImageServer download URL for imageServer export */
  function sendArcGISRequest(sessionOverride) {
    // Only proceed if the selected product has imageServer: true
    const productSelectElement = document.getElementById(productSelect.getId());
    const selectedProduct = predefinedExports.find((p) => p.name === productSelectElement?.value);
    if (!selectedProduct || !selectedProduct.imageServer) {
      return;
    }

    const fileTypeSelectElement = document.getElementById(fileTypeSelect.getId());
    const selectedFormat = fileTypeSelectElement.value;

    if (!selectedFormat) {
      console.error('No format selected for ArcGIS imageServer download');
      return;
    }

    const session = sessionOverride || arcgisSession;
    if (!session || !session.access_token) {
      console.error('No ArcGIS session available. Please sign in first.');
      return;
    }

    // Prefer the drawn polygon (freehand tool) if available, otherwise fall back to the bounding box
    let geometry;
    let geometryType;
    if (coords && coords.length > 0) {
      const ring = coords.map((coord) => [coord[0], coord[1]]);
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push([first[0], first[1]]);
      }
      geometry = JSON.stringify({ rings: [ring] });
      geometryType = 'esriGeometryPolygon';
    } else if (x1 !== undefined && y1 !== undefined && x2 !== undefined && y2 !== undefined) {
      geometry = `${x1},${y1},${x2},${y2}`;
      geometryType = 'esriGeometryEnvelope';
    } else {
      console.error('No extent available. Please draw an area first.');
      return;
    }

    const token = session.access_token;

    // Build the base ImageServer download URL (use f=json to get individual file URLs)
    const jsonUrl = `https://geo.eskilstuna.se/imageserver/rest/services/${selectedProduct.name}/ImageServer/download?rasterIds=1&geometry=${encodeURIComponent(geometry)}&geometryType=${geometryType}&format=${selectedFormat}&f=json&token=${token}`;

    fetch(jsonUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`ArcGIS download request failed: ${response.status}`);
        }
        return response.json();
      })
      .then(async (data) => {
        if (data.error) {
          throw new Error(data.error.message || 'ArcGIS returned an error');
        }

        // Extract download URLs and file info from rasterFiles
        const files = [];
        if (data.rasterFiles && Array.isArray(data.rasterFiles)) {
          data.rasterFiles.forEach((item) => {
            const downloadUrl = extractUrlFromId(item.id);
            if (downloadUrl) {
              const urlPath = downloadUrl.split('?')[0];
              const fileName = urlPath.split('/').pop() || `fil_${files.length}`;
              files.push({ url: downloadUrl, name: fileName, size: item.size });
            }
          });
        } else if (data.href) {
          const hrefUrl = extractUrlFromId(data.href);
          if (hrefUrl) {
            const urlPath = hrefUrl.split('?')[0];
            files.push({ url: hrefUrl, name: urlPath.split('/').pop() || 'raster_output' });
          }
        }

        if (files.length === 0) {
          throw new Error('No download URLs found in the response');
        }

        // Open a progress window
        const downloadWindow = window.open('', '_blank');
        if (!downloadWindow) {
          alert('Kunde inte öppna nedladdningsfönstret. Kontrollera att popup-blockerare är avstängd för denna sida.');
          return;
        }

        // Show a spinner page while we work
        downloadWindow.document.write(`
          <!DOCTYPE html>
          <html lang="sv">
            <head>
              <meta charset="UTF-8">
              <title>Laddar ner raster...</title>
              <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                  width: 100vw; height: 100vh;
                  display: flex; flex-direction: column;
                  justify-content: center; align-items: center;
                  background: #f0f4f8;
                  font-family: 'Segoe UI', Arial, sans-serif;
                }
                .spinner {
                  border: 4px solid #e0e0e0;
                  border-top: 4px solid #3498db;
                  border-radius: 50%;
                  width: 50px; height: 50px;
                  animation: spin 1s linear infinite;
                  margin-bottom: 1.5rem;
                }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                p { color: #555; font-size: 1.1rem; text-align: center; padding: 0 2rem; }
                .progress-text { color: #888; font-size: 0.9rem; margin-top: 0.5rem; }
              </style>
            </head>
            <body>
              <div class="spinner"></div>
              <p>Laddar ner raster från imageserver...</p>
              <p class="progress-text">Skapar ZIP-fil när nedladdningen är klar</p>
            </body>
          </html>
        `);
        downloadWindow.document.close();

        // Load JSZip from CDN
        await loadJSZip();

        // Download each file and add to ZIP
        const zip = new JSZip();
        // 'JSZip' is not defined — this is expected since JSZip is loaded dynamically from CDN at runtime (via loadJSZip()),
        // not as a module import. It will work correctly in the browser.
        let downloadedCount = 0;

        // Download all files in parallel, one at a time via reduce chain to avoid lint issues
        await files.reduce(async (previousPromise, file) => {
          await previousPromise;
          try {
            const fileResponse = await fetch(file.url);
            if (!fileResponse.ok) {
              console.warn(`Failed to download ${file.name}: ${fileResponse.status}`);
              return;
            }
            const blob = await fileResponse.blob();
            zip.file(file.name, blob);
            downloadedCount += 1;
          } catch (err) {
            console.warn(`Failed to download ${file.name}:`, err);
          }
        }, Promise.resolve());

        if (downloadedCount === 0) {
          throw new Error('Could not download any files');
        }

        // Generate the ZIP blob
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipBlobUrl = URL.createObjectURL(zipBlob);
        const zipFileName = `${selectedProduct.name}_${new Date().getTime()}.zip`;

        // Build file list HTML for the success page
        const fileListHtml = files
          .map(
            (f) => `<li>${f.name} ${f.size ? `(${(f.size / 1024).toFixed(0)} KB)` : ''}</li>`
          )
          .join('');

        // Show success page with download button in the new window
        downloadWindow.location.href = URL.createObjectURL(
          new Blob(
            [
              `
          <!DOCTYPE html>
          <html lang="sv">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Raster nedladdning</title>
              <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                  width: 100vw; min-height: 100vh;
                  display: flex; flex-direction: column;
                  align-items: center;
                  background-color: #f0f4f8;
                  font-family: 'Segoe UI', Arial, sans-serif;
                  padding: 2rem;
                }
                .container {
                  max-width: 800px; width: 100%;
                  background: #ffffff;
                  border-radius: 12px;
                  box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                  padding: 2.5rem;
                  margin-top: 2rem;
                  text-align: center;
                }
                .success-icon { font-size: 64px; margin-bottom: 1rem; }
                h1 { color: #000000; font-size: 1.8rem; margin-bottom: 1rem; }
                .message { color: #555; font-size: 1.1rem; margin-bottom: 0.5rem; line-height: 1.6; }
                .sub-message { color: #888; font-size: 0.95rem; margin-bottom: 2rem; }
                .download-button {
                  display: inline-block;
                  font-size: 1.3rem; font-weight: 700;
                  color: #ffffff; background: #007ac2;
                  padding: 1rem 2.5rem;
                  border-radius: 10px;
                  text-decoration: none;
                  transition: background 0.2s, transform 0.1s;
                  margin-bottom: 1.5rem;
                  border: none; cursor: pointer;
                }
                .download-button:hover { background: #007ac2; transform: scale(1.02); }
                .download-button:active { transform: scale(0.98); }
                .file-list {
                  text-align: left; margin: 0 auto; max-width: 500px;
                  background: #f8fafc; border: 1px solid #e2e8f0;
                  border-radius: 8px; padding: 1rem 1.5rem;
                  list-style: none;
                }
                .file-list li { padding: 0.3rem 0; font-size: 0.9rem; color: #555; word-break: break-all; }
                .note { margin-top: 1rem; font-size: 0.85rem; color: #aaa; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>Nedladdning av raster lyckades</h1>

                <a href="${zipBlobUrl}" download="${zipFileName}" class="download-button" id="download-zip-btn">
                  Ladda ner ZIP
                </a>

                <ul class="file-list">
                  ${fileListHtml}
                </ul>

                <p class="note">Export från GeoUttag — ArcGIS ImageServer</p>
              </div>
            </body>
          </html>`
            ],
            { type: 'text/html;charset=utf-8' }
          )
        );
      })
      .catch((error) => {
        console.error('ArcGIS download failed:', error);
        // Fallback: open the HTML page directly
        const fallbackUrl = jsonUrl.replace('f=json', 'f=html');
        const fallbackWindow = window.open(fallbackUrl, '_blank');
        if (!fallbackWindow) {
          alert('Kunde inte öppna nedladdningsfönstret. Kontrollera att popup-blockerare är avstängd för denna sida.');
        }
      });
  }

  /* Wires up the ArcGIS OAuth flow: exposes window.oauthCallback for the popup redirect,
     restores a saved session from localStorage.
     onAuthChange is called whenever the session changes so
     geouttag.js can keep its own arcgisSession state in sync. */
  function setupArcGISAuth({ onAuthChange } = {}) {
    function updateAuthUI(sessionInfo) {
      const userInfoEl = document.getElementById(userInfoComp.getId());

      if (!sessionInfo) {
        localStorage.removeItem('__ARCGIS_USER_SESSION__');
        userInfoEl.style.display = 'none';
        userInfoEl.innerHTML = '';
      } else {
        localStorage.setItem('__ARCGIS_USER_SESSION__', JSON.stringify(sessionInfo));
        userInfoEl.style.display = '';
      }

      if (onAuthChange) onAuthChange(sessionInfo);
    }

    // Expose oauthCallback on window so the OAuth popup can reach it.
    // Access the response from the endpoint. If the request was valid,
    // the response will contain an access_token, refresh_token, username, and other session information
    window.oauthCallback = async (authResponse) => {
      try {
        // PKCE flow — authResponse is an authorization code string
        if (typeof authResponse === 'string' && authResponse.length > 0) {
          const redirectUri = window.location.href;
          const response = await fetch(arcgisTokenEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            }, // ArcGIS Portals token-endpoint do not support application/json
            body: new URLSearchParams({
              client_id: arcgisClientId,
              grant_type: 'authorization_code',
              code: authResponse,
              redirect_uri: redirectUri,
              code_verifier: getCodeVerifier()
            })
          });
          if (!response.ok) {
            console.error('ArcGIS token exchange failed:', response.status, await response.text());
            return;
          }
          const sessionInfo = await response.json();
          if (sessionInfo.access_token) {
            updateAuthUI(sessionInfo);
            sendArcGISRequest(sessionInfo);
          } else {
            console.error('ArcGIS OAuth failed: no access_token in response', sessionInfo);
          }
          return;
        }
        // Implicit grant fallback — authResponse is an object with access_token
        if (authResponse && authResponse.access_token) {
          updateAuthUI(authResponse);
          sendArcGISRequest(authResponse);
          return;
        }
        console.error('ArcGIS OAuth failed: unrecognized response', authResponse);
      } catch (e) {
        console.error('ArcGIS OAuth callback error', e);
      }
    };

    // Restore existing session from localStorage on page load
    try {
      const savedSession = localStorage.getItem('__ARCGIS_USER_SESSION__');
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        if (parsed && parsed.access_token) {
          updateAuthUI(parsed);
        }
      }
    } catch (e) {
      console.warn('Could not restore ArcGIS session:', e);
      localStorage.removeItem('__ARCGIS_USER_SESSION__');
    }
  }

  return {
    name: 'ImageServer',
    sendArcGISRequest,
    generateRandomString,
    challengeFromVerifier,
    openArcGISAuth,
    getCodeVerifier,
    setupArcGISAuth
  };
};

export default ImageServer;
