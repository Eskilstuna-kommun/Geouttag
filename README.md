# Geouttag
Geouttag plugin for Origo using FME server Web Services.

(<i>Is compatible with EK-extern and origo-map v2.3.1</i>)

Geouttag is only used without any other plugins so the functionality can not be guaranteed if such use.

#### Example usage of Geouttag as plugin
The plugin can be loaded like this in an html-file:
```
        <head>
	...
	<link href="plugins/geouttag.css" rel="stylesheet">
	</head>
	...
        <script src="js/origo.min.js"></script>
        <script src="plugins/geouttag.min.js"></script>
        <script type="text/javascript">
            var origo = Origo('index.json');
            origo.on('load', function(viewer) {

                var geouttag = Geouttag({
			url: "URL to FME",
			filepath: "any path where user can get the export",
			contactmail: "support mail",
			infolink: "link to user instructions",
			logo: "img/logo.png",
			warninglimit: 500*500,
			warningtooltip: "warning text hover",
			warningtext: "warning text in modal",
			errorlimit: 2000*2000,
			errortooltip: "error text hover",
			errortext: "error text in modal",
			infotext: "Informative description for users",
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
