const express = require('express')
const path = require('path')
const helmet = require('helmet')
const logger = require('morgan') //打印日志
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const proxy = require('express-http-proxy') //代理
const querystring = require('querystring') //处理对象为 name=wangbing的形式
const fs = require('fs') //文件处理
// fs.writeFileSync(dst, fs.readFileSync(src));拷贝文件到另一位置
const mkdirp = require('mkdirp');//创建多层级目录
const multer = require('multer') //用于文件上传
const urljoin = require('url-join') //拼接路径
const request = require('request')
const ejs = require('ejs');//模版引擎
const cheerio = require('cheerio')
const compression = require('compression') //服务器端启用gzip压缩
const getCc = require('./applyMiddleware/getCc.js') //cc视频中间键
const debug = require('./applyMiddleware/debug.js') //cc视频中间键
const util = require('./util')
const https = require('https')
const ossConfig = require('./config/oss.config')
const pbuMinio = require('./applyMiddleware/upload')
const formidable = require('express-formidable') //用于文件上传

// const pbu_wx_sdk = require('pbu-wx-sdk') //wx sdk中间键
var router = express.Router()

const app = express()
//将文件等信息绑定在red.body上
var upload = multer({
    dest: 'upload/'
})
// app.use(formidable({
//     encoding: 'utf-8',
//     uploadDir:'./dest',
//     multiples: true
//   }))
  
var updateHtml = multer({dest:'dist/'})
app.use(router)
router.get('/user/:id', function (req, res, next) {
    console.log('although this matches')
    res.send(req.params.id)
})
app.set('port', process.env.PORT || 6080)
app.set('trust proxy', true)


app.use(compression())//gzip压缩尽量放在其他中间件前面

//主要用来解析前端传过来的数据(分装在req.body)
app.use(bodyParser.json()) //解析 Content-type : appliaction/json 就是json对象
app.use(bodyParser.urlencoded({ extended: true })) //解析 Content-type : application/x-www-form-urlencoded 是一个通过&拼接起来的字符串

//对http传入的cookie进行解析后赋值给req.cookies(参数是signed密钥)
app.use(cookieParser('aa12312312312a'))
// 对cookie进行签名
// app.get('/set',(req,res,next)=>{
//     res.cookie('name','wb',{signed:true})
//     res.send('200')
// })
// app.get('/get',(req,res,next)=>{
//     res.send(req.signedCookies.name)
// })

//打印日志
app.use(logger('dev'))

// cc视频中间件
app.use(getCc.getCc)
// debug日志处理
app.use(debug)


app.use(pbuMinio(ossConfig))

//使用express-http-proxy代理所有的post请求 只是转发请求
app.use('/demo', (req, resp, next) => {
    https.get('https://www.baidu.com', function (res) {
        const buffer = []
        res.on('data', d => {
            buffer.push(d)
        })
        res.on('end', () => {
            resp.end(Buffer.concat(buffer))
        })
    })
    return
})

// 模版引擎
app.get('/template', (req, res, next) => {
    const injectData = {
        indexCss: `你好的`,
    }
    const templateHTML = fs.readFileSync('./template/index.html', 'utf-8')
    const htmlString = ejs.render(templateHTML, injectData);
    fs.writeFileSync('./template/index.html', htmlString);
    res.sendFile(path.resolve(__dirname, './template/index.html'), {
        headers: {
            'Content-Type': 'text/html;charset=utf8'
        }
    })

})



//cheerio 操作dom
app.get('/cheerio', (req, res, next) => {
    let user = new Date().toLocaleTimeString()
    fs.readFile('./index.html', 'utf8', (err, data) => {
        $ = cheerio.load(data, {
            decodeEntities: false
        });
        $('.box').append('<div>来了老弟</div>')
        fs.writeFile('./index.html', $.html(), (err) => {
            if (!err) {
                console.log('写入成功')
            }
        });
    })
    next()
})
app.get('*',(req,res,next)=>{
    res.set({
        'Access-Control-Allow-Origin': '*'
    })
    next()
})
//读取静态资源
app.use(express.static('dist'))

