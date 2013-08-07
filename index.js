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

