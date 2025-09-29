import HtmlInlineScriptWebpackPlugin from 'html-inline-script-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import url from 'node:url';
import TerserPlugin from 'terser-webpack-plugin';
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin';
import Components from 'unplugin-vue-components/webpack';
import { VueLoaderPlugin } from 'vue-loader';
import webpack from 'webpack';

const require = createRequire(import.meta.url);
const HTMLInlineCSSWebpackPlugin = require('html-inline-css-webpack-plugin').default;

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const entry = {
  script: 'src/什么我要在玄幻修仙世界种田-0楼版本/index.ts',
  html: 'src/什么我要在玄幻修仙世界种田-0楼版本/index.html',
  minimize: true,
};

function parse_configuration(entry: { script: string; html?: string; minimize?: boolean }): (_env: any, argv: any) => webpack.Configuration {
  const script_filepath = path.parse(entry.script);
  const should_minimize = entry.minimize ?? true;

  let plugins: webpack.Configuration['plugins'] = [
    new VueLoaderPlugin(),
    Components({
      dirs: ['src/什么我要在玄幻修仙世界种田-0楼版本/components'],
      dts: 'src/components.d.ts',
    }),
  ];
  if (entry.html === undefined) {
    plugins.push(new MiniCssExtractPlugin());
  } else {
    plugins.push(
      new HtmlWebpackPlugin({
        template: path.join(__dirname, entry.html),
        filename: path.parse(entry.html).base,
        scriptLoading: 'module',
        cache: false,
      }),
      new HtmlInlineScriptWebpackPlugin(),
      new MiniCssExtractPlugin(),
      new HTMLInlineCSSWebpackPlugin({
        styleTagFactory({ style }: { style: string }) {
          return `<style>${style}</style>`;
        },
      }),
    );
  }

  return (_env, argv) => ({
    experiments: {
      outputModule: true,
    },
    devtool: argv.mode === 'production' ? false : 'eval-source-map',
    entry: path.join(__dirname, entry.script),
    target: 'browserslist',
    output: {
      devtoolModuleFilenameTemplate: 'webpack://tavern_helper_template/[resource-path]?[loaders]',
      filename: `${script_filepath.name}.js`,
      path: path.join(__dirname, 'dist/', script_filepath.dir),
      chunkFilename: `${script_filepath.name}.[contenthash].chunk.js`,
      asyncChunks: true,
      chunkLoading: 'import',
      clean: true,
      publicPath: './',
      library: {
        type: 'module',
      },
    },
    module: {
      rules: [
        {
          test: /\.vue$/,
          loader: 'vue-loader',
        },
        {
          oneOf: [
            {
              test: /\.tsx?$/,
              loader: 'ts-loader',
              options: {
                transpileOnly: true,
              },
              resourceQuery: /raw/,
              type: 'asset/source',
            },
            {
              test: /\.(sa|sc|c)ss$/,
              oneOf: [
                {
                  resourceQuery: /raw/,
                  use: [
                    {
                      loader: 'postcss-loader',
                      options: {
                        postcssOptions: {
                          config: path.resolve(__dirname, 'postcss.config.js'),
                        },
                      },
                    },
                    'sass-loader',
                  ],
                  type: 'asset/source',
                },
                {
                  use: [
                    MiniCssExtractPlugin.loader,
                    { loader: 'css-loader', options: { url: false } },
                    {
                      loader: 'postcss-loader',
                      options: {
                        postcssOptions: {
                          config: path.resolve(__dirname, 'postcss.config.js'),
                        },
                      },
                    },
                    'sass-loader',
                  ],
                },
              ],
              exclude: /node_modules/,
            },
            {
              resourceQuery: /raw/,
              type: 'asset/source',
            },
            {
              test: /\.tsx?$/,
              loader: 'ts-loader',
              options: {
                transpileOnly: true,
              },
              exclude: /node_modules/,
            },
            {
              test: /\.html?$/,
              use: 'html-loader',
              exclude: /node_modules/,
            },
          ],
        },
      ],
    },
    resolve: {
      extensions: ['.ts', '.js', '.tsx', '.jsx', '.css', '.vue'],
      plugins: [
        new TsconfigPathsPlugin({
          extensions: ['.ts', '.js', '.tsx', '.jsx', '.vue'],
          configFile: path.join(__dirname, 'tsconfig.json'),
        }),
      ],
      alias: {},
    },
    plugins: plugins,
    optimization: {
      minimize: should_minimize,
      minimizer: [
        argv.mode === 'production'
          ? new TerserPlugin({
              terserOptions: {
                format: { quote_style: 1 },
                mangle: {
                  keep_fnames: true,
                  reserved: [
                    '_',
                    'toastr',
                    'YAML',
                    '$',
                    'z',
                    'getCurrentMessageId',
                    'getVariables',
                    'triggerSlash',
                    'insertOrAssignVariables',
                    'updateVariablesWith',
                    'getChatMessages',
                    'getWorldbook',
                  ],
                },
              },
            })
          : new TerserPlugin({
              extractComments: false,
              terserOptions: {
                format: { beautify: true, indent_level: 2 },
                compress: false,
                mangle: false,
              },
            }),
      ],
      splitChunks: {
        chunks: 'async',
        minSize: 20000,
        minChunks: 1,
        maxAsyncRequests: 30,
        maxInitialRequests: 30,
        cacheGroups: {
          vendor: {
            name: 'vendor',
            test: /[\\/]node_modules[\\/]/,
            priority: -10,
          },
          default: {
            name: 'default',
            minChunks: 2,
            priority: -20,
            reuseExistingChunk: true,
          },
        },
      },
    },
    externals: [
      ({ context, request }, callback) => {
        if (!context || !request) {
          return callback();
        }

        if (
          request.startsWith('-') ||
          request.startsWith('.') ||
          request.startsWith('/') ||
          request.startsWith('@') ||
          request.startsWith('http') ||
          path.isAbsolute(request) ||
          fs.existsSync(path.join(context, request)) ||
          fs.existsSync(request)
        ) {
          return callback();
        }

        const builtin = {
          lodash: '_',
          toastr: 'toastr',
          yaml: 'YAML',
          jquery: '$',
        };
        if (request in builtin) {
          return callback(null, 'var ' + builtin[request as keyof typeof builtin]);
        }
        return callback(null, 'module-import https://testingcf.jsdelivr.net/npm/' + request + '/+esm');
      },
    ],
  });
}

export default parse_configuration(entry);
