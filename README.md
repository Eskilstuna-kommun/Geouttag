# Geouttag
Geouttag plugin for Origo using FME server Web Services. The user may draw a rectangle over the area to be exported, as well as choose a list of predefined layers/data sources to export.

(<i>Is compatible with Origo v2.9</i>)

Geouttag is only used without any other plugins so the functionality can not be guaranteed if such use.
(It autostarts and claims the mouse cursor and cannot be turned off)

#### Example usage of Geouttag as plugin
The plugin can be loaded like this in an html-file:
```html
  <head>
	...
	<link href="plugins/geouttag.css" rel="stylesheet">
	</head>
	...
  <script src="js/origo.min.js"></script>
  <script src="plugins/geouttag.min.js"></script>
  <script type="text/javascript">
      const origo = Origo('index.json');
      origo.on('load', function(viewer) {
      
      const geouttag = Geouttag({
        url: "URL to FME",
        filePath: "any path where user can get the export",
        contactMail: "support mail",
        infoLink: "link to user instructions",
        logo: "img/logo.png",
        warningLimit: 500*500,
        warningTooltip: "warning text hover",
        warningText: "warning text in modal",
        errorLimit: 2000*2000,
        errorTooltip: "error text hover",
        errorText: "error text in modal",
        infoText: "Informative description for users",
        predefinedExports: [
          {
            name: 'base',
            title: 'Base map',
            filetypes: [
              {
                title: 'DWG',
                outputFormat: 'DWG', // 'outputFormat' is sent as a query param in the FME Flow request for the workspace to do with as it pleases
                workspace: 'basemap.fmw'
              },
              {
                title: 'Shape',
                outputFormat: 'SHP',
                workspace: 'basemap.fmw'
              }
            ]
          },
          {
            name: 'cyclingmap',
            title: 'Cycling map',
            filetypes: [
              {
                title: 'DWG',
                workspace: 'cycling_cad.fmw'
              },
              {
                title: 'Shape',,
                workspace: 'cycling_shape.fmw'
              }
            ],
            restricted: true
          },
          {
            name: 'hojddata_nh_grid',
            title: 'National elevation data 2015',
            filetypes: [
              {
                title: 'ESRI GRID',
                workspace: 'grid_elev.fmw'
              }
            ]
          }
        ],
        maplayerExport: {
        filetypes: [
          {
            title: 'GML3',
            outputFormat: 'GML3'
          },
          {
            title: 'GeoJSON',
            outputFormat: 'application/json'
          },
          {
            title: 'dxf',
            outputFormat: 'dxf'
          },
          {
            title: 'GeoPackage',
            outputFormat: 'geopkg'

          }
        ],
        workspace: 'maplayers_wfs.fmw'
      } 
		});
    viewer.addComponent(geouttag);
                
    });
        </script>
```
