import 'Origo';
import downloadBlob from './download';
/* global JSZip */

// Module-scope so the PKCE verifier survives the Portal redirect and token exchange.
let storedCodeVerifier = null;

/* The OAuth callback can reuse the popup as the raster export progress window. */
export async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const authError = params.get('error');
  if (authError && window.opener && typeof window.opener.oauthCallback === 'function') {
    window.stop();
    const keepWindowOpen = await window.opener.oauthCallback(null, window, authError);
    if (!keepWindowOpen) window.close();
    return;
  }

  const code = params.get('code');
  if (code && window.opener && typeof window.opener.oauthCallback === 'function') {
    window.stop();
    const keepWindowOpen = await window.opener.oauthCallback(code, window);
    if (!keepWindowOpen) window.close();
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
/*
Function that checks whether the session has a valid access token that has not expired.
Checks a stored session before reusing it
*/
export function isArcGISSessionValid(session) {
  if (!session || !session.access_token) return false;
  if (!session.expires_at) return true; // no expiry info available — assume valid until ArcGIS says otherwise
  return session.expires_at > Date.now() + 5000; // A small safety margin avoids sending a request with a token that expires very soon ( within 5 seconds)
}

const ImageServer = function ImageServer(options = {}) {
  const {
    predefinedExports = [],
    arcgisSession = null,
    arcgisClientId,
    arcgisTokenEndpoint,
    arcgisAuthorizationEndpoint,
    userInfoComp,
    getString
  } = options;
  let currentSession = arcgisSession;
  let onAuthChangeCallback;
  let onAuthFailureCallback;
  const pendingRasterExports = new Set();
  let rasterAuthInProgress = false;
  let rasterAuthWindow = null;
  let rasterAuthWindowMonitor = null;

  // Helper to open ArcGIS OAuth popup (Authorization Code with PKCE)
  async function openArcGISAuth(existingWindow) {
    const popupWidth = 600;
    const popupHeight = 400;
    const left = Math.max(0, Math.round((window.screen.availWidth - popupWidth) / 2));
    const top = Math.max(0, Math.round((window.screen.availHeight - popupHeight) / 2));

    const authWindow = existingWindow || window.open('about:blank', 'oauth-window', `height=${popupHeight},width=${popupWidth},left=${left},top=${top},menubar=no,location=yes,resizable=yes,scrollbars=yes,status=yes`);

    const codeVerifier = generateRandomString();
    const codeChallenge = await challengeFromVerifier(codeVerifier);
    storedCodeVerifier = codeVerifier;
    const redirectUri = window.location.href;
    const authorizationEndpoint = `${arcgisAuthorizationEndpoint}?client_id=${arcgisClientId}&code_challenge=${codeChallenge}&code_challenge_method=S256&redirect_uri=${window.encodeURIComponent(redirectUri)}&response_type=code&expiration=20160`;

    if (authWindow) authWindow.location.href = authorizationEndpoint;
    return authWindow;
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

  function writeExportProgressWindow(exportWindow, title, message, showSpinner = true) {
    exportWindow.document.open();
    exportWindow.document.write(`
      <!DOCTYPE html>
      <html lang="sv">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${title}</title>
          <style>
            body {
              width: 100vw;
              height: 100vh;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              font-family: Arial, sans-serif;
              overflow: hidden;
            }
            .spinner {
              border: 4px solid #f3f3f3;
              border-top: 4px solid #3498db;
              border-radius: 50%;
              width: 60px;
              height: 60px;
              animation: spin 1s linear infinite;
              margin-bottom: 20px;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            .message {
              font-size: 18px;
              color: #333;
              text-align: center;
              padding: 0 20px;
            }
          </style>
        </head>
        <body>
          <div class="spinner"${showSpinner ? '' : ' style="display:none;"'}></div>
          <p class="message">${message}</p>
        </body>
      </html>
    `);
    exportWindow.document.close();
  }

  function openExportProgressWindow(title, message, showSpinner) {
    const exportWindow = window.open('', '_blank');
    if (exportWindow) writeExportProgressWindow(exportWindow, title, message, showSpinner);
    return exportWindow;
  }

  function updateExportProgressWindow(exportWindow, message, isError = false, showSpinner = true) {
    if (!exportWindow || exportWindow.closed) return;
    const messageElement = exportWindow.document.querySelector('.message');
    const spinner = exportWindow.document.querySelector('.spinner');
    if (messageElement) {
      messageElement.textContent = message;
      if (isError) messageElement.style.color = 'red';
    }
    if (spinner) spinner.style.display = isError || !showSpinner ? 'none' : '';
  }

  function finishRasterExport(exportJob, { blob, fileName, error } = {}) {
    pendingRasterExports.delete(exportJob);
    const { progressWindow } = exportJob;
    if (error) {
      console.error('Raster export failed:', error);
      if (progressWindow && !progressWindow.closed) {
        if (progressWindow === rasterAuthWindow) {
          writeExportProgressWindow(
            progressWindow,
            getString('downloadingRasterTitle'),
            getString('exportErrorText'),
            false
          );
          updateExportProgressWindow(progressWindow, getString('exportErrorText'), true);
        } else {
          updateExportProgressWindow(progressWindow, getString('exportErrorText'), true);
        }
      } else {
        alert(getString('exportErrorText'));
      }
    } else {
      downloadBlob(blob, fileName);
      if (progressWindow && !progressWindow.closed) progressWindow.close();
    }
  }

  function clearRasterAuthMonitor() {
    if (rasterAuthWindowMonitor) {
      window.clearInterval(rasterAuthWindowMonitor);
      rasterAuthWindowMonitor = null;
    }
  }

  function failPendingRasterAuth(error) {
    const pendingJobs = Array.from(pendingRasterExports);
    const keepAuthWindow = pendingJobs.some((job) => job.progressWindow === rasterAuthWindow);
    pendingJobs.forEach((job) => finishRasterExport(job, { error }));
    rasterAuthInProgress = false;
    clearRasterAuthMonitor();
    if (!keepAuthWindow && rasterAuthWindow && !rasterAuthWindow.closed) {
      rasterAuthWindow.close();
    }
    rasterAuthWindow = null;
  }

  function monitorPendingRasterAuth() {
    clearRasterAuthMonitor();
    rasterAuthWindowMonitor = window.setInterval(() => {
      if (!rasterAuthInProgress || pendingRasterExports.size === 0) {
        clearRasterAuthMonitor();
      } else if (!rasterAuthWindow || rasterAuthWindow.closed) {
        failPendingRasterAuth(new Error('ArcGIS sign-in window was closed.'));
      }
    }, 500);
  }

  function queueRasterExportForAuth(exportJob) {
    pendingRasterExports.add(exportJob);
    if (rasterAuthInProgress) return;

    rasterAuthInProgress = true;
    openArcGISAuth()
      .then((authWindow) => {
        if (!rasterAuthInProgress) return;
        if (authWindow) {
          rasterAuthWindow = authWindow;
        } else {
          const fallbackJob = Array.from(pendingRasterExports)
            .find((job) => job.progressWindow && !job.progressWindow.closed);
          if (!fallbackJob) {
            failPendingRasterAuth(new Error('Could not open the ArcGIS sign-in window.'));
            return;
          }
          rasterAuthWindow = fallbackJob.progressWindow;
          openArcGISAuth(rasterAuthWindow)
            .then(monitorPendingRasterAuth)
            .catch((error) => failPendingRasterAuth(error));
          return;
        }
        monitorPendingRasterAuth();
      })
      .catch((error) => failPendingRasterAuth(error));
  }

  function handleInvalidArcgisSession(exportJob) {
    currentSession = null;
    localStorage.removeItem('__ARCGIS_USER_SESSION__');
    const userInfoEl = userInfoComp && document.getElementById(userInfoComp.getId());
    if (userInfoEl) {
      userInfoEl.style.display = 'none';
      userInfoEl.innerHTML = '';
    }
    if (onAuthChangeCallback) onAuthChangeCallback(null);
    updateExportProgressWindow(
      exportJob.progressWindow,
      getString('waitingForArcgisAuthText'),
      false,
      false
    );
    queueRasterExportForAuth(exportJob);
  }

  /* Construct and open ArcGIS ImageServer download URL for imageServer export */
  function sendArcGISRequest(sessionOverride, exportJob) {
    const { progressWindow, selection, geometry: exportGeometry } = exportJob;
    const reportError = (error) => {
      console.error('ArcGIS download failed:', error);
      finishRasterExport(exportJob, { error });
    };

    const selectedProduct = predefinedExports.find((p) => p.name === selection.productName);
    if (!selectedProduct || !selectedProduct.imageServer) {
      reportError(new Error('No raster product selected'));
      return;
    }

    const selectedFormat = selection.outputFormat;
    if (!selectedFormat) {
      reportError(new Error('No format selected for ArcGIS imageServer download'));
      return;
    }

    const session = sessionOverride || currentSession;
    if (!session || !session.access_token) {
      reportError(new Error('No ArcGIS session available. Please sign in first.'));
      return;
    }

    // Prefer the drawn polygon (freehand tool) if available, otherwise fall back to the bounding box
    let geometry;
    let geometryType;
    if (exportGeometry.coords && exportGeometry.coords.length > 0) {
      const ring = exportGeometry.coords.map((coord) => [coord[0], coord[1]]);
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push([first[0], first[1]]);
      }
      geometry = JSON.stringify({ rings: [ring] });
      geometryType = 'esriGeometryPolygon';
    } else if (exportGeometry.x1 !== undefined && exportGeometry.y1 !== undefined
      && exportGeometry.x2 !== undefined && exportGeometry.y2 !== undefined) {
      geometry = `${exportGeometry.x1},${exportGeometry.y1},${exportGeometry.x2},${exportGeometry.y2}`;
      geometryType = 'esriGeometryEnvelope';
    } else {
      reportError(new Error('No extent available. Please draw an area first.'));
      return;
    }

    const token = session.access_token;
    let sessionExpired = false;

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
          const errorCode = data.error.code;
          const errorMessage = data.error.message || 'ArcGIS returned an error';
          if (errorCode === 498 || errorCode === 499 || /invalid token|token required/i.test(errorMessage)) {
            sessionExpired = true;
            handleInvalidArcgisSession(exportJob);
            throw new Error(getString('arcgisSessionExpiredText').replace('{0}', errorMessage));
          }
          throw new Error(errorMessage);
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

        updateExportProgressWindow(progressWindow, getString('downloadingRasterText'));

        // Load JSZip from CDN
        await loadJSZip();

        updateExportProgressWindow(progressWindow, getString('creatingZipText'));

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

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const safeProductName = selectedProduct.name.replace(/[\\/:*?"<>|]/g, '_');
        const zipFileName = `${safeProductName}_${new Date().getTime()}.zip`;
        finishRasterExport(exportJob, { blob: zipBlob, fileName: zipFileName });
      })
      .catch((error) => {
        if (sessionExpired) {
          return;
        }
        reportError(error);
      });
  }

  function resumePendingRasterExports(authWindow) {
    if (!currentSession || !currentSession.access_token || pendingRasterExports.size === 0) return false;

    const pendingJobs = Array.from(pendingRasterExports);
    const keepAuthWindow = pendingJobs.some((job) => job.progressWindow === authWindow);
    pendingJobs.forEach((job) => pendingRasterExports.delete(job));
    rasterAuthInProgress = false;
    rasterAuthWindow = null;
    clearRasterAuthMonitor();

    pendingJobs.forEach((job) => {
      if (job.progressWindow === authWindow && !job.progressWindow.closed) {
        writeExportProgressWindow(
          job.progressWindow,
          getString('downloadingRasterTitle'),
          getString('downloadingRasterText')
        );
      } else {
        updateExportProgressWindow(job.progressWindow, getString('downloadingRasterText'));
      }
      sendArcGISRequest(currentSession, job);
    });
    return keepAuthWindow;
  }

  function startExport({
    productName, outputFormat, coords, x1, y1, x2, y2
  }) {
    const hasValidSession = isArcGISSessionValid(currentSession);
    const progressWindow = openExportProgressWindow(
      getString('downloadingRasterTitle'),
      getString(hasValidSession ? 'downloadingRasterText' : 'waitingForArcgisAuthText'),
      hasValidSession
    );
    if (!progressWindow) {
      alert(getString('popupBlockedExportAlertText'));
      return false;
    }

    const exportJob = {
      progressWindow,
      selection: { productName, outputFormat },
      geometry: {
        coords: Array.isArray(coords) ? coords.map((coordinate) => coordinate.slice()) : coords,
        x1,
        y1,
        x2,
        y2
      }
    };
    if (hasValidSession) {
      sendArcGISRequest(currentSession, exportJob);
    } else {
      queueRasterExportForAuth(exportJob);
    }
    return true;
  }

  /* Wires up the ArcGIS OAuth flow and restores a saved session from localStorage. */
  function setupArcGISAuth({ onAuthChange, onAuthFailure } = {}) {
    onAuthChangeCallback = onAuthChange;
    onAuthFailureCallback = onAuthFailure;

    function updateAuthUI(sessionInfo, authWindow) {
      currentSession = sessionInfo || null;
      const userInfoEl = userInfoComp && document.getElementById(userInfoComp.getId());

      if (!currentSession) {
        localStorage.removeItem('__ARCGIS_USER_SESSION__');
        if (userInfoEl) {
          userInfoEl.style.display = 'none';
          userInfoEl.innerHTML = '';
        }
      } else {
        localStorage.setItem('__ARCGIS_USER_SESSION__', JSON.stringify(currentSession));
        if (userInfoEl) userInfoEl.style.display = '';
      }

      if (onAuthChangeCallback) onAuthChangeCallback(currentSession);
      if (currentSession && currentSession.access_token) {
        return resumePendingRasterExports(authWindow);
      }
      return false;
    }

    function handleAuthFailure(error, authWindow) {
      console.error('ArcGIS sign-in failed:', error);
      if (onAuthFailureCallback) onAuthFailureCallback(error);
      const keepAuthWindow = Array.from(pendingRasterExports)
        .some((job) => job.progressWindow === authWindow);
      failPendingRasterAuth(error);
      return keepAuthWindow;
    }

    // Expose oauthCallback on window so the OAuth popup can reach it.
    // Access the response from the endpoint. If the request was valid,
    // the response will contain an access_token, refresh_token, username, and other session information
    window.oauthCallback = async (authResponse, authWindow, authError) => {
      try {
        if (authError) {
          return handleAuthFailure(new Error(authError), authWindow);
        }

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
            const responseText = await response.text();
            const error = new Error(`ArcGIS token exchange failed: ${response.status} ${responseText}`);
            console.error(error);
            return handleAuthFailure(error, authWindow);
          }
          const sessionInfo = await response.json();
          if (sessionInfo.access_token) {
            if (sessionInfo.expires_in) {
              sessionInfo.expires_at = Date.now() + (Number(sessionInfo.expires_in) * 1000);
            }
            return updateAuthUI(sessionInfo, authWindow) === true;
          }
          const error = new Error('ArcGIS OAuth failed: no access_token in response');
          console.error(error, sessionInfo);
          return handleAuthFailure(error, authWindow);
        }
        // Implicit grant fallback — authResponse is an object with access_token
        if (authResponse && authResponse.access_token) {
          const responseObj = authResponse;
          if (responseObj.expires_in && !responseObj.expires_at) {
            responseObj.expires_at = Date.now() + (Number(authResponse.expires_in) * 1000);
          }
          return updateAuthUI(responseObj, authWindow) === true;
        }
        const error = new Error('ArcGIS OAuth failed: unrecognized response');
        console.error(error, authResponse);
        return handleAuthFailure(error, authWindow);
      } catch (e) {
        console.error('ArcGIS OAuth callback error', e);
        return handleAuthFailure(e, authWindow);
      }
    };

    // Restore existing session from localStorage on page load
    try {
      const savedSession = localStorage.getItem('__ARCGIS_USER_SESSION__');
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        if (parsed && isArcGISSessionValid(parsed)) {
          updateAuthUI(parsed);
        } else if (parsed) {
          // Stored session has already expired — drop it instead of restoring a session that's
          // guaranteed to fail with "Invalid Token" on first use.
          localStorage.removeItem('__ARCGIS_USER_SESSION__');
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
    startExport,
    generateRandomString,
    challengeFromVerifier,
    openArcGISAuth,
    getCodeVerifier,
    setupArcGISAuth
  };
};

export default ImageServer;
