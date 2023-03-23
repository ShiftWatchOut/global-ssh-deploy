#!/usr/bin/env node

const archiver = require('archiver');
const fs = require('fs');
const path = require('path')
const { NodeSSH } = require('node-ssh');

const [_1, _2, envFile] = process.argv
checkOrExit(envFile, '必须传入带有 .env 文件的路径')
require('dotenv').config({
    path: path.resolve(process.cwd(), envFile)
})
const { SSH_HOST, SSH_PORT, SSH_USERNAME, SSH_PASSWORD, DEPLOY_DIR } = process.env
console.log('工作目录：', process.cwd());
console.log('准备登录：', SSH_HOST);
checkOrExit(SSH_HOST, '必要变量 SSH_HOST 未找到')
checkOrExit(SSH_PORT, '必要变量 SSH_PORT 未找到')
checkOrExit(SSH_USERNAME, '必要变量 SSH_USERNAME 未找到')
checkOrExit(SSH_PASSWORD, '必要变量 SSH_PASSWORD 未找到')
checkOrExit(DEPLOY_DIR, '必要变量 DEPLOY_DIR 未找到')
const ssh = new NodeSSH();

const configs = {
    deploy: {
        ssh: { host: SSH_HOST, port: SSH_PORT, username: SSH_USERNAME, password: SSH_PASSWORD },
        dir: DEPLOY_DIR,
        fn: deploy,
    },
};

const config = configs.deploy;

const sshConfig = config.ssh;
const remoteDir = config.dir;

config.fn();

async function deploy() {
    console.log('开始部署');
    console.log('远程登录...');
    await ssh.connect(sshConfig);

    console.log('删除远程文件...');
    await ssh.execCommand(`rm -rf ${remoteDir}/*;`);

    console.log('删除完成');
    console.log('压缩本地文件...');
    await startZip();

    console.log('压缩成功');
    console.log('远程上传压缩包...');
    await ssh.putFile('dist.tar', `${remoteDir}/dist.tar`);

    console.log('上传完成');
    console.log('开始解压...');
    await ssh.execCommand(`cd ${remoteDir} && tar -xvf dist.tar && rm -f dist.tar`);

    console.log('解压完成');
    console.log('部署成功!');
    ssh.dispose()
    process.exit(0);
}

// 压缩dist目录为dist.tar
function startZip() {
    return new Promise((resolve) => {
        const archive = archiver('tar', {
            zlib: { level: 5 }, // 递归扫描最多5层
        }).on('error', (err) => {
            throw err; // 压缩过程中如果有错误则抛出
        });

        const output = fs.createWriteStream('dist.tar').on('close', (err) => {
            /* 压缩结束时会触发close事件，然后才能开始上传，
                        否则会上传一个内容不全且无法使用的tar包 */
            if (err) {
                console.log('关闭archiver异常:', err);
                return;
            }
            resolve && resolve();
        });

        archive.pipe(output); // 典型的node流用法
        archive.directory('dist', '/'); // 将srcPach路径对应的内容添加到tar包中
        archive.finalize();
    });
}

/**
 * 
 * @param {any} check 
 * @param {string} msg 
 * @returns 
 */
function checkOrExit(check, msg) {
    if (!check) {
        console.log(msg);
        return process.exit(1)
    }
}
