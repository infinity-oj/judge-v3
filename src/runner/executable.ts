import tar = require("tar");
import lockfile = require("lockfile");
import Bluebird = require("bluebird");
import pathLib = require("path");
import fse = require("fs-extra");
import msgpack = require("msgpack-lite");
import winston = require("winston");

import { streamToBuffer } from "../utils";
import { globalConfig as Cfg } from "./config";
import { getLanguage, Language } from "../languages";
import { redisBinarySuffix, redisMetadataSuffix } from "../interfaces";
import fs = require("fs");
import { fetchFile, http } from "./ioj-api";

import nodeStream = require("stream");

Bluebird.promisifyAll(lockfile);

const FormData = require("form-data");

export interface BinaryMetadata {
  language: string;
  code: string;
}

export async function newVolume() {
  const res = await http.post("/volume");
  // console.log(res.data);
  return res.data.name;
}

export async function pushBinary(
  name: string,
  language: Language,
  code: string,
  path: string
): Promise<string> {
  winston.verbose(`Pushing binary ${name}, creating tar archive...`);
  const binary = await streamToBuffer(
    tar.create(
      {
        gzip: true,
        cwd: path,
        portable: true,
      },
      ["."]
    )
  );

  const form = new FormData();
  form.append("file", binary, name + redisBinarySuffix);

  try {
    const volumeName = await newVolume();

    const res = await http({
      method: "post",
      url: `/volume/${volumeName}/file`,
      data: form,
      headers: {
        "Content-Type": `multipart/form-data; boundary=${form._boundary}`,
      },
    });
    // console.log(res);
    return res.data.name + ":/" + name + redisBinarySuffix;
  } catch (err) {
    console.log(err);
  }
}

// Return value: [path, language, code]
export async function fetchBinary(name: string, volumeFile: string): Promise<string> {
  winston.verbose(`Fetching binary ${name}...`);

  const targetName = pathLib.join(Cfg.binaryDirectory, name);
  const lockFileName = pathLib.join(Cfg.binaryDirectory, `${name}-get.lock`);

  // const metadata = msgpack.decode(await getRedis(name + redisMetadataSuffix)) as BinaryMetadata;
  const isCurrentlyWorking = await fse.exists(lockFileName);
  // The binary already exists, no need for locking
  if ((await fse.exists(targetName)) && !isCurrentlyWorking) {
    winston.debug(`Binary ${name} exists, no need for fetching...`);
  } else {
    winston.debug(`Acquiring lock ${lockFileName}...`);
    await lockfile.lockAsync(lockFileName, {
      wait: 1000,
    });
    let ok = false;
    try {
      winston.debug(`Got lock for ${name}.`);
      if (await fse.exists(targetName)) {
        winston.debug(`Work ${name} done by others...`);
      } else {
        winston.debug(`Doing work: fetching binary for ${name} ...`);
        await fse.mkdir(targetName);

        const fileStream = await fetchFile(volumeFile);
        const binary = await streamToBuffer(fileStream as nodeStream.Readable)
        // const binary = await getRedis(name + redisBinarySuffix);
        // winston.debug(`Decompressing binary (size=${binary.length})...`);
        await new Promise((res, rej) => {
          const s = tar.extract({
            cwd: targetName,
          });
          s.on("error", rej);
          s.on("close", res);
          s.write(binary)
          s.end();
        });
      }
      ok = true;
    } finally {
      if (!ok) await fse.rmdir(targetName);
      winston.debug("Unlocking...");
      await lockfile.unlockAsync(lockFileName);
    }
  }
  return targetName;
}
