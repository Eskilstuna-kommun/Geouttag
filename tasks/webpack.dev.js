const merge = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
  output: {
    path: `${__dirname}/../build/js`,
    publicPath: '/build/js',
    filename: 'geouttag.js',
    libraryTarget: 'var',
    libraryExport: 'default'
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
    contentBase: './',
    port: 9008
  }
});
