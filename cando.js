;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// # Cando
// 
// Is an autorization module that includes a micro router for matching
// defined routes and providing authorization logic to confirm the 
// user has the right to execute the requested api function.
//
// There are two endpoints, #define and #verify.

// ## define
//
// define takes a url pattern, a optional verb array, if null, then it 
// is assumed you want to match against all verbs, currently the defaut
// verbs are GET, POST, PUT, DELTETE.
// the last paramenter is the function you want to be invoked on match
// in that function you will have access to the following:
//
// * this.user object if set
// * this.model object if set
// * this.url string
// * this.method string 
// * this.params if using colon patterns
// * this.set is the function you call to specify if the request is authorized
//   or not.  this.allow() or this.deny();
// * this.next to continue to the next match
//
// ## verify
//
// verify is the function that performs the match against all of your defined
// patterns.  So you normally call this in the middleware stack or before you
// want to execute your application code.
var mapleTree = require('mapleTree');
var router = new mapleTree.RouteTree({'fifo' : false });
var _ = require('underscore');

var verbs = ['GET', 'POST', 'PUT', "DELETE"];

exports.define = function(url, verb, fn) {
  // handle optional arguments
  if (_.isFunction(verb)) {
    fn = verb;
    verb = verbs;
  } else {
    verb = [verb];
  }
  // GET/foo/:params
  _(verb).each(function(action) {
    var test = [action.toUpperCase(), url].join('/');
    router.define(test, fn);
  });
  return this;
};

exports.verify = function(data, cb) {
  var m = router.match([data.method.toUpperCase(), data.url].join('/'));
  // setup cando functions
  m.authorizations = [];
  m.allow = allow;
  m.deny = deny;
  m.cbs.push(function() {
    var authorized = _.reduce(this.authorizations, 
      function(mem, val) { return mem + val; }, 0) === 0 ? false : true;
    cb(null, authorized);
  });
  // data should extend the match object with data
  // and make sure there are no conflicts
  _.extend(m, data);
  // if no match then authorize
  if (!m.fn) { return cb(null, true); }
  // run matches...
  m.fn();
};

function deny() {
  this.authorizations.push(false);
}

