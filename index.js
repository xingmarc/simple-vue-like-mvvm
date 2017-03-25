(function () {
	/**
	 * check if the two values are equal.
	 */
	function isEqual(a, b) {
		return a == b || ( isObject(a) && isObject(b) ? JSON.stringify(a) === JSON.stringify(b) : false )
	}

	/**
	 * Check if `obj` is an object (including array, regex, etc)
	 */
	function isObject(obj) {
		return obj !== null && typeof obj === 'object';
	}

	function deepCopy(from) {
		return isObject(from) ? JSON.parse(JSON.stringify(from)) : from;
	}

	/**
	 * Compute expression:
	 * called by compiler and watcher.
	 * with + eval will bind the variable to the vm, thus get the value.
	 */
	function computeExpression(exp, scope) {
		try {
			with (scope) {
				return eval(exp);
			}
		} catch (e) {
			console.error('ERROR', e);
		}
	}

	var slice = Array.prototype.slice
	// =======================  Utils End  ===================== //

	/**
	 * Compiler
	 */
	var $$id = 0
	function Compiler(options) {
		this.$el = options.el;
		this.vm = options.vm;

		// to documentFragment
		if (this.$el) {
			this.$fragment = nodeToFragment(this.$el);
			this.compile(this.$fragment);
			this.$el.appendChild(this.$fragment);
		}
	}

	Compiler.prototype = {
		compile: function (node, scope) {
			var self = this;
			node.$id = $$id++;
			if (node.childNodes && node.childNodes.length) {
				node.childNodes.forEach(function (child) {
					if (child.nodeType === 3) {
						self.compileTextNode(child, scope);
					} else if (child.nodeType === 1) {
						self.compileElementNode(child, scope);
					}
				});
			}
		},

		compileTextNode: function (node, scope) {
			var text = node.textContent.trim();
			if (!text) {
				return;
			}
			var exp = parseTextExp(text);
			scope = scope || this.vm;
			this.textHandler(node, scope, exp);
		},

		compileElementNode: function (node, scope) {
			var attrs = slice.call(node.attributes);
			var lazyCompileDir = '';
			var lazyCompileExp = '';
			var self = this;
			scope = scope || this.vm;
			attrs.forEach(function (attr) {
				var attrName = attr.name;
				var exp = attr.value;
				var dir = checkDirective(attrName);
				if (dir.type) {
					if (dir.type === 'for' || dir.type === 'if') {
						lazyCompileDir = dir.type;
						lazyCompileExp = exp;
					} else {
						var handler = self[dir.type + 'Handler'].bind(self);
						if (handler) {
							handler(node, scope, exp, dir.prop);
						} else {
							console.error('Can not find ' + dir.type + ' diretory.');
						}
					}
					node.removeAttribute(attrName);
				}
			});

			if (lazyCompileExp) {
				this[lazyCompileDir + 'Handler'](node, scope, lazyCompileExp);
			} else {
				this.compile(node, scope);
			}
		},

		bindWatcher: function (node, scope, exp, dir, prop) {
			// Add a Watcher, listen to all exp's field change.
			var updateFn = updater[dir];
			var watcher = new Watcher(exp, scope, function (newVal) {
				updateFn && updateFn(node, newVal, prop);
			});
		},

		/**
		 * Handle directives:
		 * v-text
		 * v-model (two way data binding)
		 * v-on：(event binding)
		 * v-bind
		 * v-show
		 * v-if
		 * v-for
		 * */

		// Bind the events
		// Three types: 
		// v-on:click="handler", v-on:click="add($index)", v-on:click="count=count+1"
		onHandler: function (node, scope, exp, eventType) {
			if (!eventType) {
				return console.error('Error in Event type');
			}

			var fn = scope[exp];
			if (typeof fn === 'function') {
				node.addEventListener(eventType, fn.bind(scope));
			} else {
				// 表达式和add(item)，使用computeExpression(exp, scope)
				node.addEventListener(eventType, function () {
					computeExpression(exp, scope);
				});
			}
		},

		/**
		 * Two way data binding:
		 * v-model="expression"
		 * different element has different bindings:
		 *    checkbox, radio -> checked
		 *    ohthers         -> value
		 * 不同的元素也有不同的处理方式：checkbox处理value数组，其他处理value的单值
		 * different element has different ways:
		 *     checkbox -> handle the array of values,
		 *     others   -> single value
		 * */
		modelHandler: function (node, scope, exp, prop) {

			if (node.tagName.toLowerCase() === 'input') {
				switch (node.type) {
					case 'checkbox':
						this.bindWatcher(node, scope, exp, 'checkbox');
						node.addEventListener('change', function (e) {
							var target = e.target;
							var value = target.value || target.$id;
							var index = scope[exp].indexOf(value);
							if (target.checked && index < 0) {
								scope[exp].push(value);
							} else if (!target.checked && index > -1) {
								scope[exp].splice(index, 1);
							}
						});
						break;
					case 'radio':
						this.bindWatcher(node, scope, exp, 'radio');
						node.addEventListener('change', function (e) {
							var target = e.target;
							if (target.checked) {
								var calExp = exp + '=`' + target.value + '`';
								with (scope) {
									eval(calExp);
								}
							}
						});
						break;
					case 'file':
						this.bindWatcher(node, scope, exp, 'value');
						node.addEventListener('change', function (e) {
							var newValue = e.target.value;
							var calExp = exp + '=`' + newValue + '`';
							with (scope) {
								eval(calExp);
							}
						});
						break;
					default:
						this.bindWatcher(node, scope, exp, 'value');
						node.addEventListener('input', function (e) {
							node.isInputting = true; // prevent cyclic dependency.
							var newValue = e.target.value;
							var calExp = exp + '=`' + newValue + '`';
							with (scope) {
								eval(calExp);
							}
						});
				}
			}
		},

		// v-html="expression"
		htmlHandler: function (node, scope, exp, prop) {
			var updateFn = updater.html;
			var self = this;
			var watcher = new Watcher(exp, scope, function (newVal) {
				updateFn && updateFn(node, newVal, prop);
				self.compile(node, scope);
			});
		},

		// v-text="expression"
		textHandler: function (node, scope, exp, prop) {
			this.bindWatcher(node, scope, exp, 'text');
		},

		// v-show="expression"
		showHandler: function (node, scope, exp, prop) {
			this.bindWatcher(node, scope, exp, 'style', 'display')
		},

		// v-bind:id="id", v-bind:class="cls"
		bindHandler: function (node, scope, exp, attr) {
			switch (attr) {
				case 'class':
					// to  "baseCls "+(a?"acls ":"")+(b?"bcls ":"")
					exp = '"' + node.className + ' "+' + parseClassExp(exp);
					break;
				case 'style':
					var styleStr = node.getAttribute('style');
					exp = '"' + styleStr + ';"+' + parseStyleExp(exp);
					break;
				default:

			}
			this.bindWatcher(node, scope, exp, 'attr', attr)
		},

		// v-if="expression"
		ifHandler: function (node, scope, exp, prop) {
			// First compile the children nodes
			this.compile(node, scope);
			// create a placeholding element.
			var refNode = document.createTextNode('');
			node.parentNode.insertBefore(refNode, node);
			var current = node.parentNode.removeChild(node);
			this.bindWatcher(current, scope, exp, 'dom', refNode);
		},

		// v-for="item in items"
		forHandler: function (node, scope, exp, prop) {
			var self = this;
			var itemName = exp.split('in')[0].replace(/\s/g, '')
			var arrNames = exp.split('in')[1].replace(/\s/g, '').split('.');
			var parentNode = node.parentNode;
			var startNode = document.createTextNode('');
			var endNode = document.createTextNode('');
			var range = document.createRange();
			parentNode.replaceChild(endNode, node);
			parentNode.insertBefore(startNode, endNode);
			var watcher = new Watcher(arrNames.join('.'), scope, function (newArray, oldArray, options) {
				range.setStart(startNode, 0);
				range.setEnd(endNode, 0);
				range.deleteContents();
				newArray.forEach(function (item, index) {
					var cloneNode = node.cloneNode(true);
					parentNode.insertBefore(cloneNode, endNode);
					// For loop's scope is the current scope. so every loop will have a new object.
					var forScope = Object.create(scope);  
					forScope.$index = index;
					forScope[itemName] = item;
					self.compile(cloneNode, forScope);
				});
			});
		},
	};

	// Copy node to documentFragment.
	function nodeToFragment(node) {
		var fragment = document.createDocumentFragment(), child;
		while (child = node.firstChild) {
			if (isIgnorable(child)) {     // delete '\n'
				node.removeChild(child);
			} else {
				fragment.appendChild(child);   // Move the child from original place to fragment
			}
		}
		return fragment;
	}

	// ignore comment node and text node with \t\n\r 
	function isIgnorable(node) {
		var regIgnorable = /^[\t\n\r]+/;
		return (node.nodeType == 8) || ((node.nodeType == 3) && (regIgnorable.test(node.textContent)));
	}

	// Check properties and return the directive type.
	function checkDirective(attrName) {
		var dir = {};
		if (attrName.indexOf('v-') === 0) {
			var parse = attrName.substring(2).split(':');
			dir.type = parse[0];
			dir.prop = parse[1];
		} else if (attrName.indexOf('@') === 0) {
			dir.type = 'on';
			dir.prop = attrName.substring(1);
		} else if (attrName.indexOf(':') === 0) {
			dir.type = 'bind';
			dir.prop = attrName.substring(1);
		}
		return dir;
	}

	// Parse Text expression
	function parseTextExp(text) {
		var regText = /\{\{(.+?)\}\}/g;
		var pieces = text.split(regText);
		var matches = text.match(regText);
		var tokens = [];
		pieces.forEach(function (piece) {
			if (matches && matches.indexOf('{{' + piece + '}}') > -1) {
				tokens.push(piece);
			} else if (piece) {
				tokens.push('`' + piece + '`');
			}
		});
		return tokens.join('+');
	}

	/**
	 * parse class expression, eg:
	 * <div class="static" v-bind:class="{ active: isActive, 'text-danger': hasError }"></div>
	 * <div v-bind:class="[isActive ? activeClass : '', errorClass]">
	 */
	function parseClassExp(exp) {
		if (!exp) {
			return;
		}
		var regObj = /\{(.+?)\}/g;
		var regArr = /\[(.+?)\]/g;
		var result = [];
		if (regObj.test(exp)) {
			var subExp = exp.replace(/[\s\{\}]/g, '').split(',');
			subExp.forEach(function (sub) {
				var key = '"' + sub.split(':')[0].replace(/['"`]/g, '') + ' "';
				var value = sub.split(':')[1];
				result.push('((' + value + ')?' + key + ':"")')
			});
		} else if (regArr.test(exp)) {
			var subExp = exp.replace(/[\s\[\]]/g, '').split(',');
			result = subExp.map(function (sub) {
				return '(' + sub + ')' + '+" "';
			});
		}
		return result.join('+');  // to  (a?"acls ":"")+(b?"bcls ":"")
	}

	/**
	 * Parse the `style`:eg:
	 * <div v-bind:style="{ color: activeColor, font-size: fontSize }"></div>
	 * <div v-bind:style="[baseStyles, overridingStyles]">
	 */
	function parseStyleExp(exp) {
		if (!exp) {
			return;
		}
		var regObj = /\{(.+?)\}/g;
		var regArr = /\[(.+?)\]/g;
		var result = [];
		if (regObj.test(exp)) {
			var subExp = exp.replace(/[\s\{\}]/g, '').split(',');
			subExp.forEach(function (sub) {
				var key = '"' + sub.split(':')[0].replace(/['"`]/g, '') + ':"+';
				var value = sub.split(':')[1];
				result.push(key + value + '+";"');
			});
		} else if (regArr.test(exp)) {
			var subExp = exp.replace(/[\s\[\]]/g, '').split(',');
			result = subExp.map(function (sub) {
				return '(' + sub + ')' + '+";"';
			});
		}
		return result.join('+');  // to  (a?"acls ":"")+(b?"bcls ":"")
	}

	var updater = {
		text: function (node, newVal) {
			node.textContent = typeof newVal === 'undefined' ? '' : newVal;
		},
		html: function (node, newVal) {
			node.innerHTML = typeof newVal == 'undefined' ? '' : newVal;
		},
		value: function (node, newVal) {
			if (!node.isInputting) {
				node.value = newVal ? newVal : '';
			}
			node.isInputting = false;
		},
		checkbox: function (node, newVal) {
			var value = node.value || node.$id;
			if (newVal.indexOf(value) < 0) {
				node.checked = false;
			} else {
				node.checked = true;
			}
		},
		attr: function (node, newVal, attrName) {
			newVal = typeof newVal === 'undefined' ? '' : newVal;
			node.setAttribute(attrName, newVal);
		},
		style: function (node, newVal, attrName) {
			newVal = typeof newVal === 'undefined' ? '' : newVal;
			if (attrName === 'display') {
				newVal = newVal ? 'initial' : 'none';
			}
			node.style[attrName] = newVal;
		},
		dom : function (node, newVal, nextNode) {
			if (newVal) {
				nextNode.parentNode.insertBefore(node, nextNode);
			} else {
				nextNode.parentNode.removeChild(node);
			}
		},
	};
	// =======================  Compiler End  ===================== //

	/**
	 * Dependency
	 */
	function Dep() {
		this.subs = {};
	};

	// Add subscriber
	Dep.prototype.addSub = function (target) {
		if (!this.subs[target.uid]) {  // de-duplication
			this.subs[target.uid] = target;
		}
	};

	// Notify and update subscribers
	Dep.prototype.notify = function (options) {
		for (var uid in this.subs) {
			this.subs[uid].update(options);
		}
	};
	// =======================  Dependence End  ===================== //

	/**
	 * Observer is keeping an eye on the ViewModel, when it changes, send out the changing message.
	 */
	function Observer(data) {
		this.data = data;
		this.observe(data);
	}

	Observer.prototype = {
		observe: function (data) {
			if (!data || typeof data !== 'object') {
				return;
			}
			var self = this;
			Object.keys(data).forEach(function (key) {
				self.observeObject(data, key, data[key]);
			});
		},

		// Change the object's getter and setter.
		observeObject: function (data, key, val) {
			// Every variable has its own dependencis.
			var dep = new Dep();
			var self = this;
			Object.defineProperty(data, key, {
				enumerable: true,
				configurable: false,
				get: function () {
					// Dep.target is a placeholder for temporary store of watcher. 
					Dep.target && dep.addSub(Dep.target);
					return val;
				},
				set: function (newVal) {
					if (val === newVal) {
						return;
					}
					val = newVal;
					if (Array.isArray(newVal)) {
						self.observeArray(newVal, dep);
					} else {
						self.observe(newVal);
					}
					dep.notify();
				},
			});

			if (Array.isArray(val)) {
				self.observeArray(val, dep);
			} else {
				self.observe(val);
			}
		},

		observeArray: function (arr, dep) {
			var self = this;
			arr.__proto__ = self.defineReactiveArray(dep);
			arr.forEach(function (item) {
				self.observe(item);
			});
		},

		//Change the array's behavior to implement the observation on Arrays.
		defineReactiveArray: function (dep) {
			var arrayPrototype = Array.prototype;
			var arrayMethods = Object.create(arrayPrototype);
			var self = this;

			// Rewrite the array manipulating methods.
			var methods = [
				'pop',
				'push',
				'sort',
				'shift',
				'splice',
				'unshift',
				'reverse'
			];

			methods.forEach(function (method) {
				var original = arrayPrototype[method];
				
				Object.defineProperty(arrayMethods, method, {
					value: function () {
						var args = [];
						for (var i = 0, l = arguments.length; i < l; i++) {
							args.push(arguments[i]);
						}
						
						var result = original.apply(this, args);
						
						var inserted;
						switch (method) {
							case 'push':
							case 'unshift':
								inserted = args
								break
							case 'splice':
								inserted = args.slice(2)
								break
						}
						
						if (inserted && inserted.length) {
							self.observeArray(inserted, dep)
						}
						// fire the update
						dep.notify({method, args});
						return result
					},
					enumerable: true,
					writable: true,
					configurable: true
				});
			});

			/**
			 * Global change for array remove method.
			 */
			Object.defineProperty(arrayMethods, '$set', {
				value: function (index, value) {
					// append to the end.
					if (index >= this.length) {
						index = this.length;
					}
					return this.splice(index, 1, value)[0];
				}
			});

			/**
			 * Global change for array remove method.
			 */
			Object.defineProperty(arrayMethods, '$remove', {
				value: function (item) {
					var index = this.indexOf(item);
					if (index > -1) {
						return this.splice(index, 1);
					}
				}
			});
			return arrayMethods;
		}

	};
	// =======================  Observer End  ===================== //


	/**
	 * Watcher，subscribe the Observer's changes, get the new value, then use the callback(updater) to update the view.
	 */
	var $uid = 0;

	function Watcher(exp, scope, callback) {
		this.exp = exp;
		this.scope = scope;
		this.callback = callback || function () {};

		this.value = null;
		this.uid = $uid++;
		this.update();
	}

	Watcher.prototype = {
		get: function () {
			Dep.target = this;

			// When invoking `computeExpression`, with + eval will bind the variables to the ViewModel, and fires the `getter` in the meantime,
			// Since we have the `Dep.target`, so will invoke `addSub` method in observer, thus forms a dependency.
			var value = computeExpression(this.exp, this.scope);
			
			Dep.target = null;
			return value;
		},
		update: function (options) {
			var newVal = this.get();
			if (!isEqual(this.value, newVal)) {
				this.callback && this.callback(newVal, this.value, options);
				this.value = deepCopy(newVal);
			}
		}
	}

	// =======================  Watcher End  ===================== //


	/**
	 * The MVVM main function, including data/method/computed
	 */
	function MVVM(options) {
		this.$data = options.data || {};

		// the DOM element
		this.$el = typeof options.el === 'string' ? document.querySelector(options.el) : options.el || document.body;

		this.$options = Object.assign({},{
				computed: {},
				methods : {}
			},options);

		// Making the properties in `data`, `method`, `computed` accessable at this MVVM object,
		this._proxy(options);
		this._proxyMethods(options.methods);   // `method` doesn't need to getter/setter

		var observer = new Observer(this.$data);

		if (!observer) {
			return;
		}

		this.$compiler = new Compiler({ el: this.$el, vm: this });
	}

	MVVM.prototype = {
		// Making the properties of `data` and `computed` accessible at the MVVM instance.
		_proxy: function (data) {
			var self = this;
			var proxy = ['data', 'computed'];
			proxy.forEach(function (item) {
				Object.keys(data[item]).forEach(function (key) {
					Object.defineProperty(self, key, {
						configurable: false,
						enumerable: true,
						get: function () {
							if (typeof self.$data[key] !== 'undefined') {
								return self.$data[key];
							} else if (typeof self.$options.computed[key] !== 'undefined') {
								return self.$options.computed[key].call(self);
							} else {
								return undefined;
							}
						},
						set: function (newVal) {
							if (self.$data.hasOwnProperty(key)) {
								self.$data[key] = newVal;
							} else if (self.$options.computed.hasOwnProperty(key)) {
								self.$options.computed[key] = newVal;
							}
						}
					});
				})
			})
		},
		// Making the properties of `method` accessible at the MVVM instance.
		_proxyMethods: function (methods) {
			var self = this;
			Object.keys(methods).forEach(function (key) {
				self[key] = self.$options.methods[key];
			})
		}
	}

	window.MVVM = MVVM;
})()

