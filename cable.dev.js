/*.......................................
. cablejs: By Wyatt Allen, MIT Licenced .
. 2014-03-18T22:13:04.591Z              .
.......................................*/
var Cable = {};

(function() {

var reserved = "result respond define type event".split(" ");

var graph = { };

function each(obj, fn) {
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      fn(obj[key], key);
    }
  }
};

//  Find the argument names of a function.
function getArgNames(fn) {
  if (fn.argAliases) {
    return fn.argAliases;
  }
  else {
    return (fn + "")
      .match(/^function(\s*)?\(([^)]*)\)/m)[2]
      .split(",")
      .map(function(x) { return x.replace(/(^\s+)|(\s+$)/g, ""); });
  }
}

//  Gets the list of properties which should be fed into the function as 
//  arguments. Essentially, this is the list of argument names excluding 
//  reserved words and with leading underscores removed. Each one should refer to 
//  a  extant node (contextualized).
function getFanIn(fn, context) {
  return getArgNames(fn)
    .filter(function(arg) {
      return reserved.indexOf(arg) == -1;
    })
    .map(function(arg) {
      return arg.replace(/^_/, "");
    });
}

//  Gets the list of nodes which are dependencies and which can trigger this 
//  node. In other words, it is the arguments excluding reserved words and arguments
//  with leading underscores.
function getDependencies(fn, context) {
  return getArgNames(fn)
    .filter(function(arg) {
      return reserved.indexOf(arg) == -1 && arg[0] != '_';
    });
}

// Via http://stackoverflow.com/a/7356528/26626
function isFunction(fn) {
  var getType = {};
  return fn && getType.toString.call(fn) === '[object Function]';
}

//  The test for whether a function represents a synthetic cable is whether it 
//  requests a result handler.
function isSynthetic(fn) {
  return (
    getArgNames(fn).indexOf("result") != -1 || 
    getArgNames(fn).indexOf("respond") != -1
  );
}

//  Return the first argument with overriden properties from the second 
//  argument. For example extend({ x:1, y:2 }, { y:3 }) === { x:1, y:3 } OR
//  extend({ x:1, y:2 }, { z:1000 }) === { x:1, y:2 }
function extend(defaults, override) {
  if (override) {
    var o = { };
    each(defaults, function(prop, name) {
      o[name] = override.hasOwnProperty(name) ? override[name] : prop;
    });
    return o;
  }
  else {
    return defaults;
  }
}

Cable._debug = function() { return graph; };


//  Definition function. Essentially this is the interface for cable.
Cable.define = function(object, options) {

  //  Get a complete options set.
  var options = extend(
    { reify:true, wireup:true, scope:{ chain:[] } },
    options
  );

  //  For each definition in the object, examine it's meaning/validity and defer 
  //  to the installation procedures as appropriate.
  each(object, function(cable, name) {

    //  Check wehether the name is valid:
    if (/^_/.test(name)) {
      throw "Illegal definition: names cannot begin with an underscore.";
    }
    if (reserved.indexOf(name) != -1) {
      throw "Illegal definition: " + name + " is a reserved word.";
    }
    if (graph.hasOwnProperty(name)) {
      throw "Illegal definition: " + name + " is already defined.";
    }

    //  Next: determine the type:
    var type = null;

    //  If it has an explicitly declared type, use it.
    if (cable.hasOwnProperty("type")) {
      type = cable.type;
    }

    //  Otherwise, it's a function and we must determine whether it's a 
    //  synthetic function (produces synthetic data) or an effect function 
    //  (causes a side effect externally to cable e.g. the DOM).
    else if (isFunction(cable)) {
      type = isSynthetic(cable) ? "synthetic" : "effect";
    }

    //  Otherwise, assume it's a subdefinition.
    else {
      type = "sub";
    }

    //  If a type was determined, and an installer exists for that type, install 
    //  it:
    if (install.hasOwnProperty(type)) {
      install[type](name, cable, options.scope);
    }
    else if (type !== "sub" && type !== "reference") {
      throw "Illegal definiton: could not determine meaning of " + name;
    }
  });

  if (options.reify) {
    reify();
  }

  if (options.wireup) {
    wireup();
  }
};

