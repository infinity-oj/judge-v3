import tar = require('tar');
import lockfile = require('lockfile');
import Bluebird = require('bluebird');
import pathLib = require('path');
import fse = require('fs-extra');
import msgpack = require('msgpack-lite');
import winston = require('winston');

import { streamToBuffer } from '../utils';
import { get as getRedis, put as putRedis } from './redis';
import { globalConfig as Cfg } from './config';
import { getLanguage, Language } from '../languages';
import { redisBinarySuffix, redisMetadataSuffix } from '../interfaces';
import fs = require("fs")
import {pushExecutableToServer} from "./tasks";
Bluebird.promisifyAll(lockfile);

export interface BinaryMetadata {
    language: string;
    code: string;
}

export async function pushBinary(name: string, language: Language, code: string, path: string): Promise<void> {
    winston.verbose(`Pushing binary ${name}, creating tar archive...`);
    const binary = await streamToBuffer(tar.create({
        gzip: true,
        cwd: path,
        portable: true
    }, ['.']));
    const data: BinaryMetadata = {
        language: language.name,
        code: code
    };

    fs.writeFile(path, binary, err => {
        if (err) {
            return winston.error(err.message)
        }
        winston.info(`file ${name} has been dumped into ${path}`)
    })
    await pushExecutableToServer(binary, data)
}

// Return value: [path, language, code]
export async function fetchBinary(spj: boolean,task: any): Promise<[string, Language, string]> {
    let binary: Buffer
    if (spj){
        binary = task.spjExecutable
    } else {
        binary = task.executable
    }

    // TODO: binary to local path
    let path: string
    return [path, task.metaData.language, task.metaData.code]

}
