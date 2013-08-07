var expect = require('expect.js');
var cando = require('../');

describe('CanDo', function() {
  before(function() {
    cando
      .define('/foo',  function(user) {
        this.user.role === 'admin' ? this.allow() : this.deny();
        this.next();
      })
      .define('/foo/bar', 'GET', function(user, model) {
        this.user.id === this.model.user_id ? this.allow() : this.deny();
        this.next();
      });
  });
  it('should allow role of admin for GET /foo', function(done) {
    cando.verify({
      user: { role: 'admin'},
      url: '/foo', 
      method: 'GET'
    }, function(err, authorized) {
      expect(authorized).to.be(true);
      done();
    });
  });
  it('should deny role of user for GET /foo', function(done) {
    cando.verify({
      user: { role: 'user'},
      url: '/foo', 
      method: 'GET'
    }, function(err, authorized) {
      expect(authorized).to.be(false);
      done();
    });
  });
  it('should allow role of user if owner for GET /foo/bar', function(done) {
    cando.verify({
      user: { id: 1, role: 'user'},
      model: { user_id: 1 },
      url: '/foo/bar', 
      method: 'GET'
    }, function(err, authorized) {
      expect(authorized).to.be(true);
      done();
    });
  });
  it('should deny role of user if not owner for GET /foo/bar', function(done) {
    cando.verify({
      user: { id: 1, role: 'user'},
      model: { user_id: 2 },
      url: '/foo/bar', method: 'GET'
    }, function(err, authorized) {
      expect(authorized).to.be(false);
      done();
    });
  });

});
