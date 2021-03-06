# CanDo

This module creates a dynamic handler for matching and authorizing routes.  

In order, to perform an authorization for a given user, you must have access to 
the user, model, url, and method.


       +-------------------------+
       |       Request           |
       |                         |
       +----------+--------------+
                  |
                  |
       +----------+--------------+
       |                         |
       |                         |
       |     Authentication      |
       |                         |
       +-----------+-------------+
                   |
                   |
                   |
       +-----------v-------------+
       |                         |
       |                         |
       |     Authorization       |
       |        (CanDo)          |
       +-----------+-------------+
                   |
                   |
       +-----------v-------------+
       |                         |
       |     app.router          |
       |                         |
       +-------------------------+
       

Here is a diagram of the middleware stack, the CanDo module can be placed between 
the Authentication and App.router.  It needs the user, model, url, and method;

The concept behind the `cando` module is to give you the ability to create custom based authorization rules in a sharable javascript file that can be provided to both the server and the client.  THis way our authorization rules are in one place and applied to the front-end to hide and show functionality and applied to the back-end to allow or deny actions.

## Example:

``` js
var cando = require('cando');

cando
  .define('/api/users', function() {
    this.user.role === 'admin' ? this.allow() : this.deny();
    this.next();
  })
  .define('/api/users/:id', 'PUT', function() {
    this.user.id === this.model.user_id ? this.allow() : this.deny();
    this.next();
  });

app.use(...); //authentication
app.use(function(req, res, next) {
  // /api/:model/:id
  var id = req.url.split('/')[3];
  db.get(id, function(err, doc) {
    if (err) { return res.send(500, err); }
    req.model = doc;
    next();
  });
});

app.use(function(req, res, next) {
  var data = {
    user: req.session.user,
    model: req.model,
    req: req
  };
  
  cando.verify(data, function(err, authorized) {
    if (err) { return res.send(500, err); }
    if (!authorized) { return res.send(403, { status: 'Not Authorized' }); }
    console.log('authorized');
    next();
  });
});
```

---

## Api

# Cando
 
Is an authorization module that includes a micro-router for matching
defined routes and providing authorization logic to confirm the 
user has the right to execute the requested api function.

There are two endpoints, #define and #verify.

## define(pattern, [method], fn)

[define] takes a url pattern, a optional verb array, if null, then it 
is assumed you want to match against all verbs, and is the default
verbs are GET, POST, PUT, DELETE.
the last parameter is the function you want to be invoked on match
in that function you will have access to the following:

* this.user [object] if set
* this.model [object] if set
* this.url [string] - url of the request
* this.method [string] - method of the request
* this.params [object] if using colon patterns
* this.set is the function you call to specify if the request is authorized
 or not.  this.allow() or this.deny();
* this.next to continue to the next match

### verify(data, fn)

[verify] is the function that performs the match against all of your defined
patterns.  So you normally call this in the middleware stack or on the client before you want to execute your application code.

---

## Browserfied version is in the root dir

* cando.js

## Thanks

* mapleTree
* NodeJS
