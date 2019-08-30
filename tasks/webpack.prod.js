const webpack = require('webpack');
const merge = require('webpack-merge');
const UglifyJSPlugin = require('uglifyjs-webpack-plugin');
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const common = require('./webpack.common.js');

module.exports = merge(common, {
  optimization: {
    nodeEnv: 'production',
    minimize: true
  },
  performance: { hints: false },
  output: {
    path: `${__dirname}/../build/js`,
    filename: 'geouttag.min.js',
    libraryTarget: 'var',
    libraryExport: 'default',
    library: 'Geouttag'
  },
  devtool: false,
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.(sc|c)ss$/,
        use: [
          {
            loader: MiniCssExtractPlugin.loader
          },       
          {
            loader: "css-loader"
          },
          {
            loader: 'postcss-loader',
            options: {
              plugins: [
                require('autoprefixer')({
                  env: '> 0.5%, last 2 versions, Firefox ESR, not dead, not ie <= 10'
                })
              ]
            }
          },                    
          {
            loader: "sass-loader"     
          }       
        ]
      }       
    ]
  },
  plugins: [
    new UglifyJSPlugin({
      uglifyOptions: {
        output: {
          beautify: false
        }
      }
    }),
    new webpack.optimize.AggressiveMergingPlugin(),
    new MiniCssExtractPlugin({
      filename: "../css/export.css"    
    })    
  ]
});
