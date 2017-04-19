import mysql from 'mysql';
import Pool from 'mysql/lib/Pool';
import Connection from 'mysql/lib/Connection';
import Promise from 'bluebird';
import debug from 'debug';
import assert from 'assert';
import SqlString from 'sqlstring';

Promise.promisifyAll([Pool, Connection]);

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
    return SqlString.format(query, values, false, 'local');
  }
  return query.replace(/:(\w+)/g, (txt, key) => {
    if (({}).hasOwnProperty.call(values, key)) {
      return this.escape(values[key]);
    }
    return txt;
  });
}

function createPool(host, config) {
  return mysql.createPool(Object.assign({ host }, config));
}

const logger = {
  benchmark: debug('mqsp:info:benchmark'),
  info: debug('mqsp:info'),
  verbose: debug('mqsp:verbose'),
};

export default class MQSP {
  /**
   * MQSP Constructor
   * Initialize round robin counter for write and read.
   * @param config
   */
  constructor(config) {
    this.writeCounter = 0;
    this.readCounter = 0;

    this.benchHandler = null;

    const { host } = config;
    const { writeHosts = [], readHosts = [] } = config;

    if (host && typeof host === 'string') {
      if (writeHosts.length === 0) {
        writeHosts.push('localhost');
      }

      if (readHosts.length === 0) {
        readHosts.push('localhost');
      }
    }

    assert(writeHosts instanceof Array, 'Expecting property `writeHosts` to be an Array.');
    assert(readHosts instanceof Array, 'Expecting property `readHosts` to be an Array.');

    const sqlConfig = Object.assign({ queryFormat }, config);
    this.pools = {
      write: writeHosts.map(uri => createPool(uri, sqlConfig)),
      read: readHosts.map(uri => createPool(uri, sqlConfig)),
    };

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
  async borrowRead() {
    this.readCounter += 1;
    return this.pools.read[this.readCounter % this.totalRead].getConnectionAsync();
  }

  /**
   * Borrows a single connection on the write hosts,
   * which uses a round robin method.
   * @access private
   * @returns {Promise.<Connection>}
   */
  async borrowWrite() {
    this.writeCounter += 1;
    return this.pools.write[this.writeCounter % this.totalWrite].getConnectionAsync();
  }

  /**
   * Executes a query with a given connection.
   * @access private
   * @param {String} qs
   * @param {Array} qa
   * @param {Connection} conn
   * @returns {Promise.<Object>}
   */
  async query(qs, qa, conn) {
    logger.verbose({ qs, qa });

    const start = new Date();
    const result = await conn.queryAsync(qs, qa);
    const end = new Date();
    const ms = end.getTime() - start.getTime();

    logger.benchmark({ qs, qa, ms });
    if (this.benchHandler) {
      await this.benchHandler(qs, qa, ms);
    }

    conn.release();

    return result;
  }
  /**
   * Executes the query to a write host.
   * @access private
   * @param {String} qs
   * @param {Array} qa
   * @returns {Promise.<Object>}
   */
  async queryWrite(qs, qa) {
    return this.query(qs, qa, await this.borrowWrite());
  }

  /**
   * Executes a query to a read host.
   * @access private
   * @param {String} qs
   * @param {Array} qa
   * @returns {Promise.<Object>}
   */
  async queryRead(qs, qa) {
    return this.query(qs, qa, await this.borrowRead());
  }

  /**
   * Executes the query and returns the row,
   * this will get only in the read host.
   * @param qs
   * @param qa
   * @returns {Promise.<Array>}
   */
  async getRows(qs, qa) {
    return this.queryRead(qs, qa);
  }

  /**
   * Executes the query to get a single row.
   * @param qs
   * @param qa
   * @returns {Promise.<Object|undefined>}
   */
  async getRow(qs, qa) {
    return (await this.queryRead(qs, qa))[0];
  }

  /**
   * Executes a query, without returning any result.
   * @param qs
   * @param qa
   * @returns {Promise.<void>}
   */
  async exec(qs, qa) {
    return this.queryWrite(qs, qa);
  }
}
