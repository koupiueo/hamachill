module.exports = {
  debug: (...a) => { if (process.env.DEBUG) console.log(...a); },
  info: (...a) => console.log(...a),
  warn: (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
};
