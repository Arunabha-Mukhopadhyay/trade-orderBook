const { createDefaultEsmPreset } = require("ts-jest");

const preset = createDefaultEsmPreset();

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  ...preset,
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};