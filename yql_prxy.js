/*
Authorization: Client-ID YOUR_CLIENT_ID
prxy01 111111
109d10abeac9fd3
56aacb3485800ce88abfef213bfece615ea2cdd8
8fec560c1586e93
25f1cbff6c3bbee3d158b59b4372af26ad51224b

prxy03 111111
c8ad8306adb4caf
bfee854b0027943b63ee7b68ee6fbbfc074d8362

prxy04 111111
181046d30c694d4
be8b554c48f0a41959a28f8c85e44808ae07650b
*/

$px = $.noConflict();
/* Don't execute AJAX async request when append/replace a script to document tree */
$px._evalUrl = null;
/* pass exception when load inner code script */
$px._globalEval = $px.globalEval;
$px.globalEval = function(data) {
	try {
		$px._globalEval(data);
	} catch(e) {
		console.log('globalEval error:', e);
	}
};
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};

var imgur = (function() {
	function imgur(force_auth) {
		if(force_auth == undefined) force_auth = true
		this.force_auth = force_auth;
	}
	imgur.prototype._auth = function(cb) {
		$px.ajax({
			type: 'POST',
			url: 'https://api.imgur.com/oauth2/token',
			dataType: 'json',
			data: {
				client_id: '181046d30c694d4',
				client_secret: 'be8b554c48f0a41959a28f8c85e44808ae07650b',
				grant_type: 'password',
				username: 'prxy04',
				password: '111111',
			},
			success: (function(data) {
				this.token = data.access_token;
				if(cb) cb();
			}).bind(this),
		});
	};
	imgur.prototype._check = function(args) {
		if(!this.token) {
			if(this.force_auth) throw 'Imgur need auth first.'
			var func = args.callee;
			var cb = func.bind.apply(func, Array.prototype.concat.apply([this], args));
			this._auth(cb);
			return true;
		}
	};
	imgur.prototype._authhead = function(xhr) {
		if(this.token) {
			xhr.setRequestHeader("Authorization", "Bearer " +  this.token);
		}
	};
	imgur.prototype.update = function(url, cb, errcb, retry) {
		if(this._check(arguments)) return;
		if(!retry) retry = 0;
		console.log('imgur update', url);
		$px.ajax({
			type: 'POST',
			url: 'https://api.imgur.com/3/image',
			dataType: 'json',
			data: {
				image: url,
				type: 'URL',
			},
			beforeSend : this._authhead.bind(this),
			success: this._update_hndl.bind(this, url, cb, errcb, retry),
			error: errcb,
		});
	};
	imgur.prototype._update_hndl = function(url, cb, errcb, retry, data) {
		if(data.success) {
			if(data.data == null) {
				if(retry > 5) {
					throw 'Imgur update unknown success.'
				} else {
					return this.update(url, cb, errcb, retry + 1);
				}
			}
			var img_id = data.data.id;
			var img_url = data.data.link.replace(/http:\/\//, 'https://');
			console.log('imgur get', img_url);
			if(cb) cb(img_id, img_url);
		} else {
			throw 'Imgur update faild.'
		}
	};
	imgur.prototype.del = function(id) {
		if(this._check(arguments)) return;
		$px.ajax({
			type: 'DELETE',
			url: 'https://api.imgur.com/3/image/' + id,
			dataType: 'json',
			beforeSend : this._authhead.bind(this),
		});
	};
	return imgur;
})();

var yql = (function() {
	function yql() {}
	yql.prototype.exccode = function(src) {
		src = arguments[0];
		dst = src.toString().replace(/^[^{]*{/, '').replace(/}[^}]*$/, '').trim().split('\n').join('').split('\t').join(''); //.split(' ').join('');
		for(var i = 1; i < arguments.length; i++) {
			dst = dst.replace(new RegExp('arg' + (i - 1), 'g'), arguments[i]);
		}
		return dst;
	};
	yql.prototype.excyql = function(code, file, env) {
		return 'select * from execute where code="' + code + '"' 
			+ (file && ' and file="' + file + '"' || '')
			+ (env && ' and env="' + env + '"' || '');
	}
	yql.prototype.excurl = function(yql, type) {
		return "https://query.yahooapis.com/v1/public/yql?format=" + (type || 'json') + "&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys&diagnostics=true&q="
			+ encodeURIComponent(yql);
	};
	yql.prototype.get = function(url, type, cb) {
		console.log(url);
		$px.ajax({
			type: 'GET',
			url: url,
			dataType: (type || 'json'),
			success: function(data) {
				cb && cb(data);
			}
		});
	};
	yql.prototype.exc = function(type, cb, src) {
		var remain_args = arguments;
		var pop_arg = function() {
			var rslt_srg = remain_args[0];
			remain_args = Array.prototype.slice.call(remain_args, 1);
			return rslt_srg;
		};
		var type = pop_arg();
		if(typeof(type) == 'function') {
			cb = type;
			type = 'json';
		} else {
			cb = pop_arg();
		}
		this.get(this.excurl(this.excyql(this.exccode.apply(this, remain_args)), type), type, cb);
	}
	yql.prototype.exchtml = function(url, cb) {
		this.get(this.excurl('select * from html where xpath="/html" and url="' + url +'"', 'xml'), 'xml', cb);
	}
	yql.prototype.exchtmlraw = function(url, cb) {
		this.get(this.excurl('select content from data.headers where url="' + url +'"', 'json'), 'json', cb);
	}
	return yql;
})();

var prxy = (function() {
	function prxy(force_replace) {
		this.yql = new yql();
		this.imgur = new imgur();
		if(!force_replace) force_replace = false;
		this._flag_force_replace = force_replace;
		this._flag_imgur_timeout = false;
		this._img_lib = {};
		this.done_hook = function(){};
	}
	prxy.prototype._encode_url = function(url) {
		var rslt = ''
		for(var i = 0; i < url.length; i++)
		{
			rslt = rslt.concat('%' + url[i].charCodeAt().toString(16));
		}
		return rslt;
	};
	prxy.prototype._es_url = function(url) {
		return url.replace(/ /g, '%20');
	};
	prxy.prototype._parse_url = function(url, base_url) {
		var _a = new URL(url, base_url);
		return {url: _a.href, hostname: _a.hostname, pathname: _a.pathname};
	};
	prxy.prototype._url = function(url, base_url) {
		return (new URL(url, base_url)).href;
	};
	prxy.prototype._get_html = function(url, cb, retry) {
		if(!retry) retry = 0;
		this.yql.exchtmlraw(this._es_url(url), this._htmlraw_hndl.bind(this, url, cb, retry));
	};
	prxy.prototype._html_hndl = function(url, cb, retry, yql_rslt) {
		var html_raw = yql_rslt.childNodes[0].childNodes[1].childNodes[0];
		if(!html_raw) {
			if(retry > 5) {
				throw 'No result.';
			} else {
				return this._get_html(url, cb, retry + 1);
			}
		};
		var html = $px(html_raw);//.remove();
		if(cb) cb(url, html);
	};
	prxy.prototype._htmlraw_hndl = function(url, cb, retry, yql_rslt) {
		var html_raw = yql_rslt.query.results.resources.content;
		if(!html_raw) {
			if(retry > 5) {
				throw 'No result.';
			} else {
				return this._get_html(url, cb, retry + 1);
			}
		};
		//var dom = document.implementation.createDocument('', 'html', document.implementation.createDocumentType( 'html', '', ''));
		//var dom = document.implementation.createHTMLDocument();
		//var html = $px.parseHTML(html_raw, dom, false);
		//var html = $px.parseXML(html_raw);
		//var html = $px(html_raw, dom);
		var parser = new DOMParser();
		var dom = parser.parseFromString(html_raw, "text/html");
		var html = $px('html', dom);
		if(cb) cb(url, html);
	};
	prxy.prototype._get_text = function(url, cb, retry) {
		if(!url) throw 'err_get_text: empty url.'
		if(!retry) retry = 0;
		this.yql.exc(this._text_hndl.bind(this, url, cb, retry), this._text_srv, this._es_url(url));
	};
	prxy.prototype._text_srv = function() {
		response.object =y.rest('arg0').get().response;
	};
	prxy.prototype._text_hndl = function(url, cb, retry, yql_rslt) {
		var text_raw = yql_rslt.query.results;
		if(!text_raw || !text_raw.result) {
			if(retry > 5) {
				throw 'No result.';
			} else {
				return this._get_text(url, cb, retry + 1);
			}
		};
		text_raw = text_raw.result;
		if(cb) cb(url, text_raw);
	};
	prxy.prototype._get_image = function(url, cb, errcb) {
		this.imgur.update(url, this._image_hndl.bind(this, url, cb, errcb), errcb);
	};
	prxy.prototype._image_hndl = function(url, cb, errcb, img_id, img_url) {
		this._image2dataurl(img_url, this._dataurl_hndl.bind(this, url, cb, img_id), errcb/* this._get_image.bind(this, url, cb, errcb) */);
	};
	prxy.prototype._image2dataurl = function(url, cb, errhndl, retry) {
		if(!retry) retry = 0;
		var img = new Image();
		img.onload = function() {
			if(to != null) clearTimeout(to);
			var canv = document.createElement('canvas');
			canv.width = img.width;
			canv.height = img.height;
			var ctx = canv.getContext('2d');
			ctx.drawImage(img, 0, 0);
			var dataurl = canv.toDataURL('image/png');
			if(cb) cb(dataurl);
		};
		var _err = (function() {
			if(to != null) clearTimeout(to);
			if(retry > 5) {
				if(errhndl) errhndl();
			} else {
				setTimeout(this._image2dataurl.bind(this, url, cb, errhndl, retry + 1));
			}
		}).bind(this);
		img.onerror = _err;
		img.setAttribute('crossOrigin', 'anonymous');
		var to = this._flag_imgur_timeout ? setTimeout(function() {
			img.src = '';
			console.log('Imagedata timeout.', url);
			/* canceling trig error handle */
			//_err();
		}, 5000) : null;
		img.src = url;
	};
	prxy.prototype._dataurl_hndl = function(url, cb, img_id, dataurl) {
		if(cb) cb(url, dataurl);
		this.imgur.del(img_id);
	};
	prxy.prototype._preload_imgur = function(continue_cb, url, html) {
		this.imgur._auth(continue_cb.bind(this, url, html));
	};
	prxy.prototype._preproc_html = function(continue_cb, elm, url, html) {
		$px('head', html).prepend($px('<base>').attr('href', url).attr('id', '_prxy_base'));
		if(this._flag_force_replace) {

			/*$px('script[src]', html).each((function(idx, elm) {
				this._script_reload(elm);
			}).bind(this));
			$px('link[href][rel=stylesheet]', html).each((function(idx, elm) {
				this._link_reload.call(elm, {data:{this: this}});
			}).bind(this));
			$px('img[src]', html).each((function(idx, elm) {
				this._img_reload.call(elm, {data:{this: this}});
			}).bind(this));
			if(continue_cb) continue_cb.call(this, elm, url, html);*/
			this._preproc_script_hndl($px('script[src]', html), 0,
			this._preproc_link_hndl.bind(this, $px('link[href][rel=stylesheet]', html), 0,
			this._preproc_image_hndl.bind(this, $px('img[src]', html), 0,
			continue_cb.bind(this, elm, url, html))));
		} else {
			this._preload_script(continue_cb, elm, url, html);
		}
	};
	prxy.prototype._preproc_script_hndl = function(elms, idx, continue_cb) {
		if(idx < elms.length) {
			elm = elms[idx];
			this._get_text(elm.src, (function(url, raw) {
				elm.innerHTML = raw;
				this._preproc_script_hndl(elms, idx + 1, continue_cb);
			}).bind(this));
			elm.setAttribute('old_src', elm.src);
			elm.removeAttribute('src');
		} else {
			if(continue_cb) continue_cb();
		}
	};
	prxy.prototype._preproc_link_hndl = function(elms, idx, continue_cb) {
		if(idx < elms.length) {
			elm = elms[idx];
			this._get_text(elm.href, (function(url, raw) {
				$px(elm).replaceWith($px('<style>').attr('old_href', url).html(raw));
				this._preproc_link_hndl(elms, idx + 1, continue_cb);
			}).bind(this));
		} else {
			if(continue_cb) continue_cb();
		}
	};
	prxy.prototype._preproc_image_hndl = function(elms, idx, continue_cb) {
		if(idx < elms.length) {
			elm = elms[idx];
			var imglib = this._img_lib;
			if(elm.src in imglib) {
				elm.setAttribute('src', imglib[elm.src].dataurl);
				elm.setAttribute('old_src', elm.src);
				this._preproc_image_hndl(elms, idx + 1, continue_cb);
			} else {
				imglib[elm.src] = {};
				this._get_image(elm.src, (function(url, dataurl) {
					elm.setAttribute('src', dataurl);
					imglib[url].dataurl = dataurl;
					this._preproc_image_hndl(elms, idx + 1, continue_cb);
				}).bind(this),
				this._preproc_image_hndl.bind(this, elms, idx + 1, continue_cb));
				elm.setAttribute('old_src', elm.src);
			}
		} else {
			if(continue_cb) continue_cb();
		}
	};
	prxy.prototype._preload_script = function(continue_cb, elm, url, html) {
		var scripts = $px('script[src]', html);
		this._preload_script_hndl(scripts, 0, continue_cb.bind(this, elm, url, html));
	};
	prxy.prototype._preload_script_set_error = function(url, cb) {
		var script = $px('script[src^="' + url + '"]');
		script.error(cb);
		return setTimeout(function() {
			/* remove() can't cancel pending request of script,
			   but disable all events handle of it. */
			script.remove();
			console.log('Script timeout.', script[0]);
			if(cb) cb();
		}, 5000);
	};
	prxy.prototype._preload_script_hndl = function(scripts, idx, continue_cb) {
		if(idx < scripts.length) {
			var script = scripts.eq(idx);
			var url = script.prop('src');
			if(url) {
				$px.ajax({
					url: url,
					type: "GET",
					dataType: "script",
					//async: false,
					//global: false,
					success: (function(d) {
						clearTimeout(to);
						this._preload_script_hndl(scripts, idx + 1, continue_cb);
					}).bind(this),
				});
				/* ajax script doesn't support error handle */
				var to = this._preload_script_set_error(url, (function(e) {
					clearTimeout(to);
					this._script_reload(script[0]);
					this._preload_script_hndl(scripts, idx + 1, continue_cb);
				}).bind(this));
			} else {
				console.log('script error, continue.', script[0]);
				this._preload_script_hndl(scripts, idx + 1, continue_cb);
			}
		} else {
			$px('script[async]').remove();
			if(continue_cb) continue_cb();
		}
	};
	prxy.prototype._set_elm_html = function(elm, url, html) {
		$px('a', html).each(this._a_reload);
		/* Cut down by remove,
		   else append and replace on this tree will be treat as document tree,
		   script will trig a AJAX execute op.
		   Without this remove,
		   all scripts in this tree will be set has-executed,
		   extra execute machism in jquery will never be valid*/
		//html.remove();
		$px('link', html).error({this: this}, this._link_reload).load(function(){console.log('load:', this);});
		//$px('script', html).error({url: url}, this._script_reload).load(function(){console.log('load:', this);});
		//$px('script', html).replaceWith(function() {
		//	/* Each script tag only execute once.
		//	   So copy its attributes to a new one.
		//	   But this only for appendChild,
		//	   jquery's append will disable the original script execute machism.*/
		//	_ns = $px('<script>');
		//	$px.each(this.attributes, function() {
		//		if(this.specified) {
		//			if(this.name == 'src') _ns.attr('src', (foo++)+'xxx.js'); else
		//			_ns.attr(this.name, this.value);
		//		}
		//	});
		//	return _ns.error({url: url}, this._script_reload).load(function(){console.log('load:', this);});
		//});
		$px('img', html).error({this: this}, this._img_reload);
		$px('head', elm).append($px('head', html).children());
		/*$px('head', html).children().each(function() {
			//$px('head', elm).append($px(this));
			elm.head.appendChild(this);
		});*/
		$px('body', elm).append($px('body', html).children());
		//$px('script[async]').remove();
		elm.close();
		if(this.done_hook) this.done_hook();
	};
	prxy.prototype._link_reload = function(e) {
		var _this = e.data.this;
		var elm = $px(this);
		//console.log(_this, this);
		if(this.rel == 'stylesheet') {
			_this._get_text(this.href, function(url, raw) {
				elm.replaceWith($px('<style>').attr('old_href', url).html(raw));
			});
		}
	};
	prxy.prototype._script_reload = function(elm) {
		//console.log(elm);
		this._get_text(elm.src, function(url, raw) {
			elm.innerHTML = raw;
		});
		elm.setAttribute('old_src', elm.src);
		elm.removeAttribute('src');
	};
	prxy.prototype._img_reload = function(e) {
		//console.log(this);
		var _this = e.data.this;
		var elm = this;
		var imglib = _this._img_lib
		if(elm.src in imglib) {
			elm.setAttribute('old_src', elm.src);
			if(imglib[elm.src].dataurl) {
				elm.setAttribute('src', imglib[elm.src].dataurl);
			} else {
				imglib[elm.src].req.push(elm);
			}
		} else {
			imglib[elm.src] = {};
			imglib[elm.src].req = [elm];
			_this._get_image(elm.src, function(url, dataurl) {
				for(var i = 0; i < imglib[url].req.length; i++) {
					imglib[url].req[i].setAttribute('src', dataurl);
				}
				imglib[url].dataurl = dataurl;
			});
		}
	};
	prxy.prototype._a_reload = function() {
		//console.log(this, this.protocol);
		if(this.protocol == 'https:' || this.protocol == 'http:') {
			this.href = 'javascript:_PXY.load("' + this.href + '");';
		}
	};
	prxy.prototype.load = function(elm, url) {
		this._get_html(url, this._preload_imgur.bind(this, this._preproc_html.bind(this, this._set_elm_html, elm)));
	};
	return prxy;
})();

var prxy_menu = (function() {
	function prxy_menu() {
		this.history = [];
		this.history_idx = 0;
		this.flag_preload = false;
	}
	prxy_menu.prototype.current_url = function() {
		if(this.history_idx) {
			return this.history[this.history_idx - 1];
		} else {
			return '';
		}
	};
	prxy_menu.prototype.push_url = function(url) {
		if(this.history_idx < this.history.length) {
			this.history = this.history.slice(0, this.history_idx);
		}
		this.history_idx = this.history.push(url);
	};
	prxy_menu.prototype.back_url = function(url) {
		if(this.history_idx > 1) {
			this.history_idx --;
			return this.current_url();
		}
	};
	prxy_menu.prototype.prev_url = function(url) {
		if(this.history_idx < this.history.length) {
			this.history_idx ++;
			return this.current_url();
		}
	};
	prxy_menu.prototype.reload = function() {
		this.draw_menu();
		if(this.history_idx) {
			this.menu_busy(true);
			var p = new prxy(this.flag_preload);
			p.done_hook = this.menu_busy.bind(this, false);
			p.load(document, this.current_url());
		} else {
			document.close();
		}
	};
	prxy_menu.prototype.load = function(url) {
		if(!/:\/\//.exec(url)) url = 'http://' + url;
		if(url != this.current_url()) {
			this.push_url(url);
			this.reload();
		} else {
			this.reload();
		}
	};
	prxy_menu.prototype.back = function() {
		if(this.back_url()) {
			this.reload();
		}
	};
	prxy_menu.prototype.prev = function() {
		if(this.prev_url()) {
			this.reload();
		}
	};
	prxy_menu.prototype.menu_busy = function(b) {
		if(b) {
			$px('#_pxy_idle').text('bussy').css('color', 'red');
		} else {
			$px('#_pxy_idle').text('idle').css('color', 'green');
		}
	};
	prxy_menu.prototype.draw_menu = function() {
		document.write('<html><head></head><body></body></html>');
		document.head.innerHTML = '';
		document.body.innerHTML = '';
		$px('body').append(
			$px('<div>').css({
				display: 'block',
				position: 'fixed',
				left: '0px',
				top: '0px',
				'z-index': '19999999999',
				background: '#F0F0F0',
			}).append([
				(this.history_idx > 1)?
				$px('<a>').attr('href', 'javascript:_PXY.back();').text('Back'):
				$px('<span>').text('Back'),
				(this.history_idx < this.history.length)?
				$px('<a>').attr('href', 'javascript:_PXY.prev();').text('Prev'):
				$px('<span>').text('Prev'),
				$px('<a>').attr('id', '_pxy_go').attr('href', "javascript:_PXY.load($px('#_pxy_url').prop('value'));").text('Go'),
				$px('<input>').attr('id', '_pxy_url').attr('value', this.current_url()).attr('title', this.current_url()),
				$px('<input>').attr('type', 'checkbox').attr('id', '_pxy_preload').prop('checked', this.flag_preload).change((function() {
					this.flag_preload = $px('#_pxy_preload').prop('checked');
				}).bind(this)),
				$px('<b>').text('idle').attr('id', '_pxy_idle').css('color', 'green'),
			])
		).find('div span, a').css({
			'padding-right': '5px',
		});
	};
	return prxy_menu;
})();

var _PXY = new prxy_menu();

$px(document).ready(function() {
	_PXY.reload();
});
