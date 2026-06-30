const webpack = require('webpack');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

module.exports = {
  entry: [
    './geouttag.js'
  ],
  externals: ['Origo'],
  resolve: {
    extensions: ['.*', '.js', '.scss']
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.ARC_GIS_CLIENT_ID': JSON.stringify(process.env.ARC_GIS_CLIENT_ID)
    })
  ]
};
