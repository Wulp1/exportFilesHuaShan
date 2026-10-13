const router = require('express').Router();
const AV = require('leancloud-storage');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const https = require('https');
const archiver = require('archiver');

AV.init({
  appId: "F9tyT5VsLXLCAqxKvTHqzmvP-gzGzoHsz",
  appKey: "17eIyz42rRL1YubtKE5MgLHm",
  serverURL: "https://api-shc.megahealth.cn"
});

const EXPORT_DIR = 'C:/Users/www/Desktop/export_reports';
const LAST_SUCCESS_PATH = path.join(__dirname, 'lastSuccessAt.txt');
const ALL_DATA_PATH = path.join(__dirname, 'public', 'allData.json');
const INTERVAL_MS = 10 * 60 * 1000; // 每 10 分钟
const OVERLAP_MS = 2 * 60 * 1000;   // 小重叠 2 分钟
const PAGE_SIZE = 100;

// 默认只查这些机构；可按需增删
const DEFAULT_ORG_IDS = [
  '62e76bf9286e3d30eefe03cb',
  '630c5577e6f69b71e92794d6',
  '62eccf46d5534c0fbf61562d'
];

/** 规范化机构号列表：入参优先，否则用默认数组 */
function normalizeOrgIds(orgIds) {
  if (Array.isArray(orgIds)) {
    return orgIds.map(String).map(s => s.trim()).filter(Boolean);
  }
  if (typeof orgIds === 'string' && orgIds.trim()) {
    return [orgIds.trim()];
  }
  return DEFAULT_ORG_IDS.slice();
}

let isRunning = false;
let schedulerStarted = false;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readLastSuccessAt() {
  try {
    if (!fs.existsSync(LAST_SUCCESS_PATH)) return null;
    const raw = fs.readFileSync(LAST_SUCCESS_PATH, 'utf8').trim();
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch (err) {
    console.error('读取 lastSuccessAt 失败:', err);
    return null;
  }
}

function writeLastSuccessAt(date) {
  const iso = date instanceof Date ? date.toISOString() : new Date(date).toISOString();
  fs.writeFileSync(LAST_SUCCESS_PATH, iso, 'utf8');
  console.log('已更新 lastSuccessAt =>', iso);
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

function downloadFile(fileUrl, fileName, writePath, type, index) {
  return new Promise((resolve, reject) => {
    if (!fileUrl) {
      resolve(null);
      return;
    }
    const dest = path.join(writePath, fileName);
    const fileStream = fs.createWriteStream(dest);
    https.get(fileUrl, response => {
      if (response.statusCode && response.statusCode >= 400) {
        fileStream.close();
        fs.unlink(dest, () => {});
        reject(new Error(`下载失败 HTTP ${response.statusCode}: ${fileUrl}`));
        return;
      }
      response.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close(() => {
          console.log(type, index, '=>文件下载完成。=>', dest);
          resolve(dest);
        });
      });
    }).on('error', error => {
      fileStream.close();
      fs.unlink(dest, () => {});
      console.error(type, index, dest, '=>下载文件时发生错误:', error);
      reject(error);
    });
  });
}

function getDeviceSN(item) {
  const idDevice = item.get('idDevice');
  return (idDevice && idDevice.get('deviceSN'))
    || (idDevice && idDevice.get('deviceSNS01D'))
    || (item.get('remoteDevice') && item.get('remoteDevice').deviceSN)
    || 'unknown';
}

function getOrgId(item) {
  const idBaseOrg = item.get('idBaseOrg');
  return (idBaseOrg && idBaseOrg.id) || 'unknownOrg';
}

function getWritePath(item) {
  const orgId = getOrgId(item);
  const tempSleepId = item.get('tempSleepId') || '';
  const date = tempSleepId.length >= 12 ? tempSleepId.slice(4, 12) : 'unknown';
  const deviceSN = getDeviceSN(item);
  // exportFile/机构号/日期-设备号-报告objectId
  const reportObjectId = item.id;
  return path.join(EXPORT_DIR, orgId, `${date}-${deviceSN}-${reportObjectId}`);
}

