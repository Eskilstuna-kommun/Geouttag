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
			layers: {
			  background_layer_1: {
			      title : "Layer One",
			      filetypes: {
              DXF : "fmescript.fmw",
              SHP : "fmescript.fmw"
			      }
			  },
			  background_layer_2: { 
			      title : "Layer Two",
			      filetypes: {
              DXF : "fmescript.fmw",
              SHP : "fmescript.fmw",
				      GeoTIFF : "fmescript.fmw"
			      },
			      restricted: true
			  }
			}
		});
    viewer.addComponent(geouttag);
                
    });
        </script>
```
