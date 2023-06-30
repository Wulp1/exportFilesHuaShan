const router = require('express').Router();
const AV = require('leancloud-storage');
const { Query, User } = AV;
const fs = require('fs');
const http = require('http');
const https = require('https');
const archiver = require('archiver');

AV.init({
  appId: "F9tyT5VsLXLCAqxKvTHqzmvP-gzGzoHsz",
  appKey: "17eIyz42rRL1YubtKE5MgLHm",
  serverURL: "https://api-shc.megahealth.cn"
});


//下载文件
function getFiles(fileUrl,name,writePath,type,index) {
  // const fileUrl = 'https://file-shc.megahealth.cn/lYbRhjSqycfjANJcW1WjtzGsrQfNmuEElrXXd0mn.zip';
  // const fileName = 'downloaded_file.zip';
  const fileName = `${writePath}/${name}`|| `./exportFile/downloaded_file.zip`;
  const fileStream = fs.createWriteStream(fileName);
  https.get(fileUrl, response => {
    response.pipe(fileStream);
    fileStream.on('finish', () => {
      fileStream.close();
      console.log(type,index,'=>文件下载完成。=》',fileName);
    });
  }).on('error', error => {
    console.error(type,index,fileName,"=>",'下载文件时发生错误:', error,);
  });
}

//创建文件夹
function createDirectoryIfNotExists(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath);
    console.log(`文件夹 ${directoryPath} 创建成功。`);
  } else {
    console.log(`文件夹 ${directoryPath} 已存在。`);
  }
}

//压缩文件
function zip(outputPath, inputPath, callback) {
  console.log('reports/export=>', 'into zip', outputPath, inputPath);
  // 第二步，创建可写流来写入数据
  const output = fs.createWriteStream(outputPath); // 将压缩包保存到当前项目的目录下，并且压缩包名为
  const archive = archiver('zip', { zlib: { level: 9 } }); // 设置压缩等级
  output.on('finish', function () {
    console.log('reports/export=>', 'finish zip',outputPath);
    // callback(null, outputPath);
  });
  archive.on('warning', function (err) {
    if (err.code === 'ENOENT') {
      // log warning
      console.log('reports/export=>', 'warning', err + '');
    } else {
      console.log('reports/export=>', 'warning', err + '');
      // throw error
      callback(err);
    }
  });
  archive.on('error', function (err) {
    console.log('reports/export=>', 'error', err + '');
    callback(err);
  });
  // 第三步，建立管道连接
  archive.pipe(output);
  // 第四步，压缩文件和目录到压缩包中
  archive.directory(inputPath, false);
  // 第五步，开启压缩
  console.log('reports/export=>', 'start zip');
  archive.finalize();
}

//获取数据
async function getAllReports(orgId,pageNum) {
  let result = [];
  var count = 0;
  if(orgId) {
    let q = new AV.Query("Reports");
    let idBaseOrgPointer = AV.Object.createWithoutData("BaseOrganizations",orgId);
    q.notEqualTo('AHI',-1);
    q.greaterThanOrEqualTo('endStatusTimeMinute',180);
    q.equalTo('idBaseOrg',idBaseOrgPointer);
    q.notEqualTo('delete',true);
    q.include("idBaseOrg");
    q.include("idDevice");
    q.include("idGroup");
    q.include("idModifiedReport");
    q.include("idPatient");
    q.include("idRingOriginalData");
    q.include("idRingReport");
    q.include("idRingReportFile");
    q.include("waveFiledId");
    q.descending("createdAt"); 
    q.skip(pageNum * 100);
    q.limit(100);
    try {
      count = await q.count();
      console.log('count',count);
      data = await q.find();
      result = data;
    } catch (error) {
      console.log('error',error);
    }
  }
  return {
    count,
    result
  };
}

