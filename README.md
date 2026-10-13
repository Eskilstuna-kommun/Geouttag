# Geouttag

Geouttag plugin for Origo using FME server Web Services. The user may draw a rectangle over the area to be exported, as well as choose a list of predefined layers/data sources to export.

(<i>Is compatible with Origo v2.9</i>)

Layers in the map meant to be exportable via this plugin can be indicated via a `geouttag: true` prop.
These layers share a configuration, including export formats, possible via wfs for instance, as well as an FME Flow workspace.

#### Example usage of Geouttag as plugin

The plugin can be loaded like this in an html-file:

```html
<head>
  ...
  <link href="plugins/geouttag.css" rel="stylesheet" />
</head>
...
<script src="js/origo.min.js"></script>
<script src="plugins/geouttag.min.js"></script>
<script type="text/javascript">
      const origo = Origo('index.json');
      origo.on('load', function(viewer) {

      const geouttag = Geouttag({
        fmeFlowDataDownloadUrl: "URL to the FME Flow data download service",
        // Coordinate systems offered in the export UI, as EPSG codes
        coordSyses: [
          {ref: "3010", title: "SWEREF99 16 30"},
          {ref: "3006", title: "SWEREF99 TM"},
          {ref: "4326", title: "World Geodetic System 1984"}
        ],
        products: [ // "products" are sometimes a combination of spatial tables and related data, and can have their own output file formats and FME workspaces
          {
            name: "base",
            title: "Base map",
            // Optional max exportable area in km2; the sketch is warning-styled when exceeded
            maxArea: 100,
            FMEWorkspace: "basemap.fmw",
            filetypes: [
              {
                title: "DWG",
                outputFormat: "DWG"
              },
              {
                title: "Shape",
                outputFormat: "SHP"
              }
            ]
          },
          {
            name: "cyclingmap",
            title: "Cycling map",
            FMEWorkspace: "cycling_cad.fmw",
            filetypes: [
              {
                title: "DWG",
                outputFormat: "DWG"
              },
              {
                title: "Shape",
                outputFormat: "SHP"
              }
            ]
          },
          {
            name: "hojddata_nh_grid",
            title: "National elevation data 2015",
            FMEWorkspace: "grid_elev.fmw",
            // imageServer: true exports via an ArcGIS ImageServer instead of FME Flow
            filetypes: [
              {
                title: "ESRI GRID",
                outputFormat: "ESRI GRID"
              }
            ]
          }
        ],
        layersConf: { // "layers" have common properties - one shared FME workspace and output file formats
          filetypes: [
            {
              title: "GML3",
              outputFormat: "GML3"
            },
            {
              title: "GeoJSON",
              outputFormat: "application/json"
            },
            {
              title: "dxf",
              outputFormat: "dxf"
            },
            {
              title: "GeoPackage",
              outputFormat: "geopkg"
            }
          ],
          FMEWorkspace: "maplayers_wfs.fmw",
          layers: [
            {
              name: "sokvyx_intressepunkter_kff_ok_bibliotek",
              title: "Bibliotek",
              workspace: "etuna",
              // Optional max exportable area in km2
              maxArea: 25
            },
            {
              name: "sokvyx_intressepunkter_utescen",
              title: "Utescener",
              workspace: "etuna",
              // Optional: exportable in its entirety, without a drawn export area
              wholeExportable: true
            }
          ]
        }
      });
    viewer.addComponent(geouttag);

    });
</script>
```

#### Configuration notes

- Products declare their own `FMEWorkspace`; all layers share the single `FMEWorkspace` on `layersConf`.
- Each selected product or layer is posted to the workspace as an `exportName` parameter, one parameter per item.
- `outputFormat` is sent as a parameter in the FME Flow request for the workspace to do with as it pleases.
- `coordSyses` (optional) is an array of EPSG codes (e.g. `["3010", "3006", "4326", "3857", "3021"]`) rendered as a coordinate system dropdown in the UI. The selection is sent to FME Flow as the `crs` parameter (e.g. `crs=EPSG:3006`). When omitted, no dropdown is shown and no `crs` parameter is sent.
- `maxArea` (optional, km²) may be declared per product and per layer to cap the exportable area. When several layers are selected, the smallest `maxArea` among them applies. While no product or layer is selected, no area limit is applied. An area exceeding the limit is warning-styled while sketching and stays warning-styled once the sketch is finished, and the export button stays disabled.
- `wholeExportable` (optional, boolean) may be declared per product (not for `imageServer` products, for which it is disregarded) and per layer to mark an export that can be delivered in its entirety, without a drawn geometry defining an export area. When every selected item is `wholeExportable`, the export button can be enabled without a sketch, and the export is posted without a `geom` parameter. A `wholeExportable` layer that is exported together with layers that need a geometry is cut by the drawn geometry just like everything else.
- The FME Flow token is read from the `VITE_FME_FLOW_TOKEN` environment variable at build time (see `.env.example`).
