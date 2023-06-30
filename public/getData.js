// let responseData;
// fetch("../allData.json").then((response) => response.json()).then((res) => {
//   console.log('res',res);
//   getTable(res);
//   responseData = res;
// });

// function getTable(data) {
//   const table = document.getElementById('myTable');
//   const tbody = table.querySelector('tbody');
//   data.forEach(item => {
//     let row = document.createElement('tr');
//     let idReportCell = document.createElement('td');
//     let nameCell = document.createElement('td');
//     let SnCell = document.createElement('td');
//     let StartTimeCell = document.createElement('td');
//     let EndTimeCell = document.createElement('td');
//     let durationCell = document.createElement('td');
//     let SleepIdCell = document.createElement('td');

//     let idReportText = document.createTextNode(item.idReport);
//     let nameText = document.createTextNode(item.customInfo.name);
//     let SnText = document.createTextNode(item.deviceSN) || document.createTextNode(item.deviceSNS01D);
//     let StartTimeText = document.createTextNode(item.startSleepTime);
//     let EndTimeText = document.createTextNode(item.startSleepTime);
//     let durationText = document.createTextNode(item.extraCheckTimeMinute);
//     let SleepIdText = document.createTextNode(item.tempSleepId);

//     idReportCell.appendChild(idReportText);
//     nameCell.appendChild(nameText);
//     SnCell.appendChild(SnText);
//     StartTimeCell.appendChild(StartTimeText);
//     EndTimeCell.appendChild(EndTimeText);
//     durationCell.appendChild(durationText);
//     SleepIdCell.appendChild(SleepIdText);

//     row.appendChild(idReportCell);
//     row.appendChild(nameCell);
//     row.appendChild(SnCell);
//     row.appendChild(StartTimeCell);
//     row.appendChild(EndTimeCell);
//     row.appendChild(durationCell);
//     row.appendChild(SleepIdCell);

//     tbody.appendChild(row);
//   });
// }

// function getQueryData() {
//   var inputElement = document.getElementById("inputField");
//   var queryData = inputElement.value;
//   // 在这里可以对获取到的输入框内容进行处理
//   console.log("查询的内容是：" + queryData);
//   if(responseData) {
//     let newData = [];
//     responseData.forEach(item => {
//       if(item.idReport == queryData) {
//         newData.push(item);
//       }
//     })
//     console.log('newData',newData);
//     getTable(newData);
//   }
// }

let responseData =[];
fetch("../allData.json").then((response) => response.json()).then((res) => {
    console.log('res', res);
    res.forEach(item => {
      let monitorStart = dayjs(item.startSleepTime).format("DD日 HH:mm");
      let monitorEnd = dayjs(item.startSleepTime+(item.extraCheckTimeMinute==-1?0:item.extraCheckTimeMinute* 60 * 1000)).format("DD日 HH:mm"); //时间戳
      let start = item.startSleepTime;
      let end = item.startSleepTime+(item.extraCheckTimeMinute==-1?0:item.extraCheckTimeMinute* 60 * 1000);
      let monitorPeriod=Math.floor(parseInt((end-start)/60/1000)/60)+" 时 "+(parseInt((end-start)/60/1000) % 60)+" 分";
      responseData.push({
        monitorStart,
        monitorEnd,
        monitorPeriod,
        ...item
      })
    })
    console.log('responseData',responseData);
    getTable(responseData);
    updateReportsTotal(responseData.length);
  });

  function updateReportsTotal(total) {
    const reportsTotalElement = document.getElementById("ReportsTotal");
    reportsTotalElement.textContent = total;
  }

function getTable(data) {
  const table = document.getElementById('myTable');
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = ''; // 清空表格内容

  data.forEach(item => {
    let row = document.createElement('tr');
    let idReportCell = document.createElement('td');
    let nameCell = document.createElement('td');
    let SnCell = document.createElement('td');
    let StartTimeCell = document.createElement('td');
    let EndTimeCell = document.createElement('td');
    let durationCell = document.createElement('td');
    let SleepIdCell = document.createElement('td');

    let idReportText = document.createTextNode(item.idReport);
    let nameText = document.createTextNode(item.customInfo.name);
    let SnText = document.createTextNode(item.deviceSN) || document.createTextNode(item.deviceSNS01D);
    let StartTimeText = document.createTextNode(item.monitorStart);
    let EndTimeText = document.createTextNode(item.monitorEnd);
    let durationText = document.createTextNode(item.monitorPeriod);
    let filePathText = document.createTextNode(item.filePath);

    idReportCell.appendChild(idReportText);
    nameCell.appendChild(nameText);
    SnCell.appendChild(SnText);
    StartTimeCell.appendChild(StartTimeText);
    EndTimeCell.appendChild(EndTimeText);
    durationCell.appendChild(durationText);
    filePathCell.appendChild(filePathText);

    row.appendChild(idReportCell);
    row.appendChild(nameCell);
    row.appendChild(SnCell);
    row.appendChild(StartTimeCell);
    row.appendChild(EndTimeCell);
    row.appendChild(durationCell);
    row.appendChild(filePathCell);

    tbody.appendChild(row);
  });
}

function getQueryData() {
  var inputElement = document.getElementById("inputField");
  var queryData = inputElement.value;

  console.log("查询的内容是：" + queryData);

  if (responseData) {
    if(queryData) {
      const filteredData = responseData.filter(item => item.idReport === queryData);
      // 清空表格内容
      const tbody = document.querySelector("#myTable tbody");
      tbody.innerHTML = '';
      // 如果有匹配的数据，则更新表格
      if (filteredData.length > 0) {
        getTable(filteredData);
      } else {
        console.log('未找到匹配的数据');
      }
    }else {
      getTable(responseData);
    }
  }
}