//
const queryData = async (orgId,skip, limit,allData = []) => {
  let id = orgId;
  let q = new AV.Query("Reports");
  let idBaseOrgPointer = AV.Object.createWithoutData("BaseOrganizations",id);
  q.notEqualTo('AHI',-1);
  q.greaterThanOrEqualTo('endStatusTimeMinute',180);
  q.equalTo('idBaseOrg',idBaseOrgPointer);
  q.notEqualTo('delete',true);
  q.include("idBaseOrg");
  q.include("idDevice");
  q.include("idGroup");
  q.include("idModifiedReport");
  q.include("idPatient");
  q.include("idRingOriginalData");
  q.include("idRingReport");
  q.include("idRingReportFile");
  q.include("waveFiledId");
  q.descending("createdAt"); 
  q.skip(skip);
  q.limit(limit);
  let count = await q.count();
  console.log('aaa',count);
  const results = await q.find();
  //将查询结果添加到 allData 数组中
  allData.push(...results);
  console.log('skip',skip);
  console.log('limit',limit);
  console.log('count',count);
  const remaining = 100 - (skip + limit);
  // if (remaining > 0) {
  //   console.log('remaining>0,remaining=>',remaining);
  //   console.log('id=>',id);
  //   const nextSkip = skip + limit;
  //   const nextLimit = Math.min(remaining, 1000);
  //   return queryData(id,nextSkip, nextLimit,allData);
  // }else {
    //所有数据查询完毕，返回结果
    return allData;
  // }
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


router.post('/reports/export',async function(req,res){
  console.log('export req',req.body);
  const { orgId } = req.body;
  console.log('orgId',orgId);
  try {
    let data = [];
    if(orgId) {
      try {
        queryData(orgId,0, 100).then(async(resData) => {
          console.log('allData=>',resData.length);
          let allDataPath = './allData.json';
          // if(resData) {
          //   let tableData = [];
          //   resData.forEach(item => {
          //     // console.log('item',item);
          //     let id = item.id;
          //     let tempSleepId = item.get('tempSleepId');
          //     let idReport = item.get('idReport');
          //     let remoteDevice = item.get('remoteDevice');
          //     let customInfo = item.get('customInfo');
          //     let createdAt = item.createdAt;
          //     let startSleepTime = item.get('startSleepTime');
          //     let extraCheckTimeMinute = item.get('extraCheckTimeMinute');
          //     let idDevice = item.get("idDevice");
          //     let deviceSN= item.get("idDevice") && item.get("idDevice").get("deviceSN");
          //     let deviceSNS01D = item.get("idDevice") &&item.get("idDevice").get("deviceSNS01D");
          //     tableData.push({
          //       id,
          //       tempSleepId,
          //       idReport,
          //       remoteDevice,
          //       customInfo,
          //       createdAt,
          //       startSleepTime ,
          //       extraCheckTimeMinute,
          //       idDevice,
          //       deviceSN,
          //       deviceSNS01D,
          //     });
          //   });
          //   let allData = JSON.stringify(tableData);
          //   fs.writeFile(allDataPath, allData, async(err) => {
          //     if (err) {
          //       console.error('写入JSON文件时发生错误：', err);
          //     } else {
          //       console.log('JSON数据已成功写入文件！');
          //     }
          //   });
          // }
          if(resData) {
            let outputPath = 'C:/Users/www/Desktop/export_reports';
            for(let i=0;i<resData.length;i++) {
              let item = resData[i];
              // delete item.get('ACL');
              console.log(i,item.get('tempSleepId'));
              let tempSleepId = item.get('tempSleepId');
              let date = tempSleepId.slice(4,12);
              // if(i ==1) console.log('item',item.get('remoteDevice').deviceSN);
              if(tempSleepId == 'temp202305171406i5e9140635c5545f99f7583fd2f7775b1') console.log('yyyy',i);
              // let deviceSN = item&&item.get('remoteDevice').deviceSN;
              let deviceSN= item.get("idDevice")&&item.get("idDevice").get("deviceSN");
              let writePath = `./exportFile/${date}-${deviceSN}`;
              await createDirectoryIfNotExists(writePath);
              // console.log('item',item);
              let tableData = [];
              let id = item.id;
              let idReport = item.get('idReport');
              let remoteDevice = item.get('remoteDevice');
              let customInfo = item.get('customInfo');
              let createdAt = item.createdAt;
              let startSleepTime = item.get('startSleepTime');
              let extraCheckTimeMinute = item.get('extraCheckTimeMinute');
              let idDevice = item.get("idDevice");
              let deviceSNS01D = item.get("idDevice") &&item.get("idDevice").get("deviceSNS01D");
              let filePath = `${outputPath}-${date}-${deviceSN}`;
              tableData.push({
                id,
                tempSleepId,
                idReport,
                remoteDevice,
                customInfo,
                createdAt,
                startSleepTime ,
                extraCheckTimeMinute,
                idDevice,
                deviceSN,
                deviceSNS01D,
                filePath,
              });
              console.log('后处理文件idRingReportFile',item.get('idRingReportFile'));
              console.log('呼吸波文件waveFiledId',item.get('waveFiledId'));
              console.log('算法bin文件fileId',item.get('fileId'));

              //后处理文件
              if(item&&item.get('idRingReportFile')) {
                let ringFileUrl = item&&item.get('idRingReportFile').get('url')? item.get('idRingReportFile').get('url'):'';
                let ringFileName = item&&item.get('idRingReportFile').get('name')?item.get('idRingReportFile').get('name'): '';
                if(ringFileUrl!== '') {
                  await getFiles(ringFileUrl,ringFileName,writePath,'ring',i);
                  await delay(500);
                }
              }
              //呼吸波文件
              if(item&&item.get('waveFiledId')) {
                let waveFileUrl = item.get('waveFiledId')&&item.get('waveFiledId').get('url')?item.get('waveFiledId').get('url'):"";
                let waveFileName = item.get('waveFiledId')&&item.get('waveFiledId').get('name')?item.get('waveFiledId').get('name'):"";
                if(waveFileUrl!== "") {
                  await getFiles(waveFileUrl,waveFileName,writePath,'wave',i);
                  await delay(500);
                }else {
                  console.log('没有呼吸波文件');
                }
              }
              //算法bin文件
              if(item&&item.get('fileId')) {
                let FileUrl = item.get('fileId')&&item.get('fileId').get('url')?item.get('fileId').get('url'):"";
                let FileName = item.get('fileId')&&item.get('fileId').get('name')?item.get('fileId').get('name'):"";
                if(FileUrl !=='') {
                  console.log('算法FileUrl',i,FileUrl,FileName);
                  await getFiles(FileUrl,FileName,writePath,'temp',i);
                  await delay(500);
                }else {
                  console.log('没有算法bin文件');
                }
              }
              //血氧bin文件
              if (tempSleepId&&tempSleepId!=='xx') {
                  var queryFile = new AV.Query('_File');
                  queryFile.contains('name', tempSleepId);
                  try {
                    const tempFile = await queryFile.find();
                    if (tempFile.length > 0) {
                      let hasbin = tempFile.find((i) => {
                        let n = i.attributes.name;
                        if (n.indexOf('bin_') !== -1) {
                          return i;
                        }
                      });
                      if (hasbin) {
                        console.log('有戒指算法bin');
                        console.log('hasbin,url,name,writePath',hasbin.attributes.url, hasbin.attributes.name,writePath);
                        getFiles(hasbin.attributes.url, hasbin.attributes.name,writePath,'bin',i);
                        await delay(500);
                      } else {
                        console.log('没有戒指算法bin',tempSleepId);
                      }
                    } else {
                      console.log('没有戒指算法bin',tempSleepId);
                    }
                  } catch (error) {
                    console.log('没有戒指算法bin',tempSleepId);
                  }
              } else {
                console.log('没有血氧bin文件',tempSleepId);
              }
              const jsonData = JSON.stringify(item);
              let jsonPath = `${writePath}/${date}_${deviceSN}_report.json`;
              fs.writeFile(jsonPath, jsonData, async(err) => {
                if (err) {
                  console.error('写入JSON文件时发生错误：', err);
                } else {
                  console.log('JSON数据已成功写入文件！');
                  zip(outputPath + '\\'+ date + '_' + deviceSN + '.zip', writePath,(err2) => {
                    if (err2) {
                      res.status(400).json({ error: 'zip is error!' });
                    } else {
                      console.log('zip error!',tempSleepId);
                    }
                  });
                }
              });
            }
          }
          res.send({
            code:200,
            count:resData.length,
            msg:'success!',
          })
        }).catch(error => {
          // 处理错误
          console.error(error);
        });
      } catch (error) {
        console.log('error',error);
      }
    }
  } catch (error) {
    console.log('error',error);
    res.status(400).json({ error,});
    return;
  }
})

module.exports = router