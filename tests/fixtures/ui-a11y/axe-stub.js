// A stand-in for axe-core's browser build: it reports one critical and one moderate violation on
// any page, so the injection path and the hard-fail rule are tested where the real axe is absent.
window.axe = {
  run: () => Promise.resolve({ violations: [
    { id: 'stub-critical', impact: 'critical', help: 'a critical violation', nodes: [{ target: ['body'] }] },
    { id: 'stub-moderate', impact: 'moderate', help: 'a moderate violation', nodes: [{ target: ['main'] }] },
  ] }),
};