/** 收集本条报告「应该存在」的本地文件名（仅统计云端有引用的文件） */
async function collectExpectedFiles(item) {
  const expected = [];
  const tempSleepId = item.get('tempSleepId') || '';
  const date = tempSleepId.length >= 12 ? tempSleepId.slice(4, 12) : 'unknown';
  const deviceSN = getDeviceSN(item);

  expected.push(`${date}_${deviceSN}_report.json`);

  const ringFile = item.get('idRingReportFile');
  if (ringFile && ringFile.get('url') && ringFile.get('name')) {
    expected.push(ringFile.get('name'));
  }

  const waveFile = item.get('waveFiledId');
  if (waveFile && waveFile.get('url') && waveFile.get('name')) {
    expected.push(waveFile.get('name'));
  }

  const algoFile = item.get('fileId');
  if (algoFile && algoFile.get('url') && algoFile.get('name')) {
    expected.push(algoFile.get('name'));
  }

  if (tempSleepId) {
    try {
      const queryFile = new AV.Query('_File');
      queryFile.contains('name', tempSleepId);
      const tempFiles = await queryFile.find();
      const hasbin = tempFiles.find(f => {
        const n = f.get('name') || '';
        return n.indexOf('bin_') !== -1;
      });
      if (hasbin && hasbin.get('name')) {
        expected.push(hasbin.get('name'));
      }
    } catch (err) {
      // 查不到 bin 不算期望文件
    }
  }

  return expected;
}

function fileExistsNonEmpty(filePath) {
  try {
    const st = fs.statSync(filePath);
    return st.isFile() && st.size > 0;
  } catch (_) {
    return false;
  }
}

/** 本地目录存在，且 report.json 里匹配 tempSleepId/id，且期望文件齐全 */
async function isLocalComplete(item) {
  const writePath = getWritePath(item);
  if (!fs.existsSync(writePath)) return false;

  const tempSleepId = item.get('tempSleepId');
  const reportId = item.id;
  const date = (tempSleepId || '').length >= 12 ? tempSleepId.slice(4, 12) : 'unknown';
  const deviceSN = getDeviceSN(item);
  const jsonPath = path.join(writePath, `${date}_${deviceSN}_report.json`);

  if (!fileExistsNonEmpty(jsonPath)) return false;

  try {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const local = JSON.parse(raw);
    const localId = local.objectId || local.id;
    const localTemp = local.tempSleepId
      || (local.attributes && local.attributes.tempSleepId);
    const idMatch = localId === reportId || localTemp === tempSleepId;
    if (!idMatch) return false;
  } catch (_) {
    return false;
  }

  const expected = await collectExpectedFiles(item);
  return expected.every(name => fileExistsNonEmpty(path.join(writePath, name)));
}

async function queryDataSince(orgIds, sinceDate, skip = 0, allData = []) {
  const ids = normalizeOrgIds(orgIds);
  if (!ids.length) {
    throw new Error('机构号数组为空，无法查询');
  }

  const q = new AV.Query('Reports');
  q.notEqualTo('AHI', -1);
  q.greaterThanOrEqualTo('endStatusTimeMinute', 180);
  q.notEqualTo('delete', true);

  const orgPointers = ids.map(id =>
    AV.Object.createWithoutData('BaseOrganizations', id)
  );
  q.containedIn('idBaseOrg', orgPointers);

  if (sinceDate) {
    q.greaterThanOrEqualTo('createdAt', sinceDate);
  }
  q.include('idBaseOrg');
  q.include('idDevice');
  q.include('idGroup');
  q.include('idModifiedReport');
  q.include('idPatient');
  q.include('idRingOriginalData');
  q.include('idRingReport');
  q.include('idRingReportFile');
  q.include('waveFiledId');
  q.include('fileId');
  q.ascending('createdAt');
  q.skip(skip);
  q.limit(PAGE_SIZE);

  const results = await q.find();
  allData.push(...results);
  console.log(`query skip=${skip} got=${results.length} totalSoFar=${allData.length}`);

  if (results.length === PAGE_SIZE) {
    return queryDataSince(ids, sinceDate, skip + PAGE_SIZE, allData);
  }
  return allData;
}

async function findRingBinFile(tempSleepId) {
  if (!tempSleepId) return null;
  const queryFile = new AV.Query('_File');
  queryFile.contains('name', tempSleepId);
  const tempFiles = await queryFile.find();
  return tempFiles.find(f => {
    const n = f.get('name') || '';
    return n.indexOf('bin_') !== -1;
  }) || null;
}

