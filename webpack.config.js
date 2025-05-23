const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const mode =
  process.env.NODE_ENV === "production" ? "production" : "development";
const devtool =
  process.env.NODE_ENV === "production" ? undefined : "inline-source-map";

module.exports = {
  entry: ["./src/index.ts"],
  mode,
  devtool,
  devServer: {
    static: "./dist",
    server: "https"
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.(vert|frag|wgsl)$/,
        use: "raw-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.scss$/,
        use: ["style-loader", "css-loader", "sass-loader"],
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  output: {
    clean: true,
    filename: "index.js",
    path: path.resolve(__dirname, "dist"),
    // library: "tinygpu",
    // libraryTarget: "umd",
    // umdNamedDefine: true,
  },
  plugins: [new HtmlWebpackPlugin()],
};
