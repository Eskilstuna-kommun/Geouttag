# Geouttag
Geouttag plugin for Origo using FME server Web Services.

(Warning: Geouttag was last updated to function with release 2.2 of Origo however this functionality is at present unverified. The only known running instance is together with a late 2019 version of Origo, likely 2.0.1. Further development is uncertain )

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
