module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // react-native-reanimated/plugin MUST be listed last in the plugins
      // array. It rewrites worklet functions and needs to run after all
      // other transforms. Putting anything after it will break reanimated.
      "react-native-reanimated/plugin",
    ],
  };
};
