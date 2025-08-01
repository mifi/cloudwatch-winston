import winston from 'winston';
import util from 'util';
import CloudWatchTransport from './index.js';


const cloudWatchTransport = new CloudWatchTransport({
  logGroupName: 'winston-cloudwatch-test',
  logStreamName: new Date().toISOString().replace(/[-:]/g, '/'),
  shouldCreateLogGroup: true,
  shouldCreateLogStream: true,
  // maxQueuedBatches: 2,
  /* aws: {
    credentials: {
      accessKeyId: '',
      secretAccessKey: '',
    },
    region: 'us-east-1',
  }, */
  formatLog: ({ level, message }) => `${level}: ${message}`,
});

// https://github.com/winstonjs/winston/issues/1427
const combineMessageAndSplat = () => ({
  transform(info) {
    const { [Symbol.for('splat')]: args = [], message } = info;
    info.message = util.format(message, ...args);
    return info;
  },
});

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    combineMessageAndSplat(),
    winston.format.simple(),
  ),
});

logger.add(cloudWatchTransport);

logger.info('loggety log log');

logger.error('something failed', new Error('test error'));

for (let i = 0; i < 1000; i++) {
  logger.info(`log message ${i}`);
  await new Promise((resolve) => setTimeout(resolve, 1));
}

// for (let i = 0; i < 10; i++) {
//  logger.info(Array.from({ length: 200000 }).fill('a').join(''));
// }

// logger.info(Array.from({ length: 300000 }).fill('a').join(''));

setTimeout(() => logger.warn('10 sec'), 10000);

// setTimeout(() => logger.close(), 30000);