var install = {
  data:function(name, obj, scope) {
    graph[name] = {
      type:"data",
      value:obj.value,

      "in":[],
      out:[],

      helpers:obj.helpers ? obj.helpers : { },

      scope:scope
    };
  },

  synthetic:function(name, fn, scope) {
    if (getArgNames(fn).indexOf("respond") != -1) {
      graph[name] = {
        type:"synthetic",
        fn:fn,

        value:null,
        invoked:false,

        "in":getFanIn(fn, fn.context),
        out:[],

        resultIndex:getArgNames(fn).indexOf("respond"),

        scope:scope,
        coalesce:false
      };
    }
    else {
      graph[name] = {
        type:"synthetic",
        fn:fn,

        value:null,
        invoked:false,

        "in":getFanIn(fn, fn.context),
        out:[],

        resultIndex:getArgNames(fn).indexOf("result"),

        scope:scope,
        coalesce:true
      };
    }
  },

  effect:function(name, fn, scope) {
    graph[name] = {
      type:"effect",
      fn:fn,

      "in":getFanIn(fn, fn.context),
      out:[],

      scope:scope
    };
  },

  event:function(name, obj, scope) {
    graph[name] = {
      type:"event",
      value:obj.defaultValue,
      wireup:obj.wireup,
      isWiredUp:false,
      invoked:false,

      "in":[],
      out:[],

      scope:scope
    };
  },

  library:function(name, obj, scope) {
    graph[name] = {
      type:"library",
      path:obj.path,
      shim:obj.shim,

      handle:null,
      loaded:false,

      scope:scope
    };
  },

  sub:function(name, obj, scope) {
    var newObj = { };

    // Find references:
    var references = { };
    each(obj, function(subobj, subname) {
      if (subobj.type === "reference") {
        references[subname] = subobj.referenceName;
      }
    });

    each(obj, function(subobj, subname) {
      var newName = subname === "main" ? name : name + "_" + subname;
      newObj[newName] = subobj;
    });

    Cable.define(
      newObj, { 
        reify:false, 
        wireup:false,
        scope:{
          chain:scope.chain.concat([ name ])
        }
      }
    );
  }
};

//  Take a scope chain and a name, and enumerate each possible namespace 
//  prefixed version of that name starting with the deepest. For example 
//  enumerateScopes(['x','y','z'], "w") === ["x_y_z_w", "x_y_w", "x_w"] OR
//  enumerateScopes(['x','y'], "main") === ["x_y", "x"]
function enumerateScopes(chain, name) {
  var 
    suffix = name === "main" ? "" : "_" + name,
    scopes = [];
  for (var idx = 0; idx < chain.length; ++idx) {
    scopes.push(chain.slice(0, chain.length - idx).join("_") + suffix);
  }
  scopes.push(name);
  return scopes;
}

//  Resolve the reference, If there is no apparent resolution, return null.
function resolve(name, scope) {
  var names = enumerateScopes(scope.chain, name);
  for (var idx = 0; idx < names.length; ++idx) {
    if (graph.hasOwnProperty(names[idx])) {
      return names[idx];
    }
  }
  return null;
}

//  Reify the graph. The graph is an object of cable definitions. This expresses
//  a graph in two subtly different ways. If we let each definition be a vertex
//  they each have fan-in and fan-out defined in their in and out properties 
//  respectively, however these do not necessarily express the same graph, 
//  because whereas in enumerates how to construct arguments for the node, out
//  enumerates which nodes can be subsequently triggered by that node and not
//  necessarily all of the nodes which it fans into.
// 
//  Because of this asymmetry, we only need to reify the out-graph. This can be
//  done by wiping every out list and reconstructing it by looping over every 
//  node and allowing them to append their name to any other node's out list.
//
//  If there is no internal consistency (e.g. a node refers to a node that does
//  not (or does not *yet*) exist), an exception will be thrown. If one is 
//  defining intermediate graphs, one should hold of on reifying it until 
//  consistency is expected. This is the reason that sub-definitions are 
//  installed with reification disabled in Cable.define.
function reify() {

  //  Pass 1: Clean all objects
  each(graph, function(node) {
    node.out = [];
  });

  //  Pass 2: Append dependencies
  each(graph, function(node, nodeName) {

    //  Dependencies can only be needed when a function is present.
    if (node.fn) {

      //  For each dependency
      getDependencies(node.fn, node.context).forEach(function(depName) {

        //  Here we need to determine the fully qualified namespaced name of the
        //  dependency in order to add our name to its list.

        var qname = resolve(depName, node.scope);

        //  If it resolved:
        if (qname) {
          graph[qname].out.push(nodeName);
        }

        //  Otherwise it's a bad reference:
        else {
          function showContext(context) {
            var refs = [];
            each(context.references, function(ref, name) {
              refs.push("'" + name + "' ==> '" + ref + "'");
            })
            return (
              "named '" + context.name + "'" + 
              " and references {" + 
              refs.join(", ") +
              "}"
            );
          }

          throw "Reference to undefined node '" +
            depName +
            "' as dependency of '" +
            nodeName +
            "'" + 
            (node.hasOwnProperty("context") ?
              " in context " + showContext(node.context) :
              "");
        }
      });
    }

  });
}

