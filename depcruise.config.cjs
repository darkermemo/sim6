module.exports = {
  forbidden: [],
  allowed: [],
  allowedSeverity: 'error',
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    exclude: '(^node_modules|__tests__|\\.spec\\.|\\.test\\.)',
    outputType: 'json',
    outputTo: 'reports/depcruise.json'
  },
};