function allow() {
  this.authorizations.push(true);
}


},{"mapleTree":3,"underscore":4}],2:[function(require,module,exports){

//only two reserver charachters for our mini syntax
var reservedChars = [
  '*'
  , ':'
]

var escapedChars = [
  '.'
  , '-'
  , '/'
  , '+'
]

function isEscapedChar(aChar) {
  return escapedChars.indexOf(aChar) !== -1
}
function isReservedChar(aChar) {
  return reservedChars.indexOf(aChar) !== -1
}

/*
 * returns a regexp that will match against this route
 * @param {string} aRoute
 * @param {boolean} matchTillEnd, whether or not to add the Regexp dollar sign match till end identifier
 * @return {
 *    regexp:  {RegExp}   =>  that matches the route
 *    , params: {array}   =>  /:hello/:world/  => ['hello', 'world']
 * }
 */
function createRoute() {
  var cur = ''
    , myStr = ''
    , curIndex = 0
    , keys = []
    , regEx = ''
    , flags = ['i'] //for regexp constructor
    , prev = ''


  function canProceed() {
    if (isEscapedChar(cur) || isReservedChar(cur)) return false
    else return true
  }

  function badRoute(token) {
    throw new Error('unexpected token within route: ' + "'" + cur + "'" + ' at index:' + curIndex)
  }

  function next(token) {
    if (token) {
      if (typeof token === 'string' && token !== cur) {
        return badRoute(cur)
      } else if (token instanceof RegExp && !token.test(cur)) {
        return badRoute(cur)
      }
    }

    prev = cur
    curIndex += 1
    cur = myStr.charAt(curIndex)  //note, when curIndex exceeds the bounds of the string, a blank '' string is returned
    return cur
  }

  function colon () {
    //colons can only be followed by letters, numbers or underscores/
    var range = /[a-zA-Z0-9\_]/
      , aKey = ''

    next(':') //get rid of colon
    while (cur && canProceed()) {
      if (range.test(cur)) {
        aKey += cur
        next()
      } else {
        return badRoute(cur)
      }
    }

    keys.push(aKey)

    return '([^\\/]+)' //match everything except a '/'
  }

  function wildcard () {
    return '(.+)' //capture everything but the final '/'
  }

  function exactPath () {
    var exact = ''
    while (cur && canProceed()) {
      exact += cur
      next()
    }
    return exact
  }

  function startMatching () {
    regEx = '^' //match from beginning
    // NOTE to self, be careful about using question mark's for the {0, 1} previous match because it allows partial routes match one another.
    // this is especially pertinent to ('/') slashes where '/file/' could match '/files/' if the slash is optional
    while (cur) {
      switch (cur) {
        case '*' :
          regEx += wildcard()
          return regEx   //we are done
        case ':' :
          regEx += colon()
          break
        default :
          if (isEscapedChar(cur)) {
            regEx += '\\' + cur
            next() //get rid of escaped char
          } else { //default letters such as '/hello'
            regEx += exactPath()
          }
          break
      }
    }
  }

  function begin (stringToEvaluate, matchTillEnd) {
    myStr = stringToEvaluate
    cur = myStr.charAt(0)

    curIndex = 0
    startMatching()
    if (matchTillEnd) regEx += '$'
    return {
      'params' : (keys.length ? keys : null)
      , 'regexp' : new RegExp(regEx, flags.join(''))
    }
  }


  return begin.apply({}, [].slice.call(arguments))
}


module.exports = createRoute



},{}],3:[function(require,module,exports){

var util = require('util')
   , events = require('events')
   , compile = require('./compile.js')
   , assert = require('assert')

//for testing purposes
//   , DEBUG = false
//   , debug
//
//if (DEBUG) {
//  debug = function() {
//    console.log.apply(console, [].slice.call(arguments))
//  }
//} else {
//  debug = function(){}
//}


/*
 * @param {RegExp} reg_exp
 * @param {Array} params_a    =>  represents 'colon' in '/hello/:colon'
 * @param {Function} cb  => callback
 */
var RouteNode = function (reg_exp, params_a, cb) {
  if (!(this instanceof RouteNode)) { return new RouteNode(reg_exp) }
  if (!reg_exp) { throw new Error('route needs a regexp to be defined') }
  if (typeof params_a === 'function' && !cb) {
    cb = params_a
    params_a = null
  }

  var self = this

  self.children = []
  self.regexp = reg_exp
  self.key = self.regexp.toString()
  self.callback = cb  //callback is optional, if we don't have a callback, it means that we aren't an executable route,
  if (params_a) { self.params = params_a }
}

/*
 * @param {object} options
 * flags => 'fifo' : true or false (false default)  //represents order of how we match routes
 */
var RouteTree = function (options) {
   this.root = new RouteNode(/^$/)
   if (!options) {
     options = {'fifo' : false}
   }
   this.fifo = !!options.fifo
}

/*
 * gather array of potential paths, may include '?' may not
 * @param {string} path
 * @return {array} of potential paths
 *
 * this function works based on the assumption that if the latter question mark routes match
 * then the earlier question marks in the route are assumed to be matching as well, therefore we can remove the ?marks
 * this function continually adds the path preceding the earliest ?mark into the paths array,
 * stripping the ?mark, and reapplying the same logic to the rest of the string
*/
function getQMarkPaths(apath, paths) {
  var qi = apath.indexOf('?') //returns first occuring index
    , i = qi
    , prev

  if (qi === -1) { //recursion has finished
    paths.push(apath)
    return paths
  }
  //take away ? mark and recursively add paths to support more than 1 qmark.
  while (apath.charAt(--i) !== '/')
    ;

  paths.push(apath.slice(0, i)) //add current matching path without qmark and without ending '/'
  return getQMarkPaths(apath.slice(0, qi) + apath.slice(qi+1), paths) //remove current ? mark in question, and reapply logic to next potential ?mark
}



/*
 * @param {string|regexp} path
 * @param {function} callback
 */
RouteTree.prototype.define = function (path, callback) {
   if (!path || !callback) { throw new Error('mapleTree needs a path and a callback to define a route') }
   var prereq = / /g
      , i
      , j
      , paths

   if (typeof path === 'string') {
      if (prereq.test(path)) {
        throw new Error('defined path cannot contain spaces path => ' + path)
      }
      if (path === '/') {
         var rootNode = new RouteNode(/^\/$/, callback)
         this.root.children.unshift(rootNode) //keep root at front of array to optimize the match against root. Will stay O(1)
      } else {
         //generate questionmark paths
         paths = getQMarkPaths(path, [])
         paths.forEach(function (apath) {
           var portions = []
             , sliceTo

           while (apath.length) {
             sliceTo = apath.indexOf('/', 1) //don't match the '/' that is at the beginning but the one following the one at index 0
             if (sliceTo !== -1) { //more slahes ('/') left
               portions.push( apath.slice(0, sliceTo) ) //add current route i.e => '/hello' in '/hello/world'
               apath = apath.slice(sliceTo) //before apath = '/hello/world' after apath = '/world'
             } else { //whats left in apath is final portion of route being defined => '/someRoute' or '/'
               portions.push(apath)
               apath = ''
             }
           }
           for (i = 0; i < portions.length; i+=1) portions[i] = compile(portions[i])  //returns {regexp:reg , params:[id1,id2,...]}
           this._defineRecursiveHelper(this.root, portions, callback, path) //note original path here for redefine warnings
         }.bind(this))
      }
   } else if (path instanceof RegExp) {
      //TODO figure out an elegant way to handle this that doesn't involve only definining it as root's child
      var newNode = new RouteNode(path, callback)
      this.root.children.push(newNode)
   }
}

RouteTree.prototype._defineRecursiveHelper = function (curNode, paths, cb, fullPath) {
  var currentRoute = paths.shift()
     , newNode
     , i
     , curKey = currentRoute.regexp.toString()

  for (i = 0; i < curNode.children.length; i++) {    //does a child node with same key already exist?
    if (curNode.children[i].key === curKey) {
      if (paths.length) { this._defineRecursiveHelper(curNode.children[i], paths, cb, fullPath) }
      else {
        //redefine callback, maybew throw error in future, or warn the user
        if (curNode.children[i].callback) { console.warn('WARNING: redefining route, this will create routing conflicts. Conflicted path => ' + fullPath) }
        curNode.children[i].callback = cb
      }
      return //don't allow anything else to happen on current call frame
    }
  }
  newNode = new RouteNode(currentRoute.regexp, currentRoute.params)
  curNode.children.push(newNode)
  if (paths.length) {
    this._defineRecursiveHelper(newNode, paths, cb, fullPath)
  } else {
    //end of recursion, we have a matching function
    newNode.callback = cb
  }
}


/*
 * @param {string} path
 * @return an instance of Matcher
 */
RouteTree.prototype.match = function (path) {
  var matcher = new Matcher()
    , decodedPath

  try {
    decodedPath = decodeURIComponent(path)
  } catch (err) {
    decodedPath = path   //oh well
  }

  this._matchRecursiveHelper(this.root, decodedPath, matcher)

  //callbacks are added in preorder fashion, so if we want filo, we must reverse the order of fns
  if (!this.fifo) { matcher.cbs.reverse() } //TODO, consider optimizing this so this.fifo has to be reversed because !this.fifo === default setting
  matcher.fn = matcher.cbs.shift()

  return matcher
}

/*
 * @param {RouteNode} curNode
 * @param {String} curPath
 * @param {Matcher} matcher
*/
RouteTree.prototype._matchRecursiveHelper = function (curNode, curPath, matcher) {
   var i
      , j
      , exe
      , mNode
      , mPath
      , slicer

   for (i = 0; i < curNode.children.length; i+=1) {
      exe = curNode.children[i].regexp.exec(curPath)
      if (exe) {
         mNode = curNode.children[i]
         mNode.regexp.lastIndex = 0 //keep matching from start of str
         mPath = exe[0]
         slicer = curPath.slice(mPath.length)
         //incorrect partial match when slicer[0] !== '/' i.e => '/hell' will match '/hello/world' but not be correct b/c slicer[0] === 'o' instead of '/'
         //or if mPath === curPath, slicer === '' and we have a perfect match
         if (mPath.length !== curPath.length && slicer.charAt(0) !== '/') continue

         if (exe.length > 1) {
           if (mNode.params) {  //colon args
             for (j = 0; j < mNode.params.length && (j+1) < exe.length; j++) {
               matcher.params[mNode.params[j]] = exe[j+1] //mNode.params[j] contains the colon arg named string. i.e in => '/hello/:foo', mNode.params[j] === 'foo'
             }
           } else {  //regex capture groups that aren't part of colon args, this will mostly be for wildcard routes '/*'
             for (j = 1; j < exe.length; j++) {
               matcher.extras.push(exe[j])
             }
           }
         }

         curPath = curPath.slice(mPath.length)
         if (curPath.length) {
           if (mNode.callback) { matcher.cbs.push(mNode.callback) } //TODO, should I add callbacks consecutively if they are the same function from ? mark routes
           this._matchRecursiveHelper(mNode, curPath, matcher) //continute recursive search
         } else {
           if (mNode.callback) { //callback indicates this route was explicitly declared, not just a branch of another route, recursion ends
             matcher.perfect = true
             matcher.cbs.push(mNode.callback)
           }
         }
         return //dive deeper into the tree, don't allow more matches at this level in the tree
      }
   }
}



var Matcher = function () {
  this.cbs = []          //collection of callbacks, the closest match first
  this.fn = null         //placeholder for best matching function
  this.perfect = false   //were we able to match an exact path, or did we only match partially?
  this.extras = []       //match regexp capture groups that isn't part of params
  this.params = {}       //colon args
}

Matcher.prototype.next = function () {
  this.fn = this.cbs.shift()
  if (this.fn) { this.fn.apply(this, Array.prototype.slice.call(arguments)) }
}


/*
 * pattern matching API
 *
 * @param {string} toMatch => similary type string that you would use in router.define
 * @return a function that when executed with string as its argument, will return a boolean
*/

function pattern(toMatch) {
  var regexps = getQMarkPaths(toMatch, [])

  //reassign array to compiled regular expressions
  regexps.forEach(function(aPath, ix) {
    regexps[ix] = compile(aPath, true).regexp //'true' tells regexp compiler to math till end => '$'
  })


  if (regexps.length === 1) { //fast case
    regexps = regexps[0]
    return function (testAgainst) {
      return regexps.test(testAgainst)
    }
  } else { //test each potential path
    return function (testAgainst) {
      for (var i = 0; i < regexps.length; i++) {
        if (regexps[i].test(testAgainst)) return true
      }

      return false
    }
  }
}

//EXPORTS
exports.RouteTree = RouteTree
exports.pattern = pattern


},{"./compile.js":2,"assert":5,"events":6,"util":7}],4:[function(require,module,exports){
//     Underscore.js 1.5.1
//     http://underscorejs.org
//     (c) 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Underscore may be freely distributed under the MIT license.

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `global` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var
    push             = ArrayProto.push,
    slice            = ArrayProto.slice,
    concat           = ArrayProto.concat,
    toString         = ObjProto.toString,
    hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  _.VERSION = '1.5.1';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, l = obj.length; i < l; i++) {
        if (iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      for (var key in obj) {
        if (_.has(obj, key)) {
          if (iterator.call(context, obj[key], key, obj) === breaker) return;
        }
      }
    }
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results.push(iterator.call(context, value, index, list));
    });
    return results;
  };

  var reduceError = 'Reduce of empty array with no initial value';

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var length = obj.length;
    if (length !== +length) {
      var keys = _.keys(obj);
      length = keys.length;
    }
    each(obj, function(value, index, list) {
      index = keys ? keys[--length] : --length;
      if (!initial) {
        memo = obj[index];
        initial = true;
      } else {
        memo = iterator.call(context, memo, obj[index], index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, iterator, context) {
    var result;
    any(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(iterator, context);
    each(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) results.push(value);
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, iterator, context) {
    return _.filter(obj, function(value, index, list) {
      return !iterator.call(context, value, index, list);
    }, context);
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(iterator, context);
    each(obj, function(value, index, list) {
      if (!(result = result && iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(iterator, context);
    each(obj, function(value, index, list) {
      if (result || (result = iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if the array or object contains a given value (using `===`).
  // Aliased as `include`.
  _.contains = _.include = function(obj, target) {
    if (obj == null) return false;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    return any(obj, function(value) {
      return value === target;
    });
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    var isFunc = _.isFunction(method);
    return _.map(obj, function(value) {
      return (isFunc ? method : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, function(value){ return value[key]; });
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // containing specific `key:value` pairs.
  _.where = function(obj, attrs, first) {
    if (_.isEmpty(attrs)) return first ? void 0 : [];
    return _[first ? 'find' : 'filter'](obj, function(value) {
      for (var key in attrs) {
        if (attrs[key] !== value[key]) return false;
      }
      return true;
    });
  };

  // Convenience version of a common use case of `find`: getting the first object
  // containing specific `key:value` pairs.
  _.findWhere = function(obj, attrs) {
    return _.where(obj, attrs, true);
  };

  // Return the maximum element or (element-based computation).
  // Can't optimize arrays of integers longer than 65,535 elements.
  // See [WebKit Bug 80797](https://bugs.webkit.org/show_bug.cgi?id=80797)
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.max.apply(Math, obj);
    }
    if (!iterator && _.isEmpty(obj)) return -Infinity;
    var result = {computed : -Infinity, value: -Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed > result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.min.apply(Math, obj);
    }
    if (!iterator && _.isEmpty(obj)) return Infinity;
    var result = {computed : Infinity, value: Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed < result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Shuffle an array.
  _.shuffle = function(obj) {
    var rand;
    var index = 0;
    var shuffled = [];
    each(obj, function(value) {
      rand = _.random(index++);
      shuffled[index - 1] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // An internal function to generate lookup iterators.
  var lookupIterator = function(value) {
    return _.isFunction(value) ? value : function(obj){ return obj[value]; };
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, value, context) {
    var iterator = lookupIterator(value);
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value : value,
        index : index,
        criteria : iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index < right.index ? -1 : 1;
    }), 'value');
  };

  // An internal function used for aggregate "group by" operations.
  var group = function(obj, value, context, behavior) {
    var result = {};
    var iterator = lookupIterator(value == null ? _.identity : value);
    each(obj, function(value, index) {
      var key = iterator.call(context, value, index, obj);
      behavior(result, key, value);
    });
    return result;
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = function(obj, value, context) {
    return group(obj, value, context, function(result, key, value) {
      (_.has(result, key) ? result[key] : (result[key] = [])).push(value);
    });
  };

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  _.countBy = function(obj, value, context) {
    return group(obj, value, context, function(result, key) {
      if (!_.has(result, key)) result[key] = 0;
      result[key]++;
    });
  };

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator, context) {
    iterator = iterator == null ? _.identity : lookupIterator(iterator);
    var value = iterator.call(context, obj);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >>> 1;
      iterator.call(context, array[mid]) < value ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely create a real, live array from anything iterable.
  _.toArray = function(obj) {
    if (!obj) return [];
    if (_.isArray(obj)) return slice.call(obj);
    if (obj.length === +obj.length) return _.map(obj, _.identity);
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    if (obj == null) return 0;
    return (obj.length === +obj.length) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    if (array == null) return void 0;
    return (n != null) && !guard ? slice.call(array, 0, n) : array[0];
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n != null) && !guard) {
      return slice.call(array, Math.max(array.length - n, 0));
    } else {
      return array[array.length - 1];
    }
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, (n == null) || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, _.identity);
  };

  // Internal implementation of a recursive `flatten` function.
  var flatten = function(input, shallow, output) {
    if (shallow && _.every(input, _.isArray)) {
      return concat.apply(output, input);
    }
    each(input, function(value) {
      if (_.isArray(value) || _.isArguments(value)) {
        shallow ? push.apply(output, value) : flatten(value, shallow, output);
      } else {
        output.push(value);
      }
    });
    return output;
  };

  // Return a completely flattened version of an array.
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator, context) {
    if (_.isFunction(isSorted)) {
      context = iterator;
      iterator = isSorted;
      isSorted = false;
    }
    var initial = iterator ? _.map(array, iterator, context) : array;
    var results = [];
    var seen = [];
    each(initial, function(value, index) {
      if (isSorted ? (!index || seen[seen.length - 1] !== value) : !_.contains(seen, value)) {
        seen.push(value);
        results.push(array[index]);
      }
    });
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(_.flatten(arguments, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  _.intersection = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.indexOf(other, item) >= 0;
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = concat.apply(ArrayProto, slice.call(arguments, 1));
    return _.filter(array, function(value){ return !_.contains(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var length = _.max(_.pluck(arguments, "length").concat(0));
    var results = new Array(length);
    for (var i = 0; i < length; i++) {
      results[i] = _.pluck(arguments, '' + i);
    }
    return results;
  };

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values.
  _.object = function(list, values) {
    if (list == null) return {};
    var result = {};
    for (var i = 0, l = list.length; i < l; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i = 0, l = array.length;
    if (isSorted) {
      if (typeof isSorted == 'number') {
        i = (isSorted < 0 ? Math.max(0, l + isSorted) : isSorted);
      } else {
        i = _.sortedIndex(array, item);
        return array[i] === item ? i : -1;
      }
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item, isSorted);
    for (; i < l; i++) if (array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item, from) {
    if (array == null) return -1;
    var hasIndex = from != null;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) {
      return hasIndex ? array.lastIndexOf(item, from) : array.lastIndexOf(item);
    }
    var i = (hasIndex ? from : array.length);
    while (i--) if (array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var len = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(len);

    while(idx < len) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
  // available.
  _.bind = function(func, context) {
    var args, bound;
    if (nativeBind && func.bind === nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      ctor.prototype = null;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Partially apply a function by creating a version that has had some of its
  // arguments pre-filled, without changing its dynamic `this` context.
  _.partial = function(func) {
    var args = slice.call(arguments, 1);
    return function() {
      return func.apply(this, args.concat(slice.call(arguments)));
    };
  };

  // Bind all of an object's methods to that object. Useful for ensuring that
  // all callbacks defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length === 0) throw new Error("bindAll must be passed function names");
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time. Normally, the throttled function will run
  // as much as it can, without ever going more than once per `wait` duration;
  // but if you'd like to disable the execution on the leading edge, pass
  // `{leading: false}`. To disable execution on the trailing edge, ditto.
  _.throttle = function(func, wait, options) {
    var context, args, result;
    var timeout = null;
    var previous = 0;
    options || (options = {});
    var later = function() {
      previous = options.leading === false ? 0 : new Date;
      timeout = null;
      result = func.apply(context, args);
    };
    return function() {
      var now = new Date;
      if (!previous && options.leading === false) previous = now;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0) {
        clearTimeout(timeout);
        timeout = null;
        previous = now;
        result = func.apply(context, args);
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var result;
    var timeout = null;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        if (!immediate) result = func.apply(context, args);
      };
      var callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) result = func.apply(context, args);
      return result;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      memo = func.apply(this, arguments);
      func = null;
      return memo;
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return function() {
      var args = [func];
      push.apply(args, arguments);
      return wrapper.apply(this, args);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = nativeKeys || function(obj) {
    if (obj !== Object(obj)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys.push(key);
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    var values = [];
    for (var key in obj) if (_.has(obj, key)) values.push(obj[key]);
    return values;
  };

  // Convert an object into a list of `[key, value]` pairs.
  _.pairs = function(obj) {
    var pairs = [];
    for (var key in obj) if (_.has(obj, key)) pairs.push([key, obj[key]]);
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    for (var key in obj) if (_.has(obj, key)) result[obj[key]] = key;
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    each(keys, function(key) {
      if (key in obj) copy[key] = obj[key];
    });
    return copy;
  };

   // Return a copy of the object without the blacklisted properties.
  _.omit = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    for (var key in obj) {
      if (!_.contains(keys, key)) copy[key] = obj[key];
    }
    return copy;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          if (obj[prop] === void 0) obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function for `isEqual`.
  var eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] == a) return bStack[length] == b;
    }
    // Objects with different constructors are not equivalent, but `Object`s
    // from different frames are.
    var aCtor = a.constructor, bCtor = b.constructor;
    if (aCtor !== bCtor && !(_.isFunction(aCtor) && (aCtor instanceof aCtor) &&
                             _.isFunction(bCtor) && (bCtor instanceof bCtor))) {
      return false;
    }
    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          if (!(result = eq(a[size], b[size], aStack, bStack))) break;
        }
      }
    } else {
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], aStack, bStack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return result;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, [], []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp.
  each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) == '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Optimize `isFunction` if appropriate.
  if (typeof (/./) !== 'function') {
    _.isFunction = function(obj) {
      return typeof obj === 'function';
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`? (NaN is the only number which does not equal itself).
  _.isNaN = function(obj) {
    return _.isNumber(obj) && obj != +obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  // Run a function **n** times.
  _.times = function(n, iterator, context) {
    var accum = Array(Math.max(0, n));
    for (var i = 0; i < n; i++) accum[i] = iterator.call(context, i);
    return accum;
  };

  // Return a random integer between min and max (inclusive).
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  // List of HTML entities for escaping.
  var entityMap = {
    escape: {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;'
    }
  };
  entityMap.unescape = _.invert(entityMap.escape);

  // Regexes containing the keys and values listed immediately above.
  var entityRegexes = {
    escape:   new RegExp('[' + _.keys(entityMap.escape).join('') + ']', 'g'),
    unescape: new RegExp('(' + _.keys(entityMap.unescape).join('|') + ')', 'g')
  };

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  _.each(['escape', 'unescape'], function(method) {
    _[method] = function(string) {
      if (string == null) return '';
      return ('' + string).replace(entityRegexes[method], function(match) {
        return entityMap[method][match];
      });
    };
  });

  // If the value of the named `property` is a function then invoke it with the
  // `object` as context; otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return void 0;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name){
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return result.call(this, func.apply(_, args));
      };
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = ++idCounter + '';
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'":      "'",
    '\\':     '\\',
    '\r':     'r',
    '\n':     'n',
    '\t':     't',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    var render;
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = new RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset)
        .replace(escaper, function(match) { return '\\' + escapes[match]; });

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      }
      if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      }
      if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }
      index = offset + match.length;
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + "return __p;\n";

    try {
      render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  var result = function(obj) {
    return this._chain ? _(obj).chain() : obj;
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name == 'shift' || name == 'splice') && obj.length === 0) delete obj[0];
      return result.call(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return result.call(this, method.apply(this._wrapped, arguments));
    };
  });

  _.extend(_.prototype, {

    // Start chaining a wrapped Underscore object.
    chain: function() {
      this._chain = true;
      return this;
    },

    // Extracts the result from a wrapped and chained object.
    value: function() {
      return this._wrapped;
    }

  });

}).call(this);

},{}],5:[function(require,module,exports){
// UTILITY
var util = require('util');
var Buffer = require("buffer").Buffer;
var pSlice = Array.prototype.slice;

function objectKeys(object) {
  if (Object.keys) return Object.keys(object);
  var result = [];
  for (var name in object) {
    if (Object.prototype.hasOwnProperty.call(object, name)) {
      result.push(name);
    }
  }
  return result;
}

// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.message = options.message;
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  var stackStartFunction = options.stackStartFunction || fail;

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  }
};
util.inherits(assert.AssertionError, Error);

function replacer(key, value) {
  if (value === undefined) {
    return '' + value;
  }
  if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) {
    return value.toString();
  }
  if (typeof value === 'function' || value instanceof RegExp) {
    return value.toString();
  }
  return value;
}

function truncate(s, n) {
  if (typeof s == 'string') {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}

assert.AssertionError.prototype.toString = function() {
  if (this.message) {
    return [this.name + ':', this.message].join(' ');
  } else {
    return [
      this.name + ':',
      truncate(JSON.stringify(this.actual, replacer), 128),
      this.operator,
      truncate(JSON.stringify(this.expected, replacer), 128)
    ].join(' ');
  }
};

// assert.AssertionError instanceof Error

assert.AssertionError.__proto__ = Error.prototype;

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!!!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (Buffer.isBuffer(actual) && Buffer.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();

  // 7.3. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (typeof actual != 'object' && typeof expected != 'object') {
    return actual == expected;

  // 7.4. For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isUndefinedOrNull(value) {
  return value === null || value === undefined;
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (isUndefinedOrNull(a) || isUndefinedOrNull(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  try {
    var ka = objectKeys(a),
        kb = objectKeys(b),
        key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (expected instanceof RegExp) {
    return expected.test(actual);
  } else if (actual instanceof expected) {
    return true;
  } else if (expected.call({}, actual) === true) {
    return true;
  }

  return false;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (typeof expected === 'string') {
    message = expected;
    expected = null;
  }

  try {
    block();
  } catch (e) {
    actual = e;
  }

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail('Missing expected exception' + message);
  }

  if (!shouldThrow && expectedException(actual, expected)) {
    fail('Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [true].concat(pSlice.call(arguments)));
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [false].concat(pSlice.call(arguments)));
};

assert.ifError = function(err) { if (err) {throw err;}};

},{"buffer":9,"util":7}],6:[function(require,module,exports){
var process=require("__browserify_process");if (!process.EventEmitter) process.EventEmitter = function () {};

var EventEmitter = exports.EventEmitter = process.EventEmitter;
var isArray = typeof Array.isArray === 'function'
    ? Array.isArray
    : function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]'
    }
;
function indexOf (xs, x) {
    if (xs.indexOf) return xs.indexOf(x);
    for (var i = 0; i < xs.length; i++) {
        if (x === xs[i]) return i;
    }
    return -1;
}

// By default EventEmitters will print a warning if more than
// 10 listeners are added to it. This is a useful default which
// helps finding memory leaks.
//
// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
var defaultMaxListeners = 10;
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!this._events) this._events = {};
  this._events.maxListeners = n;
};


EventEmitter.prototype.emit = function(type) {
  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events || !this._events.error ||
        (isArray(this._events.error) && !this._events.error.length))
    {
      if (arguments[1] instanceof Error) {
        throw arguments[1]; // Unhandled 'error' event
      } else {
        throw new Error("Uncaught, unspecified 'error' event.");
      }
      return false;
    }
  }

  if (!this._events) return false;
  var handler = this._events[type];
  if (!handler) return false;

  if (typeof handler == 'function') {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        var args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
    return true;

  } else if (isArray(handler)) {
    var args = Array.prototype.slice.call(arguments, 1);

    var listeners = handler.slice();
    for (var i = 0, l = listeners.length; i < l; i++) {
      listeners[i].apply(this, args);
    }
    return true;

  } else {
    return false;
  }
};

// EventEmitter is defined in src/node_events.cc
// EventEmitter.prototype.emit() is also defined there.
EventEmitter.prototype.addListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('addListener only takes instances of Function');
  }

  if (!this._events) this._events = {};

  // To avoid recursion in the case that type == "newListeners"! Before
  // adding it to the listeners, first emit "newListeners".
  this.emit('newListener', type, listener);

  if (!this._events[type]) {
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  } else if (isArray(this._events[type])) {

    // Check for listener leak
    if (!this._events[type].warned) {
      var m;
      if (this._events.maxListeners !== undefined) {
        m = this._events.maxListeners;
      } else {
        m = defaultMaxListeners;
      }

      if (m && m > 0 && this._events[type].length > m) {
        this._events[type].warned = true;
        console.error('(node) warning: possible EventEmitter memory ' +
                      'leak detected. %d listeners added. ' +
                      'Use emitter.setMaxListeners() to increase limit.',
                      this._events[type].length);
        console.trace();
      }
    }

    // If we've already got an array, just append.
    this._events[type].push(listener);
  } else {
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  var self = this;
  self.on(type, function g() {
    self.removeListener(type, g);
    listener.apply(this, arguments);
  });

  return this;
};

EventEmitter.prototype.removeListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('removeListener only takes instances of Function');
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (!this._events || !this._events[type]) return this;

  var list = this._events[type];

  if (isArray(list)) {
    var i = indexOf(list, listener);
    if (i < 0) return this;
    list.splice(i, 1);
    if (list.length == 0)
      delete this._events[type];
  } else if (this._events[type] === listener) {
    delete this._events[type];
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  if (arguments.length === 0) {
    this._events = {};
    return this;
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (type && this._events && this._events[type]) this._events[type] = null;
  return this;
};

EventEmitter.prototype.listeners = function(type) {
  if (!this._events) this._events = {};
  if (!this._events[type]) this._events[type] = [];
  if (!isArray(this._events[type])) {
    this._events[type] = [this._events[type]];
  }
  return this._events[type];
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (typeof emitter._events[type] === 'function')
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

},{"__browserify_process":11}],7:[function(require,module,exports){
var events = require('events');

exports.isArray = isArray;
exports.isDate = function(obj){return Object.prototype.toString.call(obj) === '[object Date]'};
exports.isRegExp = function(obj){return Object.prototype.toString.call(obj) === '[object RegExp]'};


exports.print = function () {};
exports.puts = function () {};
exports.debug = function() {};

exports.inspect = function(obj, showHidden, depth, colors) {
  var seen = [];

  var stylize = function(str, styleType) {
    // http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
    var styles =
        { 'bold' : [1, 22],
          'italic' : [3, 23],
          'underline' : [4, 24],
          'inverse' : [7, 27],
          'white' : [37, 39],
          'grey' : [90, 39],
          'black' : [30, 39],
          'blue' : [34, 39],
          'cyan' : [36, 39],
          'green' : [32, 39],
          'magenta' : [35, 39],
          'red' : [31, 39],
          'yellow' : [33, 39] };

    var style =
        { 'special': 'cyan',
          'number': 'blue',
          'boolean': 'yellow',
          'undefined': 'grey',
          'null': 'bold',
          'string': 'green',
          'date': 'magenta',
          // "name": intentionally not styling
          'regexp': 'red' }[styleType];

    if (style) {
      return '\033[' + styles[style][0] + 'm' + str +
             '\033[' + styles[style][1] + 'm';
    } else {
      return str;
    }
  };
  if (! colors) {
    stylize = function(str, styleType) { return str; };
  }

  function format(value, recurseTimes) {
    // Provide a hook for user-specified inspect functions.
    // Check that value is an object with an inspect function on it
    if (value && typeof value.inspect === 'function' &&
        // Filter out the util module, it's inspect function is special
        value !== exports &&
        // Also filter out any prototype objects using the circular check.
        !(value.constructor && value.constructor.prototype === value)) {
      return value.inspect(recurseTimes);
    }

    // Primitive types cannot have properties
    switch (typeof value) {
      case 'undefined':
        return stylize('undefined', 'undefined');

      case 'string':
        var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                                 .replace(/'/g, "\\'")
                                                 .replace(/\\"/g, '"') + '\'';
        return stylize(simple, 'string');

      case 'number':
        return stylize('' + value, 'number');

      case 'boolean':
        return stylize('' + value, 'boolean');
    }
    // For some reason typeof null is "object", so special case here.
    if (value === null) {
      return stylize('null', 'null');
    }

    // Look up the keys of the object.
    var visible_keys = Object_keys(value);
    var keys = showHidden ? Object_getOwnPropertyNames(value) : visible_keys;

    // Functions without properties can be shortcutted.
    if (typeof value === 'function' && keys.length === 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        var name = value.name ? ': ' + value.name : '';
        return stylize('[Function' + name + ']', 'special');
      }
    }

    // Dates without properties can be shortcutted
    if (isDate(value) && keys.length === 0) {
      return stylize(value.toUTCString(), 'date');
    }

    var base, type, braces;
    // Determine the object type
    if (isArray(value)) {
      type = 'Array';
      braces = ['[', ']'];
    } else {
      type = 'Object';
      braces = ['{', '}'];
    }

    // Make functions say that they are functions
    if (typeof value === 'function') {
      var n = value.name ? ': ' + value.name : '';
      base = (isRegExp(value)) ? ' ' + value : ' [Function' + n + ']';
    } else {
      base = '';
    }

    // Make dates with properties first say the date
    if (isDate(value)) {
      base = ' ' + value.toUTCString();
    }

    if (keys.length === 0) {
      return braces[0] + base + braces[1];
    }

    if (recurseTimes < 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        return stylize('[Object]', 'special');
      }
    }

    seen.push(value);

    var output = keys.map(function(key) {
      var name, str;
      if (value.__lookupGetter__) {
        if (value.__lookupGetter__(key)) {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Getter/Setter]', 'special');
          } else {
            str = stylize('[Getter]', 'special');
          }
        } else {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Setter]', 'special');
          }
        }
      }
      if (visible_keys.indexOf(key) < 0) {
        name = '[' + key + ']';
      }
      if (!str) {
        if (seen.indexOf(value[key]) < 0) {
          if (recurseTimes === null) {
            str = format(value[key]);
          } else {
            str = format(value[key], recurseTimes - 1);
          }
          if (str.indexOf('\n') > -1) {
            if (isArray(value)) {
              str = str.split('\n').map(function(line) {
                return '  ' + line;
              }).join('\n').substr(2);
            } else {
              str = '\n' + str.split('\n').map(function(line) {
                return '   ' + line;
              }).join('\n');
            }
          }
        } else {
          str = stylize('[Circular]', 'special');
        }
      }
      if (typeof name === 'undefined') {
        if (type === 'Array' && key.match(/^\d+$/)) {
          return str;
        }
        name = JSON.stringify('' + key);
        if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
          name = name.substr(1, name.length - 2);
          name = stylize(name, 'name');
        } else {
          name = name.replace(/'/g, "\\'")
                     .replace(/\\"/g, '"')
                     .replace(/(^"|"$)/g, "'");
          name = stylize(name, 'string');
        }
      }

      return name + ': ' + str;
    });

    seen.pop();

    var numLinesEst = 0;
    var length = output.reduce(function(prev, cur) {
      numLinesEst++;
      if (cur.indexOf('\n') >= 0) numLinesEst++;
      return prev + cur.length + 1;
    }, 0);

    if (length > 50) {
      output = braces[0] +
               (base === '' ? '' : base + '\n ') +
               ' ' +
               output.join(',\n  ') +
               ' ' +
               braces[1];

    } else {
      output = braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
    }

    return output;
  }
  return format(obj, (typeof depth === 'undefined' ? 2 : depth));
};


function isArray(ar) {
  return ar instanceof Array ||
         Array.isArray(ar) ||
         (ar && ar !== Object.prototype && isArray(ar.__proto__));
}


function isRegExp(re) {
  return re instanceof RegExp ||
    (typeof re === 'object' && Object.prototype.toString.call(re) === '[object RegExp]');
}


function isDate(d) {
  if (d instanceof Date) return true;
  if (typeof d !== 'object') return false;
  var properties = Date.prototype && Object_getOwnPropertyNames(Date.prototype);
  var proto = d.__proto__ && Object_getOwnPropertyNames(d.__proto__);
  return JSON.stringify(proto) === JSON.stringify(properties);
}

function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}

var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}

exports.log = function (msg) {};

exports.pump = null;

var Object_keys = Object.keys || function (obj) {
    var res = [];
    for (var key in obj) res.push(key);
    return res;
};

var Object_getOwnPropertyNames = Object.getOwnPropertyNames || function (obj) {
    var res = [];
    for (var key in obj) {
        if (Object.hasOwnProperty.call(obj, key)) res.push(key);
    }
    return res;
};

var Object_create = Object.create || function (prototype, properties) {
    // from es5-shim
    var object;
    if (prototype === null) {
        object = { '__proto__' : null };
    }
    else {
        if (typeof prototype !== 'object') {
            throw new TypeError(
                'typeof prototype[' + (typeof prototype) + '] != \'object\''
            );
        }
        var Type = function () {};
        Type.prototype = prototype;
        object = new Type();
        object.__proto__ = prototype;
    }
    if (typeof properties !== 'undefined' && Object.defineProperties) {
        Object.defineProperties(object, properties);
    }
    return object;
};

exports.inherits = function(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = Object_create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
};

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (typeof f !== 'string') {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(exports.inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j': return JSON.stringify(args[i++]);
      default:
        return x;
    }
  });
  for(var x = args[i]; i < len; x = args[++i]){
    if (x === null || typeof x !== 'object') {
      str += ' ' + x;
    } else {
      str += ' ' + exports.inspect(x);
    }
  }
  return str;
};

},{"events":6}],8:[function(require,module,exports){
exports.readIEEE754 = function(buffer, offset, isBE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isBE ? 0 : (nBytes - 1),
      d = isBE ? 1 : -1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.writeIEEE754 = function(buffer, value, offset, isBE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isBE ? (nBytes - 1) : 0,
      d = isBE ? -1 : 1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],9:[function(require,module,exports){
var assert = require('assert');
exports.Buffer = Buffer;
exports.SlowBuffer = Buffer;
Buffer.poolSize = 8192;
exports.INSPECT_MAX_BYTES = 50;

function Buffer(subject, encoding, offset) {
  if (!(this instanceof Buffer)) {
    return new Buffer(subject, encoding, offset);
  }
  this.parent = this;
  this.offset = 0;

  var type;

  // Are we slicing?
  if (typeof offset === 'number') {
    this.length = coerce(encoding);
    this.offset = offset;
  } else {
    // Find the length
    switch (type = typeof subject) {
      case 'number':
        this.length = coerce(subject);
        break;

      case 'string':
        this.length = Buffer.byteLength(subject, encoding);
        break;

      case 'object': // Assume object is an array
        this.length = coerce(subject.length);
        break;

      default:
        throw new Error('First argument needs to be a number, ' +
                        'array or string.');
    }

    // Treat array-ish objects as a byte array.
    if (isArrayIsh(subject)) {
      for (var i = 0; i < this.length; i++) {
        if (subject instanceof Buffer) {
          this[i] = subject.readUInt8(i);
        }
        else {
          this[i] = subject[i];
        }
      }
    } else if (type == 'string') {
      // We are a string
      this.length = this.write(subject, 0, encoding);
    } else if (type === 'number') {
      for (var i = 0; i < this.length; i++) {
        this[i] = 0;
      }
    }
  }
}

Buffer.prototype.get = function get(i) {
  if (i < 0 || i >= this.length) throw new Error('oob');
  return this[i];
};

Buffer.prototype.set = function set(i, v) {
  if (i < 0 || i >= this.length) throw new Error('oob');
  return this[i] = v;
};

Buffer.byteLength = function (str, encoding) {
  switch (encoding || "utf8") {
    case 'hex':
      return str.length / 2;

    case 'utf8':
    case 'utf-8':
      return utf8ToBytes(str).length;

    case 'ascii':
    case 'binary':
      return str.length;

    case 'base64':
      return base64ToBytes(str).length;

    default:
      throw new Error('Unknown encoding');
  }
};

Buffer.prototype.utf8Write = function (string, offset, length) {
  var bytes, pos;
  return Buffer._charsWritten =  blitBuffer(utf8ToBytes(string), this, offset, length);
};

Buffer.prototype.asciiWrite = function (string, offset, length) {
  var bytes, pos;
  return Buffer._charsWritten =  blitBuffer(asciiToBytes(string), this, offset, length);
};

Buffer.prototype.binaryWrite = Buffer.prototype.asciiWrite;

Buffer.prototype.base64Write = function (string, offset, length) {
  var bytes, pos;
  return Buffer._charsWritten = blitBuffer(base64ToBytes(string), this, offset, length);
};

Buffer.prototype.base64Slice = function (start, end) {
  var bytes = Array.prototype.slice.apply(this, arguments)
  return require("base64-js").fromByteArray(bytes);
};

Buffer.prototype.utf8Slice = function () {
  var bytes = Array.prototype.slice.apply(this, arguments);
  var res = "";
  var tmp = "";
  var i = 0;
  while (i < bytes.length) {
    if (bytes[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(bytes[i]);
      tmp = "";
    } else
      tmp += "%" + bytes[i].toString(16);

    i++;
  }

  return res + decodeUtf8Char(tmp);
}

Buffer.prototype.asciiSlice = function () {
  var bytes = Array.prototype.slice.apply(this, arguments);
  var ret = "";
  for (var i = 0; i < bytes.length; i++)
    ret += String.fromCharCode(bytes[i]);
  return ret;
}

Buffer.prototype.binarySlice = Buffer.prototype.asciiSlice;

Buffer.prototype.inspect = function() {
  var out = [],
      len = this.length;
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i]);
    if (i == exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...';
      break;
    }
  }
  return '<Buffer ' + out.join(' ') + '>';
};


Buffer.prototype.hexSlice = function(start, end) {
  var len = this.length;

  if (!start || start < 0) start = 0;
  if (!end || end < 0 || end > len) end = len;

  var out = '';
  for (var i = start; i < end; i++) {
    out += toHex(this[i]);
  }
  return out;
};


Buffer.prototype.toString = function(encoding, start, end) {
  encoding = String(encoding || 'utf8').toLowerCase();
  start = +start || 0;
  if (typeof end == 'undefined') end = this.length;

  // Fastpath empty strings
  if (+end == start) {
    return '';
  }

  switch (encoding) {
    case 'hex':
      return this.hexSlice(start, end);

    case 'utf8':
    case 'utf-8':
      return this.utf8Slice(start, end);

    case 'ascii':
      return this.asciiSlice(start, end);

    case 'binary':
      return this.binarySlice(start, end);

    case 'base64':
      return this.base64Slice(start, end);

    case 'ucs2':
    case 'ucs-2':
      return this.ucs2Slice(start, end);

    default:
      throw new Error('Unknown encoding');
  }
};


Buffer.prototype.hexWrite = function(string, offset, length) {
  offset = +offset || 0;
  var remaining = this.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = +length;
    if (length > remaining) {
      length = remaining;
    }
  }

  // must be an even number of digits
  var strLen = string.length;
  if (strLen % 2) {
    throw new Error('Invalid hex string');
  }
  if (length > strLen / 2) {
    length = strLen / 2;
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16);
    if (isNaN(byte)) throw new Error('Invalid hex string');
    this[offset + i] = byte;
  }
  Buffer._charsWritten = i * 2;
  return i;
};


Buffer.prototype.write = function(string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length;
      length = undefined;
    }
  } else {  // legacy
    var swap = encoding;
    encoding = offset;
    offset = length;
    length = swap;
  }

  offset = +offset || 0;
  var remaining = this.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = +length;
    if (length > remaining) {
      length = remaining;
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase();

  switch (encoding) {
    case 'hex':
      return this.hexWrite(string, offset, length);

    case 'utf8':
    case 'utf-8':
      return this.utf8Write(string, offset, length);

    case 'ascii':
      return this.asciiWrite(string, offset, length);

    case 'binary':
      return this.binaryWrite(string, offset, length);

    case 'base64':
      return this.base64Write(string, offset, length);

    case 'ucs2':
    case 'ucs-2':
      return this.ucs2Write(string, offset, length);

    default:
      throw new Error('Unknown encoding');
  }
};


// slice(start, end)
Buffer.prototype.slice = function(start, end) {
  if (end === undefined) end = this.length;

  if (end > this.length) {
    throw new Error('oob');
  }
  if (start > end) {
    throw new Error('oob');
  }

  return new Buffer(this, end - start, +start);
};

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function(target, target_start, start, end) {
  var source = this;
  start || (start = 0);
  if (end === undefined || isNaN(end)) {
    end = this.length;
  }
  target_start || (target_start = 0);

  if (end < start) throw new Error('sourceEnd < sourceStart');

  // Copy 0 bytes; we're done
  if (end === start) return 0;
  if (target.length == 0 || source.length == 0) return 0;

  if (target_start < 0 || target_start >= target.length) {
    throw new Error('targetStart out of bounds');
  }

  if (start < 0 || start >= source.length) {
    throw new Error('sourceStart out of bounds');
  }

  if (end < 0 || end > source.length) {
    throw new Error('sourceEnd out of bounds');
  }

  // Are we oob?
  if (end > this.length) {
    end = this.length;
  }

  if (target.length - target_start < end - start) {
    end = target.length - target_start + start;
  }

  var temp = [];
  for (var i=start; i<end; i++) {
    assert.ok(typeof this[i] !== 'undefined', "copying undefined buffer bytes!");
    temp.push(this[i]);
  }

  for (var i=target_start; i<target_start+temp.length; i++) {
    target[i] = temp[i-target_start];
  }
};

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function fill(value, start, end) {
  value || (value = 0);
  start || (start = 0);
  end || (end = this.length);

  if (typeof value === 'string') {
    value = value.charCodeAt(0);
  }
  if (!(typeof value === 'number') || isNaN(value)) {
    throw new Error('value is not a number');
  }

  if (end < start) throw new Error('end < start');

  // Fill 0 bytes; we're done
  if (end === start) return 0;
  if (this.length == 0) return 0;

  if (start < 0 || start >= this.length) {
    throw new Error('start out of bounds');
  }

  if (end < 0 || end > this.length) {
    throw new Error('end out of bounds');
  }

  for (var i = start; i < end; i++) {
    this[i] = value;
  }
}

// Static methods
Buffer.isBuffer = function isBuffer(b) {
  return b instanceof Buffer || b instanceof Buffer;
};

Buffer.concat = function (list, totalLength) {
  if (!isArray(list)) {
    throw new Error("Usage: Buffer.concat(list, [totalLength])\n \
      list should be an Array.");
  }

  if (list.length === 0) {
    return new Buffer(0);
  } else if (list.length === 1) {
    return list[0];
  }

  if (typeof totalLength !== 'number') {
    totalLength = 0;
    for (var i = 0; i < list.length; i++) {
      var buf = list[i];
      totalLength += buf.length;
    }
  }

  var buffer = new Buffer(totalLength);
  var pos = 0;
  for (var i = 0; i < list.length; i++) {
    var buf = list[i];
    buf.copy(buffer, pos);
    pos += buf.length;
  }
  return buffer;
};

// helpers

function coerce(length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length);
  return length < 0 ? 0 : length;
}

function isArray(subject) {
  return (Array.isArray ||
    function(subject){
      return {}.toString.apply(subject) == '[object Array]'
    })
    (subject)
}

function isArrayIsh(subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
         subject && typeof subject === 'object' &&
         typeof subject.length === 'number';
}

function toHex(n) {
  if (n < 16) return '0' + n.toString(16);
  return n.toString(16);
}

function utf8ToBytes(str) {
  var byteArray = [];
  for (var i = 0; i < str.length; i++)
    if (str.charCodeAt(i) <= 0x7F)
      byteArray.push(str.charCodeAt(i));
    else {
      var h = encodeURIComponent(str.charAt(i)).substr(1).split('%');
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16));
    }

  return byteArray;
}

function asciiToBytes(str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++ )
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push( str.charCodeAt(i) & 0xFF );

  return byteArray;
}

function base64ToBytes(str) {
  return require("base64-js").toByteArray(str);
}

function blitBuffer(src, dst, offset, length) {
  var pos, i = 0;
  while (i < length) {
    if ((i+offset >= dst.length) || (i >= src.length))
      break;

    dst[i + offset] = src[i];
    i++;
  }
  return i;
}

function decodeUtf8Char(str) {
  try {
    return decodeURIComponent(str);
  } catch (err) {
    return String.fromCharCode(0xFFFD); // UTF 8 invalid char
  }
}

// read/write bit-twiddling

Buffer.prototype.readUInt8 = function(offset, noAssert) {
  var buffer = this;

  if (!noAssert) {
    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (offset >= buffer.length) return;

  return buffer[offset];
};

function readUInt16(buffer, offset, isBigEndian, noAssert) {
  var val = 0;


  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (offset >= buffer.length) return 0;

  if (isBigEndian) {
    val = buffer[offset] << 8;
    if (offset + 1 < buffer.length) {
      val |= buffer[offset + 1];
    }
  } else {
    val = buffer[offset];
    if (offset + 1 < buffer.length) {
      val |= buffer[offset + 1] << 8;
    }
  }

  return val;
}

Buffer.prototype.readUInt16LE = function(offset, noAssert) {
  return readUInt16(this, offset, false, noAssert);
};

Buffer.prototype.readUInt16BE = function(offset, noAssert) {
  return readUInt16(this, offset, true, noAssert);
};

function readUInt32(buffer, offset, isBigEndian, noAssert) {
  var val = 0;

  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (offset >= buffer.length) return 0;

  if (isBigEndian) {
    if (offset + 1 < buffer.length)
      val = buffer[offset + 1] << 16;
    if (offset + 2 < buffer.length)
      val |= buffer[offset + 2] << 8;
    if (offset + 3 < buffer.length)
      val |= buffer[offset + 3];
    val = val + (buffer[offset] << 24 >>> 0);
  } else {
    if (offset + 2 < buffer.length)
      val = buffer[offset + 2] << 16;
    if (offset + 1 < buffer.length)
      val |= buffer[offset + 1] << 8;
    val |= buffer[offset];
    if (offset + 3 < buffer.length)
      val = val + (buffer[offset + 3] << 24 >>> 0);
  }

  return val;
}

Buffer.prototype.readUInt32LE = function(offset, noAssert) {
  return readUInt32(this, offset, false, noAssert);
};

Buffer.prototype.readUInt32BE = function(offset, noAssert) {
  return readUInt32(this, offset, true, noAssert);
};


/*
 * Signed integer types, yay team! A reminder on how two's complement actually
 * works. The first bit is the signed bit, i.e. tells us whether or not the
 * number should be positive or negative. If the two's complement value is
 * positive, then we're done, as it's equivalent to the unsigned representation.
 *
 * Now if the number is positive, you're pretty much done, you can just leverage
 * the unsigned translations and return those. Unfortunately, negative numbers
 * aren't quite that straightforward.
 *
 * At first glance, one might be inclined to use the traditional formula to
 * translate binary numbers between the positive and negative values in two's
 * complement. (Though it doesn't quite work for the most negative value)
 * Mainly:
 *  - invert all the bits
 *  - add one to the result
 *
 * Of course, this doesn't quite work in Javascript. Take for example the value
 * of -128. This could be represented in 16 bits (big-endian) as 0xff80. But of
 * course, Javascript will do the following:
 *
 * > ~0xff80
 * -65409
 *
 * Whoh there, Javascript, that's not quite right. But wait, according to
 * Javascript that's perfectly correct. When Javascript ends up seeing the
 * constant 0xff80, it has no notion that it is actually a signed number. It
 * assumes that we've input the unsigned value 0xff80. Thus, when it does the
 * binary negation, it casts it into a signed value, (positive 0xff80). Then
 * when you perform binary negation on that, it turns it into a negative number.
 *
 * Instead, we're going to have to use the following general formula, that works
 * in a rather Javascript friendly way. I'm glad we don't support this kind of
 * weird numbering scheme in the kernel.
 *
 * (BIT-MAX - (unsigned)val + 1) * -1
 *
 * The astute observer, may think that this doesn't make sense for 8-bit numbers
 * (really it isn't necessary for them). However, when you get 16-bit numbers,
 * you do. Let's go back to our prior example and see how this will look:
 *
 * (0xffff - 0xff80 + 1) * -1
 * (0x007f + 1) * -1
 * (0x0080) * -1
 */
Buffer.prototype.readInt8 = function(offset, noAssert) {
  var buffer = this;
  var neg;

  if (!noAssert) {
    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (offset >= buffer.length) return;

  neg = buffer[offset] & 0x80;
  if (!neg) {
    return (buffer[offset]);
  }

  return ((0xff - buffer[offset] + 1) * -1);
};

function readInt16(buffer, offset, isBigEndian, noAssert) {
  var neg, val;

  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'Trying to read beyond buffer length');
  }

  val = readUInt16(buffer, offset, isBigEndian, noAssert);
  neg = val & 0x8000;
  if (!neg) {
    return val;
  }

  return (0xffff - val + 1) * -1;
}

Buffer.prototype.readInt16LE = function(offset, noAssert) {
  return readInt16(this, offset, false, noAssert);
};

Buffer.prototype.readInt16BE = function(offset, noAssert) {
  return readInt16(this, offset, true, noAssert);
};

function readInt32(buffer, offset, isBigEndian, noAssert) {
  var neg, val;

  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to read beyond buffer length');
  }

  val = readUInt32(buffer, offset, isBigEndian, noAssert);
  neg = val & 0x80000000;
  if (!neg) {
    return (val);
  }

  return (0xffffffff - val + 1) * -1;
}

Buffer.prototype.readInt32LE = function(offset, noAssert) {
  return readInt32(this, offset, false, noAssert);
};

Buffer.prototype.readInt32BE = function(offset, noAssert) {
  return readInt32(this, offset, true, noAssert);
};

function readFloat(buffer, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset + 3 < buffer.length,
        'Trying to read beyond buffer length');
  }

  return require('./buffer_ieee754').readIEEE754(buffer, offset, isBigEndian,
      23, 4);
}

Buffer.prototype.readFloatLE = function(offset, noAssert) {
  return readFloat(this, offset, false, noAssert);
};

Buffer.prototype.readFloatBE = function(offset, noAssert) {
  return readFloat(this, offset, true, noAssert);
};

function readDouble(buffer, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset + 7 < buffer.length,
        'Trying to read beyond buffer length');
  }

  return require('./buffer_ieee754').readIEEE754(buffer, offset, isBigEndian,
      52, 8);
}

Buffer.prototype.readDoubleLE = function(offset, noAssert) {
  return readDouble(this, offset, false, noAssert);
};

Buffer.prototype.readDoubleBE = function(offset, noAssert) {
  return readDouble(this, offset, true, noAssert);
};


/*
 * We have to make sure that the value is a valid integer. This means that it is
 * non-negative. It has no fractional component and that it does not exceed the
 * maximum allowed value.
 *
 *      value           The number to check for validity
 *
 *      max             The maximum value
 */
function verifuint(value, max) {
  assert.ok(typeof (value) == 'number',
      'cannot write a non-number as a number');

  assert.ok(value >= 0,
      'specified a negative value for writing an unsigned value');

  assert.ok(value <= max, 'value is larger than maximum value for type');

  assert.ok(Math.floor(value) === value, 'value has a fractional component');
}

Buffer.prototype.writeUInt8 = function(value, offset, noAssert) {
  var buffer = this;

  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'trying to write beyond buffer length');

    verifuint(value, 0xff);
  }

  if (offset < buffer.length) {
    buffer[offset] = value;
  }
};

function writeUInt16(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'trying to write beyond buffer length');

    verifuint(value, 0xffff);
  }

  for (var i = 0; i < Math.min(buffer.length - offset, 2); i++) {
    buffer[offset + i] =
        (value & (0xff << (8 * (isBigEndian ? 1 - i : i)))) >>>
            (isBigEndian ? 1 - i : i) * 8;
  }

}

Buffer.prototype.writeUInt16LE = function(value, offset, noAssert) {
  writeUInt16(this, value, offset, false, noAssert);
};

Buffer.prototype.writeUInt16BE = function(value, offset, noAssert) {
  writeUInt16(this, value, offset, true, noAssert);
};

function writeUInt32(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'trying to write beyond buffer length');

    verifuint(value, 0xffffffff);
  }

  for (var i = 0; i < Math.min(buffer.length - offset, 4); i++) {
    buffer[offset + i] =
        (value >>> (isBigEndian ? 3 - i : i) * 8) & 0xff;
  }
}

Buffer.prototype.writeUInt32LE = function(value, offset, noAssert) {
  writeUInt32(this, value, offset, false, noAssert);
};

Buffer.prototype.writeUInt32BE = function(value, offset, noAssert) {
  writeUInt32(this, value, offset, true, noAssert);
};


/*
 * We now move onto our friends in the signed number category. Unlike unsigned
 * numbers, we're going to have to worry a bit more about how we put values into
 * arrays. Since we are only worrying about signed 32-bit values, we're in
 * slightly better shape. Unfortunately, we really can't do our favorite binary
 * & in this system. It really seems to do the wrong thing. For example:
 *
 * > -32 & 0xff
 * 224
 *
 * What's happening above is really: 0xe0 & 0xff = 0xe0. However, the results of
 * this aren't treated as a signed number. Ultimately a bad thing.
 *
 * What we're going to want to do is basically create the unsigned equivalent of
 * our representation and pass that off to the wuint* functions. To do that
 * we're going to do the following:
 *
 *  - if the value is positive
 *      we can pass it directly off to the equivalent wuint
 *  - if the value is negative
 *      we do the following computation:
 *         mb + val + 1, where
 *         mb   is the maximum unsigned value in that byte size
 *         val  is the Javascript negative integer
 *
 *
 * As a concrete value, take -128. In signed 16 bits this would be 0xff80. If
 * you do out the computations:
 *
 * 0xffff - 128 + 1
 * 0xffff - 127
 * 0xff80
 *
 * You can then encode this value as the signed version. This is really rather
 * hacky, but it should work and get the job done which is our goal here.
 */

/*
 * A series of checks to make sure we actually have a signed 32-bit number
 */
function verifsint(value, max, min) {
  assert.ok(typeof (value) == 'number',
      'cannot write a non-number as a number');

  assert.ok(value <= max, 'value larger than maximum allowed value');

  assert.ok(value >= min, 'value smaller than minimum allowed value');

  assert.ok(Math.floor(value) === value, 'value has a fractional component');
}

function verifIEEE754(value, max, min) {
  assert.ok(typeof (value) == 'number',
      'cannot write a non-number as a number');

  assert.ok(value <= max, 'value larger than maximum allowed value');

  assert.ok(value >= min, 'value smaller than minimum allowed value');
}

Buffer.prototype.writeInt8 = function(value, offset, noAssert) {
  var buffer = this;

  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'Trying to write beyond buffer length');

    verifsint(value, 0x7f, -0x80);
  }

  if (value >= 0) {
    buffer.writeUInt8(value, offset, noAssert);
  } else {
    buffer.writeUInt8(0xff + value + 1, offset, noAssert);
  }
};

function writeInt16(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'Trying to write beyond buffer length');

    verifsint(value, 0x7fff, -0x8000);
  }

  if (value >= 0) {
    writeUInt16(buffer, value, offset, isBigEndian, noAssert);
  } else {
    writeUInt16(buffer, 0xffff + value + 1, offset, isBigEndian, noAssert);
  }
}

Buffer.prototype.writeInt16LE = function(value, offset, noAssert) {
  writeInt16(this, value, offset, false, noAssert);
};

Buffer.prototype.writeInt16BE = function(value, offset, noAssert) {
  writeInt16(this, value, offset, true, noAssert);
};

function writeInt32(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to write beyond buffer length');

    verifsint(value, 0x7fffffff, -0x80000000);
  }

  if (value >= 0) {
    writeUInt32(buffer, value, offset, isBigEndian, noAssert);
  } else {
    writeUInt32(buffer, 0xffffffff + value + 1, offset, isBigEndian, noAssert);
  }
}

Buffer.prototype.writeInt32LE = function(value, offset, noAssert) {
  writeInt32(this, value, offset, false, noAssert);
};

Buffer.prototype.writeInt32BE = function(value, offset, noAssert) {
  writeInt32(this, value, offset, true, noAssert);
};

function writeFloat(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to write beyond buffer length');

    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38);
  }

  require('./buffer_ieee754').writeIEEE754(buffer, value, offset, isBigEndian,
      23, 4);
}

Buffer.prototype.writeFloatLE = function(value, offset, noAssert) {
  writeFloat(this, value, offset, false, noAssert);
};

Buffer.prototype.writeFloatBE = function(value, offset, noAssert) {
  writeFloat(this, value, offset, true, noAssert);
};

function writeDouble(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 7 < buffer.length,
        'Trying to write beyond buffer length');

    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308);
  }

  require('./buffer_ieee754').writeIEEE754(buffer, value, offset, isBigEndian,
      52, 8);
}

Buffer.prototype.writeDoubleLE = function(value, offset, noAssert) {
  writeDouble(this, value, offset, false, noAssert);
};

Buffer.prototype.writeDoubleBE = function(value, offset, noAssert) {
  writeDouble(this, value, offset, true, noAssert);
};

},{"./buffer_ieee754":8,"assert":5,"base64-js":10}],10:[function(require,module,exports){
(function (exports) {
	'use strict';

	var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

	function b64ToByteArray(b64) {
		var i, j, l, tmp, placeHolders, arr;
	
		if (b64.length % 4 > 0) {
			throw 'Invalid string. Length must be a multiple of 4';
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		placeHolders = b64.indexOf('=');
		placeHolders = placeHolders > 0 ? b64.length - placeHolders : 0;

		// base64 is 4/3 + up to two characters of the original data
		arr = [];//new Uint8Array(b64.length * 3 / 4 - placeHolders);

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length;

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (lookup.indexOf(b64[i]) << 18) | (lookup.indexOf(b64[i + 1]) << 12) | (lookup.indexOf(b64[i + 2]) << 6) | lookup.indexOf(b64[i + 3]);
			arr.push((tmp & 0xFF0000) >> 16);
			arr.push((tmp & 0xFF00) >> 8);
			arr.push(tmp & 0xFF);
		}

		if (placeHolders === 2) {
			tmp = (lookup.indexOf(b64[i]) << 2) | (lookup.indexOf(b64[i + 1]) >> 4);
			arr.push(tmp & 0xFF);
		} else if (placeHolders === 1) {
			tmp = (lookup.indexOf(b64[i]) << 10) | (lookup.indexOf(b64[i + 1]) << 4) | (lookup.indexOf(b64[i + 2]) >> 2);
			arr.push((tmp >> 8) & 0xFF);
			arr.push(tmp & 0xFF);
		}

		return arr;
	}

	function uint8ToBase64(uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length;

		function tripletToBase64 (num) {
			return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F];
		};

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
			output += tripletToBase64(temp);
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1];
				output += lookup[temp >> 2];
				output += lookup[(temp << 4) & 0x3F];
				output += '==';
				break;
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1]);
				output += lookup[temp >> 10];
				output += lookup[(temp >> 4) & 0x3F];
				output += lookup[(temp << 2) & 0x3F];
				output += '=';
				break;
		}

		return output;
	}

	module.exports.toByteArray = b64ToByteArray;
	module.exports.fromByteArray = uint8ToBase64;
}());

},{}],11:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}]},{},[1])
;