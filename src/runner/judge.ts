import pathLib = require("path");
import randomString = require("randomstring");
import util = require("util");
import fse = require("fs-extra");
import winston = require("winston");
import nodeStream = require("stream");

const syspipe = require("syspipe");

import { SandboxStatus } from "simple-sandbox/lib/interfaces";
import {
  TestcaseResultType,
  StandardRunTask,
  StandardRunResult,
  InteractionRunTask,
  AnswerSubmissionRunTask,
  AnswerSubmissionRunResult,
  RPCRequest,
} from "../interfaces";
import { createOrEmptyDir, tryEmptyDir } from "./utils";
import { readFileLength, streamToBuffer, tryReadFile } from "../utils";
import { globalConfig as Cfg } from "./config";
import { runProgram, runDiff } from "./run";
import { getLanguage, Language } from "../languages";
import { fetchBinary } from "./executable";
import { signals } from "./signals";
import { fetchFile, push } from "./ioj-api";
import { InternalSymbolName } from "typescript";

const workingDir = `${Cfg.workingDirectory}/data`;
const spjWorkingDir = `${Cfg.workingDirectory}/data-spj`;

interface SpjResult {
  status: TestcaseResultType;
  message: string;
  score: number;
}

const spjFullScore = 100;

function getStatusByScore(score: number): TestcaseResultType {
  switch (score) {
    case spjFullScore:
      return TestcaseResultType.Accepted;
    case 0:
      return TestcaseResultType.WrongAnswer;
    default:
      return TestcaseResultType.PartiallyCorrect;
  }
}

async function runSpj(
  spjBinDir: string,
  spjLanguage: Language
): Promise<SpjResult> {
  const scoreFileName = "score.txt";
  const messageFileName = "message.txt";
  const [resultPromise] = await runProgram(
    spjLanguage,
    spjBinDir,
    spjWorkingDir,
    Cfg.spjTimeLimit,
    Cfg.spjMemoryLimit * 1024 * 1024,
    null,
    scoreFileName,
    messageFileName
  );
  const spjRunResult = await resultPromise;

  if (spjRunResult.result.status !== SandboxStatus.OK) {
    return {
      status: TestcaseResultType.JudgementFailed,
      message: `Special Judge ${
        SandboxStatus[spjRunResult.result.status]
      } encountered.`,
      score: 0,
    };
  } else {
    const scoreString = await tryReadFile(
        pathLib.join(spjWorkingDir, scoreFileName)
      ),
      score = Number(scoreString);
    const messageString = await readFileLength(
      pathLib.join(spjWorkingDir, messageFileName),
      Cfg.stderrDisplayLimit
    );

    if (!scoreString || isNaN(score) || score < 0 || score > spjFullScore) {
      return {
        status: TestcaseResultType.JudgementFailed,
        message: `Special Judge returned an unrecoginzed score: ${scoreString}.`,
        score: 0,
      };
    } else {
      return {
        status: getStatusByScore(score),
        message: messageString,
        score: score / spjFullScore,
      };
    }
  }
}

export async function judgeAnswerSubmission(
  task: AnswerSubmissionRunTask
): Promise<AnswerSubmissionRunResult> {
  return null;
}

