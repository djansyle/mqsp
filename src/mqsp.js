import mysql from 'mysql';
import Pool from 'mysql/lib/Pool';
import Connection from 'mysql/lib/Connection';
import Promise from 'bluebird';
import debug from 'debug';
import assert from 'assert';

Promise.promisifyAll([Pool, Connection]);
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
Object.keys(env).forEach((key) => {
  if (/MYSQL_WRITE_HOST_[0-9]{1,3}/g.test(key)) {
    writeHosts.push(env[key]);
    return;
  }

  if (/MYSQL_READ_HOST_[0-9]{1,3}/g.test(key)) {
    readHosts.push(env[key]);
  }
});

// Just make sure we both have write and read host.
assert(writeHosts.length >= 1, 'No write host found.');
assert(readHosts.length >= 1, 'No read host found.');

const config = {
  connectionLimit: env.MYSQL_CONNECTION_LIMIT,
  user: env.MYSQL_USER,
  password: env.MYSQL_PASSWORD,
  database: env.MYSQL_DB,
};

function createPool(host) {
  return mysql.createPool(Object.assign({ host }, config));
}

const pools = {
  write: writeHosts.map(createPool),
  read: writeHosts.map(createPool),
};

// For faster read.
const totalWrite = writeHosts.length;
const totalRead = readHosts.length;

const logger = {
  benchmark: debug('mqsp:info:benchmark'),
  info: debug('mqsp:info'),
  verbose: debug('mqsp:verbose'),
};

export default class MQSP {
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
  async borrowRead() {
    this.readCounter += 1;
    return pools.read[this.readCounter % totalRead].getConnectionAsync();
  }

  /**
   * Borrows a single connection on the write hosts,
   * which uses a round robin method.
   * @returns {Promise.<Connection>}
   */
  async borrowWrite() {
    this.writeCounter += 1;
    return pools.write[this.writeCounter % totalWrite].getConnectionAsync();
  }

  /**
   * Executes a query with a given connection.
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

    return result;
  }
  /**
   * Executes the query to a write host.
   * @param {String} qs
   * @param {Array} qa
   * @returns {Promise.<Object>}
   */
  async queryWrite(qs, qa) {
    return this.query(qs, qa, await this.borrowWrite());
  }

  /**
   * Executes a query to a read host.
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