function wireup() {
  each(graph, function(node, nodeName) {
    if (node.type === "event" && !node.isWiredUp) {
      node.wireup(function(value) {
        yield(nodeName, function(setter) {
          setter(value);
        });
      });
      node.isWiredUp = true;
    }
  });
}

var yields = {
  data:function(name, fn) {
    var access = function() {
      if (!arguments.length) {
        return graph[name].value;
      }
      else if (arguments[0] != graph[name].value) {
        graph[name].value = arguments[0];
        triggerDownstream(name);
      }
    };

    each(graph[name].helpers, function(helper, helpName) {
      access[helpName] = function() {
        return helper.apply(
          access, 
          arguments
        );
      };
    });

    fn(access);
  },

  synthetic:function(name, fn) {
    if (!graph[name].invoked) {
      evaluate(name, function() { });
    }
    else {
      fn(function() {
        return graph[name].value;
      });
    }
  },

  effect:function() { /* Do anything here? */ },

  event:function(name, fn) {
    fn(function() {
      if (!arguments.length) {
        return graph[name].value;
      }
      else if (arguments[0] != graph[name].value || !graph[name].coalesce) {
        graph[name].invoked = true;
        graph[name].value = arguments[0];
        triggerDownstream(name);
      }
    });
  },

  library:function(name, fn) {
    if (graph[name].loaded) {
      fn(graph[name].handle);
    }
    else {
      evaluate(name, function() {
        yield(name, fn);
      });
    }
  }
};

function yield(name, fn) {
  if (graph.hasOwnProperty(name)) {
    yields[graph[name].type](name, fn);
  }
  else {
    throw "Cannot yield: '" + name + "' is not defined";
  }
}

Cable.yield = yield;

function yieldAll(names, fn, prefix) {
  if (prefix === undefined) { prefix = []; }

  if (!names.length) {
    fn(prefix);
  }
  else {
    yield(names[0], function(value) {
      yieldAll(names.slice(1), fn, prefix.concat([ value ]));
    });
  }
}

function yieldIn(name, fn) {
  var resolved = graph[name]["in"].map(function(dep) {
    return resolve(dep, graph[name].scope);
  });

  yieldAll(resolved, fn);
}

function evaluate(name, fn) {
  evaluators[graph[name].type](name, fn);
}

var evaluators = {
  data:yield.data,
  event:yield.event,

  synthetic:function(name, fn) {
    yieldIn(name, function(deps) {

      deps.splice(graph[name].resultIndex, 0, function(result) {

        graph[name].invoked = true;

        if (graph[name].value != result || !graph[name].coalesce) {
          graph[name].value = result;
          triggerDownstream(name);
        }

        fn();
      });

      graph[name].fn.apply({ }, deps);
    });
  },

  effect:function(name, fn) {
    yieldIn(name, function(deps) {
      graph[name].fn.apply({ }, deps);
      fn();
    });
  },

  library:function(name, fn) {
    if (graph[name].loaded) {
      fn();
      return;
    }

    var define = function() {
      var idx = arguments.length - 1;

      if (isFunction(arguments[idx])) {
        graph[name].handle = arguments[idx]();
      }
      else {
        graph[name].handle = arguments[idx];
      }

      graph[name].loaded = true;
    };

    define.amd = {};

    var req = new XMLHttpRequest();

    req.onreadystatechange = function() {
      if (this.readyState === 4 && this.status === 200) {
        var source = this.responseText;

        if (graph[name].shim) {
          source = [
            "define(function() {", source, "\nreturn ", graph[name].shim, "; });"
          ].join("");
        }

        window.define = define;
        eval(source);
        delete window.define;

        if (name === "$" && $ && $.noConflict) { $.noConflict(); }

        fn();
      }
    }

    req.open("get", graph[name].path, true);
    req.send();
  }
};

