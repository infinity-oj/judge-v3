import {login} from "./ioj-api";

require('source-map-support').install();

import winston = require('winston');
import {globalConfig as Cfg} from './config';
import util = require('util');
import {RPCRequest, RPCTaskType} from '../interfaces';
import {compile} from './compile';
import {judgeStandard, judgeAnswerSubmission, judgeInteraction} from './judge';
import {pullTaskFromServer, waitForTask} from "./ioj-tasks";

(async function () {
    winston.info('Start to login')
    if (!await login('username', 'password')) {
        winston.error('Fail to login')
        return
    }
    winston.info("Success to login");
    winston.info("Start consuming the queue.");
    await waitForTask(async (task) => {
        winston.debug(`Handling task ${util.inspect(task)}`);
        if (task.type === RPCTaskType.Compile) {
            winston.debug("Task type is compile");
            return await compile(task.task);
        } else if (task.type === RPCTaskType.RunStandard) {
            return await judgeStandard(task.task);
        } else {
            winston.warn("Task type unsupported");
            throw new Error(`Task type ${task.type} not supported!`);
        }
    });
})().then(() => {
    winston.info("Initialization logic completed.");
}, (err) => {
    winston.error(util.inspect(err));
    process.exit(1);
});
