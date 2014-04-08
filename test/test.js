var 
  assert = require("assert"),
  should = require("should"),
  Cable = require("../dist/cable.min.js");

describe("Cable._private", function() {
  describe("#getArgNames", function() {
    it("find should the argument names of a function without aliases", function() {
      Cable._private.getArgNames(function() { })
        .should.eql([]);

      Cable._private.getArgNames(function(x,y,z) { })
        .should.eql(["x", "y", "z"]);
    });

    it("find should use aliases if they are present", function() {
      var fn = function(a, b) {};
      fn.argAliases = ["c", "d"];

      Cable._private.getArgNames(fn)
        .should.eql(fn.argAliases);
    });
  });
});

describe("Cable#Helpers", function() {
  describe("#withArgs", function() {
    it("should produce a fuction with an argAliases property", function() {
      Cable.withArgs([], function() { })
        .should.have.property("argAliases");
    });

    it("should have argAliases equal to the list names", function() {
      var aliases = ["a","b","c"]
      Cable.withArgs(aliases, function(x,y,z) { })
        .should.have.property("argAliases", aliases);
    });
  });
});
