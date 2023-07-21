let responseData =[];
fetch("./allData.json").then((response) => response.json()).then((res) => {
    // console.log('res', res);
    responseData = formData(res)
    console.log('responseData',responseData);
    getTable(responseData);
    updateReportsTotal(responseData.length);
  });

  function formData(data) {
    let resData = [];
    if(data) {
      data.forEach(item => {
        let monitorStart = dayjs(item.startSleepTime).format("DD日 HH:mm");
        let monitorEnd = dayjs(item.startSleepTime+(item.extraCheckTimeMinute==-1?0:item.extraCheckTimeMinute* 60 * 1000)).format("DD日 HH:mm"); //时间戳
        let start = item.startSleepTime;
        let end = item.startSleepTime+(item.extraCheckTimeMinute==-1?0:item.extraCheckTimeMinute* 60 * 1000);
        let monitorPeriod=Math.floor(parseInt((end-start)/60/1000)/60)+" 时 "+(parseInt((end-start)/60/1000) % 60)+" 分";
        resData.push({
          monitorStart,
          monitorEnd,
          monitorPeriod,
          ...item
        })
      })
    }
    return resData;
  }

  function updateReportsTotal(total) {
    console.log('total',total);
    const reportsTotalElement = document.getElementById("ReportsTotal");
    reportsTotalElement.textContent = total? total:0;
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
    let filePathCell = document.createElement('td');

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

function getData() {
  var getDataBtn = document.getElementById('dataButton'); // 获取按钮元素
   // 禁用按钮
    getDataBtn.disabled = true;
   // 更改按钮文本为"正在获取数据，请勿重复点击"
    getDataBtn.textContent = '正在获取数据...';
  var orgId = "62e76bf9286e3d30eefe03cb";
  fetch('/reports/export', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ orgId: orgId }) // 将ID数据转换为JSON字符串并作为请求体发送
  })
    .then(function(response) {
      if (response.ok) {
        return response.json();
      } else {
        throw new Error('请求失败：' + response.status);
      }
    })
    .then(function(data) {
      // 处理响应数据，将数据渲染到页面
      console.log('响应数据 data',data);
      let result = formData(data.data);
      getTable(result);
      updateReportsTotal(result.length);
       // 恢复按钮状态和文本
      getDataBtn.disabled = false;
      getDataBtn.textContent = '获取数据';
    })
    .catch(function(error) {
      console.error('请求失败：', error);
       // 恢复按钮状态和文本
      getDataBtn.disabled = false;
      getDataBtn.textContent = '获取数据';
    });
}

