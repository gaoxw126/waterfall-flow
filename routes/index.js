var express = require('express');
var router = express.Router();

var request = require('request');
var async = require('async');
var fs = require('fs');
var http = require('http');
var open = require('open');



/* GET home page. */
router.get('/', function(req, res) {
	res.render('index', { title: '瀑布流demo' });
});

router.get('/api/getImage',function(req,res) {
	var url = req.query.url;
	var re = url.match(/http:\/\/(\w\.hiphotos).+\/(.+)\.(jpg|png|jpeg|bmp|gif)/i);
	//待保存文件的目录
	var rootPath = __dirname+'/../public/images/';
	//文件完整路径
	var savePath = rootPath + re[2] + '.' + re[3];
	var options = {
		host:re[1] + '.baidu.com',
		port:80,	//不是必需
		path:url.match(/http:\/\/\w\.hiphotos\.baidu.com(\/.+)/)[1],
        headers:{
            //伪造一个userAgent，如果为空，则百度认为是盗链，不会返回正确的图片
            'user-agent':'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.101 Safari/537.36'
        }
	};


	//若文件不存在，则请求并保存
	fs.exists(savePath,function(exists) {
		if(!exists) {
			var r = http.get(options,function(response) {
				var imagedata = '';
				response.setEncoding('binary');
				response.on('data',function(chunk) {
					imagedata += chunk;
				});
				response.on('end',function() {
					fs.writeFile(savePath,imagedata,'binary',function(err) {
						if(err) throw err;
						console.log('File saved');
						fs.readFile(savePath,function(err,data) {
							//响应头
							res.writeHead(200, {'Content-Type': 'image/'+ (re[3] == 'png' ? 'x-png' : re[3])});
							//输出
							res.end(data,'binary');
						});
					});
				});
			});
		} else {
			fs.readFile(savePath,function(err,data) {
				//响应头
				res.writeHead(200, {'Content-Type': 'image/'+ (re[3] == 'png' ? 'x-png' : re[3])});
				//输出
				res.end(data,'binary');
			});
		}
	});
});

router.get('/api/waterfall',function(req,res) {

	//页码, 浏览器向下拉, 发出的请求.
	var p = req.query.page;
	//图片数据接口地址
    // p= req.quey.page 随着浏览器向下请求, p++ , 相应请求 百度的 第 p+1页, 当百度无数据时, 返回为空. 会导致下面出错.
    //var url = 'http://image.baidu.com/data/imgs?col=%E5%8A%A8%E6%BC%AB&tag=%E5%85%A8%E9%83%A8&sort=1&tag3=&pn='+(p+1)*15+'&rn=15&p=channel&from=1'
    var url = 'http://image.baidu.com/data/imgs?col=%E5%8A%A8%E6%BC%AB&tag=%E5%85%A8%E9%83%A8&sort=1&tag3=&pn='+(1)*15+'&rn=15&p=channel&from=1'
	//var url = 'http://image.baidu.com/data/imgs?col=%e9%a3%8e%e6%99%af&tag=%c6%fb%b3%b5&sort=1&tag3=&pn='+(p+1)*15+'&rn=13&p=channel&from=2';
	var ret;
	var db = require('./db.js');

	//数据库配置
	var db_config = {
		host: 'localhost',
		user: 'root',
		password: '123456',
		database:'test'
	};

	var connection = db(db_config);

	//这一段数据库里有数据后就可以注释掉了，不用再请求图片接口，省些流量
	request(url,function(error,response,body) {
		if(!error && response.statusCode == 200) {
			//格式化数据
			ret = JSON.parse(body);
			//将数据保存进数据库
			saveImagesInfo(ret,connection);
            console.log("call saveImage");
        }
    	});

	//最少取6条数据，因为布局中限定了最大列数是6列
	connection.query('select * from waterfallimg limit ' + p * 10 +',10',function(err,rows) {
        //connection.release();
		if(err) throw err;
		res.send(rows);
	});
});


//保存图片信息到数据库
function saveImagesInfo(ret,connection) {
    //console.log("[saveImage] ret.imgs = ", ret.imgs)
    console.log("[saveImage] ret.imgs length = ", ret.imgs.length)
    //console.log("[saveImage] ret.imgs.slice(0, -1).length  = ", ret.imgs.slice(0, -1).length)
    // 不适用 imgs[]最后一个, 因为最后一个是空{}
	async.eachSeries(ret['imgs'].slice(0, -1),function(item,next) {
	//async.eachSeries(ret['imgs'],function(item,next) {
         //console.log("ret elem = ", item)
        if (item === '{}') {
             console.log("ret elem = null")
        }
		var id = item.id;
		var imgUrl = item.thumbnailUrl || '';
		var oWidth = item.thumbnailWidth;
		var oHeight = item.thumbnailHeight;

        console.log("in saveImage");
        if (isNaN(parseFloat(id))) {
               console.log("id is Nan. Exit");
        }
        if(!id) {
            next();
            console.log("id= %d . Excute next", id);
        }
		connection.query('select * from `waterfallimg` where `id` = ?',[id],function(err,data) {
                console.log("query by id=%d.", id);
			if(err) {
                console.log("query is err. excute next(err)");
                return next(err);
            }

            console.log("query end.");
            //else next(null)
			if(data.length === 0) {

                console.log("query data length =0.");
				//thumbnailUrl是缩略图地址
				if(imgUrl.indexOf('hiphotos') == -1) {
                    console.log("query img Url  hiphotes = -1.");
					//如果缩略图地址不能访问则访问真实地址
					imgUrl = item.imageUrl;
					//同时获取原始宽高
					oWidth = item.imageWidth;
					oHeight = item.imageHeight;
				}
				//将图片信息放进数据库
				//connection.query('insert into `waterfallimg`(`id`,`url`,`title`,`width`,`height`) values(?,?,?,?,?)',[id,imgUrl,escape(item.title),oWidth,oHeight],next);
                if (imgUrl != '') {
                    console.log("imgUrl = %s ,  Then next.", imgUrl);
                    //connection.query('insert into `waterfallimg`(`id`,`url`,`title`,`width`,`height`) values(?,?,?,?,?)',[id,imgUrl,escape(item.title),oWidth,oHeight]);
                    connection.query('insert into `waterfallimg`(`url`,`title`,`width`,`height`) values(?,?,?,?) ON DUPLICATE KEY UPDATE `url`=?',[imgUrl,escape(item.title),oWidth,oHeight,imgUrl]);
                }
                else {
                    console.log("imgUrl = '' ,  Then next.");
                    //next()
                }
			} else {
                console.log("query data.length != 0.");
                next();
            }

		});
	});
}

module.exports = router;
