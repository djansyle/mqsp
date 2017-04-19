'use strict';Object.defineProperty(exports, "__esModule", { value: true });var _mysql = require('mysql');var _mysql2 = _interopRequireDefault(_mysql);
var _Pool = require('mysql/lib/Pool');var _Pool2 = _interopRequireDefault(_Pool);
var _Connection = require('mysql/lib/Connection');var _Connection2 = _interopRequireDefault(_Connection);
var _bluebird = require('bluebird');var _bluebird2 = _interopRequireDefault(_bluebird);
var _debug = require('debug');var _debug2 = _interopRequireDefault(_debug);
var _assert = require('assert');var _assert2 = _interopRequireDefault(_assert);
var _sqlstring = require('sqlstring');var _sqlstring2 = _interopRequireDefault(_sqlstring);function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };}function _asyncToGenerator(fn) {return function () {var gen = fn.apply(this, arguments);return new _bluebird2.default(function (resolve, reject) {function step(key, arg) {try {var info = gen[key](arg);var value = info.value;} catch (error) {reject(error);return;}if (info.done) {resolve(value);} else {return _bluebird2.default.resolve(value).then(function (value) {step("next", value);}, function (err) {step("throw", err);});}}return step("next");});};}

_bluebird2.default.promisifyAll([_Pool2.default, _Connection2.default]);

/**
                                                                          * Replaces the `:<field>` in the query with the value corresponds in the value
                                                                          * of `value` if it's an object.
                                                                          *
                                                                          * Ex.
                                                                          * query: SELECT :val AS field
                                                                          * values: { val: 1 }
                                                                          *
                                                                          * will be rewrite as,
                                                                          * SELECT 1 AS field
                                                                          *
                                                                          * If the `values` is array, just reuse the mysql formatter.
                                                                          *
                                                                          * @param query
                                                                          * @param values
                                                                          * @returns {String}
                                                                          */
function queryFormat(query, values) {
  if (!values) return query;
  if (values instanceof Array) {
    return _sqlstring2.default.format(query, values, false, 'local');
  }
  return query.replace(/:(\w+)/g, (txt, key) => {
    if ({}.hasOwnProperty.call(values, key)) {
      return this.escape(values[key]);
    }
    return txt;
  });
}

function createPool(host, config) {
  return _mysql2.default.createPool(Object.assign({ host }, config));
}

const logger = {
  benchmark: (0, _debug2.default)('mqsp:info:benchmark'),
  info: (0, _debug2.default)('mqsp:info'),
  verbose: (0, _debug2.default)('mqsp:verbose') };


class MQSP {
  /**
             * MQSP Constructor
             * Initialize round robin counter for write and read.
             * @param config
             */
  constructor(config) {
    this.writeCounter = 0;
    this.readCounter = 0;

    this.benchHandler = null;const

    host = config.host;var _config$writeHosts =
    config.writeHosts;const writeHosts = _config$writeHosts === undefined ? [] : _config$writeHosts;var _config$readHosts = config.readHosts;const readHosts = _config$readHosts === undefined ? [] : _config$readHosts;

    if (host && typeof host === 'string') {
      if (writeHosts.length === 0) {
        writeHosts.push('localhost');
      }

      if (readHosts.length === 0) {
        readHosts.push('localhost');
      }
    }

    (0, _assert2.default)(writeHosts instanceof Array, 'Expecting property `writeHosts` to be an Array.');
    (0, _assert2.default)(readHosts instanceof Array, 'Expecting property `readHosts` to be an Array.');

    const sqlConfig = Object.assign({ queryFormat }, config);
    this.pools = {
      write: writeHosts.map(uri => createPool(uri, sqlConfig)),
      read: readHosts.map(uri => createPool(uri, sqlConfig)) };


    this.writeHosts = writeHosts;
    this.readHosts = readHosts;

    // For faster read.
    this.totalWrite = writeHosts.length;
    this.totalRead = readHosts.length;
  }

  /**
     * Borrows a single connection on the read hosts,
     * which uses a round robin method.
     * @access private
     * @returns {Promise.<Connection>}
     */
  borrowRead() {var _this = this;return _asyncToGenerator(function* () {
      _this.readCounter += 1;
      return _this.pools.read[_this.readCounter % _this.totalRead].getConnectionAsync();})();
  }

  /**
     * Borrows a single connection on the write hosts,
     * which uses a round robin method.
     * @access private
     * @returns {Promise.<Connection>}
     */
  borrowWrite() {var _this2 = this;return _asyncToGenerator(function* () {
      _this2.writeCounter += 1;
      return _this2.pools.write[_this2.writeCounter % _this2.totalWrite].getConnectionAsync();})();
  }

  /**
     * Executes a query with a given connection.
     * @access private
     * @param {String} qs
     * @param {Array} qa
     * @param {Connection} conn
     * @returns {Promise.<Object>}
     */
  query(qs, qa, conn) {var _this3 = this;return _asyncToGenerator(function* () {
      logger.verbose({ qs, qa });

      const start = new Date();
      const result = yield conn.queryAsync(qs, qa);
      const end = new Date();
      const ms = end.getTime() - start.getTime();

      logger.benchmark({ qs, qa, ms });
      if (_this3.benchHandler) {
        yield _this3.benchHandler(qs, qa, ms);
      }

      conn.release();

      return result;})();
  }
  /**
     * Executes the query to a write host.
     * @access private
     * @param {String} qs
     * @param {Array} qa
     * @returns {Promise.<Object>}
     */
  queryWrite(qs, qa) {var _this4 = this;return _asyncToGenerator(function* () {
      return _this4.query(qs, qa, (yield _this4.borrowWrite()));})();
  }

  /**
     * Executes a query to a read host.
     * @access private
     * @param {String} qs
     * @param {Array} qa
     * @returns {Promise.<Object>}
     */
  queryRead(qs, qa) {var _this5 = this;return _asyncToGenerator(function* () {
      return _this5.query(qs, qa, (yield _this5.borrowRead()));})();
  }

  /**
     * Executes the query and returns the row,
     * this will get only in the read host.
     * @param qs
     * @param qa
     * @returns {Promise.<Array>}
     */
  getRows(qs, qa) {var _this6 = this;return _asyncToGenerator(function* () {
      return _this6.queryRead(qs, qa);})();
  }

  /**
     * Executes the query to get a single row.
     * @param qs
     * @param qa
     * @returns {Promise.<Object|undefined>}
     */
  getRow(qs, qa) {var _this7 = this;return _asyncToGenerator(function* () {
      return (yield _this7.queryRead(qs, qa))[0];})();
  }

  /**
     * Executes a query, without returning any result.
     * @param qs
     * @param qa
     * @returns {Promise.<void>}
     */
  exec(qs, qa) {var _this8 = this;return _asyncToGenerator(function* () {
      return _this8.queryWrite(qs, qa);})();
  }

  /**
     * Determines whether the given query exists or not.
     * @param qs
     * @param qa
     * @returns {Promise.<boolean>}
     */
  exists(qs, qa) {var _this9 = this;return _asyncToGenerator(function* () {
      // Remove the added semi-colon if ever there is.
      const result = yield _this9.getRow(
      `SELECT EXISTS(${qs.split(';')[0]}) AS exist;`, qa);

      return !!result.exist;})();
  }}exports.default = MQSP;