function trigger(name) {
  if (!allDependenciesEvaluated(name)) {
    return;
  }

  evaluate(name, function() { });
}

function allDependenciesEvaluated(name) {
  var deps = graph[name]["in"].map(function(dep) {
    return resolve(dep, graph[name].scope);
  });

  for (var idx = 0; idx < deps.length; ++idx) {
    if (graph[deps[idx]].type === "event" && !graph[deps[idx]].invoked) {
      return false;
    }
  }

  return true;
}

function triggerDownstream(name) {
  graph[name].out.forEach(trigger);
}

Cable.initialize = function(name, value) {
  if (graph[name].type === "synthetic") {
    graph[name].value = value;
    graph[name].invoked = true;
  }
};

})();

//  Declare argument names for a function. This is useful for when the 
//  dependencies of a cable are generated dynamically, or when the code is run 
//  through a minifier which does renaming.
Cable.withArgs = function(args, fn) {
  fn.argAliases = args;
  return fn;
};

//  Declare an element of state to be managed in the graph. Pass it an initial
//  value and an optional set of data helpers.
Cable.data = function(value, helpers) {
  var obj = { type:"data", value:value };
  if (helpers) {
    obj.helpers = helpers;
  }
  return obj;
};

//  Declare the init event. This is an event which fires as soon as it is wired.
//  Can be used as a dependency for functions which should be run when the page 
//  loads.
Cable.define(
  { init:{ type:"event", wireup:function(f) { f(new Date()); } } }, 
  { reify:false, wireup:false }
);

//  Experimental list modeling tool. A list is stored as state, but is 
//  interfaced via slicing as with regular JS arrays.
Cable.list = function(array) {
  return {
    array:Cable.data(array),
    main:Cable.data(
      { index:0, howMany:0, replacement:array }, 
      {
        splice:function(i, h, r) {
          this({ index:i, howMany:h, replacement:r });
        },
        prepend:function(e) {
          this({ index:0, howMany:0, replacement:[e] });
        },
        append:function(e) {
          this({ index:-1, howMany:0, replacement:[e] });
        },
        updateAt:function(index, replacement) {
          this({ index:index, howMany:1, replacement:[replacement] });
        }
      }
    ),
    updater:Cable.withArgs(["main", "_array"], function(main, _array) {
      var 
        s = main(),
        a = _array().slice(0);

      if (s.index >= 0) {
        a.splice(s.index, s.howMany, s.replacement);
      }
      else {
        a.splice(a.length - s.index, s.howMany, s.replacement);
      }
      _array(a);
    })
  }
};

//  Create an interval event. The period can be supplied by either a number of 
//  milliseconds, or as the name of a cable which adjusts the period 
//  dynamically.
Cable.interval = function(period, triggerOnInit) {
  if (period.substring) {
    var args = ["ref", "_pid"];
    if (triggerOnInit) { 
      args = args.concat("init");
    }
    return {
      ref:Cable.reference(period),
      pid:Cable.data(-1),
      main:Cable.withArgs(args, function(ref, _pid, result) {
        clearInterval(_pid());
        var newPid = setInterval(
          function() { result(new Date()); },
          ref()
        );
        _pid(newPid);
      })
    };
  }
  else {
    return {
      type:"event",
      defaultValue:new Date(),
      wireup:function(fn) {
        setInterval(function() { fn(new Date()); }, period);

        if (triggerOnInit) {
          fn(new Date());
        }
      }
    };
  }
};

//  Declare a library to import.
Cable.library = function(path, shim) {
  return {
    type:"library",
    path:path,
    shim:shim
  }
};

