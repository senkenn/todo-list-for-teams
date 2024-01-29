// see https://github.com/microsoft/vscode-test/issues/37#issuecomment-700167820

module.exports = {
	moduleFileExtensions: ["js"],
	testMatch: ["<rootDir>/out/test/suite/**.test.js"],
	testEnvironment: "./src/test/vscode-environment.ts",
	verbose: true,
};
