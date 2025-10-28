const { merge } = require('webpack-merge');
const CopyPlugin = require('copy-webpack-plugin');
const common = require('./webpack.common.js');

module.exports = merge(common, {
  output: {
    path: `${__dirname}/../../Ek-extern-2023/plugins/geouttag`,
    publicPath: '/build/js',
    filename: 'geouttag.js',
    libraryTarget: 'var',
    libraryExport: 'default',
    library: 'Geouttag'
  },
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.scss$/,
        use: [
          {
            loader: 'style-loader'
          },
          {
            loader: 'css-loader'
          },
          {
            loader: 'sass-loader'
          }
        ]
      }
    ]
  },
  devServer: {
    static: './',
    port: 9008,
    devMiddleware: {
      writeToDisk: true
    }
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'resources/svg/material-icons.svg', to: 'material-icons.svg' }
      ]
    })
  ]
});
