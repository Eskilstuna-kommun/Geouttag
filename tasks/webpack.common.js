const webpack = require('webpack');

module.exports = {
  entry: [
    './geouttag.js'
  ],
  module: {
    rules: [
      {
        test: /\.(js)$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
        query: {
          cacheDirectory: false,
          presets: [
            ['@babel/preset-env', {
              targets: {
                browsers: ['chrome >= 39']
              },
              modules: false,
              useBuiltIns: 'usage'
            }]
          ],
          plugins: [
            ['@babel/plugin-transform-runtime', {
              regenerator: true,
              corejs: 2
            }]
          ]         
        }
      }     
    ]
  },
  externals: ['Origo'],
  resolve: {
    extensions: ['*', '.js', '.scss']
  },
  plugins: [
    new webpack.ProvidePlugin({
      fetch: 'imports-loader?this=>global!exports-loader?global.fetch!whatwg-fetch'
    })
  ]  
};
