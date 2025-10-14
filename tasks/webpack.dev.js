const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
  output: {
    path: `${__dirname}/../../origo/plugins`,
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
            loader: "style-loader"
          },            
          {
            loader: "css-loader"
          },          
          {
            loader: "sass-loader"     
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
  }
});
