import mysql from 'mysql';
import Pool from 'mysql/lib/Pool';
import Connection from 'mysql/lib/Connection';
import Promise from 'bluebird';
import debug from 'debug';
import assert from 'assert';
import SqlString from 'sqlstring';
import objectHash from 'object-hash';
import stringHash from 'string-hash';
import LRU from 'lru-cache';

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
    return 'NULL';
  });
}

function createPool(host, config) {
  return mysql.createPool(Object.assign({ host }, config));
}

function twoDigits(d) {
  if (d >= 0 && d < 10) {
    return `0${d.toString()}`;
  }

  if (d > -10 && d < 0) {
    return `-0${(-1 * d).toString()}`;
  }

  return d.toString();
}

function formatDate(year, month, day, hour, minute, second, ms = '000') {
  return `${year}-${month}-${day} ${hour}:${minute}:${second}.${ms}`;
}

const logger = {
  benchmark: debug('mqsp:info:benchmark'),
  info: debug('mqsp:info'),
  verbose: debug('mqsp:verbose'),
};

function hashPair(qs, qa = {}) {
  return stringHash(`${stringHash(qs)}${stringHash(objectHash(qa))}`);
}

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

    const { host = 'localhost' } = config;
    const { writeHosts = [], readHosts = [] } = config;
    const { cache = { maxAge: 1000 * 60 * 10 }, disableCache } = config;

    assert(writeHosts instanceof Array, 'Expecting property `writeHosts` to be an Array.');
    assert(readHosts instanceof Array, 'Expecting property `readHosts` to be an Array.');

    if (writeHosts.length === 0) {
      writeHosts.push(host);
    }

    if (readHosts.length === 0) {
      readHosts.push(host);
    }

    assert(writeHosts.length >= 1, 'Did not find any write host.');
    assert(readHosts.length >= 1, 'Did not find any read host.');

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

    // Expose escape
    this.escape = mysql.escape;
    if (!disableCache) {
      this.cache = new LRU(cache);
    }
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

    let result = null;
    try {
      const start = new Date();
      result = await conn.queryAsync(qs, qa);
      const end = new Date();
      const ms = end.getTime() - start.getTime();

      logger.benchmark({ qs, qa, ms });
      if (this.benchHandler) {
        await this.benchHandler(qs, qa, ms);
      }
    } catch (e) {
      throw e;
    } finally {
      conn.release();
    }

    return result;
  }

  /**
   * Stores the query result with the `qa` and `qs` pair.
   * @param qs
   * @param qa
   * @returns {Promise.<void>}
   */
  async cacheableRead(qs, qa) {
    if (!this.cache) {
      return this.queryRead(qs, qa);
    }

    const key = hashPair(qs, qa);
    let data = this.cache.get(key);

    if (!data) {
      data = await this.queryRead(qs, qa);
      this.cache.set(key, data);
    }

    return data;
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
    return this.cacheableRead(qs, qa);
  }

  /**
   * Executes the query to get a single row.
   * @param qs
   * @param qa
   * @returns {Promise.<Object|undefined>}
   */
  async getRow(qs, qa) {
    return (await this.cacheableRead(qs, qa))[0];
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

  /**
   * Determines whether the given query exists or not.
   * @param qs
   * @param qa
   * @returns {Promise.<boolean>}
   */
  async exists(qs, qa) {
    // Remove the added semi-colon if ever there is.
    const result = await this.getRow(
      `SELECT EXISTS(${qs.split(';')[0]}) AS exist;`, qa,
    );
    return !!result.exist;
  }

  /**
   * Formats the given Date to MySQL Timestamp.
   * Sample output:
   * 2011-10-05 14:48:00.000
   *
   * @param {Date} date
   * @param {Boolean} [excludeMs]
   * @returns {String}
   */
  static toTimestamp(date, excludeMs = false) {
    const args = [
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      excludeMs ? 0 : date.getMilliseconds(),
    ];

    return formatDate(...args.map(value => twoDigits(value)));
  }

  async close() {
    await Promise.all([
      this.pools.read.forEach(conn => conn.endAsync()),
      this.pools.write.forEach(conn => conn.endAsync()),
    ]);
  }
}
