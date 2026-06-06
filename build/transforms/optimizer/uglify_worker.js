/*
 * uglify_worker.js - Modified to use terser instead of uglify-js 2.x
 *
 * terser supports ES6+ syntax (let, const, arrow functions, template literals,
 * destructuring, classes, async/await, etc.) while uglify-js 2.x only supports ES5.
 *
 * The interface is preserved: the main uglify.js optimizer module calls this worker
 * the same way. The function signature remains:
 *   minify(code, options, dest, useSourceMaps) -> Promise<string>
 */
function factory(terser, fs){
	if(!terser){
		throw new Error("Unknown host environment: only nodejs is supported by uglify optimizer.");
	}

	// Wrap terser.minify() into the uglify-compatible interface expected by uglify.js
	// Original interface: function(code, options, dest, useSourceMaps) -> string
	// New: returns a Promise<string> (terser 5.x is async-only)
	function minifyWithTerser(code, options, dest, useSourceMaps){
		var terserOptions = {
			compress: options.compress_options || {
				warnings: false
			},
			mangle: true,
			output: options.gen_options || {}
		};

		if(options.filename){
			terserOptions.sourceMap = useSourceMaps ? {
				filename: options.filename.split("/").pop(),
				url: dest.split("/").pop() + ".map"
			} : false;
		}

		// terser 5.x minify returns a Promise
		return terser.minify(code, terserOptions).then(function(result){
			if(result.error){
				throw result.error;
			}
			var output = result.code;

			if(useSourceMaps && result.map){
				fs.writeFile(dest + ".map", result.map, "utf-8", function(){});
			}

			return output;
		});
	}

	return minifyWithTerser;
}

if(global.define){
	//loaded by dojo AMD loader - use terser instead of uglify-js
	define(["dojo/has!host-node?dojo/node!terser:", "../../fs"], factory);
}else{
	//loaded in a node sub process
	try{
		var terser = require("terser");
		var fs = require("fs");
	}catch(e){}
	var minifyFn = factory(terser, fs);
	process.on("message", function(data){
		var result = "", error = "";
		minifyFn(data.text, data.options, data.dest, data.useSourceMaps).then(function(output){
			process.send({text: output, dest: data.dest, error: ""});
		}).catch(function(e){
			process.send({text: "", dest: data.dest, error: e.toString() + " " + (e.stack || "")});
		});
	});
}
