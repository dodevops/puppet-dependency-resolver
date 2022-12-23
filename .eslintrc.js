module.exports = {
  parser: '@typescript-eslint/parser', // Specifies the ESLint parser
  parserOptions: {
    ecmaVersion: 2020, // Allows for the parsing of modern ECMAScript features
    sourceType: 'module', // Allows for the use of imports
    ecmaFeatures: {
      jsx: true, // Allows for the parsing of JSX
    },
  },
  ignorePatterns: ['node_modules', '**/*.js'],
  settings: {
    react: {
      version: 'detect', // Tells eslint-plugin-react to automatically detect the version of React to use
    },
  },
  extends: [
    'plugin:@typescript-eslint/recommended', // Uses the recommended rules from the @typescript-eslint/eslint-plugin
    'plugin:prettier/recommended', // Enables eslint-plugin-prettier and eslint-config-prettier. This will display prettier errors as ESLint errors. Make sure this is always the last configuration in the extends array.
    'plugin:jsdoc/recommended',
  ],
  rules: {
    // Place to specify ESLint rules. Can be used to overwrite rules specified from the extended configs
    // e.g. "@typescript-eslint/explicit-function-return-type": "off",
    'lines-around-comment': ['error', { allowClassStart: true }],
    'jsdoc/require-jsdoc': [
      'warn',
      {
        contexts: ['ClassProperty'],
        require: {
          ClassDeclaration: true,
          MethodDefinition: true,
        },
        checkGetters: false,
        checkSetters: false,
        checkConstructors: false,
      },
    ],
    'jsdoc/require-param-type': 'off',
    'jsdoc/require-returns-type': 'off',
    'jsdoc/require-description': [
      'warn',
      {
        contexts: ['ClassDeclaration'],
        checkConstructors: false,
        checkGetters: false,
        checkSetters: false,
      },
    ],
    '@typescript-eslint/member-ordering': 'warn',
  },
}
