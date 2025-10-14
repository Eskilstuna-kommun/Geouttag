const webpack = require('webpack');

module.exports = {
  entry: [
    './geouttag.js'
  ],
  externals: ['Origo'],
  resolve: {
    extensions: ['.*', '.js', '.scss']
  }
};
