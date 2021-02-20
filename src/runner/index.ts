import { login, pull, reserve } from "./ioj-api";

require("source-map-support").install();

import winston = require("winston");
import { globalConfig as Cfg } from "./config";
import util = require("util");
import { RPCRequest, RPCTaskType } from "../interfaces";
import { compile } from "./compile";
import {
  judgeStandard,
  judgeAnswerSubmission,
  judgeInteraction,
} from "./judge";
import { JudgeTask } from "../daemon/interfaces";

const delay = (millis) =>
  new Promise<void>((resolve, reject) => {
    setTimeout((_) => resolve(), millis);
  });

async function handle(task: RPCRequest) {
  winston.debug(`Handling task ${util.inspect(task)}`);
  if (task.type === RPCTaskType.Compile) {
    winston.debug("Task type is compile");
    return await compile(task);
  } else if (task.type === RPCTaskType.RunStandard) {
    return await judgeStandard(task);
  } else {
    winston.warn("Task type unsupported");
    throw new Error(`Task type ${task.type} not supported!`);
  }
}

(async function () {
  winston.info("Start to login");
  if (!(await login("username", "password"))) {
    winston.error("Fail to login");
    return;
  }
  winston.info("Success to login");
  winston.info("Start consuming the queue.");
  while (true) {
    await delay(1500);
    let task = await pull("syzoj/compilor");
    if (task == null) {
      task = await pull("syzoj/standard");
      if (task == null) {
        continue;
      }
    }
    // console.log(task.taskId)
    if (await reserve(task)) {
      winston.info(`Got runner task`);
      try {
        const result = await handle(task);
        winston.debug(JSON.stringify(result))
      } catch (err) {
        winston.error(
          `Fail to handle task ${task.type}, error message: ${err.message}`
        );
      }
    } else {
      winston.info("Runner task not got");
    }
  }
})().then(
  () => {
    winston.info("Initialization logic completed.");
  },
  (err) => {
    winston.error(util.inspect(err));
    process.exit(1);
  }
);
