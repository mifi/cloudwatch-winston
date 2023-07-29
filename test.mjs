import winston from 'winston';
import util from 'util';
import CloudWatchTransport from './index.js';

const cloudWatchTransport = new CloudWatchTransport({
  logGroupName: 'my-log-group',
  logStreamName: new Date().toISOString().replace(/[-:]/g, '/'),
  shouldCreateLogGroup: false,
  shouldCreateLogStream: true,
  aws: {
    credentials: {
      accessKeyId: '',
      secretAccessKey: '',
    },
    region: 'us-east-1',
  },
  formatLog: (item) => `${item.level}: ${item.message}`,
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

logger.error('failed', new Error('test error'));