export async function judgeStandard(
  _task: RPCRequest
): Promise<StandardRunResult> {
  const task: StandardRunTask = _task.task;
  winston.debug("Standard judge task...", task);
  const dataWorkingDir =
    `${Cfg.workingDirectory}/tmp-` + randomString.generate(10);
  try {
    // TODO: the test files are recognized in the following code.
    // If the test files are sent with http request, the following code should be refactored.
    // const testDataPath = pathLib.join(Cfg.testDataDirectory, task.testDataName);
    // const inputFilePath = task.inputData != null ?
    //     pathLib.join(testDataPath, task.inputData) : null;
    // const answerFilePath = task.answerData != null ?
    //     pathLib.join(testDataPath, task.answerData) : null;

    winston.debug("Creating directories...");
    await Promise.all([
      createOrEmptyDir(workingDir),
      createOrEmptyDir(spjWorkingDir),
      createOrEmptyDir(dataWorkingDir),
    ]);

    let stdinRedirectionName,
      inputFileName,
      stdoutRedirectionName,
      outputFileName;
    const tempErrFile = randomString.generate(10) + ".err";

    // if (task.fileIOInput != null) {
    //     inputFileName = task.fileIOInput;
    //     stdinRedirectionName = null;
    // } else {
    //     if (task.inputData != null) {
    stdinRedirectionName = inputFileName = randomString.generate(10) + ".in";
    //     } else {
    // stdinRedirectionName = inputFileName = null;
    //     }
    // }

    // if (task.fileIOOutput != null) {
    //     outputFileName = task.fileIOOutput;
    //     stdoutRedirectionName = null;
    // } else {
    stdoutRedirectionName = outputFileName = randomString.generate(10) + ".out";
    // }

    winston.debug("Fetching inputs...", _task.inputs);
    winston.debug("Fetching inputs...", _task.inputs[0]);

    const binaryDirectory = await fetchBinary(
      randomString.generate(10),
      _task.inputs[0].value
    );
    const language = getLanguage(_task.inputs[1].value);
    const userCode = _task.inputs[2].value;
    const stdInputStream = await fetchFile(_task.inputs[5].value);
    const stdOutputStream = await fetchFile(_task.inputs[6].value);

    // if (inputFilePath != null) {
    //     winston.debug("Copying input file...");
    //     await fse.copy(inputFilePath, pathLib.join(workingDir, inputFileName));
    // }

    await fse.writeFile(
      pathLib.join(workingDir, inputFileName),
      await streamToBuffer(stdInputStream as nodeStream.Readable)
    );
    const answerFilePath = pathLib.join(dataWorkingDir, outputFileName);
    await fse.writeFile(
      answerFilePath,
      await streamToBuffer(stdOutputStream as nodeStream.Readable)
    );

    winston.debug("Running user program...");
    // console.log(language);
    const [resultPromise] = await runProgram(
      language,
      binaryDirectory,
      workingDir,
      task.time,
      task.memory * 1024 * 1024,
      stdinRedirectionName,
      stdoutRedirectionName,
      tempErrFile
    );
    const runResult = await resultPromise;

    winston.verbose(" Run result: " + JSON.stringify(runResult));

    const time = Math.round(runResult.result.time / 1e6),
      memory = runResult.result.memory / 1024;

    let status: TestcaseResultType = null,
      message = null;
    if (runResult.outputLimitExceeded) {
      status = TestcaseResultType.OutputLimitExceeded;
    } else if (runResult.result.status === SandboxStatus.TimeLimitExceeded) {
      status = TestcaseResultType.TimeLimitExceeded;
    } else if (runResult.result.status === SandboxStatus.MemoryLimitExceeded) {
      status = TestcaseResultType.MemoryLimitExceeded;
    } else if (runResult.result.status === SandboxStatus.RuntimeError) {
      message = `Killed: ${signals[runResult.result.code]}`;
      status = TestcaseResultType.RuntimeError;
    } else if (runResult.result.status !== SandboxStatus.OK) {
      message =
        "Warning: corrupt sandbox result " + util.inspect(runResult.result);
      status = TestcaseResultType.RuntimeError;
    } else {
      message = `Exited with return code ${runResult.result.code}`;
    }

    const [userOutput, userError] = await Promise.all([
      readFileLength(
        pathLib.join(workingDir, outputFileName),
        Cfg.dataDisplayLimit
      ),
      readFileLength(
        pathLib.join(workingDir, tempErrFile),
        Cfg.stderrDisplayLimit
      ),
    ]);

    try {
      await fse.move(
        pathLib.join(workingDir, outputFileName),
        pathLib.join(spjWorkingDir, "user_out")
      );
    } catch (e) {
      if (
        e.code === "ENOENT" &&
        runResult.result.status === SandboxStatus.OK &&
        !runResult.outputLimitExceeded
      ) {
        status = TestcaseResultType.FileError;
      }
    }

    const partialResult = {
      time: time,
      memory: memory,
      userOutput: userOutput,
      userError: userError,
      systemMessage: message,
    };
    if (status !== null) {
      return Object.assign(
        { scoringRate: 0, spjMessage: null, result: status },
        partialResult
      );
    } else {
      if (answerFilePath != null)
        await fse.copy(answerFilePath, pathLib.join(spjWorkingDir, "answer"));

      //   if (task.spjExecutableName != null) {
      //     const [spjBinDir, spjLanguage] = await fetchBinary("");
      //     winston.debug(`Using spj, language: ${spjLanguage.name}`);
      //     if (inputFilePath != null)
      //       await fse.copy(inputFilePath, pathLib.join(spjWorkingDir, "input"));
      //     await fse.writeFile(pathLib.join(spjWorkingDir, "code"), userCode);
      //     winston.debug(`Running spj`);
      //     const spjResult = await runSpj(spjBinDir, spjLanguage);
      //     winston.debug("Judgement done!!");

      //     return Object.assign(
      //       {
      //         scoringRate: spjResult.score,
      //         spjMessage: spjResult.message,
      //         result: spjResult.status,
      //       },
      //       partialResult
      //     );
      //   } else {
      winston.debug(`Running diff`);
      const diffResult = await runDiff(spjWorkingDir, "user_out", "answer");
      winston.debug("Judgement done!!");

      _task.outputs = [
        // result
        {
          type: "number",
          value: diffResult.pass ? 1 : 0,
        },
      ];

      await push(_task);

      return Object.assign(
        {
          scoringRate: diffResult.pass ? 1 : 0,
          spjMessage: diffResult.message,
          result: diffResult.pass
            ? TestcaseResultType.Accepted
            : TestcaseResultType.WrongAnswer,
        },
        partialResult
      );
      //   }
    }
  } finally {
    // tryEmptyDir(workingDir);
    // tryEmptyDir(spjWorkingDir);
  }
}

export async function judgeInteraction(
  task: InteractionRunTask
): Promise<StandardRunResult> {
  return null;
}
