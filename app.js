const express = require('express');
const exportData = require('./index');
const bodyParser = require('body-parser');
const https = require('https');
const test = require('./test');

var app = express();
const PORT = 3002;

// 使用 body-parser 中间件解析请求体
app.use(bodyParser.json()); // 解析 JSON 格式的请求体
app.use(bodyParser.urlencoded({ extended: true })); // 解析表单数据

app.use('/',exportData);
app.use('/public',express.static("public"));
app.use('/',test);

//404
app.use((req,res) => {
  res.status(404)
})


app.listen(PORT,() => {
  console.log(`Server listening on port ${PORT}`);
})