//  Unify a set of cables into one.
Cable.pack = function(args) {
  var fn = function (result) {
    var obj = { };
    for (var idx = 1; idx < fn.argAliases.length; ++idx) {
      obj[fn.argAliases[idx]] = arguments[idx]();
    }
    result(obj);
  };

  var aliases = args.slice(0);
  aliases.splice(0, 0, "result");
  fn.argAliases = aliases

  return fn;
};

//  Declare a stateful integer counter, Useful for creating unique ids on the 
//  fly.
Cable.counter = function() {
  return Cable.data(-1, {
    next:function() {
      var n = this() + 1;
      this(n);
      return n;
    }
  });
};

//  Super-generic event function.
// 
//  NOTE: This is getting to big. Probably gonna break this down into 
//  specialized helpers like textbox and checkbox.
Cable.event = function(selector, events, property, triggerOnLoad) {
  return { 
    type:"event",
    coalesce:false,
    wireup:function(fn) {
      Cable.yield("$", function($) {
        if (selector === "document" && events === "ready") {
          $(document).ready(fn);
        }
        else {
          var 
            getter = function() {
              var 
                val = null,
                obj = $(selector);

              if (!property) {
                property = "time";
              }

              if (property === "value") {
                val = obj.val();

                if (obj.is("[type='number']")) {
                  val = parseFloat(val);
                }
              }
              else if (property === "time") {
                val = new Date();
              }
              else if (/^data-[-_a-zA-Z0-9]+/.test(property)) {
                val = obj.attr(property);
              }
              else if (property === ":checked") {
                val = obj.is(":checked");
              }

              fn(val);
            },

            handler;

          if (events === "key-return") {
            events = "keyup";
            handler = function(evt) {
              if (evt.keyCode === 13) {
                getter();
              }
            };
          }
          else {
            handler = getter;
          }

          $(document).on(events, selector, handler);

          if (triggerOnLoad) {
            getter();
          }
        }
      });
    }
  };
};

//  Lift a textbox into the graph.
Cable.textbox = function(selector) {
  return {
    type:"event",
    wireup:function(fn) {
      Cable.yield("$", function($) {
        var obj = $(selector);

        var getter = function() {
          if (obj.is("[type='number']")) {
            return parseFloat(obj.val());
          }
          else {
            return obj.val();
          }
        };

        obj.on("change keyup", function() {
          fn(getter());
        });
        fn(getter());
      })
    }
  };
};

Cable.checkbox = function(selector) {
  return Cable.event(selector, "change", ":checked", true);
};

Cable.returnKey = function(selector) {
  return {
    type:"event",
    wireup:function(fn) {
      Cable.yield("$", function($) {
        $(selector).on("keyup", function(evt) {
          if (evt.keyCode === 13) {
            fn(new Date());
          }
        });
      });
    }
  };
};

Cable.template = function(selector, template) {
  var
    reg = /\{\{[_a-zA-Z0-9]+\}\}/g,
    match = template.match(reg) || [],
    deps = match.map(function(m) { return m.replace(/\{|\}/g, ""); });

  var obj =  {
    properties:Cable.pack(deps),
    main:Cable.withArgs(["properties", "$"], function(properties, $) {

      function disp(v) {
        if (typeof(v) === "number") {
          return v.toFixed(2);
        }
        else {
          return v;
        }
      }

      var rend = template;
      for (var idx = 0; idx < deps.length; ++idx) {
        rend = rend.replace(
          "{{" + deps[idx] + "}}", 
          disp(properties()[deps[idx]])
        );
      }

      $(selector).html(rend);
    })
  };

  return obj;
};

Cable.json = function(fn) {
  return {
    url:fn,
    main:Cable.withArgs(["$", "url", "result"], function($, url, result) {
      var cdr = /^http/.test(url()) && !/callback=/.test(url());

      $.ajax({
        dataType: "json",
        url: url(),
        crossDomain:!!cdr,
        success: function(data) {
          result(data);
        }
      });
    })
  };
};

Cable.text = function(url) {
  return Cable.withArgs(["$", "result"], function($, result) {
    $.ajax({ 
      url:url,
      dataType:"text",
      success:function(text) { 
        result(text); 
      }
    });
  });
};
