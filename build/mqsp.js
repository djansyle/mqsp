'use strict';Object.defineProperty(exports, "__esModule", { value: true });var _mysql = require('mysql');var _mysql2 = _interopRequireDefault(_mysql);
var _Pool = require('mysql/lib/Pool');var _Pool2 = _interopRequireDefault(_Pool);
var _Connection = require('mysql/lib/Connection');var _Connection2 = _interopRequireDefault(_Connection);
var _bluebird = require('bluebird');var _bluebird2 = _interopRequireDefault(_bluebird);
var _debug = require('debug');var _debug2 = _interopRequireDefault(_debug);
var _assert = require('assert');var _assert2 = _interopRequireDefault(_assert);
var _sqlstring = require('sqlstring');var _sqlstring2 = _interopRequireDefault(_sqlstring);function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };}function _asyncToGenerator(fn) {return function () {var gen = fn.apply(this, arguments);return new _bluebird2.default(function (resolve, reject) {function step(key, arg) {try {var info = gen[key](arg);var value = info.value;} catch (error) {reject(error);return;}if (info.done) {resolve(value);} else {return _bluebird2.default.resolve(value).then(function (value) {step("next", value);}, function (err) {step("throw", err);});}}return step("next");});};}

_bluebird2.default.promisifyAll([_Pool2.default, _Connection2.default]);
/**
                                                                          * Environment Format
                                                                          * MYSQL_WRITE_HOST_0
                                                                          * MYSQL_READ_HOST_0
                                                                          * MYSQL_DB
                                                                          * MYSQL_USER
                                                                          * MYSQL_PASSWORD
                                                                          * MYSQL_CONNECTION_LIMIT
                                                                          */

const { env } = process;

// We will get all the keys that matches the host pattern
const writeHosts = [];
const readHosts = [];

// Retrieve all the read and write host.
Object.keys(env).forEach(key => {
  if (/MYSQL_WRITE_HOST_[0-9]{1,3}/g.test(key)) {
    writeHosts.push(env[key]);
    return;
  }

  if (/MYSQL_READ_HOST_[0-9]{1,3}/g.test(key)) {
    readHosts.push(env[key]);
  }
});

// Just make sure we both have write and read host.
(0, _assert2.default)(writeHosts.length >= 1, 'No write host found.');
(0, _assert2.default)(readHosts.length >= 1, 'No read host found.');

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

const config = {
  queryFormat,
  connectionLimit: env.MYSQL_CONNECTION_LIMIT,
  user: env.MYSQL_USER,
  password: env.MYSQL_PASSWORD,
  database: env.MYSQL_DB };


function createPool(host) {
  return _mysql2.default.createPool(Object.assign({ host }, config));
}

const pools = {
  write: writeHosts.map(createPool),
  read: writeHosts.map(createPool) };


// For faster read.
const totalWrite = writeHosts.length;
const totalRead = readHosts.length;

const logger = {
  benchmark: (0, _debug2.default)('mqsp:info:benchmark'),
  info: (0, _debug2.default)('mqsp:info'),
  verbose: (0, _debug2.default)('mqsp:verbose') };


class MQSP {
  /**
             * MQSP Constructor
             * Initialize round robin counter for write and read.
             */
  constructor() {
    this.writeCounter = 0;
    this.readCounter = 0;

    this.benchHandler = null;
  }

  /**
     * Borrows a single connection on the read hosts,
     * which uses a round robin method.
     * @returns {Promise.<Connection>}
     */
  borrowRead() {var _this = this;return _asyncToGenerator(function* () {
      _this.readCounter += 1;
      return pools.read[_this.readCounter % totalRead].getConnectionAsync();})();
  }

  /**
     * Borrows a single connection on the write hosts,
     * which uses a round robin method.
     * @returns {Promise.<Connection>}
     */
  borrowWrite() {var _this2 = this;return _asyncToGenerator(function* () {
      _this2.writeCounter += 1;
      return pools.write[_this2.writeCounter % totalWrite].getConnectionAsync();})();
  }

  /**
     * Executes a query with a given connection.
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

      return result;})();
  }
  /**
     * Executes the query to a write host.
     * @param {String} qs
     * @param {Array} qa
     * @returns {Promise.<Object>}
     */
  queryWrite(qs, qa) {var _this4 = this;return _asyncToGenerator(function* () {
      return _this4.query(qs, qa, (yield _this4.borrowWrite()));})();
  }

  /**
     * Executes a query to a read host.
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
  }}exports.default = MQSP;