async function downloadReportFiles(item, index) {
  const writePath = getWritePath(item);
  await ensureDir(writePath);

  const tempSleepId = item.get('tempSleepId') || '';
  const date = tempSleepId.length >= 12 ? tempSleepId.slice(4, 12) : 'unknown';
  const deviceSN = getDeviceSN(item);

  const ringFile = item.get('idRingReportFile');
  if (ringFile && ringFile.get('url') && ringFile.get('name')) {
    const dest = path.join(writePath, ringFile.get('name'));
    if (!fileExistsNonEmpty(dest)) {
      await downloadFile(ringFile.get('url'), ringFile.get('name'), writePath, 'ring', index);
      await delay(300);
    }
  }

  const waveFile = item.get('waveFiledId');
  if (waveFile && waveFile.get('url') && waveFile.get('name')) {
    const dest = path.join(writePath, waveFile.get('name'));
    if (!fileExistsNonEmpty(dest)) {
      await downloadFile(waveFile.get('url'), waveFile.get('name'), writePath, 'wave', index);
      await delay(300);
    }
  } else {
    console.log(index, '没有呼吸波文件');
  }

  const algoFile = item.get('fileId');
  if (algoFile && algoFile.get('url') && algoFile.get('name')) {
    const dest = path.join(writePath, algoFile.get('name'));
    if (!fileExistsNonEmpty(dest)) {
      await downloadFile(algoFile.get('url'), algoFile.get('name'), writePath, 'temp', index);
      await delay(300);
    }
  } else {
    console.log(index, '没有算法bin文件');
  }

  try {
    const hasbin = await findRingBinFile(tempSleepId);
    if (hasbin && hasbin.get('url') && hasbin.get('name')) {
      const dest = path.join(writePath, hasbin.get('name'));
      if (!fileExistsNonEmpty(dest)) {
        await downloadFile(hasbin.get('url'), hasbin.get('name'), writePath, 'bin', index);
        await delay(300);
      }
    } else {
      console.log(index, '没有戒指算法bin', tempSleepId);
    }
  } catch (err) {
    console.log(index, '没有戒指算法bin', tempSleepId, err && err.message);
  }

  const jsonPath = path.join(writePath, `${date}_${deviceSN}_report.json`);
  const jsonData = JSON.stringify(item);
  await fsp.writeFile(jsonPath, jsonData, 'utf8');
  console.log(index, 'JSON数据已成功写入文件！', jsonPath);

  return writePath;
}

function toTableRow(item) {
  const tempSleepId = item.get('tempSleepId');
  const remoteDevice = item.get('remoteDevice') || {};
  const idDevice = item.get('idDevice');
  const deviceSN = getDeviceSN(item);
  const orgId = getOrgId(item);
  const writePath = getWritePath(item);
  return {
    id: item.id,
    orgId,
    tempSleepId,
    idReport: item.get('idReport'),
    remoteDevice,
    customInfo: item.get('customInfo'),
    createdAt: item.createdAt,
    startSleepTime: item.get('startSleepTime'),
    extraCheckTimeMinute: item.get('extraCheckTimeMinute'),
    idDevice,
    deviceSN,
    deviceSNS01D: idDevice && idDevice.get('deviceSNS01D'),
    filePath: writePath
  };
}

/**
 * 增量导出主流程：
 * 读 lastSuccessAt → since = lastSuccessAt - 2min → 翻页 → skip 齐全 / 否则下载
 * 全部成功后写本批 max(createdAt)
 */