//用于上传使用(single参数为上传文件空间的name属性)
app.post('/upload', upload.single('img'), (req, res, next) => {
    fs.readFile('./upload/' + req.file.filename, (err, data) => {
        fs.writeFile('./upload/' + req.file.originalname, data, err => {
            if (err) throw err
            fs.unlink('./upload/' + req.file.filename, err => {
                console.log('删除成功')
            })
            res.set({
                'Access-Control-Allow-Origin': '*'
            })
            res.send({
                status: '上传成功',
                url: 'http://localhost:6080/downloadFile/' + req.file.originalname
            })
        })
    })
})
// formidable 等同于multer 
// app.post('/upload',(req,res,next)=>{
//     console.log('req',req.files.file)
//     const file = req.files.file
//     console.log('file',file)
//     // fs.readFile(file.path,function(error,buffer){
//     //   fs.writeFile('./dest/test.jpg',buffer);
//     //   });
//     res.json({code:200})
// })
  

app.post('/updateHtml',updateHtml.single('html'),(req,res,next)=>{
    fs.rename('./dist/' + req.file.filename,'./dist/' + req.file.originalname,function(err){
      if(err){
        res.send({msg:'上传失败'})
      }else{
        res.send({msg:'上传成功'})
      }
    })
  })
// app.post('/updateHtml',updateHtml.single('html'),(req,res,next)=>{
//     fs.readFile('./dist/' + req.file.filename, (err, data) => {
//         fs.writeFile('./dist/' + req.file.originalname, data, err => {
//             if (err) throw err
//             fs.unlink('./dist/' + req.file.filename, err => {
//                 console.log('删除成功')
//             })
//             res.set({
//                 'Access-Control-Allow-Origin': '*'
//             })
//             res.send({
//                 status: '上传成功',
//             })
//         })
//     })
// })

//用与文件批量上传
app.post('/mult_upload', upload.array('img', 20), (req, res, next) => {
    console.log('req.file', req.files)
    res.send('上传成功')
})


//使用express-http-proxy代理所有的post请求 只是转发请求
app.use('*', proxy('https://api.seentao.com', {
    //拼接代理地址
    proxyReqPathResolver: function (req) {
        const path = req.params[0].split('/').reverse()
        return urljoin('https://api.seentao.com', `${path[1]}/${path[0]}`)
    },
    //拼接传递参数
    proxyReqBodyDecorator: function (bodyContent, srcReq) {
        return querystring.stringify(bodyContent)
    },
    //处理接口的返回参数
    userResDecorator: function (proxyRes, proxyResData, userReq, userRes) {
        userRes.set('name', 'wb')
        data = JSON.parse(proxyResData.toString('utf8'))
        return JSON.stringify(data)
    },
    filter: function (req, res) {
        return req.method == 'POST'
    }
})
)

//解决跨域问题
app.use('/cors', (req, res, next) => {
    if (req.method == 'POST') {
        const path = req.path.split('/').reverse();
        request.post({
            url: urljoin('https://api.seentao.com', `${path[1]}/${path[0]}`),
            form: req.body
        }, function (err, response, body) {
            if (err) {
                next()
            }
            res.json(JSON.parse(body))
        });
    } else {
        next()
    }
})

//使用路由中间件(next('route')会将权限直接转给下一个路由，而不会去执行当前路由的下一个句柄)
app.get('/route', (req, res, next) => {
    if (req.query.level != 1) {
        next()
    }
},
    (req, res, next) => {
        if (req.query.level == 2) {
            res.send('2')
        } else {
            next()
        }
    }
)
// jsonp 实现方式
app.get('/getJsonp',(req,res,next)=>{
    const callback = req.query.callback
    console.log('222',req.query)
    res.send(callback+'("哈哈")')
})

//配置cors  模仿api接口
app.get('/responce', (req, res, next) => {
    //添加头部信息
    res.set({
        'Access-Control-Allow-Origin': '*'
    })
    res.append('name', 'wangbing')
    res.status(404).json({
        sex: '男'
    })
})
app.get('/deleteCache', (req, res, next) => {
    // 用于清除node reuqire的缓存
    delete require.cache[require.resolve('./tt.js')];
    const a = require('./tt.js')
    res.send(a)
})



//在任何都没有匹配到的情况下 就发送index.html
app.get('*', (req, res, next) => {
    res.status(200).sendFile(path.resolve(__dirname + '/dist/index.html'))
})

app.listen(app.get('port'), function () {
    console.log('可访问端口:' + 'http://localhost:' + app.get('port'))
    console.log('可访问端口:' + util.getIPv4() + ':' + app.get('port'))
})
