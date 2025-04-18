// eslint-disable-next-line no-undef
module.exports = {
	root: true,
	parser: "@typescript-eslint/parser",
	plugins: ["@typescript-eslint", "prettier"],
	extends: ["eslint:recommended", "plugin:prettier/recommended"],
	rules: {
		"prettier/prettier": ["error"],
	},
	env: {
		node: true,
	},
};
