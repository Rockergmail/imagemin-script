/*
 * @description: 图片压缩
 * @author: xiangrong.liu
 * @Date: 2022-02-24 22:26:28
 * @LastEditors: xiangrong.liu
 * @LastEditTime: 2022-05-21 16:15:54
 */
import { promises as fs } from 'fs';
import crypto from 'crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { globby } from 'globby';
import chalk from 'chalk';
import convertToUnixPath from 'slash';
import ora from 'ora';
import imagemin from 'imagemin';
import imageminGifsicle from 'imagemin-gifsicle';
import imageminOptpng from 'imagemin-optipng';
import imageminMozjpeg from 'imagemin-mozjpeg';
import imageminJpegtran from 'imagemin-jpegtran';
import imageminPngquant from 'imagemin-pngquant';
import imageminSvgo from 'imagemin-svgo';

// 1. 建立imagemin.map.json缓存表，如果已经处理过，则不再处理，处理过就更新到imagemin.map.json
// 2. 需要覆盖原图，assets/images下有多个文件夹，所以需要解决dest的路径问题，需要用imagemin.buffer来重写
// 3. 有些图片在压缩完之后会变得更大，这种情况不覆盖写入文件，但是要写入缓存文件，且时间戳是旧文件自己的时间戳
// 4. 更多图片类型的插件见 https://github.com/orgs/imagemin/repositories?type=all

// 缓存文件
let cacheFilename = '../imagemin.map.json';
// 图片文件目录
const input = ['src/assets/images/test/*.{jpg,png,svg,gif,jpeg}'];
// 插件
const plugins = [
  imageminGifsicle({
    optimizationLevel: 7,
    interlaced: false
  }),
  imageminOptpng({
    optimizationLevel: 7
  }),
  imageminJpegtran({
    // quality: 80
  }),
  imageminMozjpeg(),
  imageminPngquant({
    quality: [0.8, 0.9],
    speed: 4
  }),
  imageminSvgo({
    plugins: [
      {
        name: 'removeViewBox'
      },
      {
        name: 'removeEmptyAttrs',
        active: false
      }
    ]
  })
];
const debug = false;
let tinyMap = new Map();
let cache, cachePath;
let time;
let filePaths = [];
const spinner = ora('图片压缩中...');
(async () => {
  const unixFilePaths = input.map((path) => convertToUnixPath(path));
  cachePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    cacheFilename
  );
  cache = await fs.readFile(cachePath);
  cache = JSON.parse(cache.toString() || '{}');
  // 通过通配符匹配文件路径
  filePaths = await globby(unixFilePaths, { onlyFiles: true });
  // console.log(filePaths)
  filePaths = await filterFiles(filePaths);
  // debug && console.log(filePaths);
  await processFiles(filePaths);
})();

async function filterFiles(filePaths) {
  for (let i = filePaths.length - 1; i >= 0; i--) {
    let currentPath = filePaths[i];
    let buffer = await fs.readFile(currentPath);
    let md5 = crypto.createHash('md5').update(buffer).digest('hex');
    if (cache[currentPath] === md5) {
      filePaths.splice(i, 1);
    } else {
      const oldSize = buffer.byteLength;
      if (tinyMap.get(currentPath)) {
        tinyMap.set(currentPath, {
          ...tinyMap.get(currentPath),
          oldBuffer: buffer,
          oldSize: oldSize / 1024,
          md5
        });
      } else {
        tinyMap.set(currentPath, {
          oldBuffer: buffer,
          oldSize: oldSize / 1024,
          md5
        });
      }
    }
  }
  return filePaths;
}

// 处理单个文件，调用imagemin.buffer处理
async function processFile(filePath) {
  let buffer = tinyMap.get(filePath).oldBuffer;
  let content;
  try {
    content = await imagemin.buffer(buffer, {
      plugins
    });
    console.log(content);
    console.log(content.byteLength / 1024);
    const size = content.byteLength,
      oldSize = tinyMap.get(filePath).oldSize;
    tinyMap.set(filePath, {
      ...tinyMap.get(filePath),
      size: size / 1024,
      ratio: size / oldSize - 1,
      content
    });
  } catch (error) {
    console.error('imagemin error:' + filePath);
  }
}
// 批量处理
async function processFiles(filePaths) {
  if (!filePaths.length) {
    return;
  }
  spinner.start();
  time = Date.now();
  let handles = filePaths.map(async (filePath) => {
    await processFile(filePath);
  });
  await Promise.all(handles);
  await generateFiles(filePaths);
}
// 生成文件并覆盖源文件
async function generateFiles(filePaths) {
  if (filePaths.length) {
    let handles = JSON.parse(JSON.stringify(filePaths));
    handles = handles.map(async (filePath) => {
      const { content, md5, ratio } = tinyMap.get(filePath);
      if (content) {
        if (ratio < 0) {
          await fs.writeFile(filePath, content);
          cache[filePath] = md5;
        } else {
          // 存在压缩之后反而变大的情况，这种情况不覆盖原图，但会记录到缓存表中，且记录的时间戳是旧文件自己的时间戳
          cache[filePath] = md5;
        }
      }
    });
    await Promise.all(handles);
    handleOutputLogger();
    generateCache();
  }
}
// 生成缓存文件;
async function generateCache() {
  await fs.writeFile(cachePath, Buffer.from(JSON.stringify(cache)), {
    encoding: 'utf-8'
  });
}
// 输出结果
function handleOutputLogger() {
  spinner.stop();
  console.info('图片压缩成功');
  time = (Date.now() - time) / 1000 + 's';
  const keyLengths = Array.from(tinyMap.keys(), (name) => name.length);
  const valueLengths = Array.from(
    tinyMap.values(),
    (value) => `${Math.floor(100 * value.ratio)}`.length
  );
  const maxKeyLength = Math.max(...keyLengths);
  const valueKeyLength = Math.max(...valueLengths);
  tinyMap.forEach((value, name) => {
    let { ratio } = value;
    const { size, oldSize } = value;
    ratio = Math.floor(100 * ratio);
    const fr = `${ratio}`;
    // 存在压缩之后反而变大的情况，这种情况不覆盖原图，所以这种情况显示0%
    const denseRatio =
      ratio > 0
        ? // ? chalk.red(`+${fr}%`)
          chalk.green(`0%`)
        : ratio <= 0
        ? chalk.green(`${fr}%`)
        : '';
    const sizeStr =
      ratio <= 0
        ? `${oldSize.toFixed(2)}kb / tiny: ${size.toFixed(2)}kb`
        : `${oldSize.toFixed(2)}kb / tiny: ${oldSize.toFixed(2)}kb`;
    console.info(
      chalk.dim(
        chalk.blueBright(name) +
          ' '.repeat(2 + maxKeyLength - name.length) +
          chalk.gray(
            `${denseRatio} ${' '.repeat(valueKeyLength - fr.length)}`
          ) +
          ' ' +
          chalk.dim(sizeStr)
      )
    );
  });
  console.info('图片压缩总耗时', time);
}