async function runIncrementalExport(orgIds) {
  if (isRunning) {
    console.log('[export] 上一轮未结束，跳过本次');
    return { skipped: true, reason: '上一轮未结束' };
  }

  isRunning = true;
  const startedAt = new Date();
  const targetOrgIds = normalizeOrgIds(orgIds);
  console.log('[export] 开始', startedAt.toISOString(), 'orgIds=', targetOrgIds.join(','));

  try {
    await ensureDir(EXPORT_DIR);

    const lastSuccessAt = readLastSuccessAt();
    // 无水位：从「当天往前第 3 天」本地 00:00:00 起查；有水位：lastSuccessAt - 2 分钟重叠
    const threeDaysAgoStart = new Date(startedAt);
    threeDaysAgoStart.setDate(threeDaysAgoStart.getDate() - 3);
    threeDaysAgoStart.setHours(0, 0, 0, 0);
    const sinceDate = lastSuccessAt
      ? new Date(lastSuccessAt.getTime() - OVERLAP_MS)
      : threeDaysAgoStart;
    console.log(
      '[export] lastSuccessAt=',
      lastSuccessAt ? lastSuccessAt.toISOString() : '(无，用前三天零点)',
      'since=',
      sinceDate.toISOString()
    );

    const resData = await queryDataSince(targetOrgIds, sinceDate, 0, []);
    console.log('[export] 本批查询条数=', resData.length);

    const tableData = [];
    const successCreatedAts = [];
    let skippedCount = 0;
    let downloadedCount = 0;

    for (let i = 0; i < resData.length; i++) {
      const item = resData[i];
      tableData.push(toTableRow(item));

      try {
        const complete = await isLocalComplete(item);
        if (complete) {
          skippedCount++;
          console.log(i, 'skip 本地齐全', item.get('tempSleepId') || item.id);
          successCreatedAts.push(item.createdAt);
          continue;
        }

        await downloadReportFiles(item, i);
        const ok = await isLocalComplete(item);
        if (!ok) {
          throw new Error('下载后文件仍不齐全: ' + (item.get('tempSleepId') || item.id));
        }
        downloadedCount++;
        successCreatedAts.push(item.createdAt);
      } catch (err) {
        console.error('[export] 单条失败，本批不推进水位:', item.get('tempSleepId') || item.id, err);
        throw err;
      }
    }

    if (successCreatedAts.length > 0) {
      const maxCreatedAt = successCreatedAts.reduce((a, b) =>
        new Date(a).getTime() >= new Date(b).getTime() ? a : b
      );
      writeLastSuccessAt(maxCreatedAt);
    } else if (!lastSuccessAt) {
      // 首跑无数据：写下当前时间，避免下次仍全量扫
      writeLastSuccessAt(startedAt);
    }

    try {
      await fsp.writeFile(ALL_DATA_PATH, JSON.stringify(tableData), 'utf8');
      console.log('[export] 展示 JSON 已写入');
    } catch (err) {
      console.error('[export] 写入 allData.json 失败:', err);
    }

    const summary = {
      skipped: false,
      orgIds: targetOrgIds,
      count: resData.length,
      skippedCount,
      downloadedCount,
      lastSuccessAt: readLastSuccessAt(),
      data: tableData
    };
    console.log('[export] 完成', summary.skippedCount, 'skip,', summary.downloadedCount, 'download');
    return summary;
  } finally {
    isRunning = false;
  }
}

function startExportScheduler(orgIds) {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const ids = normalizeOrgIds(orgIds);
  console.log(
    `[export] 定时任务已启动，每 ${INTERVAL_MS / 60000} 分钟执行一次，机构=`,
    ids.join(',')
  );

  // 启动后稍等再跑首轮，避免抢启动日志
  setTimeout(() => {
    runIncrementalExport(ids).catch(err => {
      console.error('[export] 首次自动执行失败:', err);
    });
  }, 3000);

  setInterval(() => {
    runIncrementalExport(ids).catch(err => {
      console.error('[export] 定时执行失败:', err);
    });
  }, INTERVAL_MS);
}

// 手动触发：body.orgIds 为机构数组；未传则用 DEFAULT_ORG_IDS
router.post('/reports/export', async function (req, res) {
  const body = req.body || {};
  const orgIds = body.orgIds != null ? body.orgIds : body.orgId;
  try {
    const result = await runIncrementalExport(orgIds);
    if (result.skipped) {
      res.status(409).json({ code: 409, msg: result.reason });
      return;
    }
    res.send({
      code: 200,
      orgIds: result.orgIds,
      count: result.count,
      skippedCount: result.skippedCount,
      downloadedCount: result.downloadedCount,
      lastSuccessAt: result.lastSuccessAt,
      data: result.data,
      msg: 'success!'
    });
  } catch (error) {
    console.error('[export] 手动触发失败:', error);
    res.status(400).json({ error: String(error && error.message || error) });
  }
});

router.get('/reports/export/status', function (req, res) {
  res.json({
    isRunning,
    lastSuccessAt: readLastSuccessAt(),
    intervalMinutes: INTERVAL_MS / 60000
  });
});

// 压缩文件（保留原能力）
function zip(outputPath, inputPath, callback) {
  console.log('reports/export=>', 'into zip', outputPath, inputPath);
  const output = fs.createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  output.on('finish', function () {
    console.log('reports/export=>', 'finish zip', outputPath);
  });
  archive.on('warning', function (err) {
    console.log('reports/export=>', 'warning', err + '');
    if (err.code !== 'ENOENT') callback(err);
  });
  archive.on('error', function (err) {
    console.log('reports/export=>', 'error', err + '');
    callback(err);
  });
  archive.pipe(output);
  archive.directory(inputPath, false);
  console.log('reports/export=>', 'start zip');
  archive.finalize();
}

module.exports = router;
module.exports.startExportScheduler = startExportScheduler;
module.exports.runIncrementalExport = runIncrementalExport;
