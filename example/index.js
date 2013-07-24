var cando = require('../');
var http = require('http');

cando.define('/foo',  function() {
  this.user.role === 'admin' ? this.allow() : this.deny();
  this.next();
});

cando.define('/foo/bar', function() {
  this.user.id === this.model.user_id ? this.allow() : this.deny();
  this.next();
});

var server = http.createServer(function(req, res) {
  cando.verify({
    user: { id: 1, role: 'admi'},
    model: { user_id: 1 },
    req: req
  }, function(err, authorized) {
    if (err) { res.writeHead(500); res.end(JSON.stringify(err)); return;}
    if (!authorized) { res.writeHead(403); res.end('Forbidden'); return;}
    res.writeHead(200);
    res.end('Welcome');
  });
}).listen(3000);