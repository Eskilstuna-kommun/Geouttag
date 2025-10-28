const { merge } = require('webpack-merge');
const autoprefixer = require('autoprefixer');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyPlugin = require('copy-webpack-plugin');
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
            loader: 'css-loader'
          },
          {
            loader: 'postcss-loader',
            options: {
              plugins: [
                new autoprefixer({
                  env: '> 0.25%, not dead'
                })
              ]
            }
          },
          {
            loader: 'sass-loader'
          }
        ]
      }
    ]
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: '../css/export.css'
    }),
    new CopyPlugin({
      patterns: [
        { from: 'resources/svg/material-icons.svg', to: '../svg/material-icons.svg' }
      ]
    })
  ]
});
